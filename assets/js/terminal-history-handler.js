;(function() {
  var tty = this.tty;

  var TerminalHistoryHandler = function (socket) {
    this.socket = socket;
    this.history = {};

    this._init();
  };

  TerminalHistoryHandler.prototype._init = function () {
    var self = this;

    self.socket.on('sync', function(state, history) {
      self.history = history;
    });
  };

  TerminalHistoryHandler.prototype.get = function (id) {
    return this.history[id] ? this.history[id] : null;
  };

  tty.Controller.on('load', function () {
    tty.TerminalHistoryHandler = new TerminalHistoryHandler(tty.Controller.socket);
  });

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
