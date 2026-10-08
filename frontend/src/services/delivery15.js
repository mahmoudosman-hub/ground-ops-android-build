/**
 * Ground OPS - Delivery 15
 * 1. Pull-to-refresh (swipe down from the top → refreshes the page).
 * 2. Override navigator.onLine so a flaky connection does not falsely say "offline".
 * 3. Show a friendly "still loading" banner after 5s and "server is slow" after 12s.
 * Works on employee and admin pages.
 */
(function () {
  'use strict';

  // ---------- 1. Override navigator.onLine (only if the real state is true) ----------
  try {
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: function () { return true; }
      });
    }
  } catch (e) {}

  // ---------- 2. Pull-to-refresh ----------
  (function injectCSS() {
    if (document.getElementById('gops-d15-styles')) return;
    var s = document.createElement('style');
    s.id = 'gops-d15-styles';
    s.textContent = [
      '#gops-ptr-indicator {',
      '  position: fixed;',
      '  top: 0; left: 50%;',
      '  transform: translateX(-50%) translateY(-60px);',
      '  background: #0a84ff;',
      '  color: #fff;',
      '  padding: 10px 20px;',
      '  border-radius: 0 0 14px 14px;',
      '  font: 700 13px system-ui,-apple-system,sans-serif;',
      '  box-shadow: 0 4px 16px rgba(10,132,255,.4);',
      '  z-index: 999999;',
      '  transition: transform .18s ease;',
      '  pointer-events: none;',
      '  display: flex; align-items: center; gap: 8px;',
      '}',
      '#gops-ptr-indicator.gops-show { transform: translateX(-50%) translateY(0); }',
      '#gops-ptr-indicator .gops-ptr-spin {',
      '  display: inline-block;',
      '  width: 12px; height: 12px;',
      '  border: 2px solid #fff;',
      '  border-right-color: transparent;',
      '  border-radius: 50%;',
      '  animation: gopsPtrSpin .7s linear infinite;',
      '}',
      '@keyframes gopsPtrSpin { to { transform: rotate(360deg); } }',
      '#gops-slow-banner {',
      '  position: fixed;',
      '  top: 12px; left: 50%;',
      '  transform: translateX(-50%);',
      '  background: #f39c12;',
      '  color: #fff;',
      '  padding: 10px 18px;',
      '  border-radius: 20px;',
      '  font: 600 13px system-ui,-apple-system,sans-serif;',
      '  box-shadow: 0 6px 20px rgba(0,0,0,.3);',
      '  z-index: 999998;',
      '  max-width: 90vw; text-align: center;',
      '}'
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

  var startY = null;
  var THRESHOLD = 80;
  var REFRESHING = false;

  function onTouchStart(e) {
    if (REFRESHING) return;
    if (window.scrollY > 4) return;
    if (!e.touches || !e.touches.length) return;
    startY = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (startY === null || REFRESHING) return;
    if (!e.touches || !e.touches.length) return;
    var y = e.touches[0].clientY;
    var delta = y - startY;
    if (delta > 0 && window.scrollY <= 2) {
      var el = buildIndicator();
      var shown = Math.min(delta, THRESHOLD * 1.4);
      el.style.transform = 'translateX(-50%) translateY(' + (shown - 60) + 'px)';
      var lbl = el.querySelector('.gops-ptr-label');
      if (lbl) lbl.textContent = delta >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh';
    }
  }

  function onTouchEnd() {
    if (startY === null || REFRESHING) { startY = null; return; }
    var el = buildIndicator();
    // Decide based on the last known position
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
      setTimeout(function () { window.location.reload(); }, 300);
    } else {
      el.classList.remove('gops-show');
      el.style.transform = 'translateX(-50%) translateY(-60px)';
    }
    startY = null;
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // ---------- 3. Friendly slow-server banner ----------
  var pending = 0;
  var slowTimer = null;
  var reallySlowTimer = null;
  var banner = null;

  function showBanner(text) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'gops-slow-banner';
      document.body.appendChild(banner);
    }
    banner.textContent = text;
  }
  function hideBanner() {
    if (banner) { banner.remove(); banner = null; }
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /script\.google\.com|macros/.test(url);
    if (!isApi) return origFetch(input, init);

    pending++;
    if (pending === 1) {
      clearTimeout(slowTimer); clearTimeout(reallySlowTimer);
      slowTimer = setTimeout(function () { showBanner('Loading... connection is a bit slow'); }, 5000);
      reallySlowTimer = setTimeout(function () { showBanner('Server is busy. Please wait...'); }, 12000);
    }

    function done() {
      pending--;
      if (pending <= 0) {
        pending = 0;
        clearTimeout(slowTimer); clearTimeout(reallySlowTimer);
        hideBanner();
      }
    }

    return origFetch(input, init).then(function (r) { done(); return r; }, function (e) { done(); throw e; });
  };
})();
