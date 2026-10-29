(function () {
  'use strict';
  if (!navigator.geolocation) return;
  var origGetCurrentPosition = navigator.geolocation.getCurrentPosition;
  navigator.geolocation.getCurrentPosition = function(success, error, options) {
    var isFinished = false;
    var timer = setTimeout(function() {
      if (isFinished) return;
      isFinished = true;
      if (error) error({ code: 3, message: 'Timeout: Could not get location.' });
    }, 10000); // 10 ثواني كحد أقصى
    var robustOptions = Object.assign({}, options, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
    try {
      origGetCurrentPosition.call(navigator.geolocation, function(pos) {
        if (isFinished) return;
        isFinished = true;
        clearTimeout(timer);
        if (success) success(pos);
      }, function(err) {
        if (isFinished) return;
        isFinished = true;
        clearTimeout(timer);
        if (error) error(err);
      }, robustOptions);
    } catch (e) {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      if (error) error(e);
    }
  };
})();
