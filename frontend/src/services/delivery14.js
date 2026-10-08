/**
 * Ground OPS - Delivery 14 v2
 * Cleanup backdrops after selfie opens in new tab.
 * Removed the 1.5s interval (was expensive). Now only runs on-demand.
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  function isOurs(el) { return (el.id || '').indexOf('gops-') === 0; }

  function looksLikeBackdrop(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isOurs(el)) return false;
    if (el.tagName === 'BODY' || el.tagName === 'HTML') return false;
    var s = window.getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'absolute') return false;
    if (!(parseInt(s.zIndex, 10) > 500)) return false;
    var r = el.getBoundingClientRect();
    if (r.width < window.innerWidth * 0.85) return false;
    if (r.height < window.innerHeight * 0.85) return false;
    return /rgba?\(/.test(s.backgroundColor || '');
  }

  function cleanup() {
    document.querySelectorAll('div, section, aside').forEach(function (el) {
      if (!looksLikeBackdrop(el)) return;
      var dialog = el.querySelector('[role="dialog"], .modal, .modal-content');
      if (dialog && dialog.offsetParent !== null) return;
      try { el.parentNode && el.parentNode.removeChild(el); } catch (e) { el.style.display = 'none'; }
    });
    if (document.body) {
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
    }
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/script\.google\.com|macros/.test(url)) return origFetch(input, init);
    return origFetch(input, init).then(function (res) {
      try {
        var c = res.clone();
        c.json().then(function (b) {
          if (b && b.success && b.data && b.data.url) {
            setTimeout(cleanup, 400);
            setTimeout(cleanup, 1200);
          }
        }).catch(function () {});
      } catch (e) {}
      return res;
    });
  };
})();
