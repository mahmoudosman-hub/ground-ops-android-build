/**
 * Ground OPS - Delivery 16 v2
 * Week Grid CSS + OFF badge + employee schedule polish.
 * Only acts when the user is actually on the relevant pages.
 * No global MutationObserver, no periodic interval.
 */
(function () {
  'use strict';

  (function injectCSS() {
    if (document.getElementById('gops-d16-styles')) return;
    var s = document.createElement('style');
    s.id = 'gops-d16-styles';
    s.textContent = [
      '#gops-week-page table thead th { position: sticky !important; top: 0 !important; z-index: 20 !important; background: #f5f5f5 !important; }',
      '#gops-week-page table tbody td:first-child, #gops-week-page table thead th:first-child { position: sticky !important; left: 0 !important; background: #fff !important; box-shadow: 2px 0 6px rgba(0,0,0,.08); z-index: 10 !important; }',
      '#gops-week-page table thead th:first-child { z-index: 30 !important; background: #f5f5f5 !important; }',
      '#gops-wg-body { overflow: auto !important; }',
      '#gops-wg-body::-webkit-scrollbar { width: 14px; height: 14px; }',
      '#gops-wg-body::-webkit-scrollbar-thumb { background: #b8b8b8; border-radius: 8px; }',
      '#gops-wg-body::-webkit-scrollbar-thumb:hover { background: #8a8a8a; }',
      '#gops-wg-body::-webkit-scrollbar-track { background: #ececec; }',
      '#gops-week-page table { min-width: max-content; }',
      '.gops-off-badge { display: inline-block; background: #e8eaed; color: #5f6368; padding: 2px 10px; border-radius: 10px; font-weight: 700; font-size: 11px; letter-spacing: 1px; }'
    ].join('\n');
    document.head.appendChild(s);
  })();

  function prettifyOff() {
    var wrap = document.getElementById('gops-week-page');
    if (!wrap) return;
    wrap.querySelectorAll('td').forEach(function (td) {
      if (td.dataset.gopsOffStyled === '1') return;
      if ((td.textContent || '').trim() !== 'OFF') return;
      td.dataset.gopsOffStyled = '1';
      td.innerHTML = '<span class="gops-off-badge">OFF</span>';
    });
  }

  function hideUnexplicitDayOff() {
    var list = document.getElementById('schedule-list');
    if (!list) return;
    list.querySelectorAll('li').forEach(function (li) {
      var hint = li.querySelector('.hint');
      if (!hint || hint.dataset.gopsHidden === '1') return;
      var t = (hint.textContent || '').trim().toLowerCase();
      if (t !== 'day off' && t !== 'off' && t.indexOf('يوم راحة') < 0) return;
      if (li.querySelector('.badge') || li.querySelector('strong')) return;
      hint.dataset.gopsHidden = '1';
      hint.style.display = 'none';
      if (!li.querySelector('.gops-empty-dash')) {
        var dash = document.createElement('span');
        dash.className = 'hint gops-empty-dash';
        dash.style.opacity = '0.3';
        dash.textContent = '—';
        li.appendChild(dash);
      }
    });
  }

  function fitWeekGrid() {
    var wrap = document.getElementById('gops-wg-body');
    if (!wrap) return;
    var avail = window.innerHeight - wrap.getBoundingClientRect().top - 24;
    if (avail > 240) wrap.style.maxHeight = avail + 'px';
  }

  function runOnce() {
    try { prettifyOff(); } catch (e) {}
    try { hideUnexplicitDayOff(); } catch (e) {}
    try { fitWeekGrid(); } catch (e) {}
  }

  // Only run once when fetch completes, no observer, no interval
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/script\.google\.com|macros/.test(url)) return origFetch(input, init);
    return origFetch(input, init).then(function (res) {
      setTimeout(runOnce, 300);
      return res;
    });
  };

  window.addEventListener('resize', fitWeekGrid);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(runOnce, 500); });
  else setTimeout(runOnce, 500);
})();
