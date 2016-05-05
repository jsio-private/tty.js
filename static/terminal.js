;(function() {
  var tty = this.tty;

  tty.Terminal = tty.Window;

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
