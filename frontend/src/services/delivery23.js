/**
 * Ground OPS - Delivery 23 v5 (Register once per session + platform + clean logout)
 * الإصلاح: كان بيسجل التوكن كل 3 ثواني طول ما التطبيق مفتوح — وكل طلب بيحجز قفل السيرفر
 * ويمسح ويعيد كتابة صف في الشيت. دلوقتي: بيسجل مرة واحدة بس (أو لو التوكن/الحساب اتغير).
 */
(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  var firebaseConfig = {
    apiKey: "AIzaSyDwzrZIftyjwy_mukvWha4EhqDfBOV2UlY",
    authDomain: "ground-ops-tracker.firebaseapp.com",
    projectId: "ground-ops-tracker",
    storageBucket: "ground-ops-tracker.firebasestorage.app",
    messagingSenderId: "295865086509",
    appId: "1:295865086509:web:b9d4be3e43472f557e3ea4"
  };
  var VAPID_KEY = "BLYivja7AsoY3Qktg5NkIoLOU1bcbVTWHLxxh_QzyGqv0gyHcjuP7TGtJtM9kt1dqzOJcbiPQWm-TSDaaAhWvKw";
  var PLATFORM = 'web';
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
    if (st.token !== fcmToken) return true;                 // التوكن نفسه اتغير
    if (st.employee !== employeeId) return true;            // حساب مختلف على نفس الجهاز
    if (!st.at || (Date.now() - st.at) > RECHECK_MS) return true; // مراجعة دورية
    return false;
  }

  var inFlight = false;
  async function registerToken() {
    if (inFlight) return;
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

      var sess = getSession();
      if (!sess || !sess.user || !sess.user.employee_id) return;

      var fcmToken = null;
      try { fcmToken = localStorage.getItem('gops.fcm.token') || ''; } catch (e) {}

      // متسجل خلاص؟ متبعتش حاجة خالص (دي كانت سبب زحمة السيرفر)
      if (fcmToken && !needsRegister(fcmToken, sess.user.employee_id)) return;

      inFlight = true;
      var { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
      var { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js');

      var app = initializeApp(firebaseConfig);
      var messaging = getMessaging(app);

      var registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
      var currentToken = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

      if (currentToken) {
        try { localStorage.setItem('gops.fcm.token', currentToken); } catch (e) {}
        var apiUrl = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL;

        if (apiUrl) {
          var res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'registerPushToken',
              token: sess.token,
              payload: { token: currentToken, platform: PLATFORM },
              client: 'auto-register/5.0'
            })
          });
          var out = null;
          try { out = await res.json(); } catch (e) {}
          if (out && out.success) {
            saveRegState({ token: currentToken, employee: sess.user.employee_id, platform: PLATFORM, at: Date.now() });
            console.log('✅ Push token registered once for:', sess.user.employee_id);
            var btn = document.getElementById('gops-enable-notif-btn');
            if (btn) btn.remove();
          }
        }
      }
    } catch (err) {
      console.error('Push Error:', err);
    } finally {
      inFlight = false;
    }
  }

  async function requestNotificationPermission() {
    try {
      var permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await registerToken();
      }
    } catch (err) {
      console.error('Notification request error:', err);
    }
  }

  function checkAndRegister() {
    if (!getSession()) return;
    if (!('Notification' in window)) return;

    // لو الإذن متأكد منه خلاص، نتأكد إن التسجيل محتاج يجدد وبس
    if (Notification.permission === 'granted') {
      registerToken();
      return;
    }

    // لو الإذن default (مطلبش قبل كده)، مش هنطلع زرار، هنستنى أول ضغطة من الكابتن
    if (Notification.permission === 'default') {
        document.body.addEventListener('click', function initOnClick() {
            requestNotificationPermission();
            document.body.removeEventListener('click', initOnClick);
        }, { once: true });
    }
  }

  // فحص خفيف كل دقيقة (بدل كل 3 ثواني) — ولو محتاج تسجيل أصلاً مش هيعمل أي نداء شبكة
  setInterval(checkAndRegister, 60000);
  if (document.readyState === 'complete') checkAndRegister();
  else window.addEventListener('load', checkAndRegister);

})();
