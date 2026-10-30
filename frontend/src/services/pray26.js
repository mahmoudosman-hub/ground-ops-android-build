/**
 * Ground OPS - Delivery 26: زر الصلاة (Pray Break)
 * زر عائم للكابتن أثناء الشيفت: 15 دقيقة سكوت تام من كل الإشعارات، بتقفل لوحدها.
 * - يظهر فقط للكابتن المسجل الدخول.
 * - العد بالثواني على الزر، وينتهي تلقائياً من السيرفر.
 * - لو الكابتن عمل Check-Out، الصلاة بتتقفل تلقائياً من السيرفر.
 */
(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  var API_URL = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL || '';
  var pollTimer = null;
  var countdownTimer = null;
  var remainSec = 0;

  function getSession() {
    try {
      var raw = localStorage.getItem('gops.session.employee') || sessionStorage.getItem('gops.session.employee');
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && v.token) ? v : null;
    } catch (e) { return null; }
  }

  async function api(action, payload) {
    var sess = getSession();
    if (!sess) throw new Error('no session');
    var res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: sess.token, payload: payload || {}, client: 'pray/1.0' })
    });
    var out = await res.json();
    if (!out || out.success !== true) throw new Error((out && out.message) || 'server error');
    return out.data;
  }

  function ensureBtn() {
    var b = document.getElementById('gops-pray-btn');
    if (b) return b;
    b = document.createElement('button');
    b.id = 'gops-pray-btn';
    b.type = 'button';
    b.setAttribute('aria-label', 'بريك الصلاة');
    b.style.cssText = [
      'position:fixed', 'z-index:99990', 'right:14px', 'bottom:92px',
      'direction:rtl', 'font-family:inherit', 'font-size:14px', 'font-weight:700',
      'color:#fff', 'background:#0e7a5f', 'border:none', 'border-radius:999px',
      'padding:10px 16px', 'box-shadow:0 4px 14px rgba(0,0,0,.28)',
      'display:none', 'align-items:center', 'gap:6px', 'cursor:pointer',
      '-webkit-tap-highlight-color:transparent'
    ].join(';');
    b.innerHTML = '<span id="gops-pray-ic">🕌</span><span id="gops-pray-tx">صلاة</span>';
    b.addEventListener('click', onTap);
    document.body.appendChild(b);
    return b;
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function paint(praying) {
    var b = ensureBtn();
    var tx = document.getElementById('gops-pray-tx');
    var ic = document.getElementById('gops-pray-ic');
    if (praying) {
      b.style.background = '#8a5a00';
      b.style.animation = 'gopsPrayPulse 2s infinite';
      tx.textContent = 'في صلاة — ' + fmt(remainSec);
      ic.textContent = '🤲';
      startCountdown();
    } else {
      b.style.background = '#0e7a5f';
      b.style.animation = '';
      tx.textContent = 'صلاة';
      ic.textContent = '🕌';
      stopCountdown();
    }
  }

  function startCountdown() {
    stopCountdown();
    countdownTimer = setInterval(function () {
      if (remainSec > 0) {
        remainSec--;
        var tx = document.getElementById('gops-pray-tx');
        if (tx) tx.textContent = 'في صلاة — ' + fmt(remainSec);
      }
      if (remainSec <= 0) {
        stopCountdown();
        paint(false); // انتهت الصلاة — السيرفر فكها تلقائياً
      }
    }, 1000);
  }
  function stopCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }

  async function onTap() {
    var praying = remainSec > 0;
    try {
      if (!praying) {
        if (!window.confirm('هبدأ بريك صلاة 15 دقيقة؟\nخلال الوقت ده مش هيوصلك أي إشعارات، والبريك بيقفل لوحده.')) return;
        var r = await api('startPrayBreak', {});
        remainSec = r.remaining_seconds || (15 * 60);
        paint(true);
      } else {
        if (!window.confirm('الصلاة لسه شغالة (' + fmt(remainSec) + ' باقية).\nتريد إنهاءها الآن؟')) return;
        await api('endPrayBreak', {});
        remainSec = 0;
        paint(false);
      }
    } catch (e) {
      var msg = (e && e.message) || '';
      if (msg.indexOf('checked in') >= 0) window.alert('لازم تعمل Check In الأول عشان تستخدم بريك الصلاة.');
      else window.alert('حصلت مشكلة، حاول تاني بعد شوية.');
    }
  }

  async function refresh() {
    var sess = getSession();
    var b = ensureBtn();
    if (!sess || !API_URL) { b.style.display = 'none'; stopCountdown(); return; }
    b.style.display = 'flex';
    try {
      var st = await api('prayStatus', {});
      remainSec = st.praying ? (st.remaining_seconds || 0) : 0;
      paint(!!st.praying);
    } catch (e) {
      // سيشن بايظة أو نت أوفلاين — نخلي الزر هادي بحالة "صلاة" العادية
      if (remainSec <= 0) paint(false);
    }
  }

  var style = document.createElement('style');
  style.textContent = '@keyframes gopsPrayPulse{0%{box-shadow:0 0 0 0 rgba(138,90,0,.55)}70%{box-shadow:0 0 0 14px rgba(138,90,0,0)}100%{box-shadow:0 0 0 0 rgba(138,90,0,0)}}';
  document.head.appendChild(style);

  function boot() {
    ensureBtn();
    refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 30000);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();
