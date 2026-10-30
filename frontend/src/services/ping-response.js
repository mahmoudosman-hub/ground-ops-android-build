/**
 * Ground OPS - Ping response (location_check deep link)
 * لما السيرفر يبعت "📍 نبضة موقع" والكابتن يفتح التطبيق من الإشعار،
 * الملف ده يبعت الموقع الحالي للسيرفر فوراً من غير أي ضغطة إضافية،
 * ويعرض تأكيد بسيط على الشاشة. بيشتغل على الآيفون PWA والويب عموماً.
 */
(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  function params() { try { return new URLSearchParams(window.location.search); } catch (e) { return new URLSearchParams(); } }

  function clearParam() {
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('action');
      u.searchParams.delete('manual');
      history.replaceState({}, '', u);
    } catch (e) { /* ignore */ }
  }

  function getSession() {
    try {
      const raw = localStorage.getItem('gops.session.employee') || sessionStorage.getItem('gops.session.employee');
      const v = raw ? JSON.parse(raw) : null;
      return (v && v.token) ? v : null;
    } catch (e) { return null; }
  }

  function banner(text, ok) {
    try {
      let el = document.getElementById('gops-ping-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'gops-ping-toast';
        el.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;padding:12px 18px;border-radius:12px;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,.25);font-size:15px;max-width:90vw;text-align:center';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.style.background = ok ? '#1b8a3a' : '#c62828';
      el.style.color = '#fff';
      el.style.display = 'block';
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.style.display = 'none'; }, 5000);
    } catch (e) { /* ignore */ }
  }

  async function sendNow() {
    const sess = getSession();
    if (!sess) return banner('سجل دخولك الأول عشان نقدر نأكد موقعك', false);
    if (!('geolocation' in navigator)) return banner('الجهاز ده مش بيدعم تحديد الموقع', false);

    let fix = null;
    try {
      fix = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          (e) => reject(e),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
      });
    } catch (e) {
      return banner('معرفناش نحدد موقعك — اتأكد إن الـ GPS شغال وحاول تاني', false);
    }

    const apiUrl = window.API_URL || (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) || (window.CONFIG && window.CONFIG.API_URL);
    if (!apiUrl) return banner('إعداد السيرفر ناقص — حاول تاني', false);

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'submitLocation',
          token: sess.token,
          payload: {
            points: [{
              timestamp: fix.timestamp,
              latitude: fix.coords.latitude,
              longitude: fix.coords.longitude,
              accuracy_meters: fix.coords.accuracy,
              location_source: 'gps',
              tracking_source: 'FOREGROUND_WEB'
            }],
            tracking_state: 'ACTIVE'
          },
          client: 'ping-response/1.0'
        })
      });
      let out = null;
      try { out = await res.json(); } catch (e) { /* ignore */ }
      if (out && out.success) banner('✅ تم إرسال موقعك — تمام', true);
      else if (out && out.error_code === 'NO_ACTIVE_SHIFT') banner('مفيش شيفت شغال دلوقتي — مش محتاجين موقعك', false);
      else banner((out && out.message) ? ('مبعتش الموقع: ' + out.message) : 'مبعتش الموقع — حاول تاني', false);
    } catch (e) {
      banner('مفيش إنترنت — افتح التطبيق تاني لما الشبكة ترجع', false);
    }
  }

  function run() {
    const p = params();
    if (p.get('action') !== 'location_check') return;
    clearParam();
    const go = () => setTimeout(sendNow, 400);
    if (document.readyState === 'complete' || document.readyState === 'interactive') go();
    else window.addEventListener('DOMContentLoaded', go, { once: true });
  }

  run();
})();
