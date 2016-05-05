;(function() {
  var tty = this.tty;

  var document = this.document
    , window = this
    , root
    , body
    , h1
    , open;

  /**
   * Initial Document Title
   */

  var initialTitle = document.title;

  var EventEmitter = Terminal.EventEmitter
    , inherits = Terminal.inherits
    , on = Terminal.on
    , off = Terminal.off
    , cancel = Terminal.cancel;

  /**
   * Tab
   */
  var num_tabs = 0
  function Tab(win, socket, restoreData) {
    var self = this;

    num_tabs += 1;
    var cols = win.cols
      , rows = win.rows;

    Terminal.call(this, {
      cols: cols,
      rows: rows
    });

    var button = document.createElement('div');
    button.className = 'tab';
    button.innerHTML = num_tabs;
    win.bar.insertBefore(button, win.bar.newButton);

    on(button, 'click', function(ev) {
      if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) {
        self.destroy();
      } else {
        self.focus();
      }
      return cancel(ev);
    });

    this.id = '';
    this.socket = socket || tty.socket;
    this.window = win;
    this.button = button;
    this.element = null;
    this.process = '';
    this.open();
    this.hookKeys();

    win.tabs.push(this);

    if (restoreData) {
      self.syncTerminalData(restoreData);
    } else {
      this.socket.emit('create', cols, rows, function(err, data) {
        if (err) return self._destroy();
        self.syncTerminalData(data);
      });
    }
  };

  inherits(Tab, Terminal);

  Tab.prototype.syncTerminalData = function(data) {
    var self = this;

    self.pty = data.pty;
    self.id = data.id;
    tty.terms[self.id] = self;
    self.setProcessName(data.process);
    tty.emit('open tab', self);
    self.emit('open');
  };

// We could just hook in `tab.on('data', ...)`
// in the constructor, but this is faster.
  Tab.prototype.handler = function(data) {
    this.socket.emit('data', this.id, data);
  };

// We could just hook in `tab.on('title', ...)`
// in the constructor, but this is faster.
  Tab.prototype.handleTitle = function(title) {
    if (!title) return;

    title = sanitize(title);
    this.title = title;

    if (Terminal.focus === this) {
      document.title = title;
    }

    if (this.window.focused === this) {
      this.window.bar.title = title;
    }
  };

  Tab.prototype._write = Tab.prototype.write;

  Tab.prototype.write = function(data) {
    if (this.window.focused !== this && !/alert/.test(this.button.className)) {
      this.button.className += ' alert';
    }

    return this._write(data);
  };

  Tab.prototype._focus = Tab.prototype.focus;

  Tab.prototype.focus = function() {
    if (Terminal.focus === this) return;

    if (/alert/.test(this.button.className)) {
      this.button.className = this.button.className.replace('alert', '');
    }

    var win = this.window;

    // maybe move to Tab.prototype.switch
    if (win.focused !== this) {
      if (win.focused) {
        if (win.focused.element.parentNode) {
          win.focused.element.parentNode.removeChild(win.focused.element);
        }
        win.focused.button.className = 'tab';
      }

      win.element.appendChild(this.element);
      win.focused = this;

      document.title = this.title || initialTitle;
      this.button.className = 'tab selected';
    }

    this.handleTitle(this.title);

    this._focus();

    win.focus();

    tty.emit('focus tab', this);
    this.emit('focus');
  };

  Tab.prototype._resize = Tab.prototype.resize;

  Tab.prototype.resize = function(cols, rows) {
    this.socket.emit('resize', this.id, cols, rows);
    this._resize(cols, rows);
    tty.emit('resize tab', this, cols, rows);
    this.emit('resize', cols, rows);
  };

  Tab.prototype.__destroy = Tab.prototype.destroy;

  Tab.prototype._destroy = function() {
    if (this.destroyed) return;
    this.destroyed = true;

    var win = this.window;

    this.button.parentNode.removeChild(this.button);
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    if (tty.terms[this.id]) delete tty.terms[this.id];
    splice(win.tabs, this);

    if (win.focused === this) {
      win.previousTab();
    }

    if (!win.tabs.length) {
      win.destroy();
    }

    this.__destroy();
  };

  Tab.prototype.destroy = function() {
    if (this.destroyed) return;
    this.socket.emit('kill', this.id);
    this._destroy();
    tty.emit('close tab', this);
    this.emit('close');
  };

  Tab.prototype.hookKeys = function() {
    var self = this;

    // Alt-[jk] to quickly swap between windows.
    this.on('key', function(key, ev) {
      if (Terminal.focusKeys === false) {
        return;
      }

      var offset
        , i;

      if (key === '\x1bj') {
        offset = -1;
      } else if (key === '\x1bk') {
        offset = +1;
      } else {
        return;
      }

      i = indexOf(tty.windows, this.window) + offset;

      this._ignoreNext();

      if (tty.windows[i]) return tty.windows[i].highlight();

      if (offset > 0) {
        if (tty.windows[0]) return tty.windows[0].highlight();
      } else {
        i = tty.windows.length - 1;
        if (tty.windows[i]) return tty.windows[i].highlight();
      }

      return this.window.highlight();
    });

    this.on('request paste', function(key) {
      this.socket.emit('request paste', function(err, text) {
        if (err) return;
        self.send(text);
      });
    });

    this.on('request create', function() {
      tty.layout.addNewTab();
    });

    this.on('request term', function(key) {
      if (this.window.tabs[key]) {
        this.window.tabs[key].focus();
      }
    });

    this.on('request term next', function(key) {
      tty.layout.focusNextTab();
    });

    this.on('request term previous', function(key) {
      tty.layout.focusPreviousTab();
    });

    this.on('request split vertical', function(key) {
      tty.layout.splitActiveVertical();
    });

    this.on('request split horizontal', function(key) {
      tty.layout.splitActiveHorizontal();
    });
  };

  Tab.prototype._ignoreNext = function() {
    // Don't send the next key.
    var handler = this.handler;
    this.handler = function() {
      this.handler = handler;
    };
    var showCursor = this.showCursor;
    this.showCursor = function() {
      this.showCursor = showCursor;
    };
  };

  Tab.prototype.stopBlink = function() {
    clearInterval(this._blink);
  };

  /**
   * Program-specific Features
   */

  Tab.scrollable = {
    irssi: true,
    man: true,
    less: true,
    htop: true,
    top: true,
    w3m: true,
    lynx: true,
    mocp: true
  };

  Tab.prototype._bindMouse = Tab.prototype.bindMouse;

  Tab.prototype.bindMouse = function() {
    this.bindMouseSelection();
    if (!Terminal.programFeatures) return this._bindMouse();

    var self = this;

    var wheelEvent = 'onmousewheel' in window
      ? 'mousewheel'
      : 'DOMMouseScroll';

    on(self.element, wheelEvent, function(ev) {
      if (self.mouseEvents) return;
      if (!Tab.scrollable[self.process]) return;

      if ((ev.type === 'mousewheel' && ev.wheelDeltaY > 0)
        || (ev.type === 'DOMMouseScroll' && ev.detail < 0)) {
        // page up
        self.keyDown({keyCode: 33});
      } else {
        // page down
        self.keyDown({keyCode: 34});
      }

      return cancel(ev);
    });

    return this._bindMouse();
  };

  Tab.prototype.bindMouseSelection = function () {
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

  Tab.prototype.pollProcessName = function(func) {
    var self = this;
    this.socket.emit('process', this.id, function(err, name) {
      if (err) return func && func(err);
      self.setProcessName(name);
      return func && func(null, name);
    });
  };

  Tab.prototype.setProcessName = function(name) {
    name = sanitize(name);

    if (this.process !== name) {
      this.emit('process', name);
    }

    if (!name) { name = 'terminal'; }

    this.process = name;
    this.button.title = name;
    this.button.innerText = name;
  };

  Tab.prototype.scroll = function() {
    var win = this.window;

    if (win) {
      setTimeout(function () {
        win.element.scrollTop = win.element.scrollHeight;
      }, 100);
    }
  };

  tty.Tab = Tab;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
