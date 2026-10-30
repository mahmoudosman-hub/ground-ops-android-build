/**
 * Force Native GPS on Android to prevent WebView infinite hanging.
 */
(function () {
  'use strict';
  
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
    var origGetCurrentPosition = navigator.geolocation.getCurrentPosition;
    
    navigator.geolocation.getCurrentPosition = function(success, error, options) {
      var bridge = window.Capacitor.Plugins.GopsLocation;
      
      if (bridge && bridge.getCurrentPosition) {
        // بنجبر التطبيق يروح لملف الجافا (GopsLocationPlugin) بدل المتصفح
        bridge.getCurrentPosition({ timeoutMs: 10000 }).then(function(res) {
          success({
            coords: {
              latitude: res.latitude,
              longitude: res.longitude,
              accuracy: res.accuracy || 10
            },
            timestamp: res.timestamp || Date.now()
          });
        }).catch(function(err) {
          // لو الجافا مردش، بنرجع إيرور فوراً عشان الزرار يفك
          if (error) error({ code: 3, message: err.message || 'Native GPS Failed' });
        });
      } else {
        // لو البريدج مش موجود (نسخة قديمة)، بنستخدم المتصفح
        origGetCurrentPosition.call(navigator.geolocation, success, error, options);
      }
    };
  }
})();
