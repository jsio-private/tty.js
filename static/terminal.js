;(function() {
  var tty = this.tty
    , window = this
    , document = this.document
    , initialTitle = this.document.title
    , BaseTerminal = Terminal;

  var _Terminal = function (socket) {
    var self = this;

    self.socket = socket;
    self.element;
    self.wrapElement;
    self.process;

    BaseTerminal.call(this);

    self.open();
    self.hookKeys();
  };

  BaseTerminal.inherits(_Terminal, BaseTerminal);

  _Terminal.prototype.handler = function(data) {
    this.socket.emit('data', this.id, data);
  };

  _Terminal.prototype._open = _Terminal.prototype.open;
  _Terminal.prototype.open = function() {
    this.wrapElement = document.createElement('div');
    this.wrapElement.className = 'window';

    return this._open(this.wrapElement);
  };

  _Terminal.prototype.connect = function(state) {
    var self = this;

    if ('id' in state) {
      self._syncTerminalData(state);
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
    this.restack();
    this.changeTitle(this.title);
    this._focus();
    this.emit('focus');
  };

  _Terminal.prototype._resize = _Terminal.prototype.resize;
  _Terminal.prototype.resize = function (width, height) {
    var cols
      , rows;

    this.wrapElement.style.width = width + 'px';
    this.wrapElement.style.height = height + 'px';

    cols = this._calculateCols(width);
    rows = this._calculateRows(height);

    if (!cols || !rows) {
      return;
    }

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
    var charSize = this.measureCharacter();
    var innerHeight = height - 4; // subtract border width

    return (innerHeight - 5) / charSize.height | 0;
  };

  _Terminal.prototype.restack = function () {
    var parent = this.element.parentNode;
    if (parent) {
      parent.removeChild(this.element);
      parent.appendChild(this.element);
    }
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

    this.on(self.element, 'mousedown', function() {
      self.stopBlink();
    });

    this.on(self.element, 'mouseup', function() {
      var selection = getSelectionText();

      if (!selection) {
        self.refreshBlink();
      }
    });
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

  tty.Terminal = _Terminal;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
