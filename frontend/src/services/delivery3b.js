/**
 * Ground OPS - Delivery 3b v7
 * - FRONTEND WARM-UP: pings the API the moment the page loads, so the web-app
 *   instance is hot by the time the user signs in.
 * - All v6 features kept (week grid, delete buttons, AR/EN, cards, clean selfies).
 */
(function () {
  'use strict';

  var API_URL = null;
  var branchCache = null;
  var BRANCH_CACHE_MS = 60000;

  function loadConfigOnce() {
    if (API_URL) return Promise.resolve(API_URL);
    try {
      if (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) { API_URL = window.GOPS_CONFIG.API_URL; return Promise.resolve(API_URL); }
      if (window.CONFIG && window.CONFIG.API_URL) { API_URL = window.CONFIG.API_URL; return Promise.resolve(API_URL); }
    } catch (e) {}
    return fetch('./config.js', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (txt) { var m = txt.match(/API_URL\s*:\s*['"]([^'"]+)['"]/); API_URL = m ? m[1] : null; return API_URL; })
      .catch(function () { return null; });
  }

  // ---- FRONTEND WARM-UP ----
  function warmUpNow() {
    if (!API_URL) return;
    try {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'warmupPing', payload: {}, client: 'warmup' }),
        redirect: 'follow',
        credentials: 'omit',
        keepalive: true
      }).catch(function () { /* ignore */ });
    } catch (e) {}
  }
  function startWarmUpLoop() {
    // Fire immediately (as soon as the page loads)
    warmUpNow();
    // Fire again after 8 seconds (catches the moment the user is typing the password)
    setTimeout(warmUpNow, 8000);
    setTimeout(warmUpNow, 20000);
    // Keep it warm every 4 minutes while the tab is open
    setInterval(function () {
      if (document.hidden) return;
      warmUpNow();
    }, 240000);
  }

  function getSession(kind) {
    var key = 'gops.session.' + kind;
    var stores = [window.localStorage, window.sessionStorage].filter(Boolean);
    for (var i = 0; i < stores.length; i++) {
      try {
        var raw = stores[i].getItem(key); if (!raw) continue;
        var v = JSON.parse(raw);
        if (v && v.token && Date.parse(v.expires_at) > Date.now()) return v;
      } catch (e) {}
    }
    return null;
  }

  function apiCall(kind, action, payload) {
    if (!API_URL) return Promise.reject(new Error('API_URL is not set'));
    var sess = getSession(kind);
    if (!sess) return Promise.reject(new Error('Not signed in'));
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: sess.token, payload: payload || {}, client: 'delivery3b/7.0' }),
      redirect: 'follow',
      credentials: 'omit'
    }).then(function (r) { return r.json(); }).then(function (body) {
      if (!body || body.success !== true) { var e = new Error((body && body.message) || 'Request failed'); e.code = (body && body.error_code) || 'ERROR'; throw e; }
      return body.data;
    });
  }

  function isAdminPage() { try { return /admin\.html/i.test(window.location.pathname); } catch (e) { return false; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function toast(msg, color) {
    try {
      var el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;z-index:99999;left:50%;transform:translateX(-50%);bottom:24px;background:' + (color || '#111') + ';color:#fff;padding:10px 16px;border-radius:20px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center;';
      document.body.appendChild(el);
      setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3000);
      setTimeout(function () { try { el.remove(); } catch (e) {} }, 3400);
    } catch (e) {}
  }

  // ======================= LANGUAGE =======================
  var AR = {
    'Dashboard': 'لوحة القيادة', 'Live Monitoring': 'المراقبة المباشرة',
    'Requests': 'الطلبات', 'Alerts': 'التنبيهات', 'Employees': 'الموظفون',
    'Branches': 'الفروع', 'Shifts': 'الورديات', 'Assignments': 'الإسنادات',
    'Schedule Import': 'استيراد الجدول', 'Attendance': 'الحضور',
    'Location History': 'سجل الموقع', 'Geofence Events': 'أحداث النطاق',
    'Reports': 'التقارير', 'Settings': 'الإعدادات', 'Administrators': 'المشرفون',
    'Selfie Checks': 'فحوصات السيلفي',
    'Refresh': 'تحديث', 'Cancel': 'إلغاء', 'Close': 'إغلاق',
    'Active': 'نشط', 'Inactive': 'غير نشط', 'Status': 'الحالة',
    'Week Grid': 'الجدول الأسبوعي', 'Language': 'اللغة', 'Actions': 'الإجراءات'
  };
  var LANG_KEY = 'gops.lang';
  function getLang() { try { return localStorage.getItem(LANG_KEY) || 'en'; } catch (e) { return 'en'; } }
  function setLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch (e) {} }

  function walkAndTranslate(lang) {
    try {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var n;
      while ((n = walker.nextNode())) {
        var p = n.parentNode;
        if (p && (p.id || '').indexOf('gops-') === 0) continue;
        if (n.__gops_orig === undefined) { try { n.__gops_orig = n.nodeValue; } catch (e) { continue; } }
        var orig = n.__gops_orig;
        if (!orig) continue;
        var trimmed = orig.trim();
        if (!trimmed || trimmed.length > 60) continue;
        if (lang === 'ar' && AR[trimmed]) n.nodeValue = orig.replace(trimmed, AR[trimmed]);
        else n.nodeValue = orig;
      }
      document.documentElement.lang = lang;
    } catch (e) {}
  }

  function installLangButton(sidebar) {
    if (document.getElementById('gops-lang-btn')) return;
    var btn = document.createElement('div');
    btn.id = 'gops-lang-btn';
    btn.setAttribute('role', 'button');
    btn.style.cssText = 'cursor:pointer;padding:12px 16px;font-weight:700;border-top:1px solid rgba(0,0,0,.08);color:inherit;';
    function render() { btn.textContent = getLang() === 'ar' ? '🌐 English' : '🌐 العربية'; }
    btn.onclick = function () { var next = getLang() === 'ar' ? 'en' : 'ar'; setLang(next); walkAndTranslate(next); render(); };
    render();
    sidebar.appendChild(btn);
  }

  function findSidebar() {
    var sels = ['.sidebar', 'nav.sidebar', 'aside.sidebar', '#sidebar', '.sidenav', '.side-nav', 'aside', 'nav[role="navigation"]'];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && el.querySelectorAll('a, button, li').length >= 3) return el;
    }
    return null;
  }

  // ======================= WEEK GRID =======================
  function openWeekGridFullPage() {
    try {
      var old = document.getElementById('gops-week-page'); if (old) old.remove();
      var page = document.createElement('div');
      page.id = 'gops-week-page';
      page.dir = getLang() === 'ar' ? 'rtl' : 'ltr';
      page.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99996;overflow:auto;padding:24px;font:14px/1.5 system-ui,sans-serif;color:#111;';
      page.innerHTML =
        '<div style="max-width:1600px;margin:0 auto">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap">' +
          '<h1 style="margin:0;font-size:24px">📅 Week Grid</h1>' +
          '<button id="gops-wg-close" style="padding:10px 18px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer;font-weight:700">Close</button>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">' +
          '<label>From: <input type="date" id="gops-wg-from" style="padding:8px;border:1px solid #ccc;border-radius:6px"></label>' +
          '<label>To: <input type="date" id="gops-wg-to" style="padding:8px;border:1px solid #ccc;border-radius:6px"></label>' +
          '<button id="gops-wg-go" style="padding:10px 18px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer">Load</button>' +
        '</div>' +
        '<div id="gops-wg-body" style="overflow:auto;border:1px solid #e5e5e5;border-radius:10px">Loading...</div>' +
        '</div>';
      document.body.appendChild(page);
      var today = new Date().toISOString().slice(0, 10);
      var next7 = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
      page.querySelector('#gops-wg-from').value = today;
      page.querySelector('#gops-wg-to').value = next7;
      page.querySelector('#gops-wg-close').onclick = function () { page.remove(); };
      page.querySelector('#gops-wg-go').onclick = load;
      function load() {
        var from = page.querySelector('#gops-wg-from').value, to = page.querySelector('#gops-wg-to').value;
        var body = page.querySelector('#gops-wg-body'); body.innerHTML = '<div style="padding:20px">Loading...</div>';
        apiCall('admin', 'getWeekGrid', { date_from: from, date_to: to }).then(function (d) {
          var dates = d.dates || [];
          var header = '<th style="text-align:left;padding:10px;border-bottom:2px solid #333;position:sticky;left:0;top:0;background:#f5f5f5;z-index:3;min-width:200px">Employee</th>';
          dates.forEach(function (dt) { header += '<th style="padding:10px;border-bottom:2px solid #333;top:0;background:#f5f5f5;min-width:140px;text-align:left;position:sticky;top:0;z-index:2">' + esc(dt) + '</th>'; });
          var rows = (d.rows || []).map(function (r) {
            var cells = '<td style="padding:10px;border-bottom:1px solid #eee;position:sticky;left:0;background:#fff;z-index:1;font-weight:600">' + esc(r.employee_name) + '<br><span style="color:#888;font-weight:400;font-size:12px">' + esc(r.employee_id) + '</span></td>';
            dates.forEach(function (dt) {
              var v = r.days[dt];
              if (!v) { cells += '<td style="padding:10px;border-bottom:1px solid #eee;color:#bbb">—</td>'; return; }
              if (v.leave) { cells += '<td style="padding:10px;border-bottom:1px solid #eee;color:#a60;font-weight:600">' + esc(v.shift_name) + '</td>'; return; }
              cells += '<td style="padding:10px;border-bottom:1px solid #eee;font-size:12px">' + esc(v.shift_name) + '<br><span style="color:#666">' + esc(v.start + '-' + v.end) + '</span><br><span style="color:#888">' + esc(v.branch) + '</span></td>';
            });
            return '<tr>' + cells + '</tr>';
          }).join('');
          body.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:' + (200 + dates.length * 150) + 'px"><thead><tr style="background:#f5f5f5">' + header + '</tr></thead><tbody>' + rows + '</tbody></table>';
        }).catch(function (e) { body.innerHTML = '<div style="padding:20px;color:#c00">' + esc(e.message || e.code) + '</div>'; });
      }
      load();
    } catch (e) { toast('Could not open week grid: ' + e.message, '#c00'); }
  }

  function injectSidebarWeekGrid(sidebar) {
    if (sidebar.querySelector('[data-gops-item="week-grid"]')) return;
    var item = document.createElement('div');
    item.setAttribute('data-gops-item', 'week-grid');
    item.setAttribute('role', 'button');
    item.style.cssText = 'cursor:pointer;padding:12px 16px;font-weight:600;color:inherit;';
    item.textContent = '📅 Week Grid';
    item.onclick = function () { openWeekGridFullPage(); };
    sidebar.appendChild(item);
  }

  // ======================= DELETE BUTTONS =======================
  function overlayOpen() { try { return !!document.querySelector('#gops-week-page, #gops-clean-dialog'); } catch (e) { return false; } }
  function currentPageTitle() {
    try {
      var hs = document.querySelectorAll('h1, h2, h3');
      for (var i = 0; i < hs.length; i++) {
        var h = hs[i];
        if (h.closest('.sidebar, nav, aside, [id^="gops-"]')) continue;
        var t = (h.textContent || '').trim();
        if (t) return t.toLowerCase();
      }
    } catch (e) {}
    return '';
  }
  function injectRowDeleteButton(tr, kind, id, displayName) {
    if (tr.dataset.gopsDelInjected) return;
    tr.dataset.gopsDelInjected = '1';
    var cells = tr.querySelectorAll('td');
    if (!cells.length) return;
    var last = cells[cells.length - 1];
    var btn = document.createElement('button');
    btn.className = 'gops-del-btn';
    btn.textContent = '🗑';
    btn.title = 'Delete';
    btn.style.cssText = 'padding:4px 10px;border:0;border-radius:6px;background:#fce4e4;color:#c00;cursor:pointer;font-weight:700;margin-left:6px;';
    btn.onclick = function (ev) {
      ev.stopPropagation(); ev.preventDefault();
      var word = kind === 'employee' ? 'employee ' + displayName + ' (' + id + ')' : 'branch ' + displayName + ' (' + id + ')';
      if (prompt('Type DELETE to confirm deleting ' + word + ' and all related records:') !== 'DELETE') { toast('Cancelled', '#888'); return; }
      btn.disabled = true; btn.textContent = '...';
      var action = kind === 'employee' ? 'deleteEmployee' : 'deleteBranch';
      var payload = kind === 'employee' ? { employee_id: id, confirm: true } : { branch_id: id, confirm: true };
      apiCall('admin', action, payload).then(function () {
        toast('Deleted ' + displayName, '#1e8e3e');
        tr.style.opacity = '0.3';
        setTimeout(function () { try { tr.remove(); } catch (e) {} }, 300);
      }).catch(function (e) { btn.disabled = false; btn.textContent = '🗑'; toast('Error: ' + (e.message || e.code), '#c00'); });
    };
    last.appendChild(btn);
  }
  function getBranchesCached() {
    if (branchCache && (Date.now() - branchCache.ts) < BRANCH_CACHE_MS) return Promise.resolve(branchCache.list);
    return apiCall('admin', 'getBranches', {}).then(function (d) { branchCache = { ts: Date.now(), list: d.branches || [] }; return branchCache.list; });
  }
  function scanForDeletables() {
    try {
      if (overlayOpen()) return;
      var title = currentPageTitle();
      var isEmpPage = /^employees?\b/.test(title);
      var isBrPage = /^branches?\b/.test(title);
      if (!isEmpPage && !isBrPage) {
        var existing = document.querySelectorAll('.gops-del-btn');
        for (var i = 0; i < existing.length; i++) existing[i].remove();
        return;
      }
      var rows = document.querySelectorAll('table tbody tr');
      if (!rows.length) return;
      if (isEmpPage) {
        for (var j = 0; j < rows.length; j++) {
          var tr = rows[j];
          if (tr.dataset.gopsDelInjected) continue;
          var cells = tr.querySelectorAll('td');
          if (cells.length < 2) continue;
          var id = (cells[0].textContent || '').trim();
          var name = (cells[1] ? cells[1].textContent : '').trim();
          if (/^[A-Z][A-Z0-9_-]{2,30}$/.test(id)) injectRowDeleteButton(tr, 'employee', id, name || id);
        }
        return;
      }
      getBranchesCached().then(function (list) {
        var map = {};
        list.forEach(function (b) { map[String(b.branch_name).trim().toLowerCase()] = b; });
        var rows2 = document.querySelectorAll('table tbody tr');
        for (var k = 0; k < rows2.length; k++) {
          var tr2 = rows2[k];
          if (tr2.dataset.gopsDelInjected) continue;
          var cells2 = tr2.querySelectorAll('td');
          if (cells2.length < 2) continue;
          var nameBr = (cells2[0].textContent || '').trim();
          if (!nameBr || nameBr === '-') continue;
          var b = map[nameBr.toLowerCase()];
          if (b) injectRowDeleteButton(tr2, 'branch', b.branch_id, b.branch_name);
        }
      }).catch(function () {});
    } catch (e) {}
  }

  // ======================= CLEAN SELFIES =======================
  function openCleanSelfiesDialog() {
    try {
      var old = document.getElementById('gops-clean-dialog'); if (old) old.remove();
      var d = document.createElement('div');
      d.id = 'gops-clean-dialog';
      d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;';
      d.innerHTML =
        '<div style="background:#fff;border-radius:12px;max-width:520px;width:100%;padding:22px;font:14px/1.5 system-ui,sans-serif;color:#111">' +
        '<h2 style="margin:0 0 8px;font-size:20px">🧹 Clean selfie checks</h2>' +
        '<p style="color:#666;margin:0 0 14px">Removes PENDING selfie checks outside the shift window. DONE and MISSED are never touched.</p>' +
        '<label style="display:block;margin-bottom:6px;font-weight:600">Employee ID</label>' +
        '<input id="gops-clean-emp" type="text" placeholder="e.g. DIAA_MAHMOUD" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;font-family:monospace;text-transform:uppercase;box-sizing:border-box">' +
        '<label style="display:block;margin:14px 0 6px;font-weight:600">Date</label>' +
        '<input id="gops-clean-date" type="date" style="padding:10px;border:1px solid #ccc;border-radius:6px;width:100%;box-sizing:border-box">' +
        '<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="gops-clean-cancel" style="padding:10px 18px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;font-weight:600">Cancel</button>' +
        '<button id="gops-clean-preview" style="padding:10px 18px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer">Preview</button>' +
        '<button id="gops-clean-run" style="padding:10px 18px;border:0;border-radius:8px;background:#d33;color:#fff;font-weight:700;cursor:pointer">Clean</button>' +
        '</div>' +
        '<div id="gops-clean-result" style="margin-top:16px"></div>' +
        '</div>';
      document.body.appendChild(d);
      d.querySelector('#gops-clean-date').value = new Date().toISOString().slice(0, 10);
      d.querySelector('#gops-clean-cancel').onclick = function () { d.remove(); };
      d.querySelector('#gops-clean-preview').onclick = function () {
        var emp = d.querySelector('#gops-clean-emp').value.trim().toUpperCase();
        var date = d.querySelector('#gops-clean-date').value;
        if (!emp || !date) { toast('Fill both fields', '#c00'); return; }
        var out = d.querySelector('#gops-clean-result'); out.innerHTML = 'Loading...';
        apiCall('admin', 'getSelfieDebug', { employee_id: emp, date: date }).then(function (r) {
          var inw = 0, outw = 0, done = 0, missed = 0;
          (r.selfie_checks || []).forEach(function (sc) {
            if (sc.status === 'DONE') done++; else if (sc.status === 'MISSED') missed++; else if (sc.in_window) inw++; else outw++;
          });
          out.innerHTML = '<div style="background:#f5f5f5;padding:12px;border-radius:8px">In window (PENDING): <b>' + inw + '</b><br>Outside window (will be removed): <b style="color:#d33">' + outw + '</b><br>DONE (untouched): ' + done + '<br>MISSED (untouched): ' + missed + '</div>';
        }).catch(function (e) { out.innerHTML = '<div style="color:#c00">' + esc(e.message || e.code) + '</div>'; });
      };
      d.querySelector('#gops-clean-run').onclick = function () {
        var emp = d.querySelector('#gops-clean-emp').value.trim().toUpperCase();
        var date = d.querySelector('#gops-clean-date').value;
        if (!emp || !date) { toast('Fill both fields', '#c00'); return; }
        if (!confirm('Delete PENDING selfie checks outside the shift window for ' + emp + ' on ' + date + '?')) return;
        var out = d.querySelector('#gops-clean-result'); out.innerHTML = 'Working...';
        apiCall('admin', 'cleanSelfieChecks', { employee_id: emp, date: date }).then(function (r) {
          toast('Removed ' + r.removed + ' check(s)', '#1e8e3e');
          out.innerHTML = '<div style="background:#d4edda;padding:12px;border-radius:8px;color:#155724"><b>Done.</b> Removed ' + r.removed + ', kept ' + r.kept + '.</div>';
        }).catch(function (e) { out.innerHTML = '<div style="color:#c00">' + esc(e.message || e.code) + '</div>'; });
      };
    } catch (e) { toast('Could not open clean dialog: ' + e.message, '#c00'); }
  }

  function injectCleanSelfiesButton() {
    try {
      var scRoot = document.getElementById('gops-sc-admin-root');
      if (!scRoot) return;
      var refreshBtn = scRoot.querySelector('#gops-sc-refresh');
      if (!refreshBtn) {
        var allBtns = scRoot.querySelectorAll('button');
        for (var i = 0; i < allBtns.length; i++) {
          if ((allBtns[i].textContent || '').trim().toLowerCase() === 'refresh') { refreshBtn = allBtns[i]; break; }
        }
      }
      if (!refreshBtn) return;
      var parent = refreshBtn.parentNode;
      if (!parent || parent.querySelector('.gops-clean-btn')) return;
      var btn = document.createElement('button');
      btn.className = 'gops-clean-btn';
      btn.textContent = '🧹 Clean';
      btn.style.cssText = 'padding:8px 14px;border:0;border-radius:8px;background:#ef6c00;color:#fff;font-weight:700;cursor:pointer;margin-left:8px;';
      btn.onclick = openCleanSelfiesDialog;
      parent.appendChild(btn);
    } catch (e) {}
  }

  // ======================= DASHBOARD CARDS =======================
  var CARD_LABELS = {
    'Total Employees': 'ALL', 'Present': 'PRESENT', 'Late': 'LATE', 'Absent': 'ABSENT',
    'On Leave': 'ON_LEAVE', 'Outside Geofence': 'OUTSIDE',
    'Tracking Unavailable': 'TRACKING_UNAVAILABLE', 'On Break': 'ON_BREAK'
  };
  function findStatusSelect() {
    var selects = document.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      var opts = selects[i].options;
      for (var j = 0; j < opts.length; j++) {
        var v = opts[j].value;
        if (v === 'LATE' || v === 'ABSENT' || v === 'ON_TIME' || v === 'CHECKED_IN' || v === 'TRACKING_UNAVAILABLE') return selects[i];
      }
    }
    return null;
  }
  function clickApplyButton() {
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      if ((buttons[i].textContent || '').trim().toLowerCase() === 'apply') {
        try { buttons[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch (e) { buttons[i].click(); }
        return true;
      }
    }
    return false;
  }
  function ensureOption(select, value, label) {
    for (var i = 0; i < select.options.length; i++) if (select.options[i].value === value) return;
    var opt = document.createElement('option'); opt.value = value; opt.textContent = label || value; select.appendChild(opt);
  }
  function applyDashboardFilter(filter) {
    var sel = findStatusSelect();
    if (!sel) { toast('Status filter not found', '#c00'); return; }
    if (filter === 'ALL') sel.value = '';
    else {
      var labels = { 'PRESENT': 'Present', 'ON_BREAK': 'On break', 'LATE': 'Late', 'ABSENT': 'Absent', 'ON_LEAVE': 'On leave', 'OUTSIDE': 'Outside geofence', 'TRACKING_UNAVAILABLE': 'Tracking unavailable' };
      ensureOption(sel, filter, labels[filter] || filter); sel.value = filter;
    }
    try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    clickApplyButton();
    setTimeout(function () { var tables = document.querySelectorAll('table'); if (tables.length) { try { tables[tables.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } }, 350);
  }
  function markCardsClickable() {
    try {
      var labels = Object.keys(CARD_LABELS);
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.dataset.gopsCardLabel) continue;
        if (el.id && el.id.indexOf('gops-') === 0) continue;
        if (el.children && el.children.length > 4) continue;
        var txt = (el.textContent || '').trim();
        if (!txt || txt.length > 45) continue;
        if (!/\d/.test(txt)) continue;
        for (var j = 0; j < labels.length; j++) {
          var lbl = labels[j];
          if (txt.indexOf(lbl) < 0) continue;
          var first = txt.indexOf(lbl), second = txt.indexOf(lbl, first + 1);
          if (second >= 0) continue;
          el.dataset.gopsCardLabel = lbl;
          el.style.cursor = 'pointer';
          el.style.transition = 'transform .15s, box-shadow .15s';
          el.title = 'Click to filter the table below';
          el.addEventListener('mouseenter', function () { this.style.boxShadow = '0 6px 20px rgba(0,0,0,.18)'; this.style.transform = 'translateY(-2px)'; });
          el.addEventListener('mouseleave', function () { this.style.boxShadow = ''; this.style.transform = ''; });
          break;
        }
      }
    } catch (e) {}
  }
  function installCardClickDelegation() {
    if (window.__gopsCardClickBound) return;
    window.__gopsCardClickBound = true;
    document.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== document.body) {
        if (el.dataset && el.dataset.gopsCardLabel) {
          var filter = CARD_LABELS[el.dataset.gopsCardLabel];
          var origBg = el.style.background;
          el.style.background = '#d1e7ff';
          setTimeout(function () { el.style.background = origBg; }, 400);
          try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
          applyDashboardFilter(filter);
          return;
        }
        el = el.parentNode;
      }
    }, true);
  }

  // ======================= BOOT =======================
  function tick() {
    try { var sidebar = findSidebar(); if (sidebar) { injectSidebarWeekGrid(sidebar); installLangButton(sidebar); } } catch (e) {}
    try { scanForDeletables(); } catch (e) {}
    try { injectCleanSelfiesButton(); } catch (e) {}
    try { markCardsClickable(); } catch (e) {}
  }
  function boot() {
    installCardClickDelegation();
    startWarmUpLoop(); // <-- NEW
    tick();
    setInterval(tick, 2500);
    var l = getLang();
    if (l === 'ar') setTimeout(function () { walkAndTranslate('ar'); }, 1000);
  }

  loadConfigOnce().then(function () {
    // Warm up on ALL pages (login page too) so the instance is hot by the time the user signs in
    startWarmUpLoop();
    if (!isAdminPage()) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  });

})();
