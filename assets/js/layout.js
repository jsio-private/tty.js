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
    self.terminalOptionsLimit = 10000;
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
      var terminalOptions = 'terminalOptions' in componentState ? componentState.terminalOptions : {};
      var terminal = new tty.Terminal(tty.socket, terminalOptions);

      self._bindTerminalEvents(terminal, container);
      terminal.connect();

      container.getElement().get(0).appendChild(terminal.getElement());
      container.terminal = terminal;

      container.on('show', function () {
        setTimeout(function () {
          terminal.focus();
        }, 100);
      });
      container.on('resize', function () {
        terminal.changeDimensions(container.width, container.height);
      });
      container._element.on('click', function () {
        terminal.focus();
      });
      container.on('open', function () {
        if (!container.dropControlProceeded) {
          container.dropControlProceeded = true;
          self._controlDrop(container);
        }
      });
    });
  };

  Layout.prototype._bindTerminalEvents = function (terminal, container) {
    var self = this;

    terminal.on('connect', function () {
      self.tty.registerTerminal(terminal);
      terminal.changeDimensions(container.width, container.height);
      self._saveContainerState(container, terminal);
    });

    terminal.on('focus', function () {
      self.activeComponent = container.parent;
    });

    terminal.on('request create', function() {
      self.addNewTab();
    });

    terminal.on('request term', function(key) {
      self.focusTab(key);
    });

    terminal.on('request term next', function() {
      self.focusNextTab();
    });

    terminal.on('request term previous', function() {
      self.focusPreviousTab();
    });

    terminal.on('destroy', function () {
      self.tty.unregisterTerminal(terminal);

      if (!self.tty.hasTerminals()) {
        self.addNewTab();
      }

      if (self.activeComponent == container.parent) {
        if (!self.nextPane('down')) {
          self.focusNextTab();
        }
      } else {
        focusComponent(self.activeComponent);
      }

      container.close();
      self._removeRedundantStacks();
    });

    //terminal.on('write', function () {
    //  self._scheduleForSavingState(container, terminal);
    //});
    //
    //terminal.on('resize', function () {
    //  self._scheduleForSavingState(container, terminal);
    //});

    terminal.on('process', function () {
      container.setTitle(terminal.process);
    });
  };

  Layout.prototype._scheduleForSavingState = function (container, terminal) {
    if (typeof container.schedulerCounter === 'undefined') {
      container.schedulerCounter = 0;
    }

    container.schedulerCounter++;

    // save state if there are no new schedules (activity) for more then 1 second
    // or every 100th schedule
    if (container.schedulerCounter > 100) {
      container.schedulerCounter = 0;
      self._saveContainerState(container, terminal);
    } else {
      var self = this;
      var count = container.schedulerCounter;

      setTimeout(function () {
        if (container.schedulerCounter == count) {
          self._saveContainerState(container, terminal);
          container.schedulerCounter = 0;
        }
      }, 1000);
    }
  };

  Layout.prototype._saveContainerState = function (container, terminal) {
    var options = {};

    each(this.tty.Terminal.stateFields, function (key) {
      if ($.isArray(terminal[key])) {
        options[key] = $.extend(true, [], terminal[key]);
      } else if (typeof terminal[key] == 'object' && terminal[key]) {
        options[key] = $.extend(true, {}, terminal[key]);
      } else {
        options[key] = terminal[key];
      }
    });

    container.setState({
      terminalOptions: this._limitStateOptions(options)
    });
  };

  Layout.prototype._limitStateOptions = function (options) {
    if (options['lines'] && options['lines'].length > this.terminalOptionsLimit) {
      options['lines'] = options['lines'].splice(options['lines'].length - this.terminalOptionsLimit, this.terminalOptionsLimit);
    }

    if (options['children'] && options['children'].length > this.terminalOptionsLimit) {
      options['children'] = options['children'].splice(options['children'].length - this.terminalOptionsLimit, this.terminalOptionsLimit);
    }

    if (options['rows'] && options['rows'] > this.terminalOptionsLimit) {
      options['rows'] = this.terminalOptionsLimit;
      options['scrollBottom'] = options['rows'] - 1;
    }

    if (options['y'] && options['y'] > this.terminalOptionsLimit) {
      options['y'] = this.terminalOptionsLimit - 1;
    }

    return options;
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

      // fix GL issue with dropping tab nowhere
      var originalOnDrop = stack._$onDrop;
      stack._$onDrop = function (contentItem) {
        if (!this._dropSegment) {
          this._dropSegment = 'header';
        }

        return originalOnDrop.call(stack, contentItem);
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
        self._addRefreshBtn(stack);
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

  Layout.prototype._addRefreshBtn = function (stack) {
    var $btn = $('<li title="Refresh session">↺</li>');
    var self = this;

    stack.header.controlsContainer.prepend($btn);

    $btn.on('click', function () {
      if (confirm("Are you sure want to refresh the session?")) {
        self.tty.clearSession();
      }
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

  var focusComponent = function (component) {
    if (!component) {
      return;
    }

    component.container.terminal.focus();
    return true;
  };

  var mod = function(n1, n2) {
    return ((n1 % n2) + n2) % n2;
  };

  var getNextLmItem = function(item, dir) {
    var parent = item.parent();

    var favorClass, otherClass;
    if (dir === 'left' || dir === 'right') {
      favorClass = 'lm_row';
      otherClass = 'lm_column';
    } else {
      favorClass = 'lm_column';
      otherClass = 'lm_row';
    }

    if (parent.hasClass(otherClass)) {
      if (!parent.hasClass('lm_item')) {
        return item;
      }
      return getNextLmItem(parent, dir);
    }

    if (parent.hasClass(favorClass)) {
      var siblings = parent.children('.lm_item');
      var selfIndex = siblings.index(item);
      var intDir = dir === 'left' || 'up' ? -1 : 1;
      var nextIndex = mod(selfIndex + intDir, siblings.length);
      return $(siblings[nextIndex]);
    }

    if (!parent.hasClass('lm_item')) {
      return item;
    }

    console.error(item, dir);
    throw new Error('Unknown parent item');
  };

  var getContainerFromLmItem = function(item) {
    if (item.hasClass('lm_stack')) {
      return item.find('.lm_item_container');
    }

    var childItems = item.find('.lm_item');
    return getContainerFromLmItem(childItems.first());
  };

  Layout.prototype.nextPane = function (dir) {
    var activeTab = this.getActiveTab();

    if (!activeTab) {
      return;
    }

    var components = this.getItemComponents(activeTab);
    if (components.length === 0) {
      return;
    }
    if (components.length === 1) {
      return focusComponent(components[0]);
    }

    var parentStack = this.activeComponent.element.closest('.lm_stack');
    var nextLmItem = getNextLmItem(parentStack, dir);
    var nextContainer = getContainerFromLmItem(nextLmItem);

    var nextComponent;
    for (var i = 0; i < components.length; i++) {
      var component = components[i];
      if (component.element.is(nextContainer)) {
        nextComponent = component;
        break;
      }
    }

    if (!nextComponent) {
      console.error(nextContainer, components);
      throw new Error('No next component');
    }

    return focusComponent(nextComponent);
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