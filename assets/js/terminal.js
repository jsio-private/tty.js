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

    self._restoreOptions(options);

    if (!self.term) {
      self.term = self._createTerm();
    }
  };

  inherits(_Terminal, EventEmitter);

  _Terminal.prototype._createTerm = function() {
    var term = new hterm.Terminal();
    var self = this;

    term.prefs_.set('ctrl-c-copy', true);
    term.prefs_.set('ctrl-v-paste', true);
    term.prefs_.set('use-default-window-copy', true);
    term.prefs_.set('cursor-blink', true);
    term.prefs_.set('use-default-window-copy', true);
    term.prefs_.set('clear-selection-after-copy', false);
    term.prefs_.set('font-size', 13);
    term.prefs_.set('pass-alt-number', true);
    term.prefs_.set('pass-ctrl-number', true);
    term.prefs_.set('pass-meta-number', true);
    term.prefs_.set('audible-bell-sound', '');
    term.prefs_.set('keybindings', {
      "Ctrl-F" : "PASS",
      "Ctrl-R" : "PASS",
      "Ctrl-S" : "PASS",
      "Ctrl-A" : "PASS",
      "Meta-F" : "PASS",
      "Meta-R" : "PASS",
      "Meta-S" : "PASS",
      "Meta-A" : "PASS",
    });

    term.onFocusChangeOriginal_ = term.onFocusChange_;
    term.onFocusChange_ = function (focused) {
      term.onFocusChangeOriginal_(focused);
      if (focused) {
        self.changeTitle(self.title);
        self.emit('focus');
      }
    };

    term.showOverlay = function () {}; // don't show overlay

    term.onTerminalReady = function() {
      var io = term.io.push();

      io.onVTKeystroke = function(str) {
        self.handler(str);
      };

      io.sendString = function(str) {
        self.handler(str);
      };

      io.onTerminalResize = function(columns, rows) {
        self.resize(columns, rows);
      };
    };

    return term;
  };

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

    self.attach();

    if (this.id) {
      this.emit('connect');
    } else {
      self.socket.emit('create', self.term.io.columnCount, self.term.io.rowCount, function(err, data) {
        if (err) return self.destroy();
        self._syncTerminalData(data);
      });
    }
  };

  _Terminal.prototype.attach = function() {
    this.term.decorate(this.element);
    this.term.installKeyboard();
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
    if (!this.term) return;
    this.element.focus();
    this.term.focus();
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

    this.term.io.pop();
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
