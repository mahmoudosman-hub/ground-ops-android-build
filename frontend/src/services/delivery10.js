/**
 * Ground OPS - Delivery 10
 * Global loading feedback on every action button.
 *  - Capture-phase click: mark the button immediately (spinner + pointer-events none).
 *  - Hook fetch: track pending API requests. When all done, release all marked buttons.
 *  - Safety: auto-release after 90 seconds.
 * No imports. Works on any page.
 */
(function () {
  'use strict';

  // --- CSS ---
  (function injectCSS() {
    if (document.getElementById('gops-d10-styles')) return;
    var style = document.createElement('style');
    style.id = 'gops-d10-styles';
    style.textContent = [
      '.gops-loading {',
      '  position: relative;',
      '  cursor: wait !important;',
      '}',
      '.gops-loading::after {',
      '  content: "";',
      '  display: inline-block;',
      '  width: 12px; height: 12px;',
      '  margin-left: 8px;',
      '  border: 2px solid currentColor;',
      '  border-right-color: transparent;',
      '  border-radius: 50%;',
      '  animation: gopsSpin10 0.6s linear infinite;',
      '  vertical-align: middle;',
      '}',
      '@keyframes gopsSpin10 {',
      '  to { transform: rotate(360deg); }',
      '}',
      'html[dir="rtl"] .gops-loading::after {',
      '  margin-left: 0;',
      '  margin-right: 8px;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  })();

  var pending = 0;
  var activeButtons = [];
  var releaseTimer = null;

  function shouldMark(btn) {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    if (btn.closest('.sidebar, nav, aside')) return false;
    if (btn.id === 'gops-lang-btn') return false;
    if (btn.dataset.gopsSkip === '1') return false;
    if (btn.dataset.gopsPending === '1') return false;
    if (btn.type === 'submit') return true;
    var text = (btn.textContent || '').trim().toLowerCase();
    if (!text) return false;
    return /^(send|save|submit|approve|reject|sign in|log in|login|retry|try again|update|delete|confirm|continue|add|create|attach|respond|agree|decline|accept|yes|ok)/i.test(text);
  }

  function markButton(btn) {
    if (activeButtons.indexOf(btn) >= 0) return;
    activeButtons.push(btn);
    btn.dataset.gopsPending = '1';
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.75';
    btn.classList.add('gops-loading');

    // Safety: auto-release after 90 seconds (in case the fetch hook missed it)
    setTimeout(function () {
      if (activeButtons.indexOf(btn) >= 0) releaseButton(btn);
    }, 90000);
  }

  function releaseButton(btn) {
    try {
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
      btn.classList.remove('gops-loading');
      delete btn.dataset.gopsPending;
      var i = activeButtons.indexOf(btn);
      if (i >= 0) activeButtons.splice(i, 1);
    } catch (e) {}
  }

  function releaseAll() {
    activeButtons.slice().forEach(releaseButton);
  }

  // Small delay so chained operations (createRequest then attachRequestFile x N then submitRequest) don't flicker
  function scheduleRelease() {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(function () {
      releaseTimer = null;
      releaseAll();
    }, 700);
  }

  // Capture-phase: runs BEFORE the app's own click handler
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    var depth = 0;
    while (el && el !== document.body && depth < 8) {
      if (el.tagName === 'BUTTON' && shouldMark(el)) {
        markButton(el);
        return;
      }
      el = el.parentNode;
      depth++;
    }
  }, true);

  // Also mark on form submit (Enter key inside a form)
  document.addEventListener('submit', function (ev) {
    var btn = ev.target.querySelector('button[type=submit]');
    if (btn && shouldMark(btn)) markButton(btn);
  }, true);

  // Hook fetch: track API requests
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /script\.google\.com|macros/.test(url);
    if (!isApi) return origFetch(input, init);

    pending++;
    return origFetch(input, init).then(function (res) {
      pending--;
      if (pending <= 0) { pending = 0; scheduleRelease(); }
      return res;
    }).catch(function (err) {
      pending--;
      if (pending <= 0) { pending = 0; scheduleRelease(); }
      throw err;
    });
  };

  // Release everything on page unload
  window.addEventListener('beforeunload', releaseAll);

  // Safety sweep every 30s: if nothing is pending but buttons are still marked, clean up
  setInterval(function () {
    if (pending === 0 && activeButtons.length > 0) {
      // Give it one more beat
      setTimeout(function () {
        if (pending === 0) releaseAll();
      }, 1000);
    }
  }, 30000);
})();
