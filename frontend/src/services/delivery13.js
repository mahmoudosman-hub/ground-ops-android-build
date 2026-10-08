/**
 * Ground OPS - Delivery 13
 * Cleanup after delivery11 opens a selfie in a new tab.
 * The original code is stuck waiting for data_base64, so we force-close
 * any modal that is stuck on "Loading..." and release any locked buttons.
 * Admin pages only.
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  // Detect any visible element whose text is just "Loading..." (dots optional)
  function isStuckLoader(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.children.length > 0) return false;
    var t = (el.textContent || '').trim();
    return /^loading(\.\.\.|…)?$/i.test(t);
  }

  // Force-close every open modal / dialog / overlay
  function forceCloseAll() {
    var sels = ['[role="dialog"]', '.modal', '.overlay', '.gops-modal'];
    sels.forEach(function (sel) {
      var nodes = document.querySelectorAll(sel);
      for (var i = nodes.length - 1; i >= 0; i--) {
        var el = nodes[i];
        if (el.offsetParent === null) continue;
        // Try to find a close button first (cleaner)
        var btns = el.querySelectorAll('button');
        var closed = false;
        for (var k = 0; k < btns.length; k++) {
          var label = (btns[k].textContent || '').trim().toLowerCase();
          var title = (btns[k].getAttribute('aria-label') || '').toLowerCase();
          if (label === '×' || label === 'x' || label === 'close' || label === 'cancel' ||
              label === 'إلغاء' || label === 'إغلاق' ||
              title === 'close' || title === 'cancel') {
            btns[k].click();
            closed = true;
            break;
          }
        }
        if (!closed) {
          el.style.display = 'none';
          el.setAttribute('hidden', '');
        }
      }
    });
    // Also dispatch Escape just in case
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    } catch (e) {}
  }

  // Release buttons that are stuck with a spinner
  function releaseStuckButtons() {
    document.querySelectorAll('.gops-loading, button[disabled]').forEach(function (b) {
      // Only touch buttons inside a modal that is about to be closed
      if (b.closest('[role="dialog"], .modal, .overlay, .gops-modal')) {
        try {
          b.disabled = false;
          b.classList.remove('gops-loading');
          b.style.pointerEvents = '';
          b.style.opacity = '';
          delete b.dataset.gopsPending;
        } catch (e) {}
      }
    });
  }

  // Watch the whole document for stuck loaders and act
  var cleanupQueued = false;
  function scheduleCleanup() {
    if (cleanupQueued) return;
    cleanupQueued = true;
    setTimeout(function () {
      cleanupQueued = false;
      // Any visible "Loading..." inside a modal? => assume the selfie fetch
      // came back as a Drive link (new tab opened). Close everything.
      var candidates = document.querySelectorAll('[role="dialog"], .modal, .overlay, .gops-modal');
      var any = false;
      candidates.forEach(function (el) {
        if (el.offsetParent === null) return;
        if (el.querySelector('.gops-loading')) { any = true; return; }
        var texts = el.querySelectorAll('p, span, div, small, em');
        texts.forEach(function (t) { if (isStuckLoader(t)) any = true; });
      });
      // Additional trigger: if the address bar / window focus came back and
      // 2 seconds passed since a selfie-related fetch returned a URL
      if (any || window.__gopsSelfieLinkOpened) {
        forceCloseAll();
        releaseStuckButtons();
        delete window.__gopsSelfieLinkOpened;
        // Unstick the sidebar nav (in case the loading overlay froze it)
        var body = document.body;
        if (body) {
          body.style.pointerEvents = '';
          body.style.overflow = '';
        }
      }
    }, 800);
  }

  // Watch fetch: mark when a selfie link is opened
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/script\.google\.com|macros/.test(url)) return origFetch(input, init);
    return origFetch(input, init).then(function (res) {
      try {
        var cloned = res.clone();
        cloned.json().then(function (body) {
          if (body && body.success && body.data && body.data.url &&
              /selfie|check/i.test(String(body.data.which || ''))) {
            window.__gopsSelfieLinkOpened = true;
            scheduleCleanup();
          }
        }).catch(function () {});
      } catch (e) {}
      return res;
    });
  };

  // Also observe DOM: whenever a "Loading..." appears and stays 3s, do a check
  var obs = new MutationObserver(function () { scheduleCleanup(); });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Fallback: check every 2 seconds
  setInterval(function () {
    if (window.__gopsSelfieLinkOpened) scheduleCleanup();
  }, 2000);
})();
