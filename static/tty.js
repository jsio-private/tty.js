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
  tty.open = function() {
    if (document.location.pathname) {
      var base = document.location.pathname;
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

  this.tty = tty;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
