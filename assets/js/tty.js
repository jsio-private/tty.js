/**
 * tty.js
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 */

;(function() {

  /**
   * Elements
   */

  var query_params = getQueryParams(location.search)
    , document = this.document
    , window = this
    , EventEmitter = Terminal.EventEmitter
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
  tty.terms = {};
  tty.buffer = {};

  /**
   * Open
   */
  tty.open = function() {
    tty.openSocket();
    tty.handleSocketEvents();

    tty.emit('load');
    tty.emit('open');
  };

  tty.openSocket = function () {
    if (document.location.pathname) {
      var base = document.location.pathname;
      if (base[0] == "/"){
        base = document.location.pathname.slice(1);
      }
      if (base[base.length - 1] == "/"){
        base = base.slice(0, base.length - 1);
      }
      if (base){
        var resource = base + '/socket.io';
      } else{
        var resource = 'socket.io';
      }
      var queries = []
      if (query_params.uid){
        queries.push("uid=" + query_params.uid);
      }
      if (query_params.script){
        queries.push("script=" + query_params.script);
      }
      queries.push("sessionId=" + tty.getSessionId());
      queries.push("userAgentId=" + tty.getUserAgentId());

      var query = queries.join("&");
      tty.socket = io.connect(null, {resource : resource,
        query : query
      });
    } else {
      tty.socket = io.connect();
    }
  };

  tty.handleSocketEvents = function () {
    tty.socket.on('session', function(data) {
      tty.socket.sessionInitialized = true;
      tty.saveSessionId(data.sessionId);
    });

    tty.socket.on('connect', function() {
      tty.reset();
      tty.emit('connect');
    });

    tty.socket.on('data', function(id, data) {
      if (!tty.terms[id]) {
        tty.saveToBuffer(id, data);
        return;
      }
      tty.terms[id].write(data);
    });

    tty.socket.on('kill', function(id) {
      if (!tty.terms[id]) return;
      tty.terms[id].destroy();
    });
  };

  /**
   * Reset
   */

  tty.reset = function() {
    var i = tty.terms.length;
    while (i--) {
      tty.terms[i].destroy();
    }

    tty.terms = {};
    tty.emit('reset');
  };


  tty.registerTerminal = function (term) {
    tty.terms[term.id] = term;
  };

  tty.unregisterTerminal = function (term) {
    if (tty.terms[term.id]) {
      delete tty.terms[term.id];
    }
  };

  tty.hasTerminals = function () {
    return !$.isEmptyObject(tty.terms);
  };

  tty.getSessionId = function () {
    if (typeof(Storage) !== "undefined" && sessionStorage.sessionId) {
      return sessionStorage.sessionId;
    }
    return null;
  };

  tty.saveSessionId = function (id) {
    if (typeof(Storage) !== "undefined") {
      sessionStorage.sessionId = id;
    }
  };

  tty.clearSession = function () {
    tty.socket.emit('destroy session');

    if (typeof(Storage) !== "undefined" && sessionStorage.sessionId) {
      delete sessionStorage.sessionId;
    }

    location.reload();
  };

  tty.getUserAgentId = function () {
    if (typeof(Storage) === "undefined") {
      return null;
    }

    var id = localStorage.getItem("ttyUserAgentID");
    if (!id) {
      id = navigator.userAgent;
      localStorage.setItem("ttyUserAgentID", id);
    }
    return id;
  };

  tty.saveToBuffer = function (id, data) {
    if (typeof tty.buffer[id] == 'undefined') {
      tty.buffer[id] = [];
    }
    tty.buffer[id].push(data);
  };

  tty.pullFromBuffer = function (id) {
    if (!tty.terms[id] || !tty.buffer[id]) return;

    var buffer = tty.buffer[id];
    var term = tty.terms[id];

    while (buffer.length) {
      var data = buffer.shift();
      term.write(data);
    }
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

  tty.cancel = cancel;
  this.tty = tty;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());

