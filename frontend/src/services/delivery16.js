/**
 * Ground OPS - Delivery 16
 * 1. Week Grid: sticky header row + sticky first column + always-visible scroll bars.
 * 2. Employee schedule: hide "Day off" unless the roster explicitly marks OFF.
 */
(function () {
  'use strict';

  // ---------- 1. CSS for the Week Grid ----------
  (function injectWeekGridCSS() {
    if (document.getElementById('gops-d16-styles')) return;
    var s = document.createElement('style');
    s.id = 'gops-d16-styles';
    s.textContent = [
      '#gops-week-page table thead th {',
      '  position: sticky !important;',
      '  top: 0 !important;',
      '  z-index: 20 !important;',
      '  background: #f5f5f5 !important;',
      '}',
      '#gops-week-page table tbody td:first-child,',
      '#gops-week-page table thead th:first-child {',
      '  position: sticky !important;',
      '  left: 0 !important;',
      '  background: #fff !important;',
      '  box-shadow: 2px 0 6px rgba(0,0,0,.08);',
      '  z-index: 10 !important;',
      '}',
      '#gops-week-page table thead th:first-child {',
      '  z-index: 30 !important;',
      '  background: #f5f5f5 !important;',
      '}',
      '#gops-wg-body {',
      '  overflow: auto !important;',
      '}',
      '#gops-wg-body::-webkit-scrollbar { width: 14px; height: 14px; }',
      '#gops-wg-body::-webkit-scrollbar-thumb { background: #b8b8b8; border-radius: 8px; }',
      '#gops-wg-body::-webkit-scrollbar-thumb:hover { background: #8a8a8a; }',
      '#gops-wg-body::-webkit-scrollbar-track { background: #ececec; }',
      '#gops-week-page table { min-width: max-content; }',
      /* "OFF" badge style */
      '.gops-off-badge {',
      '  display: inline-block;',
      '  background: #e8eaed;',
      '  color: #5f6368;',
      '  padding: 2px 10px;',
      '  border-radius: 10px;',
      '  font-weight: 700;',
      '  font-size: 11px;',
      '  letter-spacing: 1px;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  })();

  // ---------- 2. After the Week Grid renders, give the wrapper a bounded height ----------
  function fitWeekGrid() {
    var wrap = document.getElementById('gops-wg-body');
    if (!wrap) return;
    var vh = window.innerHeight;
    var rect = wrap.getBoundingClientRect();
    var avail = vh - rect.top - 24;
    if (avail > 240) wrap.style.maxHeight = avail + 'px';
  }
  window.addEventListener('resize', fitWeekGrid);

  // Replace "OFF" text in week grid cells with a grey badge
  function prettifyWeekGridOff() {
    var wrap = document.getElementById('gops-week-page');
    if (!wrap) return;
    wrap.querySelectorAll('td').forEach(function (td) {
      if (td.dataset.gopsOffStyled === '1') return;
      var txt = (td.textContent || '').trim();
      if (txt === 'OFF') {
        td.dataset.gopsOffStyled = '1';
        td.innerHTML = '<span class="gops-off-badge">OFF</span>';
      }
    });
  }

  // ---------- 3. Hide "Day off" in employee schedule unless explicit OFF ----------
  function hideUnexplicitDayOff() {
    var list = document.getElementById('schedule-list');
    if (!list) return;
    list.querySelectorAll('li').forEach(function (li) {
      var hint = li.querySelector('.hint');
      if (!hint || hint.dataset.gopsHidden === '1') return;
      var t = (hint.textContent || '').trim().toLowerCase();
      var isDayOffText = (t === 'day off' || t === 'off' || t.indexOf('يوم راحة') >= 0 || t.indexOf('راحة') === 0);
      if (!isDayOffText) return;
      // If this day has a badge or a strong element → it's an OFF day coming from the roster, keep the badge
      if (li.querySelector('.badge') || li.querySelector('strong')) return;
      // Otherwise hide the fallback and show a small dash
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

  // ---------- 4. Watch the DOM ----------
  var pending = false;
  var obs = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      try { prettifyWeekGridOff(); } catch (e) {}
      try { hideUnexplicitDayOff(); } catch (e) {}
      try { fitWeekGrid(); } catch (e) {}
    }, 150);
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });

  // Periodic safety sweep
  setInterval(function () {
    try { prettifyWeekGridOff(); } catch (e) {}
    try { hideUnexplicitDayOff(); } catch (e) {}
    try { fitWeekGrid(); } catch (e) {}
  }, 2500);

  // ---------- 5. Hook fetch: intercept employee schedule + week grid ----------
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/script\.google\.com|macros/.test(url)) return origFetch(input, init);
    return origFetch(input, init).then(function (res) {
      setTimeout(function () {
        try { prettifyWeekGridOff(); } catch (e) {}
        try { hideUnexplicitDayOff(); } catch (e) {}
        try { fitWeekGrid(); } catch (e) {}
      }, 300);
      return res;
    });
  };
})();
