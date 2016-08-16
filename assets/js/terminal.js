;(function() {
  var tty = this.tty
    , window = this
    , document = this.document
    , initialTitle = this.document.title
    , BaseTerminal = Terminal
    , on = BaseTerminal.on;

  var _Terminal = function (socket, id, process) {
    var self = this;

    self.socket = socket;
    self.element;
    self.wrapElement;
    self.process;

    BaseTerminal.call(this, {nativeScroll: false});

    if (id) {
      self._restore(id);
    }
    if (process) {
      self.setProcessName(process);
    }

    self.open();
    self.hookKeys();
  };

  BaseTerminal.inherits(_Terminal, BaseTerminal);

  _Terminal.prototype.handler = function(data) {
    this.socket.emit('data', this.id, data);
  };

  _Terminal.prototype._write = _Terminal.prototype.write;
  _Terminal.prototype.write = function(data) {
    var ret = this._write(data);
    this.emit('write');
    if (this.nativeScroll) {
      this.scroll();
    }
    return ret;
  };

  _Terminal.prototype._open = _Terminal.prototype.open;
  _Terminal.prototype.open = function() {
    this.wrapElement = document.createElement('div');
    this.wrapElement.className = 'window';

    if (!this.nativeScroll) {
      this.wrapElement.style.overflowY = "hidden";
    }

    return this._open(this.wrapElement);
  };

  _Terminal.prototype.connect = function() {
    var self = this;

    if (this.id) {
      this.emit('connect');
      this._restoreHistory();
      this.scroll();
    } else {
      self.socket.emit('create', self.cols, self.rows, function(err, data) {
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

  _Terminal.prototype._restore = function (id) {
    this.id = id;
    this.pty = id;
  };

  _Terminal.prototype._restoreHistory = function() {
    var history = tty.TerminalHistoryHandler.get(this.id);
    var self = this;

    if (history) {
      each(history, function (data) {
        self._write(data);
      });
    }
  };

  _Terminal.prototype.hookKeys = function() {
    var self = this;

    this.on('request paste', function(key) {
      this.socket.emit('request paste', function(err, text) {
        if (err) return;
        self.send(text);
      });
    });
  };

  _Terminal.prototype._focus = _Terminal.prototype.focus;
  _Terminal.prototype.focus = function () {
    var prevFocus = BaseTerminal.focus;
    this._focus();
    if (prevFocus === this) return;

    this.changeTitle(this.title);
    this.element.focus();
    this.emit('focus');
  };

  _Terminal.prototype.changeDimensions = function (width, height) {
    var cols
      , rows;

    this.wrapElement.style.width = width + 'px';
    this.wrapElement.style.height = height + 'px';

    cols = this._calculateCols(width);
    rows = this._calculateRows(height);

    if (!cols || !rows) {
      return;
    }

    this.resize(cols, rows);
  };

  _Terminal.prototype._resize = _Terminal.prototype.resize;
  _Terminal.prototype.resize = function (cols, rows) {
    this.socket.emit('resize', this.id, cols, rows);
    this._resize(cols, rows);
    this.emit('resize', cols, rows);
  };

  _Terminal.prototype._destroy = _Terminal.prototype.destroy;
  _Terminal.prototype.destroy = function () {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.wrapElement.parentNode.removeChild(this.wrapElement);
    this.socket.emit('kill', this.id);

    this._destroy();

    this.emit('destroy');
  };

  _Terminal.prototype.getElement = function () {
    return this.wrapElement;
  };

  _Terminal.prototype._calculateCols = function (width) {
    var fontSize = parseFloat(window.getComputedStyle(this.element, null).getPropertyValue('font-size')); // get terminal font size
    var innerWidth = width - 4; // subtract border width
    var widthScaleCoefficient = 1.63; // empirically identified

    return innerWidth * widthScaleCoefficient / fontSize | 0;
  };

  _Terminal.prototype._calculateRows = function (height) {
    var fontSize = parseFloat(window.getComputedStyle(this.element, null).getPropertyValue('font-size')); // get terminal font size
    var innerHeight = height - 4; // subtract border width
    var heightScaleCoefficient = 0.74; // empirically identified

    return innerHeight * heightScaleCoefficient / fontSize | 0;
  };

  _Terminal.prototype.changeTitle = function(title) {
    if (title) {
      this.title = sanitize(title);
    }

    document.title = this.title || initialTitle;
  };

  _Terminal.prototype.stopBlink = function() {
    clearInterval(this._blink);
  };

  _Terminal.prototype._bindMouse = _Terminal.prototype.bindMouse;
  _Terminal.prototype.bindMouse = function() {
    this.bindMouseSelection();
    return this._bindMouse();
  };

  _Terminal.prototype.bindMouseSelection = function () {
    var self = this;

    on(self.element, 'mousedown', function() {
      self.stopBlink();
    });

    on(self.element, 'mouseup', function() {
      var selection = getSelectionText();

      if (!selection) {
        self.refreshBlink();
      }
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

  _Terminal.prototype._scroll = _Terminal.prototype.scroll;
  _Terminal.prototype.scroll = function() {
    if (!this.nativeScroll) {
      return this._scroll();
    }

    var wrapElement = this.wrapElement;

    setTimeout(function () {
      wrapElement.scrollTop = wrapElement.scrollHeight;
    }, 100);
  };

  tty.Terminal = _Terminal;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
