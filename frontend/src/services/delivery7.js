/**
 * Ground OPS - Delivery 7
 * Auto-refresh after admin actions. No imports.
 * Watches admin API calls (approve, reject, delete, etc.). On success:
 *  - Shows a green toast.
 *  - Closes the open modal.
 *  - Re-clicks the active sidebar nav to reload the list (no manual F5).
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  var ACTIONS = {
    'decideRequest': 'Request updated',
    'respondToRequest': 'Answer saved',
    'cancelRequest': 'Request cancelled',
    'acknowledgeAlerts': 'Alerts acknowledged',
    'adminEndBreak': 'Break ended',
    'cleanSelfieChecks': 'Selfie checks cleaned',
    'deleteEmployee': 'Employee deleted',
    'deleteBranch': 'Branch deleted',
    'assignShift': 'Shift assigned',
    'cancelLeave': 'Leave cancelled',
    'setLeaveAdjustment': 'Balance updated',
    'updateSettings': 'Settings saved'
  };

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var action = null;
    try {
      if (init && typeof init.body === 'string') {
        var parsed = JSON.parse(init.body);
        if (parsed && parsed.action) action = parsed.action;
      }
    } catch (e) {}

    return origFetch(input, init).then(function (res) {
      if (!action || !ACTIONS[action]) return res;
      var cloned = res.clone();
      cloned.json().then(function (body) {
        if (body && body.success === true) {
          greenToast(ACTIONS[action] + ' ✓');
          closeOpenModal();
          setTimeout(reloadActiveList, 400);
        } else if (body && body.success === false) {
          redToast(body.message || body.error_code || 'Action failed');
        }
      }).catch(function () {});
      return res;
    });
  };

  function greenToast(msg) { showToast(msg, '#1e8e3e'); }
  function redToast(msg) { showToast(msg, '#c0392b'); }
  function showToast(msg, bg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;z-index:999999;left:50%;transform:translateX(-50%);top:24px;background:' + bg + ';color:#fff;padding:14px 24px;border-radius:12px;font:600 15px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2500);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 3000);
  }

  function closeOpenModal() {
    // Look for the topmost dialog / modal and close it.
    var sels = ['[role="dialog"]', '.modal', '.overlay', '#gops-clean-dialog'];
    for (var i = 0; i < sels.length; i++) {
      var nodes = document.querySelectorAll(sels[i]);
      for (var j = nodes.length - 1; j >= 0; j--) {
        var el = nodes[j];
        if (el.id === 'gops-clean-dialog') continue; // don't touch our own
        if (el.offsetParent === null) continue; // not visible
        // Find a close button (× / Close / Cancel)
        var btns = el.querySelectorAll('button');
        var clicked = false;
        for (var k = 0; k < btns.length; k++) {
          var t = (btns[k].textContent || '').trim().toLowerCase();
          if (t === '×' || t === 'x' || t === 'close' || t === 'cancel' || t === 'إلغاء' || t === 'إغلاق') {
            btns[k].click();
            clicked = true;
            break;
          }
        }
        // Fallback: hide it
        if (!clicked) { el.style.display = 'none'; el.setAttribute('hidden', ''); }
      }
    }
    // Also press Escape as a safety net
    try {
      var ev = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true });
      document.dispatchEvent(ev);
    } catch (e) {}
  }

  function reloadActiveList() {
    // Strategy: find the currently active nav item and click it to force a re-render.
    var candidates = document.querySelectorAll('.sidebar a, .sidebar button, nav a, nav button, aside a, aside button, .nav a, .nav button, [role="tab"], [data-view]');
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var cls = (el.className || '') + ' ' + (el.getAttribute('aria-selected') || '') + ' ' + (el.getAttribute('aria-current') || '');
      if (/active|selected|current|true/i.test(cls) && el.offsetParent !== null) {
        best = el;
      }
    }
    if (best) { try { best.click(); return; } catch (e) {} }

    // Fallback: click the "Requests" link
    for (var j = 0; j < candidates.length; j++) {
      var txt = (candidates[j].textContent || '').trim().toLowerCase();
      if (txt === 'requests' || txt === 'الطلبات') { candidates[j].click(); return; }
    }
  }
})();
