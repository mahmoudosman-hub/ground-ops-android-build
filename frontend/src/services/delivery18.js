/**
 * Ground OPS - Delivery 18 v3
 * Late permission - creates the request directly as PENDING_ADMIN (no DRAFT step).
 */
(function () {
  'use strict';

  if (/admin\.html/i.test(window.location.pathname)) return;

  var API_URL = null;
  function api() {
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
  function token() {
    try {
      var k = 'gops.session.employee';
      var s = [window.localStorage, window.sessionStorage];
      for (var i = 0; i < s.length; i++) {
        var raw = s[i].getItem(k); if (!raw) continue;
        var v = JSON.parse(raw);
        if (v && v.token) return v.token;
      }
    } catch (e) {}
    return null;
  }
  function call(action, payload) {
    return api().then(function () {
      var t = token();
      if (!t) throw new Error('Not signed in');
      return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: t, payload: payload, client: 'delivery18/3' }),
        redirect: 'follow',
        credentials: 'omit'
      }).then(function (r) { return r.json(); }).then(function (b) {
        if (!b.success) { var e = new Error(b.message || b.error_code); e.code = b.error_code; throw e; }
        return b.data;
      });
    });
  }

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result), i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function fmtDate(d) {
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function toast(msg, bg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;z-index:999999;left:50%;transform:translateX(-50%);top:24px;background:' + (bg || '#1e8e3e') + ';color:#fff;padding:12px 20px;border-radius:12px;font:600 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3500);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 4000);
  }

  function hourOptions() {
    var out = '';
    for (var h = 1; h <= 12; h++) out += '<option value="' + h + '">' + h + '</option>';
    return out;
  }
  function minuteOptions() {
    var out = '';
    for (var m = 0; m <= 55; m += 5) {
      var label = (m < 10 ? '0' : '') + m;
      out += '<option value="' + label + '">' + label + '</option>';
    }
    return out;
  }

  function openModal() {
    var ov = document.createElement('div');
    ov.id = 'gops-late-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:999998;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:480px;width:100%;padding:22px;font:15px/1.5 system-ui,-apple-system,sans-serif;color:#111">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
          '<h2 style="margin:0;font-size:19px">⏰ Late permission</h2>' +
          '<button id="gops-late-close" style="background:transparent;border:0;font-size:24px;cursor:pointer;color:#666">×</button>' +
        '</div>' +
        '<p style="margin:0 0 14px;color:#666;font-size:13px">Ask the admin for permission to arrive later than your shift start.</p>' +
        '<label style="display:block;margin-bottom:10px"><span style="display:block;font-weight:600;margin-bottom:4px;font-size:13px">Date</span>' +
        '<input type="date" id="gops-late-date" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px;box-sizing:border-box"></label>' +
        '<div style="display:block;margin-bottom:10px">' +
          '<span style="display:block;font-weight:600;margin-bottom:4px;font-size:13px">I will arrive at</span>' +
          '<div style="display:flex;gap:8px">' +
            '<select id="gops-late-hour" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px">' + hourOptions() + '</select>' +
            '<select id="gops-late-min" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px">' + minuteOptions() + '</select>' +
            '<select id="gops-late-ampm" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px">' +
              '<option value="AM">AM</option>' +
              '<option value="PM" selected>PM</option>' +
            '</select>' +
          '</div>' +
          '<div style="margin-top:6px;font-size:12px;color:#666" id="gops-late-preview">Time: 1:00 PM</div>' +
        '</div>' +
        '<label style="display:block;margin-bottom:10px"><span style="display:block;font-weight:600;margin-bottom:4px;font-size:13px">Reason <span style="color:#c00">*</span></span>' +
        '<textarea id="gops-late-note" maxlength="300" rows="3" placeholder="Traffic, family, doctor, ..." style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea></label>' +
        '<label style="display:block;margin-bottom:14px"><span style="display:block;font-weight:600;margin-bottom:4px;font-size:13px">Photo (optional)</span>' +
        '<input type="file" id="gops-late-file" accept="image/*,application/pdf" style="width:100%;font-size:13px"></label>' +
        '<div id="gops-late-err" style="color:#c00;font-size:13px;min-height:18px;margin-bottom:10px"></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button id="gops-late-cancel" style="flex:1;padding:12px;border:1px solid #ccc;border-radius:8px;background:#fff;font-weight:600;cursor:pointer">Cancel</button>' +
          '<button id="gops-late-submit" style="flex:2;padding:12px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer">Send request</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var dateI = ov.querySelector('#gops-late-date');
    var hourI = ov.querySelector('#gops-late-hour');
    var minI = ov.querySelector('#gops-late-min');
    var ampmI = ov.querySelector('#gops-late-ampm');
    var preview = ov.querySelector('#gops-late-preview');

    dateI.value = fmtDate(new Date());

    function updatePreview() {
      preview.textContent = 'Time: ' + hourI.value + ':' + minI.value + ' ' + ampmI.value;
    }
    hourI.onchange = updatePreview;
    minI.onchange = updatePreview;
    ampmI.onchange = updatePreview;
    updatePreview();

    ov.querySelector('#gops-late-close').onclick = ov.querySelector('#gops-late-cancel').onclick = function () { ov.remove(); };

    ov.querySelector('#gops-late-submit').onclick = function () {
      var btn = this;
      var date = dateI.value;
      var h = parseInt(hourI.value, 10);
      var m = minI.value;
      var ampm = ampmI.value;
      var note = ov.querySelector('#gops-late-note').value.trim();
      var fileI = ov.querySelector('#gops-late-file');
      var err = ov.querySelector('#gops-late-err');
      err.textContent = '';

      if (!date) { err.textContent = 'Pick a date.'; return; }
      if (!h || h < 1 || h > 12) { err.textContent = 'Pick an hour.'; return; }
      if (!note) { err.textContent = 'Write a reason.'; return; }

      var h24 = h;
      if (ampm === 'PM' && h !== 12) h24 = h + 12;
      if (ampm === 'AM' && h === 12) h24 = 0;
      var timeStr = (h24 < 10 ? '0' : '') + h24 + ':' + m;

      btn.disabled = true;
      btn.style.opacity = '.7';
      var origText = btn.textContent;
      btn.textContent = 'Sending...';

      call('createRequest', { type: 'LATE_PERMISSION', date_from: date, time_value: timeStr, note: note })
        .then(function (res) {
          // Server already created the request as PENDING_ADMIN.
          // Attach a file if the user provided one, then we're done.
          var rid = res.request.request_id;
          var f = fileI.files && fileI.files[0];
          if (!f) return { rid: rid };
          return toBase64(f).then(function (b64) {
            var mime = f.type || 'image/jpeg';
            return call('attachRequestFile', { request_id: rid, file_base64: b64, file_mime: mime, file_name: f.name || 'proof' })
              .then(function () { return { rid: rid }; });
          });
        })
        .then(function () {
          ov.remove();
          toast('Late permission request sent ✅');
          setTimeout(function () { location.reload(); }, 800);
        })
        .catch(function (e) {
          btn.disabled = false;
          btn.style.opacity = '';
          btn.textContent = origText;
          err.textContent = e.message || e.code || 'Failed';
        });
    };
  }

  function injectButton() {
    if (document.getElementById('gops-late-btn')) return;
    var btns = document.querySelectorAll('button');
    var earlyBtn = null;
    for (var i = 0; i < btns.length; i++) {
      var t = (btns[i].textContent || '').trim().toLowerCase();
      if (t === 'early leave' || t === 'إذن انصراف مبكر' || t === 'early-leave') { earlyBtn = btns[i]; break; }
    }
    if (!earlyBtn) return;
    var parent = earlyBtn.parentNode;
    if (!parent) return;
    var b = document.createElement('button');
    b.id = 'gops-late-btn';
    b.textContent = '⏰ Late permission';
    b.style.cssText = 'padding:10px 16px;border:0;border-radius:8px;background:#f39c12;color:#fff;font-weight:700;cursor:pointer;font-size:14px;';
    b.onclick = openModal;
    parent.appendChild(b);
  }

  var pending = false;
  var obs = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; injectButton(); }, 200);
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  setInterval(injectButton, 2500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectButton);
  else injectButton();
})();
