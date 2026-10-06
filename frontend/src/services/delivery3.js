/**
 * Ground OPS - Delivery 3 client bootstrap.
 * Self-contained. No ES imports. Reads API_URL and the session token directly.
 *
 * Loaded on BOTH index.html (employee) and admin.html.
 * Detects which page it is on and:
 *   - employee: adds native_attestation to check-in/out, polls & shows selfie checks
 *   - admin:    adds a "Selfie Checks" page (floating button + sidebar link if found)
 */
(function () {
  'use strict';

  var API_URL = null;

  // ---- Config: read API_URL from config.js (fallback if not global) ----
  function loadConfigOnce() {
    if (API_URL) return Promise.resolve(API_URL);
    try {
      if (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) { API_URL = window.GOPS_CONFIG.API_URL; return Promise.resolve(API_URL); }
      if (window.CONFIG && window.CONFIG.API_URL) { API_URL = window.CONFIG.API_URL; return Promise.resolve(API_URL); }
      if (window.API_URL) { API_URL = window.API_URL; return Promise.resolve(API_URL); }
    } catch (e) {}
    return fetch('./config.js', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var m = txt.match(/API_URL\s*:\s*['"]([^'"]+)['"]/);
        API_URL = m ? m[1] : null;
        return API_URL;
      })
      .catch(function () { return null; });
  }

  // ---- Session (same format as src/core/session.js) ----
  function getSession(kind) {
    var key = 'gops.session.' + kind;
    var stores = [window.localStorage, window.sessionStorage].filter(Boolean);
    for (var i = 0; i < stores.length; i++) {
      try {
        var raw = stores[i].getItem(key);
        if (!raw) continue;
        var v = JSON.parse(raw);
        if (v && v.token && Date.parse(v.expires_at) > Date.now()) return v;
      } catch (e) {}
    }
    return null;
  }

  // ---- API call (same wire format as src/core/api.js) ----
  function apiCall(kind, action, payload, opts) {
    opts = opts || {};
    if (!API_URL) return Promise.reject(makeErr('NOT_CONFIGURED', 'API_URL is not set'));
    var sess = opts.auth === false ? null : getSession(kind);
    if (opts.auth !== false && !sess) return Promise.reject(makeErr('INVALID_SESSION', 'Not signed in'));
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: action,
        token: sess ? sess.token : undefined,
        payload: payload || {},
        client: 'delivery3/1.0'
      }),
      redirect: 'follow',
      credentials: 'omit'
    })
    .then(function (r) { return r.json(); })
    .then(function (body) {
      if (!body || body.success !== true) {
        throw makeErr((body && body.error_code) || 'SERVER_ERROR', (body && body.message) || 'Request failed');
      }
      return body.data;
    });
  }

  function makeErr(code, msg) { var e = new Error(msg); e.code = code; return e; }

  // ---- Page detection ----
  function isAdminPage() { return /admin\.html/i.test(window.location.pathname); }

  // ---- Toast ----
  function toast(msg, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;z-index:99999;left:50%;transform:translateX(-50%);bottom:24px;background:' +
      (opts.bg || '#111') + ';color:#fff;padding:10px 16px;border-radius:20px;font:14px/1.4 system-ui,sans-serif;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, (opts.ms || 3000));
    setTimeout(function () { el.remove(); }, (opts.ms || 3000) + 400);
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result), i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // ============================================================
  // EMPLOYEE: native attestation + selfie check polling
  // ============================================================
  function wrapFetchForAttestation() {
    if (window.__gopsD3FetchWrapped) return;
    window.__gopsD3FetchWrapped = true;
    var origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        var isOurCall = false;
        if (typeof input === 'string' && API_URL && input === API_URL) isOurCall = true;
        else if (input && input.url && API_URL && input.url === API_URL) isOurCall = true;
        if (isOurCall && init && init.method === 'POST' && typeof init.body === 'string') {
          var parsed = JSON.parse(init.body);
          if (parsed && (parsed.action === 'checkIn' || parsed.action === 'checkOut')) {
            var isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
            parsed.payload = parsed.payload || {};
            parsed.payload.native_attestation = isNative;
            init = Object.assign({}, init, { body: JSON.stringify(parsed) });
          }
        }
      } catch (e) { /* leave body as-is */ }
      return origFetch(input, init);
    };
  }

  var SELFIE_POLL_MS = 60000;
  var selfieState = { busy: false, showing: false, lastCheckId: null, timer: null };

  function startSelfiePolling() {
    if (selfieState.timer) return;
    setTimeout(pollSelfie, 4000);
    selfieState.timer = setInterval(pollSelfie, SELFIE_POLL_MS);
  }

  function pollSelfie() {
    if (selfieState.busy || selfieState.showing) return;
    if (!getSession('employee')) return;
    selfieState.busy = true;
    apiCall('employee', 'getPendingSelfieCheck', {})
      .then(function (data) {
        selfieState.busy = false;
        if (data && data.due && data.due.check_id && data.due.check_id !== selfieState.lastCheckId) {
          showSelfieModal(data.due);
        }
      })
      .catch(function () { selfieState.busy = false; });
  }

  function showSelfieModal(due) {
    if (selfieState.showing) return;
    selfieState.showing = true;
    selfieState.lastCheckId = due.check_id;

    var remaining = due.remaining_seconds || 600;
    var overlay = document.createElement('div');
    overlay.id = 'gops-selfie-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:420px;width:100%;padding:20px;text-align:center;font:15px/1.5 system-ui,sans-serif;color:#111">' +
        '<h2 style="margin:0 0 6px;font-size:18px">📸 Selfie check</h2>' +
        '<p style="margin:0 0 10px;color:#555;font-size:13px">Take a photo now. This confirms you are really at your location.</p>' +
        '<div id="gops-sc-timer" style="font-weight:700;font-size:22px;color:#d33;margin:4px 0 12px"></div>' +
        '<video id="gops-sc-video" autoplay playsinline muted style="width:100%;border-radius:10px;background:#000;max-height:320px;object-fit:cover"></video>' +
        '<canvas id="gops-sc-canvas" style="display:none"></canvas>' +
        '<img id="gops-sc-preview" style="display:none;width:100%;border-radius:10px;max-height:320px;object-fit:cover"/>' +
        '<div id="gops-sc-err" style="color:#c00;margin-top:8px;min-height:18px;font-size:13px"></div>' +
        '<div style="display:flex;gap:8px;margin-top:14px">' +
          '<button id="gops-sc-capture" style="flex:1;padding:12px;border:0;border-radius:10px;background:#0a84ff;color:#fff;font-weight:700;font-size:15px">Take photo</button>' +
          '<button id="gops-sc-retake" style="flex:1;padding:12px;border:0;border-radius:10px;background:#eee;color:#111;font-weight:700;font-size:15px;display:none">Retake</button>' +
          '<button id="gops-sc-submit" style="flex:1;padding:12px;border:0;border-radius:10px;background:#1e8e3e;color:#fff;font-weight:700;font-size:15px;display:none">Submit</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var video = overlay.querySelector('#gops-sc-video');
    var canvas = overlay.querySelector('#gops-sc-canvas');
    var preview = overlay.querySelector('#gops-sc-preview');
    var btnCap = overlay.querySelector('#gops-sc-capture');
    var btnRe = overlay.querySelector('#gops-sc-retake');
    var btnSub = overlay.querySelector('#gops-sc-submit');
    var errEl = overlay.querySelector('#gops-sc-err');
    var timerEl = overlay.querySelector('#gops-sc-timer');
    var stream = null, capturedBlob = null;
    var deadline = Date.now() + remaining * 1000;

    function tick() {
      var left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      var m = Math.floor(left / 60), s = left % 60;
      timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      if (left <= 0) close('Time is up. Selfie missed.');
    }
    var tickIv = setInterval(tick, 500); tick();

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(function (s) { stream = s; video.srcObject = s; })
      .catch(function (e) { errEl.textContent = 'Camera not available: ' + (e.message || e.name); });

    function stopStream() { if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; } }
    function close(msg) {
      clearInterval(tickIv); stopStream(); overlay.remove();
      selfieState.showing = false;
      if (msg) toast(msg, { bg: '#c00' });
    }

    btnCap.onclick = function () {
      if (!stream) { errEl.textContent = 'Camera not ready.'; return; }
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 960;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        if (!blob) { errEl.textContent = 'Capture failed.'; return; }
        capturedBlob = blob;
        preview.src = URL.createObjectURL(blob);
        preview.style.display = 'block'; video.style.display = 'none';
        btnCap.style.display = 'none'; btnRe.style.display = 'block'; btnSub.style.display = 'block';
      }, 'image/jpeg', 0.82);
    };

    btnRe.onclick = function () {
      capturedBlob = null;
      preview.style.display = 'none'; video.style.display = 'block';
      btnCap.style.display = 'block'; btnRe.style.display = 'none'; btnSub.style.display = 'none';
      errEl.textContent = '';
    };

    btnSub.onclick = function () {
      if (!capturedBlob) { errEl.textContent = 'Take a photo first.'; return; }
      errEl.textContent = 'Getting your location...';
      btnSub.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        blobToBase64(capturedBlob).then(function (b64) {
          apiCall('employee', 'respondToSelfieCheck', {
            check_id: due.check_id,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_meters: pos.coords.accuracy,
            gps_timestamp: new Date(pos.timestamp).toISOString(),
            is_mock_location: false,
            location_source: 'gps',
            selfie_base64: b64,
            selfie_mime: 'image/jpeg'
          }).then(function () {
            close();
            toast('Selfie submitted. Thank you!', { bg: '#1e8e3e' });
          }).catch(function (e) {
            btnSub.disabled = false;
            errEl.textContent = 'Could not submit: ' + (e.message || e.code);
          });
        }).catch(function () { btnSub.disabled = false; errEl.textContent = 'Could not read photo.'; });
      }, function (e) {
        btnSub.disabled = false;
        errEl.textContent = 'Location error: ' + (e.message || 'denied');
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    };
  }

  // ============================================================
  // ADMIN: Selfie Checks page
  // ============================================================
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(iso) { try { return new Date(iso).toLocaleString(); } catch (e) { return iso || ''; } }
  function badge(s) {
    var colors = { DONE: '#1e8e3e', PENDING: '#f0ad4e', MISSED: '#d33' };
    return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:' + (colors[s] || '#888') + ';color:#fff;font-size:12px">' + esc(s) + '</span>';
  }

  function openAdminSelfiePage() {
    var old = document.getElementById('gops-sc-admin-root');
    if (old) old.remove();
    var root = document.createElement('div');
    root.id = 'gops-sc-admin-root';
    root.style.cssText = 'position:fixed;inset:0;background:#f7f7f8;z-index:99990;overflow:auto;padding:20px;font:15px/1.5 system-ui,sans-serif;color:#111';
    root.innerHTML =
      '<div style="max-width:1100px;margin:0 auto">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
          '<h1 style="margin:0;font-size:22px">Selfie Checks</h1>' +
          '<button id="gops-sc-close-page" style="padding:8px 14px;border:0;border-radius:8px;background:#111;color:#fff;font-weight:700;cursor:pointer">Close</button>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">' +
          '<label>Date: <input type="date" id="gops-sc-date" style="padding:6px;border:1px solid #ccc;border-radius:6px"></label>' +
          '<label>Status: <select id="gops-sc-status" style="padding:6px;border:1px solid #ccc;border-radius:6px">' +
            '<option value="">All</option><option value="PENDING">Pending</option><option value="DONE">Done</option><option value="MISSED">Missed</option>' +
          '</select></label>' +
          '<button id="gops-sc-refresh" style="padding:8px 14px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer">Refresh</button>' +
        '</div>' +
        '<div id="gops-sc-summary" style="margin-bottom:10px;color:#555"></div>' +
        '<div id="gops-sc-list" style="background:#fff;border-radius:10px;overflow:hidden"></div>' +
        '<div id="gops-sc-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99995;align-items:center;justify-content:center;padding:16px"></div>' +
      '</div>';
    document.body.appendChild(root);

    var dateInput = root.querySelector('#gops-sc-date');
    var statusSel = root.querySelector('#gops-sc-status');
    var btnRefresh = root.querySelector('#gops-sc-refresh');
    var summary = root.querySelector('#gops-sc-summary');
    var list = root.querySelector('#gops-sc-list');
    var modal = root.querySelector('#gops-sc-modal');

    var today = new Date().toISOString().slice(0, 10);
    dateInput.value = today;

    function load() {
      summary.textContent = 'Loading...';
      list.innerHTML = '';
      apiCall('admin', 'getSelfieChecks', { date: dateInput.value, status: statusSel.value || undefined })
        .then(function (data) {
          var c = data.counts || {};
          summary.textContent = 'Total: ' + (data.total || 0) + '   •   Done: ' + (c.DONE || 0) + '   •   Pending: ' + (c.PENDING || 0) + '   •   Missed: ' + (c.MISSED || 0);
          if (!data.items || !data.items.length) { list.innerHTML = '<p style="padding:16px;color:#777;margin:0">No selfie checks on this date.</p>'; return; }
          var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f5f5f5">' +
            '<th style="text-align:left;padding:10px;border-bottom:1px solid #e5e5e5">Employee</th>' +
            '<th style="text-align:left;padding:10px;border-bottom:1px solid #e5e5e5">Scheduled</th>' +
            '<th style="text-align:left;padding:10px;border-bottom:1px solid #e5e5e5">Responded</th>' +
            '<th style="text-align:left;padding:10px;border-bottom:1px solid #e5e5e5">Status</th>' +
            '<th style="text-align:left;padding:10px;border-bottom:1px solid #e5e5e5">Distance</th>' +
            '<th style="text-align:left;padding:10px;border-bottom:1px solid #e5e5e5">Flags</th>' +
            '<th style="padding:10px;border-bottom:1px solid #e5e5e5"></th></tr></thead><tbody>';
          data.items.forEach(function (it) {
            var dist = (it.distance_from_branch_meters != null && it.distance_from_branch_meters !== '') ? Math.round(it.distance_from_branch_meters) + ' m' : '';
            var flags = (it.flags || []).join(', ');
            var viewBtn = it.has_image ? '<button data-cid="' + it.check_id + '" class="gops-sc-view" style="padding:6px 12px;border:0;border-radius:6px;background:#0a84ff;color:#fff;cursor:pointer;font-weight:700">View</button>' : '';
            html += '<tr>' +
              '<td style="padding:10px;border-bottom:1px solid #eee">' + esc(it.employee_name) + '</td>' +
              '<td style="padding:10px;border-bottom:1px solid #eee">' + fmtTime(it.scheduled_at) + '</td>' +
              '<td style="padding:10px;border-bottom:1px solid #eee">' + (it.responded_at ? fmtTime(it.responded_at) : '-') + '</td>' +
              '<td style="padding:10px;border-bottom:1px solid #eee">' + badge(it.status) + '</td>' +
              '<td style="padding:10px;border-bottom:1px solid #eee">' + esc(dist) + '</td>' +
              '<td style="padding:10px;border-bottom:1px solid #eee">' + esc(flags) + '</td>' +
              '<td style="padding:10px;border-bottom:1px solid #eee">' + viewBtn + '</td>' +
            '</tr>';
          });
          html += '</tbody></table>';
          list.innerHTML = html;
          list.querySelectorAll('.gops-sc-view').forEach(function (b) {
            b.onclick = function () { viewImage(b.getAttribute('data-cid')); };
          });
        })
        .catch(function (e) {
          summary.textContent = '';
          list.innerHTML = '<p style="padding:16px;color:#c00;margin:0">Error: ' + esc(e.message || e.code) + '</p>';
        });
    }

    function viewImage(checkId) {
      modal.style.display = 'flex';
      modal.innerHTML = '<div style="background:#fff;padding:12px;border-radius:10px;max-width:95vw;max-height:95vh;overflow:auto">' +
        '<div style="margin-bottom:8px;text-align:right"><button id="gops-sc-modal-close" style="padding:6px 12px;border:0;border-radius:6px;background:#eee;cursor:pointer">Close</button></div>' +
        '<div id="gops-sc-img">Loading...</div></div>';
      modal.querySelector('#gops-sc-modal-close').onclick = function () { modal.style.display = 'none'; modal.innerHTML = ''; };
      apiCall('admin', 'getSelfieCheckImage', { check_id: checkId })
        .then(function (d) {
          modal.querySelector('#gops-sc-img').innerHTML = '<img src="data:' + d.mime + ';base64,' + d.data_base64 + '" style="max-width:100%;max-height:80vh;border-radius:8px"/>';
        })
        .catch(function (e) {
          modal.querySelector('#gops-sc-img').innerHTML = '<p style="color:#c00">Could not load image: ' + esc(e.message || e.code) + '</p>';
        });
    }

    btnRefresh.onclick = load;
    dateInput.onchange = load;
    statusSel.onchange = load;
    root.querySelector('#gops-sc-close-page').onclick = function () { root.remove(); };
    load();
  }

  // ---- Admin: floating button (always works, independent of sidebar structure) ----
  function installAdminEntryPoint() {
    if (document.getElementById('gops-sc-fab')) return;
    var fab = document.createElement('button');
    fab.id = 'gops-sc-fab';
    fab.textContent = '📸 Selfie Checks';
    fab.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99991;padding:12px 16px;border:0;border-radius:24px;background:#0a84ff;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(10,132,255,.45);cursor:pointer;';
    fab.onclick = openAdminSelfiePage;
    document.body.appendChild(fab);

    // Also try to add a sidebar link (best-effort, some dashboards differ)
    try {
      var nav = document.querySelector('.sidebar, nav.sidebar, aside.sidebar, .nav, aside nav, .menu, #sidebar');
      if (nav && !nav.querySelector('[data-gops-sc-link]')) {
        var a = document.createElement('a');
        a.href = '#';
        a.setAttribute('data-gops-sc-link', '1');
        a.textContent = 'Selfie Checks';
        a.style.cssText = 'display:block;padding:10px 14px;color:inherit;text-decoration:none;cursor:pointer;';
        a.onclick = function (ev) { ev.preventDefault(); openAdminSelfiePage(); };
        nav.appendChild(a);
      }
    } catch (e) { /* sidebar shape unknown; floating button still works */ }
  }

  // ============================================================
  // Boot
  // ============================================================
  loadConfigOnce().then(function () {
    if (isAdminPage()) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installAdminEntryPoint);
      } else {
        installAdminEntryPoint();
      }
      // Some admin SPAs re-render; re-inject if removed
      setInterval(function () {
        if (!document.getElementById('gops-sc-fab')) installAdminEntryPoint();
      }, 3000);
    } else {
      wrapFetchForAttestation();
      startSelfiePolling();
    }
  });
})();
