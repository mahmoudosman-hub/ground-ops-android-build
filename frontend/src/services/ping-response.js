/**
 * Ground OPS - Ping response (location_check deep link)
 * لما السيرفر يبعت "📍 نبضة موقع" والكابتن يفتح التطبيق من الإشعار،
 * الملف ده يبعت الموقع الحالي للسيرفر فوراً من غير أي ضغطة إضافية،
 * ويعرض تأكيد بسيط على الشاشة. بيشتغل على الآيفون PWA والويب عموماً.
 * d75: الرسايل بتيجي من i18n (t()) — عشان النسخة الإنجليزية ميبقاش فيها عربي.
 */
import { t } from '../core/i18n.js'; // d75
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
    if (!sess) return banner(t('Sign in first so we can verify your location'), false);
    if (!('geolocation' in navigator)) return banner(t('This device does not support location'), false);

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
      return banner(t('Could not get your location — make sure GPS is on and try again'), false);
    }

    const apiUrl = window.API_URL || (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) || (window.CONFIG && window.CONFIG.API_URL);
    if (!apiUrl) return banner(t('Server settings missing — try again'), false);

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
      if (out && out.success) banner(t('✅ Your location was sent — all good'), true);
      else if (out && out.error_code === 'NO_ACTIVE_SHIFT') banner(t('No active shift right now — we do not need your location'), false);
      else banner((out && out.message) ? t('Location was not sent: {m}', { m: out.message }) : t('Location was not sent — try again'), false);
    } catch (e) {
      banner(t('No internet — open the app again when the network is back'), false);
    }
  }

  function run() {
    const p = params();
    if (p.get('action') !== 'location_check') return;
    clearParam();
    // d90: عشوائية التأخير (jitter) — لما السيرفر يبعت نبضة موقع لمجموعة كباتن في نفس اللحظة،
    // الكل كان بيفتح التطبيق ويبعت submitLocation في نفس الثانية (19 طلب في ثانيتين 13:51)
    // فالطلبات بتتزنوق ورا قفل السيرفر الواحد وبتظهر "Running/Failed" واللوجين يقول Slow connection.
    // الحل: كل جهاز بيستنى تأخير عشوائي 3-35 ثانية قبل الإرسال — نفس السلوك للكابتن، بس الحمل بيتوزع.
    const JITTER_MS = 3000 + Math.floor(Math.random() * 32000);
    const go = () => setTimeout(sendNow, JITTER_MS);
    if (document.readyState === 'complete' || document.readyState === 'interactive') go();
    else window.addEventListener('DOMContentLoaded', go, { once: true });
  }

  run();
})();
