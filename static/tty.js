/**
 * tty.js
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 */

;(function() {

  /**
   * Elements
   */

  var getQueryParams = function(qs) {
    var qs = qs.split("+").join(" ");

    var params = {}, tokens,
      re = /[?&]?([^=]+)=([^&]*)/g;

    while (tokens = re.exec(qs)) {
      params[decodeURIComponent(tokens[1])]
        = decodeURIComponent(tokens[2]);
    }

    return params;
  };


  var query_params = getQueryParams(location.search);

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

  /**
   * Helpers
   */

  var EventEmitter = Terminal.EventEmitter
    , inherits = Terminal.inherits
    , on = Terminal.on
    , off = Terminal.off
    , cancel = Terminal.cancel;

  /**
   * tty
   */

  var tty = new EventEmitter;

  /**
   * Shared
   */

  tty.socket;
  tty.windows;
  tty.terms;
  tty.elements;

  /**
   * Open
   */
  tty.get_default_window = function(){
    if (tty.windows.length > 0){
      return tty.windows[0];
    }else{
      return new Window;
    }
  }
  tty.open = function() {
    if (document.location.pathname) {
      base = document.location.pathname;
      if (base[0] == "/"){
        base = document.location.pathname.slice(1);
      }
      if (base[base.length - 1] == "/"){
        base = base.slice(0, base.length - 1);
      }
      if (base){
        resource = base + '/socket.io';
      } else{
        resource = 'socket.io';
      }
      var queries = []
      if (query_params.uid){
        queries.push("uid=" + query_params.uid);
      }
      if (query_params.script){
        queries.push("script=" + query_params.script);
      }
      query = queries.join("&");
      tty.socket = io.connect(null, { resource : resource,
        query : query
      });
    } else {
      tty.socket = io.connect();
    }

    tty.windows = [];
    tty.terms = {};

    tty.elements = {
      root: document.documentElement,
      body: document.body,
      h1: document.getElementsByTagName('h1')[0],
      open: document.getElementById('open'),
    };

    root = tty.elements.root;
    body = tty.elements.body;
    h1 = tty.elements.h1;
    open = tty.elements.open;

    tty.socket.on('connect', function() {
      tty.reset();
      tty.emit('connect');
      // w = tty.get_default_window();
      // // hack.. for some reason something else is sizing the window wrong...
      // w.maximize();
    });

    tty.socket.on('data', function(id, data) {
      if (!tty.terms[id]) return;
      tty.terms[id].write(data);
    });

    tty.socket.on('kill', function(id) {
      if (!tty.terms[id]) return;
      tty.terms[id]._destroy();
    });

    // We would need to poll the os on the serverside
    // anyway. there's really no clean way to do this.
    // This is just easier to do on the
    // clientside, rather than poll on the
    // server, and *then* send it to the client.
    setInterval(function() {
      var i = tty.windows.length;
      while (i--) {
        if (!tty.windows[i].focused) continue;
        tty.windows[i].focused.pollProcessName();
      }
    }, 2 * 1000);

    tty.emit('load');
    tty.emit('open');
  };

  /**
   * Reset
   */

  tty.reset = function() {
    var i = tty.windows.length;
    while (i--) {
      tty.windows[i].destroy();
    }

    tty.windows = [];
    tty.terms = {};

    tty.emit('reset');
  };

  /**
   * Window
   */

  function Window(socket) {
    var self = this;

    EventEmitter.call(this);

    var el
      , bar
      , button
      , title;

    el = document.createElement('div');
    el.className = 'window';

    bar = document.createElement('div');
    bar.className = 'bar';

    //no new/close button if we're in script mode
    if (!query_params.script){
      button = document.createElement('div');
      button.innerHTML = '+';
      button.title = 'new/close';
      button.className = 'tab plusBtn';
      bar.appendChild(button);
      bar.newButton = button;
    }

    this.socket = socket || tty.socket;
    this.element = el;
    this.bar = bar;
    this.button = button;

    this.tabs = [];
    this.focused = null;

    this.cols = Terminal.geometry[0];
    this.rows = Terminal.geometry[1];

    //body.appendChild(el);

    tty.windows.push(this);

    this.createTab();
    this.focus();

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
    x = term.element.offsetWidth * widthScaleCoefficient / fontSize | 0;
    y = (term.element.offsetHeight - 5) / charSize.height | 0;

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
    return new Tab(this, this.socket);
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

  Window.prototype.restoreTab = function(data, width, height) {
    // this code is copied from tty.open method
    // TODO clean this code
    var win = this;
    var emit = tty.socket.emit;
    tty.socket.emit = function() {};
    var tab = win.tabs[0];
    delete tty.terms[tab.id];
    tab.pty = data.pty;
    tab.id = data.term_id;
    tty.terms[data.term_id] = tab;
    tab.setProcessName(data.process);
    tty.emit('open tab', tab);
    tab.emit('open');

    setTimeout(function() {
      win.resize(width, height);
    }, 300);

    tty.socket.emit = emit;
  };

  /**
   * Tab
   */
  var num_tabs = 0
  function Tab(win, socket) {
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

    this.socket.emit('create', cols, rows, function(err, data) {
      if (err) return self._destroy();
      self.pty = data.pty;
      self.id = data.id;
      tty.terms[self.id] = self;
      self.setProcessName(data.process);
      tty.emit('open tab', self);
      self.emit('open');
    });
  };

  inherits(Tab, Terminal);

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

  /**
   * Helpers
   */

  function indexOf(obj, el) {
    var i = obj.length;
    while (i--) {
      if (obj[i] === el) return i;
    }
    return -1;
  }

  function splice(obj, el) {
    var i = indexOf(obj, el);
    if (~i) obj.splice(i, 1);
  }

  function sanitize(text) {
    if (!text) return '';
    return (text + '').replace(/[&<>]/g, '')
  }

  function getSelectionText() {
    var text = "";
    if (window.getSelection) {
      text = window.getSelection().toString();
    } else if (document.selection && document.selection.type != "Control") {
      text = document.selection.createRange().text;
    }
    return text;
  }

  /**
   * Load
   */

  function load() {
    if (load.done) return;
    load.done = true;
    if (query_params.script){
      window.onbeforeunload = function(){
        console.log('RESET');
        tty.reset();
      }
    }
    off(document, 'load', load);
    off(document, 'DOMContentLoaded', load);
    tty.open();
  }

  on(document, 'load', load);
  on(document, 'DOMContentLoaded', load);
  setTimeout(load, 200);

  /**
   * Expose
   */

  tty.Window = Window;
  tty.Tab = Tab;
  tty.Terminal = Terminal;

  this.tty = tty;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
