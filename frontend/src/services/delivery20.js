/**
 * Ground OPS - Delivery 20
 * Auto Scheduler UI for admin dashboard.
 * Full-page overlay with: Coverage, Constraints, Settings, Generate, Preview, Drafts.
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  var API_URL = null;
  function loadConfig() {
    if (API_URL) return Promise.resolve(API_URL);
    try {
      if (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) { API_URL = window.GOPS_CONFIG.API_URL; return Promise.resolve(API_URL); }
      if (window.CONFIG && window.CONFIG.API_URL) { API_URL = window.CONFIG.API_URL; return Promise.resolve(API_URL); }
    } catch (e) {}
    return fetch('./config.js', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) { var m = t.match(/API_URL\s*:\s*['"]([^'"]+)['"]/); API_URL = m ? m[1] : null; return API_URL; })
      .catch(function () { return null; });
  }

  function getSession() {
    try {
      var k = 'gops.session.admin';
      var s = [window.localStorage, window.sessionStorage];
      for (var i = 0; i < s.length; i++) {
        var raw = s[i].getItem(k); if (!raw) continue;
        var v = JSON.parse(raw);
        if (v && v.token) return v;
      }
    } catch (e) {}
    return null;
  }

  function call(action, payload) {
    return loadConfig().then(function () {
      var sess = getSession();
      if (!sess) throw new Error('Not signed in');
      return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: sess.token, payload: payload || {}, client: 'delivery20' }),
        redirect: 'follow',
        credentials: 'omit'
      }).then(function (r) { return r.json(); }).then(function (b) {
        if (!b || b.success !== true) {
          var e = new Error((b && b.message) || 'Request failed');
          e.code = (b && b.error_code) || 'ERROR';
          throw e;
        }
        return b.data;
      });
    });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function toast(msg, bg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;z-index:999999;left:50%;transform:translateX(-50%);top:24px;background:' + (bg || '#1e8e3e') + ';color:#fff;padding:12px 20px;border-radius:12px;font:600 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3000);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 3500);
  }

  // ---------- Global cache for branches/shifts ----------
  var _cache = { branches: null, shifts: null, employees: null };
  function getBranches() {
    if (_cache.branches) return Promise.resolve(_cache.branches);
    return call('getBranches', {}).then(function (d) { _cache.branches = d.branches || []; return _cache.branches; });
  }
  function getShifts() {
    if (_cache.shifts) return Promise.resolve(_cache.shifts);
    return call('getShifts', {}).then(function (d) { _cache.shifts = d.shifts || []; return _cache.shifts; });
  }
  function getEmployees() {
    if (_cache.employees) return Promise.resolve(_cache.employees);
    return call('getEmployees', { page_size: 500 }).then(function (d) { _cache.employees = d.items || []; return _cache.employees; });
  }

  // ---------- Open the full-page Auto Scheduler ----------
  function openAutoScheduler() {
    var old = document.getElementById('gops-auto-sched-root');
    if (old) old.remove();
    var root = document.createElement('div');
    root.id = 'gops-auto-sched-root';
    root.style.cssText = 'position:fixed;inset:0;background:#f6f7f9;z-index:99990;overflow:auto;font:14px/1.5 system-ui,-apple-system,sans-serif;color:#111';
    root.innerHTML =
      '<div style="background:#fff;border-bottom:1px solid #e3e6ea;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:5">' +
        '<div>' +
          '<h1 style="margin:0;font-size:20px">📅 Auto Scheduler</h1>' +
          '<div id="gops-sch-status" style="color:#666;font-size:12px;margin-top:2px">Ready</div>' +
        '</div>' +
        '<button id="gops-sch-close" style="padding:10px 18px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer;font-weight:700">Close</button>' +
      '</div>' +
      '<div style="display:flex;border-bottom:1px solid #e3e6ea;background:#fff;padding:0 24px;position:sticky;top:73px;z-index:4">' +
        tabBtn('coverage', '🏢 Coverage', true) +
        tabBtn('constraints', '🚫 Constraints', false) +
        tabBtn('settings', '⚙️ Settings', false) +
        tabBtn('generate', '🆕 Generate', false) +
        tabBtn('drafts', '📂 Drafts', false) +
      '</div>' +
      '<div id="gops-sch-panel" style="padding:24px;max-width:1400px;margin:0 auto"></div>';
    document.body.appendChild(root);

    root.querySelector('#gops-sch-close').onclick = function () { root.remove(); };
    root.querySelectorAll('[data-gops-tab]').forEach(function (b) {
      b.onclick = function () { activateTab(b.getAttribute('data-gops-tab')); };
    });
    activateTab('coverage');
  }

  function tabBtn(key, label, active) {
    return '<button data-gops-tab="' + key + '" style="padding:14px 18px;background:transparent;border:0;border-bottom:3px solid ' +
      (active ? '#0a84ff' : 'transparent') + ';color:' + (active ? '#0a84ff' : '#555') +
      ';font-weight:700;cursor:pointer;font-size:14px">' + label + '</button>';
  }

  function activateTab(key) {
    var root = document.getElementById('gops-auto-sched-root');
    if (!root) return;
    root.querySelectorAll('[data-gops-tab]').forEach(function (b) {
      var isActive = b.getAttribute('data-gops-tab') === key;
      b.style.borderBottom = '3px solid ' + (isActive ? '#0a84ff' : 'transparent');
      b.style.color = isActive ? '#0a84ff' : '#555';
    });
    var p = root.querySelector('#gops-sch-panel');
    p.innerHTML = '<div style="padding:20px;color:#666">Loading...</div>';
    if (key === 'coverage') renderCoverageTab(p);
    else if (key === 'constraints') renderConstraintsTab(p);
    else if (key === 'settings') renderSettingsTab(p);
    else if (key === 'generate') renderGenerateTab(p);
    else if (key === 'drafts') renderDraftsTab(p);
  }

  function setStatus(txt, color) {
    var el = document.getElementById('gops-sch-status');
    if (el) { el.textContent = txt; el.style.color = color || '#666'; }
  }

  // ================================================================
  // TAB 1: Coverage
  // ================================================================
  function renderCoverageTab(panel) {
    setStatus('Loading coverage rules...');
    Promise.all([getBranches(), getShifts(), call('getCoverage', {})]).then(function (arr) {
      var branches = arr[0], shifts = arr[1], data = arr[2];
      var rules = data.coverage || [];
      setStatus(rules.length + ' coverage rule(s)');

      var dayOpts = ['ALL', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var branchOpts = branches.map(function (b) { return '<option value="' + esc(b.branch_id) + '">' + esc(b.branch_name) + '</option>'; }).join('');
      var shiftOpts = shifts.map(function (s) { return '<option value="' + esc(s.shift_id) + '">' + esc(s.shift_name) + ' (' + esc(s.start_time) + '-' + esc(s.end_time) + ')</option>'; }).join('');

      panel.innerHTML =
        '<div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
          '<h2 style="margin:0 0 6px;font-size:16px">Add coverage rule</h2>' +
          '<p style="color:#666;margin:0 0 14px;font-size:13px">For each branch and shift, set how many captains are required per day.</p>' +
          '<div style="display:grid;grid-template-columns:2fr 2fr 1fr 1fr auto;gap:10px;align-items:end">' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Branch</span>' +
              '<select id="gops-cov-branch" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px">' + branchOpts + '</select></label>' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Shift</span>' +
              '<select id="gops-cov-shift" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px">' + shiftOpts + '</select></label>' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Day</span>' +
              '<select id="gops-cov-day" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px">' + dayOpts.map(function (d) { return '<option>' + d + '</option>'; }).join('') + '</select></label>' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Captains</span>' +
              '<input id="gops-cov-count" type="number" min="1" max="20" value="1" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"></label>' +
            '<button id="gops-cov-add" style="padding:11px 20px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer">+ Add</button>' +
          '</div>' +
        '</div>' +
        '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
          (rules.length ?
            '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f5f7fa">' +
              '<th style="text-align:left;padding:12px">Branch</th>' +
              '<th style="text-align:left;padding:12px">Shift</th>' +
              '<th style="text-align:left;padding:12px">Day</th>' +
              '<th style="text-align:left;padding:12px">Captains</th>' +
              '<th style="padding:12px"></th>' +
            '</tr></thead><tbody>' +
              rules.map(function (r) {
                var b = branches.filter(function (x) { return x.branch_id === r.branch_id; })[0];
                var s = shifts.filter(function (x) { return x.shift_id === r.shift_id; })[0];
                return '<tr style="border-bottom:1px solid #eef1f4">' +
                  '<td style="padding:12px">' + esc(b ? b.branch_name : r.branch_id) + '</td>' +
                  '<td style="padding:12px">' + esc(s ? s.shift_name : r.shift_id) + ' <span style="color:#999">(' + esc(s ? s.start_time + '-' + s.end_time : '') + ')</span></td>' +
                  '<td style="padding:12px">' + esc(r.day_of_week || 'ALL') + '</td>' +
                  '<td style="padding:12px;font-weight:700">' + esc(r.captains_required) + '</td>' +
                  '<td style="padding:12px;text-align:right"><button data-del="' + esc(r.coverage_id) + '" style="padding:6px 12px;border:0;border-radius:6px;background:#fde8e8;color:#c0392b;font-weight:700;cursor:pointer">Delete</button></td>' +
                '</tr>';
              }).join('') +
            '</tbody></table>'
            : '<div style="padding:30px;color:#666;text-align:center">No coverage rules yet. Add the first one above.</div>') +
        '</div>';

      panel.querySelector('#gops-cov-add').onclick = function () {
        var branchId = panel.querySelector('#gops-cov-branch').value;
        var shiftId = panel.querySelector('#gops-cov-shift').value;
        var day = panel.querySelector('#gops-cov-day').value;
        var count = parseInt(panel.querySelector('#gops-cov-count').value, 10);
        if (!branchId || !shiftId || !count) { toast('Fill all fields', '#c0392b'); return; }
        setStatus('Adding...');
        call('saveCoverage', { branch_id: branchId, shift_id: shiftId, day_of_week: day, captains_required: count })
          .then(function () { toast('Coverage rule added'); activateTab('coverage'); })
          .catch(function (e) { toast(e.message || e.code, '#c0392b'); setStatus('Error', '#c0392b'); });
      };

      panel.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-del');
          if (!confirm('Delete this coverage rule?')) return;
          setStatus('Deleting...');
          call('deleteCoverage', { coverage_id: id })
            .then(function () { toast('Deleted'); activateTab('coverage'); })
            .catch(function (e) { toast(e.message || e.code, '#c0392b'); setStatus('Error', '#c0392b'); });
        };
      });
    }).catch(function (e) {
      panel.innerHTML = '<div style="padding:20px;color:#c0392b">Error: ' + esc(e.message) + '</div>';
      setStatus('Error', '#c0392b');
    });
  }

  // ================================================================
  // TAB 2: Constraints
  // ================================================================
  function renderConstraintsTab(panel) {
    setStatus('Loading constraints...');
    Promise.all([getEmployees(), getBranches(), getShifts(), call('getConstraints', {})]).then(function (arr) {
      var emps = arr[0], branches = arr[1], shifts = arr[2], data = arr[3];
      var rules = data.constraints || [];
      setStatus(rules.length + ' constraint(s)');

      var dayOpts = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var empOpts = emps.map(function (e) { return '<option value="' + esc(e.employee_id) + '">' + esc(e.employee_name) + ' (' + esc(e.employee_id) + ')</option>'; }).join('');

      panel.innerHTML =
        '<div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
          '<h2 style="margin:0 0 6px;font-size:16px">Add captain constraint</h2>' +
          '<p style="color:#666;margin:0 0 14px;font-size:13px">Mark days, branches, or shifts a captain can never be assigned to.</p>' +
          '<div style="display:grid;grid-template-columns:1fr;gap:12px">' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Captain</span>' +
              '<select id="gops-cons-emp" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px">' + empOpts + '</select></label>' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Forbidden days (comma-separated or empty)</span>' +
              '<input id="gops-cons-days" placeholder="e.g. Friday,Saturday" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"></label>' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Forbidden branches (IDs, comma-separated or empty)</span>' +
              '<input id="gops-cons-branches" placeholder="e.g. BR-XXX,BR-YYY" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"></label>' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Forbidden shifts (IDs, comma-separated or empty)</span>' +
              '<input id="gops-cons-shifts" placeholder="e.g. SH-XXX,SH-YYY" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"></label>' +
            '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">Notes (optional)</span>' +
              '<input id="gops-cons-notes" placeholder="Reason" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"></label>' +
            '<div><button id="gops-cons-add" style="padding:11px 24px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer">+ Add constraint</button></div>' +
          '</div>' +
        '</div>' +
        '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
          (rules.length ?
            '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f5f7fa">' +
              '<th style="text-align:left;padding:12px">Captain</th>' +
              '<th style="text-align:left;padding:12px">Days</th>' +
              '<th style="text-align:left;padding:12px">Branches</th>' +
              '<th style="text-align:left;padding:12px">Shifts</th>' +
              '<th style="text-align:left;padding:12px">Notes</th>' +
              '<th style="padding:12px"></th>' +
            '</tr></thead><tbody>' +
              rules.map(function (r) {
                var e = emps.filter(function (x) { return x.employee_id === r.employee_id; })[0];
                return '<tr style="border-bottom:1px solid #eef1f4">' +
                  '<td style="padding:12px">' + esc(e ? e.employee_name : r.employee_id) + '</td>' +
                  '<td style="padding:12px">' + esc(r.forbidden_days || '—') + '</td>' +
                  '<td style="padding:12px">' + esc(r.forbidden_branches || '—') + '</td>' +
                  '<td style="padding:12px">' + esc(r.forbidden_shifts || '—') + '</td>' +
                  '<td style="padding:12px;color:#666">' + esc(r.notes || '') + '</td>' +
                  '<td style="padding:12px;text-align:right"><button data-del-cons="' + esc(r.constraint_id) + '" style="padding:6px 12px;border:0;border-radius:6px;background:#fde8e8;color:#c0392b;font-weight:700;cursor:pointer">Delete</button></td>' +
                '</tr>';
              }).join('') +
            '</tbody></table>'
            : '<div style="padding:30px;color:#666;text-align:center">No constraints yet.</div>') +
        '</div>';

      panel.querySelector('#gops-cons-add').onclick = function () {
        var emp = panel.querySelector('#gops-cons-emp').value;
        var days = panel.querySelector('#gops-cons-days').value.trim();
        var brs = panel.querySelector('#gops-cons-branches').value.trim();
        var shs = panel.querySelector('#gops-cons-shifts').value.trim();
        var notes = panel.querySelector('#gops-cons-notes').value.trim();
        if (!emp) { toast('Select a captain', '#c0392b'); return; }
        setStatus('Saving...');
        call('saveConstraint', { employee_id: emp, forbidden_days: days, forbidden_branches: brs, forbidden_shifts: shs, notes: notes })
          .then(function () { toast('Constraint saved'); activateTab('constraints'); })
          .catch(function (e) { toast(e.message || e.code, '#c0392b'); setStatus('Error', '#c0392b'); });
      };

      panel.querySelectorAll('[data-del-cons]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-del-cons');
          if (!confirm('Delete this constraint?')) return;
          setStatus('Deleting...');
          call('deleteConstraint', { constraint_id: id })
            .then(function () { toast('Deleted'); activateTab('constraints'); })
            .catch(function (e) { toast(e.message || e.code, '#c0392b'); setStatus('Error', '#c0392b'); });
        };
      });
    }).catch(function (e) {
      panel.innerHTML = '<div style="padding:20px;color:#c0392b">Error: ' + esc(e.message) + '</div>';
      setStatus('Error', '#c0392b');
    });
  }

  // ================================================================
  // TAB 3: Settings (sched_* only)
  // ================================================================
  function renderSettingsTab(panel) {
    setStatus('Loading settings...');
    call('getSettings', {}).then(function (d) {
      var all = d.settings || [];
      var sched = all.filter(function (s) { return s.key.indexOf('sched_') === 0; });
      setStatus(sched.length + ' settings');
      panel.innerHTML =
        '<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
          '<h2 style="margin:0 0 6px;font-size:16px">Auto Scheduler settings</h2>' +
          '<p style="color:#666;margin:0 0 18px;font-size:13px">These settings control how the weekly schedule is generated.</p>' +
          '<div id="gops-sch-settings-list"></div>' +
          '<div style="margin-top:18px"><button id="gops-sch-save-settings" style="padding:11px 24px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer">Save settings</button></div>' +
        '</div>';

      var list = panel.querySelector('#gops-sch-settings-list');
      sched.forEach(function (s) {
        var row = document.createElement('div');
        row.style.cssText = 'padding:12px 0;border-bottom:1px solid #eef1f4;display:flex;justify-content:space-between;align-items:center;gap:16px';
        var inputHtml = '';
        if (s.type === 'bool') {
          inputHtml = '<input type="checkbox" data-key="' + esc(s.key) + '" data-type="bool" ' + (s.value ? 'checked' : '') + ' style="width:22px;height:22px;cursor:pointer">';
        } else if (s.type === 'int') {
          inputHtml = '<input type="number" data-key="' + esc(s.key) + '" data-type="int" value="' + esc(s.value) + '" min="' + s.min + '" max="' + s.max + '" style="width:110px;padding:8px;border:1px solid #ccc;border-radius:6px">';
        } else {
          inputHtml = '<input type="text" data-key="' + esc(s.key) + '" data-type="str" value="' + esc(s.value) + '" style="width:280px;padding:8px;border:1px solid #ccc;border-radius:6px">';
        }
        row.innerHTML =
          '<div style="flex:1"><div style="font-weight:600">' + esc(s.key) + '</div>' +
            '<div style="color:#888;font-size:12px">' + esc(s.description || '') + '</div></div>' +
          '<div>' + inputHtml + '</div>';
        list.appendChild(row);
      });

      panel.querySelector('#gops-sch-save-settings').onclick = function () {
        var updates = {};
        panel.querySelectorAll('[data-key]').forEach(function (el) {
          var k = el.getAttribute('data-key');
          var t = el.getAttribute('data-type');
          if (t === 'bool') updates[k] = el.checked;
          else if (t === 'int') updates[k] = parseInt(el.value, 10);
          else updates[k] = el.value;
        });
        setStatus('Saving...');
        call('updateSettings', { settings: updates })
          .then(function () { toast('Settings saved'); setStatus('Saved', '#1e8e3e'); })
          .catch(function (e) { toast(e.message || e.code, '#c0392b'); setStatus('Error', '#c0392b'); });
      };
    }).catch(function (e) {
      panel.innerHTML = '<div style="padding:20px;color:#c0392b">Error: ' + esc(e.message) + '</div>';
      setStatus('Error', '#c0392b');
    });
  }

  // ================================================================
  // TAB 4: Generate + Preview
  // ================================================================
  function renderGenerateTab(panel, existingDraft) {
    var today = new Date().toISOString().slice(0, 10);
    var weekLater = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
    panel.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
        '<h2 style="margin:0 0 6px;font-size:16px">Generate a new schedule draft</h2>' +
        '<p style="color:#666;margin:0 0 14px;font-size:13px">The scheduler will read existing leaves, constraints, and coverage rules, then build a full week.</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">' +
          '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">From</span>' +
            '<input type="date" id="gops-gen-from" value="' + today + '" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"></label>' +
          '<label><span style="display:block;font-weight:600;font-size:12px;margin-bottom:4px">To</span>' +
            '<input type="date" id="gops-gen-to" value="' + weekLater + '" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"></label>' +
          '<button id="gops-gen-run" style="padding:11px 24px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer">🆕 Generate</button>' +
        '</div>' +
      '</div>' +
      '<div id="gops-gen-result"></div>';

    panel.querySelector('#gops-gen-run').onclick = function () {
      var from = panel.querySelector('#gops-gen-from').value;
      var to = panel.querySelector('#gops-gen-to').value;
      if (!from || !to) { toast('Pick dates', '#c0392b'); return; }
      setStatus('Generating...');
      panel.querySelector('#gops-gen-result').innerHTML = '<div style="padding:20px;color:#666">Generating schedule, please wait...</div>';
      call('generateSchedule', { week_from: from, week_to: to }).then(function (r) {
        setStatus(r.assignments.length + ' assignments, ' + r.warnings.length + ' warnings');
        renderDraftPreview(panel.querySelector('#gops-gen-result'), r);
        toast('Draft ready: ' + r.draft_id);
      }).catch(function (e) {
        panel.querySelector('#gops-gen-result').innerHTML = '<div style="padding:20px;color:#c0392b">Error: ' + esc(e.message) + '</div>';
        setStatus('Error', '#c0392b');
      });
    };
  }

  function renderDraftPreview(container, draft) {
    var warnings = draft.warnings || [];
    var stats = draft.stats || [];
    var dailySummary = draft.daily_summary || {};
    var assignments = draft.assignments || [];

    var html =
      '<div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">' +
          '<div>' +
            '<h2 style="margin:0;font-size:16px">Draft preview</h2>' +
            '<div style="color:#666;font-size:12px;margin-top:2px">' +
              esc(draft.week_from) + ' → ' + esc(draft.week_to) + '  ·  ID: ' + esc(draft.draft_id) +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button id="gops-draft-regen" style="padding:9px 16px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;font-weight:700">Regenerate</button>' +
            '<button id="gops-draft-publish" style="padding:10px 20px;border:0;border-radius:8px;background:#1e8e3e;color:#fff;cursor:pointer;font-weight:700">🚀 Publish</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">' +
        card('Total assignments', assignments.length, '#0a84ff') +
        card('Warnings', warnings.length, warnings.length ? '#c0392b' : '#1e8e3e') +
        card('Captains scheduled', stats.filter(function (s) { return s.shifts > 0; }).length + ' / ' + stats.length, '#6c5ce7') +
      '</div>' +
      (warnings.length ?
        '<div style="background:#fff4e5;border-left:4px solid #f39c12;border-radius:8px;padding:14px;margin-bottom:16px">' +
          '<div style="font-weight:700;margin-bottom:6px">⚠️ Warnings</div>' +
          '<ul style="margin:0;padding-left:20px">' + warnings.map(function (w) { return '<li>' + esc(w.message) + '</li>'; }).join('') + '</ul>' +
        '</div>' : '') +
      '<div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
        '<h3 style="margin:0 0 12px;font-size:15px">Captain stats</h3>' +
        '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f5f7fa">' +
          '<th style="text-align:left;padding:10px">Captain</th>' +
          '<th style="text-align:left;padding:10px">Shifts</th>' +
          '<th style="text-align:left;padding:10px">Hours</th>' +
          '<th style="text-align:left;padding:10px">Min shifts OK</th>' +
        '</tr></thead><tbody>' +
          stats.map(function (s) {
            return '<tr style="border-bottom:1px solid #eef1f4">' +
              '<td style="padding:10px">' + esc(s.employee_name) + '</td>' +
              '<td style="padding:10px">' + s.shifts + '</td>' +
              '<td style="padding:10px">' + s.hours + '</td>' +
              '<td style="padding:10px">' + (s.min_ok ? '✅' : '⚠️') + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table>' +
      '</div>' +
      '<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
        '<h3 style="margin:0 0 12px;font-size:15px">Assignments preview (first 40)</h3>' +
        '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f5f7fa">' +
          '<th style="text-align:left;padding:10px">Date</th>' +
          '<th style="text-align:left;padding:10px">Captain</th>' +
          '<th style="text-align:left;padding:10px">Branch</th>' +
          '<th style="text-align:left;padding:10px">Shift</th>' +
        '</tr></thead><tbody>' +
          assignments.slice(0, 40).map(function (a) {
            return '<tr style="border-bottom:1px solid #eef1f4">' +
              '<td style="padding:10px">' + esc(a.work_date) + '</td>' +
              '<td style="padding:10px">' + esc(a.employee_id) + '</td>' +
              '<td style="padding:10px">' + esc(a.branch_id) + '</td>' +
              '<td style="padding:10px">' + esc(a.shift_id) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table>' +
        (assignments.length > 40 ? '<div style="color:#666;font-size:12px;margin-top:8px">Showing 40 of ' + assignments.length + '</div>' : '') +
      '</div>';

    container.innerHTML = html;

    container.querySelector('#gops-draft-regen').onclick = function () {
      activateTab('generate');
    };
    container.querySelector('#gops-draft-publish').onclick = function () {
      if (!confirm('Publish this draft? This will create real assignments in the system.')) return;
      setStatus('Publishing...');
      call('publishSchedule', { draft_id: draft.draft_id }).then(function (r) {
        toast('Published! Created ' + r.created + ', cancelled ' + r.cancelled + ', skipped ' + r.skipped);
        setStatus('Published', '#1e8e3e');
      }).catch(function (e) { toast(e.message || e.code, '#c0392b'); setStatus('Error', '#c0392b'); });
    };
  }

  function card(label, value, color) {
    return '<div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
      '<div style="color:#666;font-size:12px;margin-bottom:4px">' + esc(label) + '</div>' +
      '<div style="font-size:26px;font-weight:800;color:' + color + '">' + esc(value) + '</div>' +
    '</div>';
  }

  // ================================================================
  // TAB 5: Drafts (history)
  // ================================================================
  function renderDraftsTab(panel) {
    setStatus('Loading drafts...');
    call('listScheduleDrafts', { limit: 30 }).then(function (d) {
      var drafts = d.drafts || [];
      setStatus(drafts.length + ' draft(s)');
      panel.innerHTML =
        '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
          (drafts.length ?
            '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f5f7fa">' +
              '<th style="text-align:left;padding:12px">ID</th>' +
              '<th style="text-align:left;padding:12px">Week</th>' +
              '<th style="text-align:left;padding:12px">Status</th>' +
              '<th style="text-align:left;padding:12px">Created</th>' +
              '<th style="padding:12px"></th>' +
            '</tr></thead><tbody>' +
              drafts.map(function (r) {
                return '<tr style="border-bottom:1px solid #eef1f4">' +
                  '<td style="padding:12px;font-family:monospace;font-size:12px">' + esc(r.draft_id) + '</td>' +
                  '<td style="padding:12px">' + esc(r.week_from) + ' → ' + esc(r.week_to) + '</td>' +
                  '<td style="padding:12px"><span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;background:' + (r.status === 'PUBLISHED' ? '#d4edda;color:#155724' : '#fff3cd;color:#856404') + '">' + esc(r.status) + '</span></td>' +
                  '<td style="padding:12px;color:#666;font-size:12px">' + esc(r.created_at) + '</td>' +
                  '<td style="padding:12px;text-align:right">' +
                    '<button data-view="' + esc(r.draft_id) + '" style="padding:6px 12px;border:0;border-radius:6px;background:#e7f0ff;color:#0a84ff;font-weight:700;cursor:pointer">View</button>' +
                  '</td>' +
                '</tr>';
              }).join('') +
            '</tbody></table>'
            : '<div style="padding:30px;color:#666;text-align:center">No drafts yet. Generate one from the Generate tab.</div>') +
        '</div>';

      panel.querySelectorAll('[data-view]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-view');
          setStatus('Loading draft...');
          call('getScheduleDraft', { draft_id: id }).then(function (d) {
            var container = document.createElement('div');
            panel.innerHTML = '';
            panel.appendChild(container);
            renderDraftPreview(container, {
              draft_id: d.draft.draft_id,
              week_from: d.draft.week_from,
              week_to: d.draft.week_to,
              assignments: d.draft.assignments || [],
              warnings: d.draft.warnings || [],
              stats: d.draft.stats || [],
              daily_summary: {}
            });
            setStatus('Draft ' + id, '#0a84ff');
          }).catch(function (e) { toast(e.message || e.code, '#c0392b'); });
        };
      });
    }).catch(function (e) {
      panel.innerHTML = '<div style="padding:20px;color:#c0392b">Error: ' + esc(e.message) + '</div>';
    });
  }

  // ================================================================
  // Sidebar injection
  // ================================================================
  function findSidebar() {
    var sels = ['.sidebar', 'nav.sidebar', 'aside.sidebar', '#sidebar', '.sidenav', '.side-nav', 'aside', 'nav[role="navigation"]'];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && el.querySelectorAll('a, button, li').length >= 3) return el;
    }
    return null;
  }

  function injectSidebarLink() {
    var sidebar = findSidebar();
    if (!sidebar) return;
    if (sidebar.querySelector('[data-gops-item="auto-scheduler"]')) return;
    var item = document.createElement('div');
    item.setAttribute('data-gops-item', 'auto-scheduler');
    item.setAttribute('role', 'button');
    item.style.cssText = 'cursor:pointer;padding:12px 16px;font-weight:600;color:inherit;';
    item.textContent = '📅 Auto Scheduler';
    item.onclick = function () { openAutoScheduler(); };
    sidebar.appendChild(item);
  }

  setInterval(injectSidebarLink, 3000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectSidebarLink);
  else injectSidebarLink();

})();
