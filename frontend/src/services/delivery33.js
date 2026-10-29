(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  function getSession() {
    try {
      var raw = localStorage.getItem('gops.session.employee') || sessionStorage.getItem('gops.session.employee');
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && v.token) ? v : null;
    } catch (e) { return null; }
  }

  async function registerNativeToken() {
    if (window.nativeFcmToken) {
      var sess = getSession();
      var apiUrl = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL;
      
      if (sess && sess.token && apiUrl) {
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'registerPushToken',
              token: sess.token,
              payload: { token: window.nativeFcmToken },
              client: 'native-app/1.0'
            })
          });
          const data = await res.json();
          console.log("✅ Native FCM Token registered to server:", data);
        } catch (e) {
          console.error("❌ Failed to register native token", e);
        }
      }
    } else {
      setTimeout(registerNativeToken, 2000);
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(registerNativeToken, 2000);
  } else {
    window.addEventListener('load', function() { setTimeout(registerNativeToken, 2000); });
  }
})();
