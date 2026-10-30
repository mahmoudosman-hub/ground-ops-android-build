/**
 * Ground OPS - Delivery 33 v2 (native Android FCM token)
 * الإصلاح: تسجيل مرة واحدة لكل سيشن بدل التكرار + تحديد المنصة 'android'
 * + حفظ التوكن عشان يتلغي تلقائياً عند الـ logout.
 */
(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  var PLATFORM = 'android';
  var RECHECK_MS = 6 * 60 * 60 * 1000; // إعادة تسجيل احتياطية كل 6 ساعات

  function getSession() {
    try {
      var raw = localStorage.getItem('gops.session.employee') || sessionStorage.getItem('gops.session.employee');
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && v.token) ? v : null;
    } catch (e) { return null; }
  }

  function regState() {
    try { return JSON.parse(localStorage.getItem('gops.fcm.state') || 'null'); } catch (e) { return null; }
  }
  function saveRegState(st) {
    try { localStorage.setItem('gops.fcm.state', JSON.stringify(st)); } catch (e) {}
  }

  function needsRegister(fcmToken, employeeId) {
    var st = regState();
    if (!st) return true;
    if (st.token !== fcmToken) return true;
    if (st.employee !== employeeId) return true;
    if (!st.at || (Date.now() - st.at) > RECHECK_MS) return true;
    return false;
  }

  var inFlight = false;
  async function registerNativeToken() {
    if (inFlight) return;
    var token = null;

    // 1. بنجرب نجيب التوكن من الجسر بتاع الجافا
    if (window.AndroidNative && typeof window.AndroidNative.getNativeToken === 'function') {
      token = window.AndroidNative.getNativeToken();
    }
    // 2. لو الجسر لسه مرجعش، بنجرب المتغير العادي
    if (!token && window.nativeFcmToken) {
      token = window.nativeFcmToken;
    }

    if (token && token !== 'null' && token !== '') {
      var sess = getSession();
      if (!sess || !sess.user || !sess.user.employee_id) {
        setTimeout(registerNativeToken, 3000);
        return;
      }

      try { var saved = localStorage.getItem('gops.fcm.token') || ''; } catch (e) { var saved = ''; }
      if (saved === token && !needsRegister(token, sess.user.employee_id)) return; // متسجل خلاص

      inFlight = true;
      var apiUrl = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL;
      if (apiUrl) {
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'registerPushToken',
              token: sess.token,
              payload: { token: token, platform: PLATFORM },
              client: 'native-app/2.0'
            })
          });
          const data = await res.json();
          if (data && data.success) {
            try { localStorage.setItem('gops.fcm.token', token); } catch (e) {}
            saveRegState({ token: token, employee: sess.user.employee_id, platform: PLATFORM, at: Date.now() });
            console.log('✅ Native FCM token registered once for:', sess.user.employee_id);
          } else {
            console.error('❌ registerPushToken failed:', data);
          }
        } catch (e) {
          console.error('❌ Failed to register native token', e);
        } finally {
          inFlight = false;
        }
      } else {
        inFlight = false;
      }
    } else {
      // الجافا لسه مبعتش التوكن — نجرب تاني
      setTimeout(registerNativeToken, 2000);
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(registerNativeToken, 2000);
  } else {
    window.addEventListener('load', function () { setTimeout(registerNativeToken, 2000); });
  }
})();
