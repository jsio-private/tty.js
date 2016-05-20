;(function() {
  this.tty = this.tty || {};

  var query_params = getQueryParams(location.search)
    , document = this.document
    , window = this
    , EventEmitter = this.tty.EventEmitter
    , on = this.tty.on
    , off = this.tty.off
    , cancel = this.tty.cancel;

  /**
   * tty
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
    Controller.setProcessNames();

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
      var query = queries.join("&");
      Controller.socket = io.connect(null, { resource : resource,
        query : query
      });
    } else {
      Controller.socket = io.connect();
    }
  };

  Controller.handleSocketEvents = function () {
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

  Controller.setProcessNames = function () {
    // We would need to poll the os on the serverside
    // anyway. there's really no clean way to do this.
    // This is just easier to do on the
    // clientside, rather than poll on the
    // server, and *then* send it to the client.
    setInterval(function() {
      var i = Controller.terms.length;
      while (i--) {
        Controller.terms[i].pollProcessName();
      }
    }, 2 * 1000);
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
