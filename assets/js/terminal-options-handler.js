;(function() {
  var tty = this.tty;

  var TerminalOptionsHandler = function (socket) {
    this.socket = socket;
    this.terminalOptions = {};
    this.scheduleCounters = {};

    this._restore();
  };

  TerminalOptionsHandler.prototype._restore = function () {
    var self = this;

    self.socket.on('sync', function(state, terminalOptions) {
      self.terminalOptions = terminalOptions;
    });
  };

  TerminalOptionsHandler.prototype.get = function (id) {
    return this.terminalOptions[id] ? this.terminalOptions[id] : null;
  };

  TerminalOptionsHandler.prototype.watch = function (terminal, fields) {
    var self = this;

    terminal.on('write', function () {
      self._scheduleForSaving(terminal, fields);
    });

    terminal.on('resize', function () {
      self._scheduleForSaving(terminal, fields);
    });
  };

  TerminalOptionsHandler.prototype._scheduleForSaving = function (terminal, fields) {
    if (typeof this.scheduleCounters[terminal.id] === 'undefined') {
      this.scheduleCounters[terminal.id] = 0;
    }

    this.scheduleCounters[terminal.id]++;

    // save state if there are no new schedules (activity) for more then 1 second
    // or every 100th schedule
    if (this.scheduleCounters[terminal.id] > 100) {
      this.scheduleCounters[terminal.id] = 0;
      this._save(terminal, fields);
    } else {
      var self = this;
      var count = this.scheduleCounters[terminal.id];

      setTimeout(function () {
        if (self.scheduleCounters[terminal.id] == count) {
          self._save(terminal, fields);
          self.scheduleCounters[terminal.id] = 0;
        }
      }, 1000);
    }
  };

  TerminalOptionsHandler.prototype._save = function (terminal, fields) {
    var options = {};

    each(fields, function (key) {
      options[key] = terminal[key];
    });

    this.persist(terminal.id, options);
  };

  TerminalOptionsHandler.prototype.persist = function (id, options) {
    this.terminalOptions[id] = options;
    this.socket.emit('terminal options save', id, options);
  };

  tty.on('load', function () {
    tty.TerminalOptionsHandler = new TerminalOptionsHandler(tty.socket);
  });

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
