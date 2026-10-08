/**
 * Ground OPS - Delivery 5 v2
 * Show request file Drive links BELOW the button instead of auto-opening.
 * Click View → a link appears below the button.
 * Click the link → file opens in a new tab.
 * No modal, no backdrop, no freeze.
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

  // CSS (blue link with an arrow, appears with a small animation)
  (function injectCSS() {
    if (document.getElementById('gops-d5-styles')) return;
    var s = document.createElement('style');
    s.id = 'gops-d5-styles';
    s.textContent = [
      '.gops-file-link {',
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
      '  animation: gopsFileLinkIn .28s ease;',
      '  cursor: pointer;',
      '}',
      '.gops-file-link:hover { background: #0868cc; transform: translateY(-1px); }',
      '.gops-file-link::after { content: "\\2197"; font-size: 14px; font-weight: 900; }',
      '.gops-file-link.gops-pulse { animation: gopsFileLinkIn .28s ease, gopsFileLinkPulse 1.2s ease 3; }',
      '@keyframes gopsFileLinkIn {',
      '  from { opacity: 0; transform: translateY(-6px); }',
      '  to   { opacity: 1; transform: translateY(0); }',
      '}',
      '@keyframes gopsFileLinkPulse {',
      '  0%,100% { box-shadow: 0 2px 10px rgba(10,132,255,.4); }',
      '  50%     { box-shadow: 0 2px 22px rgba(10,132,255,.9); }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  })();

  function clearLinks(parent) {
    if (!parent) return;
    parent.querySelectorAll('.gops-file-link').forEach(function (l) { l.remove(); });
  }

  function showLinkBelowButton(btn, url, label) {
    if (!btn || !btn.parentNode) return;
    var parent = btn.parentNode;
    clearLinks(parent);
    var a = document.createElement('a');
    a.className = 'gops-file-link gops-pulse';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    if (btn.nextSibling) parent.insertBefore(a, btn.nextSibling);
    else parent.appendChild(a);
  }

  function closeFileModals() {
    // Close any modal that is stuck on "Loading..." while showing a proof file
    document.querySelectorAll('[role="dialog"], .modal, .overlay').forEach(function (el) {
      if (el.offsetParent === null) return;
      var txt = (el.textContent || '').toLowerCase();
      var hasLoader = !!el.querySelector('.gops-loading') || /loading(\.\.\.|…)?/.test(txt);
      if (!hasLoader) return;
      var close = el.querySelector('button[aria-label*="close" i], .modal-close, button.close');
      if (close) { close.click(); return; }
      try { el.parentNode && el.parentNode.removeChild(el); } catch (e) { el.style.display = 'none'; }
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

    var isLink = (action === 'getRequestFileLink');
    var isOld = (action === 'getRequestFile');
    if (!isLink && !isOld) return origFetch(input, init);

    // Rewrite the old base64 action to the fast link action
    if (isOld) {
      try {
        var parsed = JSON.parse(init.body);
        parsed.action = 'getRequestFileLink';
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
          // Fallback: find any visible "View N" button
          var cands = document.querySelectorAll('button');
          for (var i = 0; i < cands.length; i++) {
            var t = (cands[i].textContent || '').trim();
            if (/^view(\s|\s*\d)/i.test(t) && cands[i].offsetParent) { btn = cands[i]; break; }
          }
        }

        var label = 'Open file';
        var nm = body.data.name ? String(body.data.name) : '';
        if (nm) label = 'Open ' + nm;
        if (btn) showLinkBelowButton(btn, body.data.url, label);

        setTimeout(closeFileModals, 150);
        setTimeout(closeFileModals, 700);
      }).catch(function () {});
      return res;
    });
  };
})();
