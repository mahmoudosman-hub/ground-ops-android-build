/**
 * Ground OPS - Delivery 4
 * Global UI polish:
 *   - Auto-hide error messages after 5 seconds.
 *   - Show a spinner on every disabled button (feedback for slow actions).
 *   - RTL toast fix.
 * No imports. Works on any page.
 */
(function () {
  'use strict';

  // 1. Inject CSS
  function injectCSS() {
    if (document.getElementById('gops-d4-styles')) return;
    var style = document.createElement('style');
    style.id = 'gops-d4-styles';
    style.textContent = [
      '.form-error:not([hidden]) { animation: gopsFadeOut 5s forwards; }',
      '@keyframes gopsFadeOut {',
      '  0%, 80% { opacity: 1; max-height: 200px; }',
      '  100% { opacity: 0; max-height: 0; padding: 0; margin: 0; overflow: hidden; }',
      '}',
      'button[disabled].gops-loading::before {',
      '  content: "";',
      '  display: inline-block;',
      '  width: 12px; height: 12px;',
      '  margin-right: 6px;',
      '  border: 2px solid currentColor;',
      '  border-right-color: transparent;',
      '  border-radius: 50%;',
      '  animation: gopsSpin 0.6s linear infinite;',
      '  vertical-align: middle;',
      '}',
      '@keyframes gopsSpin { to { transform: rotate(360deg); } }',
      'html[dir="rtl"] .toast, html[dir="rtl"] .gops-toast {',
      '  left: auto; right: 50%; transform: translateX(50%);',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // 2. Watch for disabled buttons and add a spinner
  function watchButtons() {
    function handle(btn) {
      if (btn.tagName !== 'BUTTON') return;
      if (btn.disabled) btn.classList.add('gops-loading');
      else btn.classList.remove('gops-loading');
    }
    document.querySelectorAll('button[disabled]').forEach(handle);
    var obs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'attributes' && m.attributeName === 'disabled') handle(m.target);
      });
    });
    obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['disabled'] });
  }

  // 3. Watch for visible error boxes and auto-hide after 5s
  function watchErrors() {
    function handle(el) {
      if (el.hidden) {
        if (el.dataset.gopsAutoHide === 'pending') {
          delete el.dataset.gopsAutoHide;
        }
        return;
      }
      if (!el.classList.contains('form-error')) return;
      if (el.dataset.gopsAutoHide === 'done') {
        // Re-show: reset the animation
        el.dataset.gopsAutoHide = '';
        void el.offsetWidth;
      }
      if (el.dataset.gopsAutoHide === 'pending') return;
      el.dataset.gopsAutoHide = 'pending';
      setTimeout(function () {
        el.style.transition = 'opacity .3s';
        el.style.opacity = '0';
        setTimeout(function () {
          el.hidden = true;
          el.style.opacity = '';
          el.dataset.gopsAutoHide = 'done';
        }, 350);
      }, 5000);
    }
    document.querySelectorAll('.form-error').forEach(handle);
    var obs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.classList && n.classList.contains('form-error')) handle(n);
            if (n.querySelectorAll) n.querySelectorAll('.form-error').forEach(handle);
          });
        } else if (m.type === 'attributes' && m.attributeName === 'hidden') {
          handle(m.target);
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }

  // Boot
  function boot() {
    injectCSS();
    watchButtons();
    watchErrors();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
