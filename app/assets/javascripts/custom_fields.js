window.ST = window.ST || {}; 
window.ST.customFields = function() {

  /**
    Fetch all custom field rows and save them to a variable
  */
  var customFields = $(".custom-field-list-row").map(function(id, row) {
    return { 
      id: $(row).data("field-id"),
      element: $(row)
    };
  }).get();

  /**
    Order manager is in charge of keeping and updating the field order.
    It provides three methods:

    - `up(fieldId)`: Moves up
    - `down(fieldId)`: Moves down
    - `getOrder()`: Returns array of fieldIds, in correct order
  */
  var orderManager = (function createSwapper(fieldMap, utils) {
    function swapDomElements(downEl, upEl) {
      var downDone = downEl.transition({ y: upEl.height() }).promise();
      var upDone = upEl.transition({ y: (-1) * downEl.height() }).promise();

      $.when(downDone, upDone).done(function() {
        $(downEl).before($(upEl));
        upEl.transition({y: 0, duration: 0});
        downEl.transition({y: 0, duration: 0});
      });
    }

    function swap(downId, upId) {
      var downEl = fieldMap[downId].element;
      var upEl = fieldMap[upId].element;

      swapDomElements(downEl, upEl);
      fieldMap = utils.swapArrayElements(fieldMap, downId, upId);
    }

    function createSwapFn(upIdFinder, downIdFinder) {
      var byFieldId = _.curry(function(id, field) {
        return field.id == id;
      });

      return function(fieldId) {
        var upArrayId = upIdFinder(fieldMap, byFieldId(fieldId));
        var downArrayId = downIdFinder(fieldMap, byFieldId(fieldId));

        if (downArrayId >= 0 && upArrayId >= 0) {
          swap(downArrayId, upArrayId);
        }
      }
    }

    return {
      up: createSwapFn(_.findIndex, utils.findPrevIndex),
      down: createSwapFn(utils.findNextIndex, _.findIndex),
      getOrder: function() {
        return _.map(fieldMap, 'id');
      }
    }
  })(customFields, ST.utils);

  function customFieldUrl(url) {
    return [window.location.pathname, url].join("/").replace("//", "/");
  }

  function clickStream(selector, field) {
    return $(selector, field.element).clickE().doAction(".preventDefault").map(_.constant(field.id));
  }

  /**
    For each custom field, setup click listeners (streams, using Bacon)
  */
  var upAndDownStreams = _.flatten(customFields.map(function(field) {

    var up = clickStream(".custom-fields-action-up", field);
    var down = clickStream(".custom-fields-action-down", field);

    up.onValue(orderManager.up);
    down.onValue(orderManager.down);

    return [up, down];
  }));

  var ajaxRequest = Bacon.mergeAll.apply(null, upAndDownStreams).debounce(800).map(function() {
    return orderManager.getOrder();
  }).toProperty(orderManager.getOrder())
    .skipDuplicates(_.isEqual)
    .changes()
    .map(function(order) {
    return {
      type: "POST",
      url: customFieldUrl("order"),
      data: { order: orderManager.getOrder() }
    };
  }).log("ajaxRequest");

  var ajaxResponse = ajaxRequest.ajax()
    .map(function() { return true; })
    .mapError(function() { return false; });

  ajaxRequest.onValue(function() {
    $("#custom-field-ajax-saving").show();
    $("#custom-field-ajax-error").hide();
    $("#custom-field-ajax-success").hide();
  });

  var canHideLoadingMessage = ajaxRequest.flatMapLatest(function() {
    return Bacon.later(1000, true).toProperty(false);
  }).toProperty(false);

  var isTrue = function(value) { return value === true};
  var isFalse = function(value) { return value === false};

  canHideLoadingMessage.and(ajaxResponse).filter(isTrue).onValue(function(v) {
    $("#custom-field-ajax-saving").hide();
    $("#custom-field-ajax-success").show();
  });

  canHideLoadingMessage.and(ajaxResponse.not()).filter(isTrue).onValue(function(v) {
    $("#custom-field-ajax-saving").hide();
    $("#custom-field-ajax-error").show();
  });

  canHideLoadingMessage.and(ajaxResponse).debounce(3000).onValue(function() {
    $("#custom-field-ajax-success").fadeOut();
  });
};