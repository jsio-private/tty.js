(function($) {
  var modalHtml = '<div class="modal"> \
                    <div class="modal-content"> \
                      <a href="javascript:void(0)" class="btn btn--link btn--primary close">✕</a> \
                      <div class="modal-body">\
                      </div> \
                    </div> \
                  </div>';

  var Modal = function (content) {
    var me = this;

    me.content = content;
    me.$modal = $(modalHtml);
    me.$modal.find('.modal-body').html(me.content);
    me.$modal.hide();
    $("body").append(me.$modal);

    me.$modal.find('.close').on('click', function () {
      me.$modal.hide();
    });
  };

  Modal.prototype.show = function () {
    if (!this.$modal.is(":visible")) {
      this.$modal.show();
    }
  };

  this.Modal = Modal;
}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
  }(), jQuery);
