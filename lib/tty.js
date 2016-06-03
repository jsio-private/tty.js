/**
 * tty.js
 * Copyright (c) 2012-2014, Christopher Jeffrey (MIT License)
 */

/**
 * Modules
 */

var path = require('path')
  , fs = require('fs')
  , Stream = require('stream').Stream
  , EventEmitter = require('events').EventEmitter;

var express = require('express')
  , io = require('socket.io')
  , pty = require('pty.js')
  , term = require('term.js')
  , nunjucks = require('nunjucks') ;

var config = require('./config')
  , logger = require('./logger');

/**
 * Server
 */

function Server(conf) {
  if (!(this instanceof Server)) {
    return new Server(conf);
  }

  var self = this
    , conf = config.checkConfig(conf);

  this.app = express();
  this.app.locals = conf;
  this.server = conf.https && conf.https.key
    ? require('https').createServer(conf.https)
    : require('http').createServer();
  this.server.on('request', this.app);

  this.sessions = {};
  this.conf = conf;
  this._auth = this._basicAuth();
  this.io = io.listen(this.server, conf.io || {
    log: false
  });

  this.on('listening', function() {
    self.log('Listening on port \x1b[1m%s\x1b[m.', self.conf.port);
  });

  this.init();
}

Server.prototype.init = function() {
  this.init = function() {};
  if (this.conf.localOnly) this.initLocal();
  this.initMiddleware();
  this.initRoutes();
  this.initIO();
};

Server.prototype.initLocal = function() {
  var self = this;
  this.warning('Only accepting local connections.'),
  this.server.on('connection', function(socket) {
    var address = socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1') {
      try {
        socket.destroy();
      } catch (e) {
        ;
      }
      self.log('Attempted connection from %s. Refused.', address);
    }
  });
};

Server.prototype.initMiddleware = function() {
  var self = this
    , conf = this.conf;

  this.use(function(req, res, next) {
    var setHeader = res.setHeader;
    res.setHeader = function(name) {
      switch (name) {
        case 'Cache-Control':
        case 'Last-Modified':
        case 'ETag':
          return;
      }
      return setHeader.apply(res, arguments);
    };
    next();
  });

  this.use(function(req, res, next) {
    return self._auth(req, res, next);
  });

  this.use(term.middleware());

  if (conf.static) {
    this.use(express.static(conf.static));
  }

  // If there is a custom favicon in the custom
  // static directory, this will be ignored.
  this.use(express.favicon(__dirname + '/../static/favicon.ico'));

  this.use(this.app.router);

  env = new nunjucks.Environment(new nunjucks.FileSystemLoader(__dirname + '/../assets/views'));
  env.express(this.app);
  
  this.app.get(conf.url_prefix || '/', function(req, res){self.index(req, res)});

  this.use(conf.static_url, express.static(__dirname + '/../static'));
};

Server.prototype.index = function(req, res) {
  res.render('index.html');
};

Server.prototype.setAuth = function(func) {
  this._auth = func;
};

Server.prototype.initRoutes = function() {
  var self = this;
  this.get( this.conf.url_prefix + '/options.js', function(req, res, next) {
    return self.handleOptions(req, res, next);
  });
};

Server.prototype.handleOptions = function(req, res, next) {
  var self = this
    , conf = this.conf;

  res.contentType('.js');
  fs.readFile(conf.json, 'utf8', function(err, data) {
    try {
      data = JSON.parse(data) || {};
    } catch(e) {
      data = {};
    }

    if (data.term) {
      Object.keys(data.term).forEach(function(key) {
        conf.term[key] = data.term[key];
      });
    }

    res.send('Terminal._opts = '
      + JSON.stringify(conf.term, null, 2)
      + ';\n'
      + '('
      + applyConfig
      + ')();');
  });
};

Server.prototype.initIO = function() {
  var self = this
    , io = this.io;

  io.configure(function() {
    io.disable('log');
  });

  io.set('authorization', function(data, next) {
    return self.handleAuth(data, next);
  });

  io.sockets.on('connection', function(socket) {
    return self.handleConnection(socket);
  });
};

Server.prototype.handleAuth = function(data, next) {
  var io = this.io;
  data.__proto__ = Stream.prototype;
  this._auth(data, null, function(err) {
    data.user = data.remoteUser || data.user;
    return !err
      ? next(null, true)
      : next(err);
  });
};

