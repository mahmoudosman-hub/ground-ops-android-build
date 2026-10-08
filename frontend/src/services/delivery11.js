/**
 * Ground OPS - Delivery 11 v2
 * Show selfie Drive links BELOW the button instead of auto-opening them.
 * Click View selfie / View check-out selfie / View → a link appears below.
 * Click the link → image opens in a new tab.
 * No modal, no backdrop, no dashboard freeze.
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  // Track the last clicked button (capture phase)
  var lastButton = null;
  document.addEventListener('click', function (ev) {
    var el = ev.target, d = 0;
    while (el && el !== document.body && d < 6) {
      if (el.tagName === 'BUTTON') { lastButton = el; return; }
      el = el.parentNode; d++;
    }
  }, true);

  // CSS
  (function injectCSS() {
    if (document.getElementById('gops-d11-styles')) return;
    var s = document.createElement('style');
    s.id = 'gops-d11-styles';
    s.textContent = [
      '.gops-img-link {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  margin-top: 8px;',
      '  padding: 9px 14px;',
      '  background: #0a84ff;',
      '  color: #fff !important;',
      '  font: 600 13px system-ui,-apple-system,sans-serif;',
      '  text-decoration: none;',
      '  border-radius: 8px;',
      '  box-shadow: 0 2px 10px rgba(10,132,255,.4);',
      '  animation: gopsLinkIn .28s ease;',
      '  cursor: pointer;',
      '}',
      '.gops-img-link:hover { background: #0868cc; transform: translateY(-1px); }',
      '.gops-img-link::after { content: "\\2197"; font-size: 14px; font-weight: 900; }',
      '.gops-img-link.gops-pulse { animation: gopsLinkIn .28s ease, gopsLinkPulse 1.2s ease 3; }',
      '@keyframes gopsLinkIn {',
      '  from { opacity: 0; transform: translateY(-6px); }',
      '  to   { opacity: 1; transform: translateY(0); }',
      '}',
      '@keyframes gopsLinkPulse {',
      '  0%,100% { box-shadow: 0 2px 10px rgba(10,132,255,.4); }',
      '  50%     { box-shadow: 0 2px 22px rgba(10,132,255,.9); }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  })();

  function clearLinks(parent) {
    if (!parent) return;
    parent.querySelectorAll('.gops-img-link').forEach(function (l) { l.remove(); });
  }

  function showLinkBelowButton(btn, url, label) {
    if (!btn || !btn.parentNode) return;
    var parent = btn.parentNode;
    clearLinks(parent);
    var a = document.createElement('a');
    a.className = 'gops-img-link gops-pulse';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    if (btn.nextSibling) parent.insertBefore(a, btn.nextSibling);
    else parent.appendChild(a);
  }

  function closeSelfieModals() {
    var sels = ['[role="dialog"]', '.modal', '.overlay'];
    sels.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.offsetParent === null) return;
        var txt = (el.textContent || '').toLowerCase();
        var hasLoader = !!el.querySelector('.gops-loading') || /loading(\.\.\.|…)?/.test(txt);
        var isSelfie = /selfie|check-in|check-out/.test(txt);
        if (hasLoader || isSelfie) {
          var close = el.querySelector('button[aria-label*="close" i], .modal-close, button.close');
          if (close) { close.click(); return; }
          try { el.parentNode && el.parentNode.removeChild(el); } catch (e) { el.style.display = 'none'; }
        }
      });
    });
    // Remove stuck full-screen backdrops
    document.querySelectorAll('div, section').forEach(function (el) {
      if (el.id && el.id.indexOf('gops-') === 0) return;
      var s = window.getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'absolute') return;
      var z = parseInt(s.zIndex, 10);
      if (!(z > 500)) return;
      var r = el.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) return;
      var dialog = el.querySelector('[role="dialog"], .modal, .modal-content');
      if (dialog && dialog.offsetParent !== null) return;
      try { el.parentNode && el.parentNode.removeChild(el); } catch (e) { el.style.display = 'none'; }
    });
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/script\.google\.com|macros/.test(url)) return origFetch(input, init);

    var action = null;
    try {
      if (init && typeof init.body === 'string') {
        var p = JSON.parse(init.body);
        if (p) action = p.action;
      }
    } catch (e) {}

    var isLinkAction = (action === 'getSelfieLink' || action === 'getSelfieCheckLink');
    var isImgAction = (action === 'getSelfie' || action === 'getSelfieCheckImage');
    if (!isLinkAction && !isImgAction) return origFetch(input, init);

    // Rewrite to *Link version (fast, returns URL)
    if (isImgAction) {
      try {
        var parsed = JSON.parse(init.body);
        parsed.action = (action === 'getSelfie') ? 'getSelfieLink' : 'getSelfieCheckLink';
        init = Object.assign({}, init, { body: JSON.stringify(parsed) });
      } catch (e) {}
    }

    var btnAtClick = lastButton;

    return origFetch(input, init).then(function (res) {
      var cloned = res.clone();
      cloned.json().then(function (body) {
        if (!body || !body.success || !body.data || !body.data.url) return;
        var btn = btnAtClick;
        if (!btn || !document.body.contains(btn)) {
          var cands = document.querySelectorAll('button');
          for (var i = 0; i < cands.length; i++) {
            var t = (cands[i].textContent || '').trim();
            if (/^view(\s|$)/i.test(t) && cands[i].offsetParent) { btn = cands[i]; break; }
          }
        }
        var which = body.data.which || '';
        var label = 'Open image';
        if (which === 'check_in') label = 'Open check-in selfie';
        else if (which === 'check_out') label = 'Open check-out selfie';
        else if (body.data.check_id) label = 'Open selfie';
        if (btn) showLinkBelowButton(btn, body.data.url, label);

        // Close any selfie modal that opened by mistake
        setTimeout(closeSelfieModals, 150);
        setTimeout(closeSelfieModals, 700);
      }).catch(function () {});
      return res;
    });
  };
})();
