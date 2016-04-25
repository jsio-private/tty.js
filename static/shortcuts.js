;(function() {
  var tty = this.tty;

  var Tab = tty.Tab,
      cancel = tty.Terminal.cancel;

  Tab.prototype._keyDown = Tab.prototype.keyDown;

  Tab.prototype.keyDown = function(ev) {
    this.bindShortcuts(ev);
    return this._keyDown(ev);
  };

  Tab.prototype.bindShortcuts = function (ev) {
    if (ev.altKey && ev.shiftKey) {
      switch (ev.keyCode) {
        case 37: // left arrow
          tty.layout.focusPreviousTab();
          return cancel(ev);
        case 39: // right arrow
          tty.layout.focusNextTab();
          return cancel(ev);
        case 67: // c
          tty.layout.addNewTab();
          return cancel(ev);
        case 72: // h
          tty.layout.splitActiveHorizontal();
          return cancel(ev);
        case 86: // v
          tty.layout.splitActiveVertical();
          return cancel(ev);
        default:
      }
    }
  };

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
