importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Ground OPS push handler - build d49
// 1) التطبيق مفتوح قدام الكابتن (أندرويد): مفيش رنة — الرسالة بتوصل للتطبيق نفسه
// 2) آيفون: آبل بتفرض إن كل إشعار يظهر (لو اتخفي بتفضل اشتراك الإشعارات) —
//    لذلك الإسكات على الآيفون بيحصل من السيرفر نفسه (نافذة الهدوء) مش من هنا
// 3) الضغط على الإشعار بيفتح التطبيق على الرابط الصح (بما فيه action=location_check)

const firebaseConfig = {
  apiKey: "AIzaSyDwzrZIftyjwy_mukvWha4EhqDfBOV2UlY",
  authDomain: "ground-ops-tracker.firebaseapp.com",
  projectId: "ground-ops-tracker",
  storageBucket: "ground-ops-tracker.firebasestorage.app",
  messagingSenderId: "295865086509",
  appId: "1:295865086509:web:b9d4be3e43472f557e3ea4"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

const IS_IOS = /iPhone|iPad|iPod/i.test(self.navigator.userAgent || '');

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Ground OPS';
  const body = n.body || d.body || 'New notification';
  const url = d.url || (payload.fcm_options && payload.fcm_options.link) || '/';

  const show = () => self.registration.showNotification(title, {
    body: body,
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/icon-192x192.png',
    vibrate: [500, 200, 500], // للاندرويد PWA والآيفون
    tag: d.type ? ('gops-' + d.type) : undefined,
    data: { url: url }
  });

  const work = (async () => {
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = list.filter((c) => c.visibilityState === 'visible');
      if (visible.length && !IS_IOS) {
        // التطبيق فاتح وظاهر: من غير رنة — بنبعت المحتوى للتطبيق نفسه
        visible.forEach((c) => { try { c.postMessage({ type: 'GOPS_PUSH', title: title, body: body, url: url }); } catch (e) { /* ignore */ } });
        return;
      }
      await show();
    } catch (e) {
      try { await show(); } catch (e2) { /* ignore */ }
    }
  })();
  return work;
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/';
  let abs = raw;
  try { abs = new URL(raw, self.location.origin).href; } catch (e) { /* keep raw */ }
  event.waitUntil((async () => {
    try {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          try { if ('navigate' in client && client.url !== abs) await client.navigate(abs); } catch (e) { /* ignore */ }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(abs);
    } catch (e) {
      try { if (self.clients.openWindow) return self.clients.openWindow(abs); } catch (e2) { /* ignore */ }
    }
  })());
});
