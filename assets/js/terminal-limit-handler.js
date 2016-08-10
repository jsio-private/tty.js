;(function() {
  var tty = this.tty;

  var TerminalLimitHandler = function () {
    this.limit = 5000;

    // 'tolerance' is used to avoid cutting lines for every new line.
    // Lines will be cut if there are more lines than 'limit + tolerance' but will be cut to 'limit'
    this.tolerance = 50;
  };

  TerminalLimitHandler.prototype.watch = function (terminal) {
    var self = this;

    terminal.on('write', function () {
      self.cutLines(terminal, self.limit, self.tolerance);
    });
  };

  TerminalLimitHandler.prototype.cutLines = function (terminal, numberOfLines, tolerance) {
    var diff = terminal.lines.length - numberOfLines;

    if (diff > tolerance) {
      terminal.lines.splice(0, diff);

      if (terminal.children.length > numberOfLines) {
        terminal.children.splice(0, terminal.children.length - numberOfLines);
      }

      if (terminal.rows > numberOfLines) {
        terminal.rows = numberOfLines;
        terminal.scrollBottom = numberOfLines - 1;
      }

      if (terminal.y > numberOfLines) {
        terminal.y = numberOfLines - 1;
      }

      if (terminal.ybase > diff) {
        terminal.ybase -= diff;
      } else if (terminal.ybase > terminal.lines.length) {
        terminal.ybase = 0;
      }

      if (terminal.ydisp > diff) {
        terminal.ydisp -= diff;
      } else if (terminal.ydisp > terminal.lines.length) {
        terminal.ydisp = 0;
      }

      terminal.refresh();
    }
  };

  tty.TerminalLimitHandler = new TerminalLimitHandler();

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
