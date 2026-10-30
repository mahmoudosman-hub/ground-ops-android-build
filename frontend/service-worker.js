/* Ground OPS Tracker service worker - FAST LOAD (build d49) */
importScripts('./precache-manifest.js');
const CACHE = `gops-${self.GOPS_PRECACHE.version}`;
const SHELL = self.GOPS_PRECACHE.files;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gops-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });

// 👇 دالة جديدة بتفتح التطبيق من الكاش فوراً وتحدث في الخلفية
async function handleNavigation(req) {
  const cache = await caches.open(CACHE);
  const isAdmin = req.url.includes('admin.html');
  const fallbackUrl = isAdmin ? './admin.html' : './index.html';
  
  const cached = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(fallbackUrl));
  
  if (cached) {
    // لو الملف موجود في الكاش، رجعه فوراً وحدثه في الخلفية
    fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
    }).catch(() => {});
    return cached; 
  }
  
  // لو مش موجود في الكاش، هاته من النت
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return Response.error();
  }
}

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), timeout(3000)]); // قللنا الوقت لـ 3 ثواني
    if (res && res.ok && req.method === 'GET') cache.put(req, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl))) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/service-worker.js') || url.pathname.endsWith('/precache-manifest.js')) return;
  
  if (req.mode === 'navigate') { 
    event.respondWith(handleNavigation(req)); // 👈 بيستخدم الدالة الجديدة
    return; 
  }
  if (url.pathname.endsWith('/config.js')) { event.respondWith(networkFirst(req)); return; }
  event.respondWith(staleWhileRevalidate(req));
});
