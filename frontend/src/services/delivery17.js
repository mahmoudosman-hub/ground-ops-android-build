/**
 * Ground OPS - Delivery 17 v2
 * Ask all required permissions on app launch only (native Android).
 * Removed the visibility-change re-check (was making the app slow).
 */
(function () {
  'use strict';

  if (/admin\.html/i.test(window.location.pathname)) return;

  function isNative() {
    try { return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()); }
    catch (e) { return false; }
  }
  function plugin() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GopsLocation) return window.Capacitor.Plugins.GopsLocation;
    } catch (e) {}
    return null;
  }

  function askCamera() {
    return new Promise(function (resolve) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return resolve('unsupported');
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(function (s) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} resolve('granted'); })
        .catch(function () { resolve('denied'); });
    });
  }

  function rowHtml(label, emoji, ok, action) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eee">' +
      '<span style="font-weight:600;font-size:14px">' + emoji + ' ' + label + '</span>' +
      (ok ? '<span style="color:#1e8e3e;font-weight:900;font-size:18px">✓</span>'
          : '<button data-gops-perm="' + action + '" style="padding:8px 16px;background:#ef6c00;color:#fff;border:0;border-radius:8px;font:700 13px system-ui,sans-serif;cursor:pointer">Enable</button>') +
      '</div>';
  }

  function showOverlay(state) {
    var old = document.getElementById('gops-perm-overlay');
    if (old) old.remove();

    var ov = document.createElement('div');
    ov.id = 'gops-perm-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:460px;width:100%;padding:24px;font:15px/1.5 system-ui,-apple-system,sans-serif;color:#111;box-shadow:0 20px 60px rgba(0,0,0,.45)">' +
        '<div style="text-align:center;margin-bottom:8px;font-size:48px">🔐</div>' +
        '<h2 style="margin:0 0 6px;font-size:20px;text-align:center">Permissions needed</h2>' +
        '<p style="margin:0 0 16px;color:#555;font-size:13px;text-align:center">Enable all permissions so the app can work.</p>' +
        rowHtml('Location', '📍', state.location === 'granted', 'location') +
        rowHtml('Camera', '📸', state.camera === 'granted', 'camera') +
        rowHtml('Notifications', '🔔', state.notifications === true, 'notifications') +
        rowHtml('Battery (no restrictions)', '🔋', state.battery === true, 'battery') +
        '<button id="gops-perm-recheck" style="width:100%;margin-top:18px;padding:13px;background:#0a84ff;color:#fff;border:0;border-radius:10px;font:700 15px system-ui,sans-serif;cursor:pointer">Check again</button>' +
      '</div>';
    document.body.appendChild(ov);

    ov.querySelector('#gops-perm-recheck').onclick = function () { ov.remove(); checkAndAsk(); };
    ov.querySelectorAll('[data-gops-perm]').forEach(function (btn) {
      btn.onclick = function () {
        var kind = btn.getAttribute('data-gops-perm');
        var G = plugin();
        if (kind === 'location') {
          if (G) G.askPermissions().then(function () { ov.remove(); setTimeout(checkAndAsk, 400); });
        } else if (kind === 'camera') {
          askCamera().then(function () { ov.remove(); setTimeout(checkAndAsk, 400); });
        } else if (kind === 'notifications') {
          if (G && G.openAppSettings) G.openAppSettings();
        } else if (kind === 'battery') {
          if (G && G.openBatterySettings) G.openBatterySettings();
        }
      };
    });
  }

  function checkAndAsk() {
    if (!isNative()) return;
    var G = plugin();
    if (!G) return;
    var result = { location: 'unknown', camera: 'unknown', notifications: false, battery: false };

    G.askPermissions().then(function (res) {
      result.location = res.location || 'unknown';
      result.notifications = !!res.notifications;
      return askCamera();
    }).then(function (cam) {
      result.camera = cam;
      return G.getNativeLocationStatus().then(function (st) {
        result.battery = st && st.ignoringBatteryOptimizations === true;
      }).catch(function () { result.battery = false; });
    }).then(function () {
      var allOk = result.location === 'granted' && result.camera === 'granted' && result.notifications === true && result.battery === true;
      if (!allOk) showOverlay(result);
    }).catch(function (e) { console.warn('[permissions]', e); });
  }

  // Only run ONCE at app launch (no visibilitychange listener anymore)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(checkAndAsk, 800); });
  else setTimeout(checkAndAsk, 800);
})();
