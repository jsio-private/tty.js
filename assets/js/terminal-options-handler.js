;(function() {
  var tty = this.tty;

  var TerminalOptionsHandler = function (socket) {
    this.socket = socket;
    this.terminalOptions = {};
    this.scheduleCounters = {};
    this.linesLimit = 300;
    this.saveAfter = 5000; // 5 sec

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

    // save state if there are no new schedules (activity) for more then this.saveAfter/1000 second
    var self = this;
    var count = this.scheduleCounters[terminal.id];

    setTimeout(function () {
      if (self.scheduleCounters[terminal.id] == count) {
        self._save(terminal, fields);
        self.scheduleCounters[terminal.id] = 0;
      }
    }, this.saveAfter);
  };

  TerminalOptionsHandler.prototype._save = function (terminal, fields) {
    var options = {};

    // we will clone the terminal and cut the number of lines that will be saved
    var cloned = $.extend(true, {}, terminal);
    tty.TerminalLimitHandler.cutLines(cloned, this.linesLimit, 0);

    each(fields, function (key) {
      options[key] = cloned[key];
    });

    this.persist(terminal.id, options);
  };

  TerminalOptionsHandler.prototype.persist = function (id, options) {
    this.terminalOptions[id] = options;
    this.socket.emit('terminal options save', id, options);
  };

  tty.Controller.on('load', function () {
    tty.TerminalOptionsHandler = new TerminalOptionsHandler(tty.Controller.socket);
  });

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