Server.prototype.handleConnection = function(socket) {
  var session = new Session(this, socket);

  // XXX Possibly wrap socket events from inside Session
  // constructor, and do: session.on('create')
  // or session.on('create term').
  socket.on('create', function(cols, rows, func) {
    return session.handleCreate(cols, rows, func);
  });

  socket.on('data', function(id, data) {
    return session.handleData(id, data);
  });

  socket.on('kill', function(id) {
    return session.handleKill(id);
  });

  socket.on('resize', function(id, cols, rows) {
    return session.handleResize(id, cols, rows);
  });

  socket.on('process', function(id, func) {
    return session.handleProcess(id, func);
  });

  socket.on('disconnect', function() {
    return session.handleDisconnect();
  });

  socket.on('request paste', function(func) {
    return session.handlePaste(func);
  });

  socket.on('layout state change', function(state) {
    return session.saveLayoutState(state);
  });
};

Server.prototype._basicAuth = function() {
  var self = this
    , conf = this.conf;

  if (!Object.keys(conf.users).length) {
    return function(req, res, next) {
      next();
    };
  }

  var crypto = require('crypto')
    , users = conf.users
    , hashedUsers = {}
    , saidWarning;

  function sha1(text) {
    return crypto
      .createHash('sha1')
      .update(text)
      .digest('hex');
  }

  function hashed(hash) {
    if (!hash) return;
    return hash.length === 40 && !/[^a-f0-9]/.test(hash);
  }

  function verify(user, pass, next) {
    var username = sha1(user)
      , password;

    if (!Object.hasOwnProperty.call(hashedUsers, username)) {
      return next();
    }

    password = hashedUsers[username];

    if (sha1(pass) !== password) return next(true);

    next(null, user);
  }

  // Hash everything for consistency.
  Object.keys(users).forEach(function(name) {
    if (!saidWarning && !hashed(users[name])) {
      self.warning('You should sha1 your user information.');
      saidWarning = true;
    }

    var username = !hashed(name)
      ? sha1(name)
      : name;

    hashedUsers[username] = !hashed(users[name])
      ? sha1(users[name])
      : users[name];
  });

  return express.basicAuth(verify);
};

Server.prototype.log = function() {
  return this._log('log', slice.call(arguments));
};

Server.prototype.error = function() {
  return this._log('error', slice.call(arguments));
};

Server.prototype.warning = function() {
  return this._log('warning', slice.call(arguments));
};

Server.prototype._log = function(level, args) {
  if (this.conf.log === false) return;
  args.unshift(level);
  return logger.apply(null, args);
};

Server.prototype.listen = function(port, hostname, func) {
  port = port || this.conf.port || 8080;
  hostname = hostname || this.conf.hostname;
  return this.server.listen(port, hostname, func);
};

Server.prototype.getInactiveSession = function(userAgentId) {
  if (!this.sessions[userAgentId]) {
    return false;
  }

  for (var i = 0; i < this.sessions[userAgentId].length; i++) {
    if (this.sessions[userAgentId][i].inactive) {
      return this.sessions[userAgentId][i];
    }
  }
};

Server.prototype.saveSession = function (userAgentId, session) {
  if (!this.sessions[userAgentId]) {
    this.sessions[userAgentId] = [];
  }

  this.sessions[userAgentId].push(session);
};

Server.prototype.removeSession = function (userAgentId, id) {
  if (!this.sessions[userAgentId]) {
    return;
  }

  for (var i = 0; i < this.sessions[userAgentId].length; i++) {
    if (this.sessions[userAgentId][i].id == id) {
      delete this.sessions[userAgentId][i];
    }
  }
};

/**
 * Session
 */

function Session(server, socket) {
  this.server = server;
  this.socket = socket;
  this.terms = {};
  this.req = socket.handshake;
  this.id = guid();
  this.user_agent_id;

  var conf = this.server.conf
    , terms = this.terms
    , req = socket.handshake;

  this.user = req.user;
  if (req.query.uid){
    this.user_agent_id = req.query.uid;
  }
  else{
    this.user_agent_id = req.user || this.uid();
  }
  if (req.query.script){
    this.script = req.query.script;
  }
  // Kill/sync older session.
  if (conf.syncSession) {
    var stale = this.server.getInactiveSession(this.user_agent_id);
    if (stale) {
      stale.disconnect();
      stale.id = this.id;
      stale.inactive = false;
      stale.socket = socket;
      stale.sync();
      stale.log('Session \x1b[1m%s\x1b[m resumed.', stale.id);
      return stale;
    }else{
      this.sync();
    }
  }

  this.server.saveSession(this.user_agent_id, this);

  this.log('Session \x1b[1m%s\x1b[m created.', this.user_agent_id);
}

