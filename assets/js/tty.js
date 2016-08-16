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
    , EventEmitter = this.tty.EventEmitter
    , on = this.tty.on
    , off = this.tty.off
    , cancel = this.tty.cancel;

  /**
   * Controller
   */

  var Controller = new EventEmitter;

  /**
   * Shared
   */

  Controller.socket;
  Controller.terms = {};
  Controller.buffer = {};

  /**
   * Open
   */
  Controller.open = function() {
    Controller.openSocket();
    Controller.handleSocketEvents();

    Controller.emit('load');
    Controller.emit('open');
  };

  Controller.openSocket = function () {
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
      queries.push("sessionId=" + Controller.getSessionId());
      queries.push("userAgentId=" + Controller.getUserAgentId());

      var query = queries.join("&");
      Controller.socket = io.connect(null, {resource : resource,
        query : query
      });
    } else {
      Controller.socket = io.connect();
    }
  };

  Controller.handleSocketEvents = function () {
    Controller.socket.on('session', function(data) {
      Controller.socket.sessionInitialized = true;
      Controller.saveSessionId(data.sessionId);
    });

    Controller.socket.on('connect', function() {
      Controller.reset();
      Controller.emit('connect');
    });

    Controller.socket.on('data', function(id, data) {
      if (!Controller.terms[id]) {
        Controller.saveToBuffer(id, data);
        return;
      }
      Controller.terms[id].write(data);
    });

    Controller.socket.on('kill', function(id) {
      if (!Controller.terms[id]) return;
      Controller.terms[id].destroy();
    });
  };

  /**
   * Reset
   */

  Controller.reset = function() {
    var i = Controller.terms.length;
    while (i--) {
      Controller.terms[i].destroy();
    }

    Controller.terms = {};
    Controller.emit('reset');
  };


  Controller.registerTerminal = function (term) {
    Controller.terms[term.id] = term;
  };

  Controller.unregisterTerminal = function (term) {
    if (Controller.terms[term.id]) {
      delete Controller.terms[term.id];
    }
  };

  Controller.hasTerminals = function () {
    return !$.isEmptyObject(Controller.terms);
  };

  Controller.getSessionId = function () {
    if (typeof(Storage) !== "undefined" && sessionStorage.sessionId) {
      return sessionStorage.sessionId;
    }
    return null;
  };

  Controller.saveSessionId = function (id) {
    if (typeof(Storage) !== "undefined") {
      sessionStorage.sessionId = id;
    }
  };

  Controller.clearSession = function () {
    Controller.socket.emit('destroy session');

    if (typeof(Storage) !== "undefined" && sessionStorage.sessionId) {
      delete sessionStorage.sessionId;
    }

    location.reload();
  };

  Controller.getUserAgentId = function () {
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

  Controller.saveToBuffer = function (id, data) {
    if (typeof Controller.buffer[id] == 'undefined') {
      Controller.buffer[id] = [];
    }
    Controller.buffer[id].push(data);
  };

  Controller.pullFromBuffer = function (id) {
    if (!Controller.terms[id] || !Controller.buffer[id]) return;

    var buffer = Controller.buffer[id];
    var term = Controller.terms[id];

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
        Controller.reset();
      }
    }
    off(document, 'load', load);
    off(document, 'DOMContentLoaded', load);
    Controller.open();
  }

  on(document, 'load', load);
  on(document, 'DOMContentLoaded', load);
  setTimeout(load, 200);

  /**
   * Expose
   */

  this.tty.Controller = Controller;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());

