;(function() {
  var window = this
    , document = this.document
    , initialTitle = this.document.title
    , EventEmitter = this.tty.EventEmitter
    , inherits = this.tty.inherits;

  var _Terminal = function (socket, parent, options) {
    var self = this;

    EventEmitter.call(this);

    self.socket = socket;
    self.parent = parent;
    self.element = document.createElement('div');
    self.element.className = 'window';
    self.parent.appendChild(self.element);
    self.term = new hterm.Terminal();
    self.io;

    self._restoreOptions(options);
  };

  inherits(_Terminal, EventEmitter);

  _Terminal.prototype.handler = function(data) {
    this.socket.emit('data', this.id, data);
  };

  _Terminal.prototype.write = function(data) {
    this.term.io.writeUTF16(data);
    this.emit('write');
  };

  _Terminal.prototype.connect = function() {
    var self = this;

    if (self.connected) return;
    self.connected = true;

    self.term.onTerminalReady = function() {
      self.io = self.term.io.push();
      self.term.installKeyboard();

      self.io.onVTKeystroke = function(str) {
        self.handler(str);
      };

      self.io.sendString = function(str) {
        self.handler(str);
      };

      self.io.onTerminalResize = function(columns, rows) {
        self.resize(columns, rows);
      };
    };

    self.term.decorate(self.element);

    if (this.id) {
      this.emit('connect');
    } else {
      self.socket.emit('create', self.term.io.columnCount, self.term.io.rowCount, function(err, data) {
        if (err) return self.destroy();
        self._syncTerminalData(data);
      });
    }
  };

  _Terminal.prototype._syncTerminalData = function(data) {
    this.pty = data.pty;
    this.id = data.id;
    this.setProcessName(data.process);
    this.emit('connect');
  };

  _Terminal.prototype._restoreOptions = function(options) {
    if (options) {
      var self = this;

      each(keys(options), function (key) {
        if (_Terminal.stateFields.indexOf(key) > -1) {
          if (key == 'process') {
            self.setProcessName(options[key]);
          } else {
            self[key] = options[key];
          }
        }
      });
    }
  };

  _Terminal.prototype.focus = function () {
    if (this.term) return;
    this.changeTitle(this.title);
    this.term.focus();
    this.emit('focus');
  };

  _Terminal.prototype.resize = function (cols, rows) {
    this.socket.emit('resize', this.id, cols, rows);
    this.emit('resize', cols, rows);
  };

  _Terminal.prototype.destroy = function () {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    this.io.pop();
    this.term.uninstallKeyboard();

    this.socket.emit('kill', this.id);
    this.emit('destroy');
  };

  _Terminal.prototype.getElement = function () {
    return this.element;
  };

  _Terminal.prototype.changeTitle = function(title) {
    if (title) {
      this.title = sanitize(title);
    }

    document.title = this.title || initialTitle;
  };

  _Terminal.prototype.pollProcessName = function(func) {
    var self = this;
    this.socket.emit('process', this.id, function(err, name) {
      if (err) return func && func(err);
      self.setProcessName(name);
      return func && func(null, name);
    });
  };

  _Terminal.prototype.setProcessName = function(name) {
    name = sanitize(name);

    if (!name) {
      name = 'terminal';
    }

    if (this.process !== name) {
      this.process = name;
      this.emit('process', name);
    }
  };

  _Terminal.stateFields = [
    'id',
    'pty',
    'process'
  ];

  this.tty.Terminal = _Terminal;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