Session.uid = 0;
Session.prototype.uid = function() {
  if (this.server.conf.syncSession) {
    var req = this.req;
    return req.getIp()
      + '|' + req.headers['user-agent'];
  }
  return Session.uid++ + '';
};

Session.prototype.disconnect = function() {
  try {
    this.socket._events = {};
    this.socket.$emit = function() {};
    this.socket.disconnect();
  } catch (e) {
    ;
  }
  this.clearTimeout();
};

Session.prototype.log = function() {
  return this._log('log', slice.call(arguments));
};

Session.prototype.error = function() {
  return this._log('error', slice.call(arguments));
};

Session.prototype.warning = function() {
  return this._log('warning', slice.call(arguments));
};

Session.prototype._log = function(level, args) {
  if (typeof args[0] !== 'string') args.unshift('');
  var id = this.user_agent_id.split('|')[0];
  args[0] = '\x1b[1m' + id + '\x1b[m ' + args[0];
  return this.server._log(level, args);
};

Session.prototype.sync = function() {
  var self = this
    , terms = {}
    , queue = [];

  Object.keys(this.terms).forEach(function(key) {
    var term = self.terms[key];
    terms[key] = {
      id: term.pty,
      pty: term.pty,
      cols: term.cols,
      rows: term.rows,
      process: sanitize(term.process)
    };
  });

  Object.keys(self.terms).forEach(function(key) {
    var term = self.terms[key]
      , cols = term.cols
      , rows = term.rows;

    // A tricky way to get processes to redraw.
    // Some programs won't redraw unless the
    // terminal has actually been resized.
    term.resize(cols + 1, rows + 1);
    queue.push(function() {
      term.resize(cols, rows);
    });

    // Send SIGWINCH to our processes, and hopefully
    // they will redraw for our resumed session.
    // self.terms[key].kill('SIGWINCH');
  });

  setTimeout(function() {
    queue.forEach(function(item) {
      item();
    });
  }, 30);

  this.socket.emit('sync', this.layoutState);
};

Session.prototype.handleCreate = function(cols, rows, func, script) {
  var self = this
    , terms = this.terms
    , conf = this.server.conf
    , socket = this.socket;

  var len = Object.keys(terms).length
    , term
    , id;
  if (len >= conf.limitPerUser || pty.total >= conf.limitGlobal) {
    this.warning('Terminal limit reached.');
    return func({ error: 'Terminal limit.' });
  }
  var shell = typeof conf.shell === 'function'
    ? conf.shell(this)
    : conf.shell;
  var shellArgs = typeof conf.shellArgs === 'function'
    ? conf.shellArgs(this)
    : conf.shellArgs;
  if (this.script){
    if (!conf.scriptsdirectory){
      console.log('**** warning ****');
      console.log('no scriptsdirectory specified, sharing will not work!');
      console.log('scriptsdirectory should be abs path to ~/.wakariscripts');
    }
    script = path.join(conf.scriptsdirectory, this.script);
    var shell = script;
    var shellArgs = [];
  }
  console.log(shell, shellArgs);
  term = pty.fork(shell, shellArgs, {
    name: conf.termName,
    cols: cols,
    rows: rows,
    cwd: conf.cwd || process.env.HOME
  });

  id = term.pty;
  terms[id] = term;

  term.on('data', function(data) {
    self.socket.emit('data', id, data);
  });

  term.on('close', function() {
    // Make sure it closes
    // on the clientside.
    self.socket.emit('kill', id);

    // Ensure removal.
    if (terms[id]) delete terms[id];

    self.log(
      'Closed pty (%s): %d.',
      term.pty, term.fd);
  });

  this.log(
    'Created pty (id: %s, master: %d, pid: %d).',
    id, term.fd, term.pid);

  return func(null, {
    id: id,
    pty: term.pty,
    process: sanitize(conf.shell)
  });
};

Session.prototype.handleData = function(id, data) {
  var terms = this.terms;
  if (!terms[id]) {
    this.warning(''
      + 'Client attempting to'
      + ' write to a non-existent terminal.'
      + ' (id: %s)', id);
    return;
  }
  terms[id].write(data);
};

Session.prototype.handleKill = function(id) {
  var terms = this.terms;
  if (!terms[id]) return;
  terms[id].destroy();
  delete terms[id];
};

Session.prototype.handleResize = function(id, cols, rows) {
  var terms = this.terms;
  if (!terms[id]) return;
  terms[id].resize(cols, rows);
};

