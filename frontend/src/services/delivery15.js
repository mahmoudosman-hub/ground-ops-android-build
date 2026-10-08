/**
 * Ground OPS - Delivery 15 v3
 * Local cache for employee app API responses.
 * Navigation is instant: cached data shows first, fresh data replaces it in the background.
 * Cache TTL: 5 minutes per action. Manual refresh still hits the server.
 */
(function () {
  'use strict';

  // ---- Cache config ----
  var CACHE_VERSION = 'v1';
  var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  var SKIP_CACHE_ACTIONS = ['checkIn', 'checkOut', 'startBreak', 'endBreak', 'submitLocation', 'createRequest', 'attachRequestFile', 'submitRequest', 'respondToRequest', 'cancelRequest', 'markNotificationsRead', 'changePassword', 'logout', 'login'];

  // Only cache these employee reads
  var CACHEABLE_ACTIONS = [
    'getTodaySchedule',
    'getMySchedule',
    'getMyRequests',
    'getNotifications',
    'getPendingSelfieCheck',
    'getAppVersion'
  ];

  function isApiUrl(url) {
    return /script\.google\.com|macros/.test(url);
  }

  function cacheKey(action, payload) {
    return 'gops.cache.' + CACHE_VERSION + '.' + action + '.' + JSON.stringify(payload || {});
  }

  function readCache(action, payload) {
    try {
      var k = cacheKey(action, payload);
      var raw = localStorage.getItem(k);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.ts || (Date.now() - obj.ts) > CACHE_TTL_MS) return null;
      return obj.data;
    } catch (e) { return null; }
  }

  function writeCache(action, payload, data) {
    try {
      var k = cacheKey(action, payload);
      localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  function clearAllCache() {
    try {
      Object.keys(localStorage)
        .filter(function (k) { return k.indexOf('gops.cache.') === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  // Clear cache on logout / password change / any write action
  window.gopsClearCache = clearAllCache;

  // ---------- Fetch wrapper ----------
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isApiUrl(url) || !init || init.method !== 'POST' || typeof init.body !== 'string') {
      return origFetch(input, init);
    }

    var parsed = null;
    try { parsed = JSON.parse(init.body); } catch (e) {}
    if (!parsed || !parsed.action) return origFetch(input, init);

    var action = parsed.action;
    var payload = parsed.payload || {};

    // Clear cache on any write action
    if (SKIP_CACHE_ACTIONS.indexOf(action) >= 0) {
      clearAllCache();
    }

    // Try to return from cache first (for read actions)
    if (CACHEABLE_ACTIONS.indexOf(action) >= 0) {
      var cached = readCache(action, payload);
      if (cached !== null) {
        // Return the cached response INSTANTLY (resolved Promise with a Response-like object)
        var body = JSON.stringify({ success: true, data: cached, _from_cache: true, server_time: new Date().toISOString() });
        var fakeResponse = new Response(body, {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json', 'X-GOPS-Cache': 'hit' }
        });
        // Kick off a background refresh (fire-and-forget)
        setTimeout(function () {
          try {
            origFetch(input, init).then(function (r) {
              return r.json();
            }).then(function (fresh) {
              if (fresh && fresh.success && fresh.data) {
                writeCache(action, payload, fresh.data);
              }
            }).catch(function () {});
          } catch (e) {}
        }, 50);
        return Promise.resolve(fakeResponse);
      }
      // Cache miss: request normally and store the result
      return origFetch(input, init).then(function (res) {
        var clone = res.clone();
        clone.json().then(function (j) {
          if (j && j.success && j.data) writeCache(action, payload, j.data);
        }).catch(function () {});
        return res;
      });
    }

    return origFetch(input, init);
  };

  // ---------- Pull-to-refresh: clear cache before reload ----------
  // (existing PTF logic below, only enhanced with cache clear)
  (function injectCSS() {
    if (document.getElementById('gops-d15-styles')) return;
    var s = document.createElement('style');
    s.id = 'gops-d15-styles';
    s.textContent = [
      '#gops-ptr-indicator { position: fixed; top: 0; left: 50%;',
      '  transform: translateX(-50%) translateY(-60px); background: #0a84ff;',
      '  color: #fff; padding: 10px 20px; border-radius: 0 0 14px 14px;',
      '  font: 700 13px system-ui,-apple-system,sans-serif;',
      '  box-shadow: 0 4px 16px rgba(10,132,255,.4); z-index: 999999;',
      '  transition: transform .18s ease; pointer-events: none;',
      '  display: flex; align-items: center; gap: 8px; }',
      '#gops-ptr-indicator.gops-show { transform: translateX(-50%) translateY(0); }',
      '#gops-ptr-indicator .gops-ptr-spin { display: inline-block; width: 12px; height: 12px;',
      '  border: 2px solid #fff; border-right-color: transparent;',
      '  border-radius: 50%; animation: gopsPtrSpin .7s linear infinite; }',
      '@keyframes gopsPtrSpin { to { transform: rotate(360deg); } }'
    ].join('\n');
    document.head.appendChild(s);
  })();

  function buildIndicator() {
    var el = document.getElementById('gops-ptr-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gops-ptr-indicator';
      el.innerHTML = '<span class="gops-ptr-spin"></span><span class="gops-ptr-label">Pull to refresh</span>';
      document.body.appendChild(el);
    }
    return el;
  }

  var startY = null, THRESHOLD = 80, REFRESHING = false;

  document.addEventListener('touchstart', function (e) {
    if (REFRESHING || window.scrollY > 4 || !e.touches || !e.touches.length) return;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (startY === null || REFRESHING || !e.touches || !e.touches.length) return;
    var y = e.touches[0].clientY, delta = y - startY;
    if (delta > 0 && window.scrollY <= 2) {
      var el = buildIndicator();
      var shown = Math.min(delta, THRESHOLD * 1.4);
      el.style.transform = 'translateX(-50%) translateY(' + (shown - 60) + 'px)';
      var lbl = el.querySelector('.gops-ptr-label');
      if (lbl) lbl.textContent = delta >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh';
    }
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (startY === null || REFRESHING) { startY = null; return; }
    var el = buildIndicator();
    var tr = el.style.transform || '';
    var match = tr.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
    var offset = match ? parseFloat(match[1]) : -60;
    var pulled = offset + 60;
    if (pulled >= THRESHOLD) {
      REFRESHING = true;
      el.classList.add('gops-show');
      el.style.transform = 'translateX(-50%) translateY(0)';
      var lbl = el.querySelector('.gops-ptr-label');
      if (lbl) lbl.textContent = 'Refreshing...';
      clearAllCache(); // Pull-to-refresh = clear cache + reload
      setTimeout(function () { window.location.reload(); }, 300);
    } else {
      el.classList.remove('gops-show');
      el.style.transform = 'translateX(-50%) translateY(-60px)';
    }
    startY = null;
  }, { passive: true });
})();
