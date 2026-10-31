/**
 * Ground OPS - Delivery 23 v6 (أندرويد: سجّل التوكن الأصلي بتاع التطبيق)
 *
 * الحكاية: v5 كان بيسجل توكن إشعارات الويب بس — وده شغال في كروم عادي،
 * لكن جوه تطبيق الأندرويد (WebView) إشعارات الويب ممنوعة أصلاً:
 * Notification.permission بيفضل denied ومفيش أي سؤال إذن بيظهر.
 * النتيجة: كل كابتن شغال من التطبيق كان بيفضل «مفيش جهاز» عند السيرفر
 * (رسالة «تم الإرسال إلى 0 أجهزة») رغم إنه فاتح وشغال تمام.
 *
 * التطبيق نفسه بيجيب التوكن الأصلي من Firebase (MainActivity.java)
 * وبيحقنه في الصفحة: window.nativeFcmToken وكمان جسر
 * AndroidNative.getNativeToken(). اللي كان ناقص إن حد يلقطه —
 * v6 بيلقطه ويسجله للسيرفر بمنصة android من غير فايربيز ويب خالص.
 * وكمان بيحفظه في localStorage ('gops.fcm.token') عشان تسجيل
 * الخروج (api.js) يمسحه من السيرفر بنفس الطريقة الموجودة أصلاً.
 *
 * بقاء منطق v5: تسجيل مرة واحدة في الجلسة (أو لو التوكن/الحساب اتغير
 * أو عدت 6 ساعات) + مسار المتصفح زي ما هو بالظبط.
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

  // ---------- (v6) التوكن الأصلي جوه تطبيق الأندرويد ----------
  // MainActivity بيحقن window.nativeFcmToken بعد ثانيتين تقريباً، وكمان
  // فيه جسر احتياطي AndroidNative.getNativeToken(). لو الاتنين مش
  // موجودين يبقى إحنا في متصفح عادي — نرجع لمسار الويب.
  function getNativeToken() {
    try {
      var cap = window.Capacitor;
      if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
      if (window.nativeFcmToken) return String(window.nativeFcmToken);
      if (window.AndroidNative && typeof window.AndroidNative.getNativeToken === 'function') {
        var t = window.AndroidNative.getNativeToken();
        if (t) return String(t);
      }
    } catch (e) {}
    return null;
  }

  function apiUrl() {
    return window.API_URL || (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) || (window.CONFIG && window.CONFIG.API_URL);
  }

  async function postRegister(sess, fcmToken, platform) {
    var url = apiUrl();
    if (!url) { console.error('Push register: API_URL not found'); return false; }
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'registerPushToken',
          token: sess.token,
          payload: { token: fcmToken, platform: platform },
          client: 'auto-register/6.0'
        })
      });
      var out = null;
      try { out = await res.json(); } catch (e) {}
      if (out && out.success) {
        // بنحفظ التوكن في نفس المكان اللي api.js بيقرأ منه عند الخروج،
        // عشان تسجيل الخروج يمسحه من السيرفر تلقائياً زي ما هو أصلاً
        try { localStorage.setItem('gops.fcm.token', fcmToken); } catch (e) {}
        saveRegState({ token: fcmToken, employee: sess.user.employee_id, platform: platform, at: Date.now() });
        console.log('✅ Push token registered (' + platform + ') for:', sess.user.employee_id);
        var btn = document.getElementById('gops-enable-notif-btn');
        if (btn) btn.remove();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Push register error:', err);
      return false;
    }
  }

  var inFlight = false;
  async function registerToken() {
    if (inFlight) return;
    inFlight = true;
    try {
      var sess = getSession();
      if (!sess || !sess.user || !sess.user.employee_id) return;

      // ---- (1) جوه تطبيق الأندرويد: التوكن الأصلي — من غير بوابات الويب خالص ----
      // (في الـ WebView مفيش إذن Notification ولا service worker push،
      //  فبوابات v5 كانت بتوقف التسجيل هنا للأبد — وده كان الباج)
      var nativeTok = getNativeToken();
      if (nativeTok) {
        if (!needsRegister(nativeTok, sess.user.employee_id)) return;
        await postRegister(sess, nativeTok, 'android');
        return;
      }

      // ---- (2) متصفح عادي: نفس مسار v5 بالظبط ----
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

      var cached = null;
      try { cached = localStorage.getItem('gops.fcm.token') || ''; } catch (e) {}

      // متسجل خلاص؟ متبعتش حاجة خالص (دي كانت سبب زحمة السيرفر)
      if (cached && !needsRegister(cached, sess.user.employee_id)) return;

      var { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
      var { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js');

      var app = initializeApp(firebaseConfig);
      var messaging = getMessaging(app);

      var registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
      var currentToken = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

      if (currentToken) {
        await postRegister(sess, currentToken, 'web');
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

    // (v6) جوه التطبيق: سجل فوراً — مفيش إذن Notification ولا service worker هنا
    if (getNativeToken()) { registerToken(); return; }

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
  // (ومفيد للتطبيق: التوكن الأصلي بيظهر بعد ثانيتين من فتح التطبيق — اللفة الجاية بتلقطه)
  setInterval(checkAndRegister, 60000);
  if (document.readyState === 'complete') checkAndRegister();
  else window.addEventListener('load', checkAndRegister);

})();