Session.prototype.handleProcess = function(id, func) {
  var terms = this.terms;
  if (!terms[id]) return;
  var name = terms[id].process;
  return func(null, sanitize(name));
};

Session.prototype.handleDisconnect = function() {
  var self = this
    , terms = this.terms
    , server = this.server
    , conf = this.server.conf;

  // XXX Possibly create a second/different
  // destroy function to accompany the one
  // above?
  function destroy() {
    var key = Object.keys(terms)
      , i = key.length
      , term;

    while (i--) {
      term = terms[key[i]];
      delete terms[key[i]];
      term.destroy();
    }

    server.removeSession(self.user_agent_id, self.id);
    self.log('Killing all pty\'s.');
  }

  this.log('Client disconnected.');
  this.inactive = true;

  if (!conf.syncSession) {
    return destroy();
  }

  if (conf.sessionTimeout <= 0 || conf.sessionTimeout === Infinity) {
    return this.log('Preserving session forever.');
  }

  // XXX This could be done differently.
  this.setTimeout(conf.sessionTimeout, destroy);
  this.log(
    'Preserving session for %d minutes.',
    conf.sessionTimeout / 1000 / 60 | 0);
};

Session.prototype.handlePaste = function(func) {
  var execFile = require('child_process').execFile;

  function exec(args) {
    var file = args.shift();
    return execFile(file, args, function(err, stdout, stderr) {
      if (err) return func(err);
      if (stderr && !stdout) return func(new Error(stderr));
      return func(null, stdout);
    });
  }

  // X11:
  return exec(['xsel', '-o', '-p'], function(err, text) {
    if (!err) return func(null, text);
    return exec(['xclip', '-o', '-selection', 'primary'], function(err, text) {
      if (!err) return func(null, text);
      // Mac:
      return exec(['pbpaste'], function(err, text) {
        if (!err) return func(null, text);
        // Windows:
        // return exec(['sfk', 'fromclip'], function(err, text) {
        return func(new Error('Failed to get clipboard contents.'));
      });
    });
  });
};

Session.prototype.setTimeout = function(time, func) {
  this.clearTimeout();
  this.timeout = setTimeout(func.bind(this), time);
};

Session.prototype.clearTimeout = function() {
  if (!this.timeout) return;
  clearTimeout(this.timeout);
  delete this.timeout;
};

Session.prototype.saveLayoutState = function (state) {
  this.layoutState = state;
};

/**
 * "Inherit" Express Methods
 */

// Methods
Object.keys(express.application).forEach(function(key) {
  if (Server.prototype[key]) return;
  Server.prototype[key] = function() {
    return this.app[key].apply(this.app, arguments);
  };
});

// Middleware
Object.getOwnPropertyNames(express).forEach(function(key) {
  var prop = Object.getOwnPropertyDescriptor(express, key);
  if (typeof prop.get !== 'function') return;
  Object.defineProperty(Server, key, prop);
});

// Server Methods
Object.keys(EventEmitter.prototype).forEach(function(key) {
  if (Server.prototype[key]) return;
  Server.prototype[key] = function() {
    return this.server[key].apply(this.server, arguments);
  };
});

/**
 * Helpers
 */

var slice = Array.prototype.slice;

function sanitize(file) {
  if (!file) return '';
  file = file.split(' ')[0] || '';
  return path.basename(file) || '';
}

function applyConfig() {
  var hasOwnProperty = Object.prototype.hasOwnProperty;

  for (var key in Terminal._opts) {
    if (!hasOwnProperty.call(Terminal._opts, key)) continue;
    if (typeof Terminal._opts[key] === 'object' && Terminal._opts[key]) {
      if (!Terminal[key]) {
        Terminal[key] = Terminal._opts[key];
        continue;
      }
      for (var k in Terminal._opts[key]) {
        if (hasOwnProperty.call(Terminal._opts[key], k)) {
          Terminal[key][k] = Terminal._opts[key][k];
        }
      }
    } else {
      Terminal[key] = Terminal._opts[key];
    }
  }

  delete Terminal._opts;
}

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

/**
 * Expand Stream class
 */
Stream.prototype.getIp = function () {
  if ('x-real-ip' in this.headers && this.headers['x-real-ip']) {
    return this.headers['x-real-ip'];
  }

  if ('x-forwarded-for' in this.headers && this.headers['x-forwarded-for']) {
    return this.headers['x-forwarded-for'];
  }

  return this.address.address;
}

/**
 * Expose
 */

exports = Server;
exports.Server = Server;
exports.Session = Session;
exports.config = config;
exports.logger = logger;
exports.createServer = Server;

module.exports = exports;
