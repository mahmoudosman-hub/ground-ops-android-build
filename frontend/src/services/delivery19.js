/**
 * Ground OPS - Delivery 19
 * App update checker. Runs on the employee app.
 * Compares the installed version with the server's latest version.
 * If newer, shows a top banner with a Download button.
 * Employee page only.
 */
(function () {
  'use strict';

  if (/admin\.html/i.test(window.location.pathname)) return;

  // ---------- IMPORTANT ----------
  // Update this constant each time you rebuild the APK.
  // It must match the "version" you enter in the Admin Settings.
  var INSTALLED_VERSION = '1.0.0';

  var API_URL = null;
  var CHECK_INTERVAL_MS = 6 * 3600 * 1000; // 6 hours
  var DISMISS_MS = 24 * 3600 * 1000;       // 24 hours
  var LAST_CHECK_KEY = 'gops.app.last_check';
  var DISMISS_V_KEY = 'gops.app.dismissed_v';
  var DISMISS_T_KEY = 'gops.app.dismissed_at';

  function loadConfig() {
    if (API_URL) return Promise.resolve(API_URL);
    try {
      if (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) { API_URL = window.GOPS_CONFIG.API_URL; return Promise.resolve(API_URL); }
      if (window.CONFIG && window.CONFIG.API_URL) { API_URL = window.CONFIG.API_URL; return Promise.resolve(API_URL); }
    } catch (e) {}
    return fetch('./config.js', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) { var m = t.match(/API_URL\s*:\s*['"]([^'"]+)['"]/); API_URL = m ? m[1] : null; return API_URL; })
      .catch(function () { return null; });
  }

  function compareVersions(a, b) {
    var A = String(a).split('.').map(function (x) { return parseInt(x, 10) || 0; });
    var B = String(b).split('.').map(function (x) { return parseInt(x, 10) || 0; });
    var len = Math.max(A.length, B.length);
    for (var i = 0; i < len; i++) {
      var ai = A[i] || 0, bi = B[i] || 0;
      if (ai < bi) return -1;
      if (ai > bi) return 1;
    }
    return 0;
  }

  function shouldCheck() {
    try {
      var last = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
      return (Date.now() - last) >= CHECK_INTERVAL_MS;
    } catch (e) { return true; }
  }

  function wasDismissed(v) {
    try {
      var dv = localStorage.getItem(DISMISS_V_KEY);
      var dt = parseInt(localStorage.getItem(DISMISS_T_KEY) || '0', 10);
      return dv === v && (Date.now() - dt) < DISMISS_MS;
    } catch (e) { return false; }
  }

  function markDismissed(v) {
    try {
      localStorage.setItem(DISMISS_V_KEY, v);
      localStorage.setItem(DISMISS_T_KEY, String(Date.now()));
    } catch (e) {}
  }

  function toast(msg, bg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;z-index:999999;left:50%;transform:translateX(-50%);top:24px;background:' + (bg || '#1e8e3e') + ';color:#fff;padding:12px 20px;border-radius:12px;font:600 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3500);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 4000);
  }

  function showBanner(version, url, notes) {
    var old = document.getElementById('gops-update-banner');
    if (old) old.remove();

    var banner = document.createElement('div');
    banner.id = 'gops-update-banner';
    banner.style.cssText = 'position:fixed;left:0;right:0;top:0;background:linear-gradient(135deg,#0a84ff,#0055cc);color:#fff;z-index:999999;padding:14px 16px 16px;box-shadow:0 6px 24px rgba(0,0,0,.4);font:14px/1.4 system-ui,-apple-system,sans-serif;animation:gopsUpdIn .3s ease;';
    banner.innerHTML =
      '<style>@keyframes gopsUpdIn { from{transform:translateY(-100%);} to{transform:translateY(0);} }</style>' +
      '<div style="display:flex;align-items:flex-start;gap:12px">' +
        '<div style="font-size:30px;line-height:1">🚀</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:800;font-size:15px;margin-bottom:2px">New version available: ' + version + '</div>' +
          '<div style="font-size:12px;opacity:.9">' + (notes || 'Important fixes and improvements. Please update.') + '</div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
            '<a href="' + url + '" target="_blank" rel="noopener" style="flex:1;min-width:120px;display:inline-block;text-align:center;padding:10px 14px;background:#fff;color:#0a84ff;border-radius:8px;font-weight:800;text-decoration:none;font-size:13px">⬇ Download now</a>' +
            '<button id="gops-upd-later" style="padding:10px 14px;background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:8px;font-weight:700;cursor:pointer;font-size:13px">Later</button>' +
          '</div>' +
        '</div>' +
        '<button id="gops-upd-x" style="background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:0 4px">×</button>' +
      '</div>';
    document.body.appendChild(banner);

    function dismiss() {
      markDismissed(version);
      banner.style.opacity = '0';
      banner.style.transition = 'opacity .25s';
      setTimeout(function () { try { banner.remove(); } catch (e) {} }, 300);
    }
    banner.querySelector('#gops-upd-later').onclick = dismiss;
    banner.querySelector('#gops-upd-x').onclick = dismiss;
  }

  function check() {
    if (!shouldCheck()) return;
    loadConfig().then(function () {
      if (!API_URL) return;
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getAppVersion', payload: {}, client: 'update-check' }),
        redirect: 'follow',
        credentials: 'omit'
      })
        .then(function (r) { return r.json(); })
        .then(function (b) {
          try { localStorage.setItem(LAST_CHECK_KEY, String(Date.now())); } catch (e) {}
          if (!b || !b.success || !b.data) return;
          var v = String(b.data.version || '');
          var url = String(b.data.url || '');
          var notes = String(b.data.notes || '');
          if (!v || !url) return;
          if (compareVersions(INSTALLED_VERSION, v) >= 0) return;
          if (wasDismissed(v)) return;
          showBanner(v, url, notes);
        })
        .catch(function () {});
    });
  }

  // Run 4 seconds after the app opens
  setTimeout(check, 4000);

  // Also re-check when the user returns to the app
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) setTimeout(check, 1500);
  });
})();
