/**
 * Ground OPS - Delivery 26: زر الصلاة (Pray Break) — d51
 * زر بريك الصلاة للكابتن: 15 دقيقة سكوت تام من كل الإشعارات، بتقفل لوحدها.
 * - يظهر فقط للكابتن المسجل الدخول.
 * - العد بالثواني على الزر، وينتهي تلقائياً من السيرفر.
 * - لو الكابتن عمل Check-Out، الصلاة بتتقفل تلقائياً من السيرفر.
 * d48: مفيش أي رسائل منبثقة (confirm/alert) — كل التأكيدات بتظهر على الزر نفسه.
 *      التشغيل بضغطتين: ضغطة أولى = الزر يسأل «متأكد؟»، ضغطة تانية = تنفيذ.
 * d51: الزر اتنقل من مكانه العائم تحت على اليمين إلى شريط التابات فوق،
 *      جنب تاب «الطلبات» مباشرة — بنفس منطق الشغل القديم بالظبط.
 */
(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  var API_URL = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL || '';
  var pollTimer = null;
  var countdownTimer = null;
  var remainSec = 0;

  // حالة الزر: idle | praying | confirm-start | confirm-end | flash | error
  var mode = 'idle';
  var modeTimer = null; // مؤقت رجوع الحالات المؤقتة

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

  // d51: الزر بيتحط جوه شريط التابات (#tabs) بعد تاب «الطلبات» مباشرة — مش عائم تحت
  function ensureBtn() {
    var b = document.getElementById('gops-pray-btn');
    if (b && b.isConnected) return b;
    var tabs = document.getElementById('tabs');
    if (!tabs) return null; // مش مسجل دخول — مفيش شريط تابات
    if (!b) {
      b = document.createElement('button');
      b.id = 'gops-pray-btn';
      b.type = 'button';
      b.setAttribute('aria-label', 'بريك الصلاة');
      b.addEventListener('click', onTap);
    }
    b.className = 'btn btn-small';
    b.style.cssText = [
      'direction:rtl', 'font-family:inherit', 'font-weight:700', 'color:#fff',
      'background:#0e7a5f', 'border:none', 'border-radius:999px',
      'padding:4px 12px', 'white-space:nowrap', '-webkit-tap-highlight-color:transparent',
      'transition:background .2s'
    ].join(';');
    b.innerHTML = '<span id="gops-pray-ic">🕌</span> <span id="gops-pray-tx">بريك الصلاة</span>';
    var req = document.getElementById('tab-requests');
    if (req && req.parentNode === tabs) req.insertAdjacentElement('afterend', b);
    else tabs.appendChild(b);
    return b;
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // نص الزر وقت الصلاة: الإيقاف + الوقت المتبقي (مختصر عشان يتسع في شريط التابات)
  function prayLabel() {
    return 'إيقاف 🤲 ' + fmt(remainSec);
  }

  function setFace(icon, html, bg, pulse) {
    var b = ensureBtn();
    if (!b) return;
    var tx = document.getElementById('gops-pray-tx');
    var ic = document.getElementById('gops-pray-ic');
    if (tx) tx.textContent = html;
    if (ic) ic.textContent = icon;
    b.style.background = bg;
    b.style.animation = pulse ? 'gopsPrayPulse 2s infinite' : '';
  }

  // إظهار حالة مؤقتة على الزر (تأكيد / رسالة) ثم الرجوع للحالة الأساسية
  function transient(nextMode, icon, html, bg, ms, pulse) {
    mode = nextMode;
    setFace(icon, html, bg, !!pulse);
    if (modeTimer) clearTimeout(modeTimer);
    modeTimer = setTimeout(function () {
      modeTimer = null;
      mode = remainSec > 0 ? 'praying' : 'idle';
      paint(mode === 'praying');
    }, ms);
  }
  function clearTransient() {
    if (modeTimer) { clearTimeout(modeTimer); modeTimer = null; }
  }

  function paint(praying) {
    // الحالات المؤقتة (تأكيد/رسالة) متتلغيش لو حصل تحديث خلفي في نفس اللحظة
    if (mode === 'confirm-start' || mode === 'confirm-end' || mode === 'flash' || mode === 'error') return;
    mode = praying ? 'praying' : 'idle';
    if (praying) {
      setFace('🤲', prayLabel(), '#8a5a00', true);
      startCountdown();
    } else {
      setFace('🕌', 'بريك الصلاة', '#0e7a5f', false);
      stopCountdown();
    }
  }

  function startCountdown() {
    stopCountdown();
    countdownTimer = setInterval(function () {
      if (remainSec > 0) {
        remainSec--;
        if (mode === 'praying') {
          var tx = document.getElementById('gops-pray-tx');
          if (tx) tx.textContent = prayLabel();
        }
      }
      if (remainSec <= 0) {
        stopCountdown();
        if (mode === 'praying') paint(false); // انتهت الصلاة — السيرفر فكها تلقائياً
      }
    }, 1000);
  }
  function stopCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }

  // رسالة «اتقفل البريك» على الزر نفسه — في نفس المكان
  var flashing = false;
  function flashEnd() {
    flashing = true;
    mode = 'flash';
    setFace('🕌', 'تم ✅', '#1b8a3a', false);
    setTimeout(function () {
      flashing = false;
      mode = 'idle';
      paint(false);
    }, 2500);
  }

  // رسالة خطأ على الزر نفسه — بدل alert المنبثق
  function flashError(msg) {
    mode = 'error';
    setFace('⚠️', msg, '#b3261e', false);
    setTimeout(function () {
      mode = remainSec > 0 ? 'praying' : 'idle';
      paint(mode === 'praying');
    }, 4000);
  }

  async function onTap() {
    if (flashing) return; // أثناء رسالة «تم» نتجاهل الضغط
    var praying = remainSec > 0;
    try {
      if (mode === 'confirm-start') {
        // ضغطة التانية → يبدأ البريك فعلاً
        clearTransient();
        mode = 'idle';
        var r = await api('startPrayBreak', {});
        remainSec = r.remaining_seconds || (15 * 60);
        paint(true);
      } else if (mode === 'confirm-end') {
        // ضغطة التانية → يقفل البريك
        clearTransient();
        mode = 'idle';
        await api('endPrayBreak', {});
        remainSec = 0;
        stopCountdown();
        flashEnd();
      } else if (!praying) {
        // ضغطة أولى: الزر نفسه بيسأل «متأكد؟»
        transient('confirm-start', '⚠️', 'متأكد؟ دوس تاني', '#b45309', 6000, false);
      } else {
        // ضغطة أولى والصلاة شغالة: تأكيد القفل على الزر نفسه
        transient('confirm-end', '⚠️', 'متأكد من الإيقاف؟', '#b3261e', 5000, false);
      }
    } catch (e) {
      var msg = (e && e.message) || '';
      clearTransient();
      if (msg.indexOf('checked in') >= 0) flashError('لازم Check In الأول');
      else flashError('حصلت مشكلة — حاول تاني');
    }
  }

  async function refresh() {
    var sess = getSession();
    var b = ensureBtn();
    if (!b || !sess || !API_URL) {
      if (b && (!sess || !API_URL)) b.remove(); // خروج من الحساب → الزر يختفي
      stopCountdown();
      return;
    }
    try {
      var st = await api('prayStatus', {});
      remainSec = st.praying ? (st.remaining_seconds || 0) : 0;
      paint(!!st.praying);
    } catch (e) {
      // سيشن بايظة أو نت أوفلاين — نخلي الزر هادي بحالة «صلاة» العادية
      if (remainSec <= 0 && mode === 'idle') paint(false);
    }
  }

  var style = document.createElement('style');
  style.textContent = '@keyframes gopsPrayPulse{0%{box-shadow:0 0 0 0 rgba(138,90,0,.55)}70%{box-shadow:0 0 0 14px rgba(138,90,0,0)}100%{box-shadow:0 0 0 0 rgba(138,90,0,0)}}';
  document.head.appendChild(style);

  // أول ما شريط التابات يظهر (تسجيل دخول جديد مثلاً) نحط الزر فوراً من غير ما نستنى الدورة
  var mo = null;
  function watchTabs() {
    if (mo || !('MutationObserver' in window)) return;
    mo = new MutationObserver(function () {
      if (document.getElementById('tabs') && !document.getElementById('gops-pray-btn')) refresh();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    ensureBtn();
    refresh();
    watchTabs();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 30000);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();
