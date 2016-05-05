;(function() {
  var tty = this.tty;

  var EventEmitter = Terminal.EventEmitter
    , inherits = Terminal.inherits
    , on = Terminal.on
    , off = Terminal.off
    , cancel = Terminal.cancel;

  /**
   * Window
   */

  function Window(state) {
    var self = this;

    EventEmitter.call(this);

    var el
      , bar
      , title;

    el = document.createElement('div');
    el.className = 'window';

    bar = document.createElement('div');
    bar.className = 'bar';

    this.socket = tty.socket;
    this.element = el;
    this.bar = bar;

    this.tabs = [];
    this.focused = null;

    this.cols = Terminal.geometry[0];
    this.rows = Terminal.geometry[1];

    //body.appendChild(el);

    tty.windows.push(this);

    if ('id' in state) {
      this.restoreTab(state);
    } else {
      this.createTab();
    }

    this.tabs[0].once('open', function() {
      tty.emit('open window', self);
      self.emit('open');
    });
  }

  inherits(Window, EventEmitter);

  Window.prototype.focus = function() {
    // Restack
    var parent = this.element.parentNode;
    if (parent) {
      parent.removeChild(this.element);
      parent.appendChild(this.element);
    }

    // Focus Foreground Tab
    this.focused.focus();

    tty.emit('focus window', this);
    this.emit('focus');
  };

  Window.prototype.destroy = function() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.minimize) this.minimize();

    splice(tty.windows, this);
    if (tty.windows.length) tty.windows[0].focus();

    this.element.parentNode.removeChild(this.element);

    this.each(function(term) {
      term.destroy();
    });

    tty.emit('close window', this);
    this.emit('close');
  };

  Window.prototype.resize = function(width, height) {
    var self = this
      , el = this.element
      , term = this.focused
      , x
      , y;

    this.width = width;
    this.height = height;

    el.style.width = width + 'px';
    el.style.height = height + 'px';

    var charSize = term.measureCharacter();
    var fontSize = parseFloat(window.getComputedStyle(term.element, null).getPropertyValue('font-size')); // get terminal font size
    var widthScaleCoefficient = 1.63; // empirically identified
    var innerWidth = width - 4; // subtract border width
    var innerHeight = height - 4; // subtract border width

    x = innerWidth * widthScaleCoefficient / fontSize | 0;
    y = (innerHeight - 5) / charSize.height | 0;

    if (!x || !y) {
      return;
    }

    this.cols = x;
    this.rows = y;

    this.each(function(term) {
      term.resize(x, y);
    });

    tty.emit('resize window', this, x, y);
    this.emit('resize', x, y);
  };

  Window.prototype.each = function(func) {
    var i = this.tabs.length;
    while (i--) {
      func(this.tabs[i], i);
    }
  };

  Window.prototype.createTab = function() {
    return new tty.Tab(this, this.socket);
  };

  Window.prototype.restoreTab = function(data) {
    return new tty.Tab(this, this.socket, data);
  };

  Window.prototype.highlight = function() {
    var self = this;

    this.element.style.borderColor = 'orange';
    setTimeout(function() {
      self.element.style.borderColor = '';
    }, 200);

    this.focus();
  };

  Window.prototype.focusTab = function(next) {
    var tabs = this.tabs
      , i = indexOf(tabs, this.focused)
      , l = tabs.length;

    if (!next) {
      if (tabs[--i]) return tabs[i].focus();
      if (tabs[--l]) return tabs[l].focus();
    } else {
      if (tabs[++i]) return tabs[i].focus();
      if (tabs[0]) return tabs[0].focus();
    }

    return this.focused && this.focused.focus();
  };

  Window.prototype.nextTab = function() {
    return this.focusTab(true);
  };

  Window.prototype.previousTab = function() {
    return this.focusTab(false);
  };

  tty.Window = Window;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
