;(function() {
  var tty = this.tty
    , Terminal = this.tty.Terminal
    , Modal = this.Modal
    , cancel = this.tty.cancel
    , shortcutHelpModal;

  var shortcutsHelp = "<div class=\"shortcuts-help\">\
                        <strong>Available shortcuts:</strong> \
                        <ul>\
                          <li>create tab : <span>alt + shift + c</span></li>\
                          <li>next tab : <span>alt + shift + q</span></li>\
                          <li>previous tab : <span>alt + shift + tab</span></li>\
                          <li>split pane vertically : <span>alt + shift + v</span></li>\
                          <li>split pane horizontally : <span>alt + shift + h</span></li>\
                          <li>switch pane : <span>alt + shift + arrow</span></li>\
                        </ul>\
                      </div>";

  Terminal.prototype._keyDown = Terminal.prototype.keyDown;

  Terminal.prototype.keyDown = function(ev) {
    if (this.bindShortcuts(ev) === false) {
      return;
    }
    return this._keyDown(ev);
  };

  Terminal.prototype.bindShortcuts = function (ev) {
    if (ev.altKey && ev.shiftKey) {
      switch (ev.keyCode) {
        case 9: // tab
          tty.layout.focusPreviousTab();
          return cancel(ev);
        case 81: // q
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
        case 37: // left arrow
          tty.layout.nextPane('left');
          return cancel(ev);
        case 39:
          tty.layout.nextPane('right');
          return cancel(ev);
        case 38:
          tty.layout.nextPane('up');
          return cancel(ev);
        case 40:
          tty.layout.nextPane('down');
          return cancel(ev);
        case 191: // forward slash
          if (!shortcutHelpModal) {
            shortcutHelpModal = new Modal(shortcutsHelp);
          }
          shortcutHelpModal.show();
          return cancel(ev);
        default:
      }
    }
  };

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());
