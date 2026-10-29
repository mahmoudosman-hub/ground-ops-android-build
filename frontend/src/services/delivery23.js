/**
 * Ground OPS - Delivery 23 v4 (Fully Automatic via First Click)
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

  function getSession() {
    try {
      var raw = localStorage.getItem('gops.session.employee') || sessionStorage.getItem('gops.session.employee');
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && v.token) ? v : null;
    } catch (e) { return null; }
  }

  async function registerToken() {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

      var { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
      var { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js');

      var app = initializeApp(firebaseConfig);
      var messaging = getMessaging(app);

      var registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
      var currentToken = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

      if (currentToken) {
        var sess = getSession();
        var apiUrl = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL;
        
        if (apiUrl && sess) {
          await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'registerPushToken',
              token: sess.token,
              payload: { token: currentToken },
              client: 'auto-register/4.0'
            })
          });
          console.log("✅ Token registered automatically for:", sess.token.substring(0, 10));
          var btn = document.getElementById('gops-enable-notif-btn');
          if (btn) btn.remove(); // إخفاء الزرار لو كان موجود
        }
      }
    } catch (err) {
      console.error('Push Error:', err);
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
    
    // لو الإذن متأكد منه خلاص، نسجل التوكن فوراً
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

  // التشغيل
  setInterval(checkAndRegister, 3000);
  if (document.readyState === 'complete') checkAndRegister();
  else window.addEventListener('load', checkAndRegister);

})();
