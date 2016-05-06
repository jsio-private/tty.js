;(function() {
  var ConfigProvider = {
    getDefaultConfig: function () {
      return {
        settings:{
          hasHeaders: true,
          constrainDragToContainer: true,
          reorderEnabled: true,
          selectionEnabled: false,
          popoutWholeStack: false,
          blockedPopoutsThrowError: false,
          closePopoutsOnUnload: false,
          showPopoutIcon: false,
          showMaximiseIcon: false,
          showCloseIcon: true
        },
        content: [{
          type: 'stack',
          content: [{
            type: 'component',
            title: 'bash',
            componentName: 'bash'
          }]
        }]
      };
    },
    getBlankPaneConfig: function () {
      return {
        type: 'component',
        title: 'bash',
        componentName: 'bash'
      };
    },
    getColumnConfig: function () {
      return {
        type: 'column',
        title: 'bash',
        content:[]
      };
    },
    getRowConfig: function () {
      return {
        type: 'row',
        title: 'bash',
        content:[]
      };
    },
    getStackConfig: function () {
      return {
        type: 'stack',
        title: 'bash',
        content:[]
      };
    }
  };

  var Layout = function (state, tty) {
    var self = this;

    if(state) {
      self.layout = new GoldenLayout(JSON.parse(state));
    } else {
      self.layout = new GoldenLayout(ConfigProvider.getDefaultConfig());
    }

    self.tty = tty;
    self.activeComponent = null;
  };

  Layout.prototype.watchStateChange = function () {
    var self = this;

    this.layout.on('stateChanged', function(){
      self.tty.socket.emit('layout state change', JSON.stringify(self.layout.toConfig()));
    });
  };

  Layout.prototype.registerComponents = function () {
    var tty = this.tty;
    var self = this;

    self.layout.registerComponent('bash', function(container, componentState){
      var terminal = new tty.Terminal(componentState);

      self._bindTerminalEvents(terminal, container, componentState);

      container.getElement().get(0).appendChild(terminal.getElement());
      container.terminal = terminal;

      container.on('show', function () {
        terminal.focus();

        if (!container.dropControlProceeded) {
          container.dropControlProceeded = true;
          self._controlDrop(container);
        }
      });
      container.on('resize', function () {
        terminal.resize(container.width, container.height);
      });
      container._element.on('click', function () {
        terminal.focus();
      });
    });
  };

  Layout.prototype._bindTerminalEvents = function (terminal, container, componentState) {
    var self = this;

    terminal.on('open', function () {
      var tab = terminal.tabs[0];

      container.setState({
        'id': tab.id,
        'pty': tab.pty,
        'process': tab.process
      });

      terminal.resize(container.width, container.height);
    });

    terminal.on('focus', function () {
      self.activeComponent = container.parent;
    });
  };

  /**
   * Changing drag&drop default behaviour
   *
   * @param container
   * @private
   */
  Layout.prototype._controlDrop = function (container) {
    var stack = container.parent.isStack ? container.parent : container.parent.parent;

    if (stack.isStack && !stack.parent.isRoot) {
      // Dropping to tabs is allowed only for root stack
      var originalGetArea = stack._$getArea;
      stack._$getArea = function () {
        var area = originalGetArea.call(stack);
        delete stack._contentAreaDimensions.header;
        return area;
      };
    } else if (stack.parent.isRoot) {
      // Dropping to any other location instead of tab is disallowed for root tabs
      var originalGetArea = stack._$getArea;
      stack._$getArea = function () {
        var area = originalGetArea.call(stack);
        delete stack._contentAreaDimensions.left;
        delete stack._contentAreaDimensions.right;
        delete stack._contentAreaDimensions.top;
        delete stack._contentAreaDimensions.bottom;
        return area;
      };
    }
  };

  Layout.prototype.handleItemDrop = function () {
    var self = this;

    self.layout.on('itemDropped', function () {
      self._removeRedundantStacks();
    });
  };

  Layout.prototype._removeRedundantStacks = function () {
    var rootStack = this._getRootStack(),
      i = 0;

    for (i = 0; i < rootStack.contentItems.length; i++) {
      var item = rootStack.contentItems[i];

      // removing unnecessary stack
      if (item.contentItems.length == 1 && !item.isComponent) {
        var childItem = item.contentItems[0];
        item.contentItems = [];
        rootStack.replaceChild(item, childItem, true);
      }
    }
  };

  Layout.prototype.handleClosingTabs = function () {
    var self = this;

    self.layout.on('tabCreated', function (tab) {
      tab
        .closeElement
        .off( 'click' ) // unbind the current click handler
        .click(function(event){
          if (self.canRemoveTab(tab)) {
            if (tab.contentItem.isComponent) {
              tab.contentItem.container.terminal.destroy();
            }
            tab._onCloseClickFn(event);
            self._removeRedundantStacks();
          }
        });

      tab
        .element
        .off( 'click' ) // unbind the current click handler
        .click(function(event) {
          if (event.button !== 1 || self.canRemoveTab(tab)) {
            tab._onTabClickFn(event);

            if (event.button === 1) { // middle button closes tab
              if (tab.contentItem.isComponent) {
                tab.contentItem.container.terminal.destroy();
              }
              self._removeRedundantStacks();
            }
          }
        });
    });
  };

  Layout.prototype.canRemoveTab = function (tab) {
    var parent = tab.contentItem.parent;

    // Tab can be removed if there are more than one tabs in root stack
    if (parent.parent.isRoot && parent.contentItems.length < 2) {
      return false;
    }

    return true;
  };

  Layout.prototype.manageControls = function () {
    var self = this;

    self.layout.on('stackCreated', function(stack){
      self._cleanControls(stack);

      if (stack.parent.isRoot) {
        // add "New Tab" control
        self._addNewTabBtn(stack);
      } else {
        self._addSplitVerticalBtn(stack);
        self._addSplitHorizontalBtn(stack);
      }
    });
  };

  Layout.prototype._cleanControls = function (stack) {
    stack.header.controlsContainer.find('.lm_close').remove();
  }

  Layout.prototype._addNewTabBtn = function (stack) {
    var $addTabBtn = $('<li title="New Tab">+</li>');
    var self = this;

    stack.header.controlsContainer.prepend($addTabBtn);

    $addTabBtn.on('click', function () {
      self.newTab(stack);
    });
  };

  Layout.prototype._addSplitVerticalBtn = function (stack) {
    var $splitVerticalBtn = $('<li title="Split Vertical">||</li>');
    var self = this;

    stack.header.controlsContainer.prepend($splitVerticalBtn);

    $splitVerticalBtn.on('click', function () {
      self.splitVertical(stack);
    });
  };

  Layout.prototype._addSplitHorizontalBtn = function (stack) {
    var $splitHorizontalBtn = $('<li title="Split Horizontal">=</li>');
    var self = this;

    stack.header.controlsContainer.prepend($splitHorizontalBtn);

    $splitHorizontalBtn.on('click', function () {
      self.splitHorizontal(stack);
    });
  };

  Layout.prototype.newTab = function (stack) {
    stack.addChild(ConfigProvider.getBlankPaneConfig());
  };

  Layout.prototype.splitVertical = function (stack) {
    var parent = stack.parent;

    if (parent.isRow) {
      parent.addChild(ConfigProvider.getBlankPaneConfig(), this.getItemIndex(stack) + 1);
    } else {
      this._injectParent(stack, ConfigProvider.getRowConfig());
    }
  };

  Layout.prototype.splitHorizontal = function (stack) {
    var parent = stack.parent;

    if (parent.isColumn) {
      parent.addChild(ConfigProvider.getBlankPaneConfig(), this.getItemIndex(stack) + 1);
    } else {
      this._injectParent(stack, ConfigProvider.getColumnConfig());
    }
  };

  Layout.prototype._injectParent = function (stack, parentConfig) {
    var parent = stack.parent;
    var index = this.getItemIndex(stack);

    parent.addChild(parentConfig, index);
    var newParent = parent.contentItems[index];

    if (parent.parent.isRoot) {
      // special case
      var stackConfig = stack.config;
      parent.removeChild(stack);
      newParent.addChild(stackConfig);
    } else {
      parent.removeChild(stack, true);
      newParent.addChild(stack);
    }

    newParent.addChild(ConfigProvider.getBlankPaneConfig());
  };

  Layout.prototype.getItemIndex = function (item) {
    var contentItems = item.parent.contentItems;
    var i = 0;

    while (i < contentItems.length) {
      if (contentItems[i] == item) {
        return i;
      }
      i++;
    }
  };

  Layout.prototype._getRootStack = function () {
    var rootStacks = this.layout.root.getItemsByType('stack');

    if (rootStacks.length) {
      return rootStacks[0];
    }
  };

  Layout.prototype.getActiveTab = function () {
    var rootStack = this._getRootStack();
    return rootStack ? rootStack.getActiveContentItem() : null;
  };

  Layout.prototype.getActivePane = function () {
    if (!this.activeComponent) {
      return this.getActiveTab();
    }

    var activePane = this.activeComponent.parent;

    return activePane.parent.isRoot
      ? this.activeComponent : activePane;
  };

  Layout.prototype.focusTab = function (index) {
    var rootStack = this._getRootStack();

    if (rootStack && rootStack.contentItems[index]) {
      return rootStack.setActiveContentItem(rootStack.contentItems[index]);
    }
  };

  Layout.prototype.focusNextTab = function () {
    var active = this.getActiveTab();
    if (active) {
      return this.focusTab(this.getItemIndex(active) + 1);
    }
  };

  Layout.prototype.focusPreviousTab = function () {
    var active = this.getActiveTab();
    if (active) {
      return this.focusTab(this.getItemIndex(active) - 1);
    }
  };

  Layout.prototype.addNewTab = function () {
    var rootStack = this._getRootStack();
    if (rootStack) {
      return this.newTab(rootStack);
    }
  };

  Layout.prototype.splitActiveVertical = function () {
    var active = this.getActivePane();
    if (active) {
      return this.splitVertical(active);
    }
  };

  Layout.prototype.splitActiveHorizontal = function () {
    var active = this.getActivePane();
    if (active) {
      return this.splitHorizontal(active);
    }
  };

  Layout.prototype.getItemComponents = function (item) {
    var components = [];
    var i;

    for (i = 0; i < item.contentItems.length; i++) {
      if (item.contentItems[i].isComponent) {
        components.push(item.contentItems[i]);
      } else {
        components = components.concat(this.getItemComponents(item.contentItems[i]));
      }
    }

    return components;
  };

  Layout.prototype.nextPane = function () {
    var activeTab = this.getActiveTab();

    if (activeTab) {
      var components = this.getItemComponents(activeTab);
      var i = 0;

      while (i < components.length) {
        if (components[i] == this.activeComponent) {
          var next = (i == components.length - 1) ? components[0] : components[i+1];
          next.container.terminal.focus();
          return;
        }
        i++;
      }
    }
  };

  Layout.prototype.init = function () {
    this.watchStateChange();
    this.registerComponents();
    this.manageControls();
    this.handleItemDrop();
    this.handleClosingTabs();
    this.layout.init();
  };

  var self = this;

  self.tty.on('load', function () {
    self.tty.socket.on('sync', function(state) {
      self.tty.reset();
      var layout = new Layout(state, self.tty);
      layout.init();

      self.tty.layout = layout;
    });
  });
}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }());