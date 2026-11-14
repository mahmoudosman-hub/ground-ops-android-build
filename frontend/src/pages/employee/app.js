import { h, mount } from '../../core/dom.js';
import { cfg } from '../../core/config.js';
import { t, initLang } from '../../core/i18n.js';
import { createApi } from '../../core/api.js';
import { errorMessage } from '../../core/errors.js';
import { buildForm, button, badge, toast, toastError } from '../../components/ui.js';
import { selectProvider } from '../../services/location/index.js';
import { createQueue } from '../../services/offline-queue.js';
import { onInstallChange, canInstall, promptInstall, isStandalone, isIos } from '../../services/pwa.js';
import { createHome } from './home.js';
import { createNotificationBell } from '../../components/notifications.js';
import { createScheduleView, createRequestsView } from './requests.js';
import { initTheme } from '../../services/theme.js'; // d70: زرار الوضع الليلي 🌙/☀️
import { createLangToggle } from '../../services/lang-toggle.js'; // d72: زرار تبديل اللغة عربي/English

// =====================================================================
// d99 — بوابة Traccar Client على شاشة الدخول (آيفون فقط) — بديل بانر d98:
// ① نص مبسط بدون «Upload response 200» (الكابتن مش هيفهمها) + خطوات + صورتين حقيقيتين
//    من تطبيق Traccar Client (عربي/English) بتوضح زرار «تتبع مستمر» (Continuous tracking) لازم يكون مفعّل
// ② زرار تأكيد أخضر — فورم الدخول مخفي خالص لحد ما الكابتن يدوس التأكيد،
//    وبعد التأكيد يسجل دخول عادي بلا أي نافذة تقطع الدخول (نافذة تذكير d98 اتشالت — مكانها البوابة دي)
// ③ كارت لينك جوجل ماب (d55) اتشال نهائيًا + خطوة اللينك من تسجيل الحضور (d84) —
//    التتبع الرسمي بقى Traccar Client بس (قرار المالك 2026-11-14)
// =====================================================================
function createIosTraccarGate(unlock) {
  const okBadge = h('p', { class: 'traccar-ok', id: 'traccar-gate-ok', 'aria-live': 'polite', hidden: true }, '✔ ' + t('Confirmed — you can sign in below'));
  const confirmRow = h('div', { class: 'traccar-confirm-row' },
    button(t('Done — Traccar Client is running'), { kind: 'primary', big: true, id: 'btn-traccar-confirm', on: { click: () => {
      try { globalThis.localStorage.setItem('gops.traccarConfirmAt', String(Date.now())); } catch (e) { /* ignore */ }
      confirmRow.hidden = true; okBadge.hidden = false; box.classList.add('traccar-confirmed'); unlock();
    } } }),
    h('p', { class: 'traccar-gate-hint' }, t('Sign-in stays locked until you tap the button above')));
  const box = h('div', { class: 'traccar-warn', id: 'traccar-login-warn', role: 'alert' },
    h('p', { class: 'traccar-warn-title' }, t('⚠️ IMPORTANT for iPhone — before you sign in')),
    h('p', { class: 'traccar-warn-body' }, t('You MUST open the Traccar Client app FIRST and turn ON "Continuous tracking" (like the two pictures below), keep it running in the background for your whole shift, then sign in. If Traccar Client is off, your location tracking will NOT be recorded and you will not appear on the map.')),
    h('p', { class: 'traccar-warn-steps-head' }, t('Steps:')),
    h('p', { class: 'traccar-warn-step' }, t('1. Open the Traccar Client app')),
    h('p', { class: 'traccar-warn-step' }, t('2. Turn ON "Continuous tracking" — exactly like the two pictures above')),
    h('p', { class: 'traccar-warn-step' }, t('3. Come back here and sign in — keep the app open in the background the whole shift')),
    h('figure', { class: 'traccar-shot' },
      h('img', { src: './assets/traccar/continuous-tracking-ar.jpg', alt: t('Continuous tracking switch ON in the app (Arabic)') }),
      h('figcaption', {}, t('In the app (Arabic): the "تتبع مستمر" switch must be ON like this'))),
    h('figure', { class: 'traccar-shot' },
      h('img', { src: './assets/traccar/continuous-tracking-en.jpg', alt: t('Continuous tracking switch ON in the app (English)') }),
      h('figcaption', {}, t('In the app (English): "Continuous tracking" must be ON like this'))),
    okBadge, confirmRow);
  return box;
}

export function mountEmployeeApp(root, deps = {}) {
  initLang();
  const api = deps.api || createApi('employee'), provider = deps.provider || selectProvider(), queue = deps.queue || createQueue();
  let home = null, notice = null, bell = null, sched = null, reqs = null;
  const online = () => !(globalThis.navigator && globalThis.navigator.onLine === false);
  const netBadge = h('span', { id: 'net-badge' });
  const updateNet = () => mount(netBadge, badge(online() ? 'ONLINE' : 'OFFLINE'));
  globalThis.addEventListener('online', updateNet); globalThis.addEventListener('offline', updateNet); updateNet();
  const body = h('main', { id: 'main', class: 'container narrow' }), headerRight = h('div', { class: 'header-right' });
  const themeBtn = initTheme(); // d70: بيتحط جوه headerRight مع كل إعادة بناء عشان ميتشالش
  const langBtn = createLangToggle(); // d72: نفس فكرة themeBtn — عنصر واحد بيتعاد تركيبه مع كل إعادة بناء للهيدر
  const installBox = h('div', { id: 'install-box' });
  mount(root, h('header', { class: 'app-header' }, h('div', { class: 'brand' }, h('img', { src: './assets/icons/icon-192.png', alt: '', width: 28, height: 28 }), h('span', {}, cfg().APP_NAME)), netBadge, headerRight),
    h('div', { id: 'update-bar' }), body, installBox);

  function renderInstall() {
    mount(installBox);
    if (isStandalone()) return;
    if (canInstall()) mount(installBox, h('div', { class: 'install' }, h('span', {}, t('Install this app on your phone for quick access.')), button(t('Install app'), { kind: 'primary', small: true, id: 'btn-install', on: { click: () => promptInstall() } })));
    else if (isIos()) mount(installBox, h('div', { class: 'install', id: 'ios-hint' }, t('To install on iPhone: tap the Share button in Safari, then "Add to Home Screen".')));
  }
  onInstallChange(renderInstall); renderInstall();
  globalThis.addEventListener('gops-update-ready', (e) => mount(globalThis.document.getElementById('update-bar'), h('div', { class: 'alert alert-info' }, t('A new version is available.'), ' ', button(t('Reload'), { small: true, on: { click: () => { const w = e.detail && e.detail.waiting; if (w) w.postMessage('SKIP_WAITING'); globalThis.location.reload(); } } }))));
  api.onSessionEnd((code) => { notice = errorMessage({ code }); view(); });

  function logoutBtn() { return button(t('Sign out'), { small: true, id: 'btn-logout', on: { click: async () => { if (home) home.destroy(); home = null; await api.logout(); notice = null; view(); } } }); }

  function loginView() {
    const f = buildForm([{ name: 'employee_id', label: 'Employee ID', required: true, autocomplete: 'username', inputmode: 'text' }, { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password', trim: false },
      { name: 'remember', label: 'Remember me on this device', type: 'checkbox' }], {}, { submitLabel: t('Sign in'), onSubmit: async (v) => {
      // d92: تشخيص فشل الشبكة + d93: تصنيف أدق (نت شغال؟ جوجل مقطوعة؟ في رابط بديل شغال؟) + محاولة أخيرة تلقائية على الرابط الشغال
      // d99: نافذة التذكير بعد الدخول اتشالت — مكانها بوابة التأكيد قبل الدخول
      try { await api.login(v.employee_id, v.password, v.remember); notice = null; view(); }
      catch (e) {
        if (['NETWORK_ERROR', 'OFFLINE', 'SERVER_UNAVAILABLE'].indexOf(e.code) >= 0) {
          const p = await api.probeNetwork();
          if (p && p.anyOk) {
            // لقينا رابط شغال واتثبت — محاولة أخيرة بالرابط الجديد
            try { await api.login(v.employee_id, v.password, v.remember); notice = null; view(); return; }
            catch (e2) { throw Object.assign(new Error(t('The server is working — we switched to a working connection. Try again in a moment.')), { code: 'LOGIN_NET_DIAG' }); }
          }
          if (p && p.netOk) throw Object.assign(new Error(t('Internet works, but the mobile network cannot reach Google servers right now. Turn mobile data OFF and ON (or airplane mode), then try again.')), { code: 'LOGIN_NET_DIAG' });
          throw Object.assign(new Error(t('No internet on this phone right now. Reconnect and try again.')), { code: 'LOGIN_NET_DIAG' });
        }
        throw e;
      }
    } });
    // d99: على الآيفون فورم الدخول مخفي لحد ما الكابتن يدوس زرار التأكيد في البوابة فوق — بعد التأكيد يسجل دخول عادي
    const formWrap = h('div', { id: 'login-form-wrap' }, f.el);
    const gate = isIos() ? createIosTraccarGate(() => { formWrap.hidden = false; }) : null;
    if (gate) formWrap.hidden = true;
    mount(body, h('section', { class: 'card login' }, h('h1', {}, t('Sign in')), gate, notice ? h('div', { class: 'alert alert-warn', id: 'login-notice' }, notice) : null, formWrap,
      h('p', { class: 'hint' }, t('Your Employee ID and password are provided by your administrator.')),
      h('p', { class: 'hint', id: 'login-ver', style: 'margin-top:8px;font-size:11px;opacity:.7' }, (t('App version') || 'App version') + ': ' + (cfg().APP_VER || '?'))));
  }
  function changePasswordView() {
    const f = buildForm([{ name: 'current', label: 'Current (temporary) password', type: 'password', required: true, autocomplete: 'current-password', trim: false }, { name: 'next', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', trim: false, hint: 'At least 8 characters with letters and digits.' },
      { name: 'again', label: 'Repeat new password', type: 'password', required: true, autocomplete: 'new-password', trim: false }], {}, { submitLabel: t('Change password'), onSubmit: async (v) => {
      if (v.next !== v.again) throw Object.assign(new Error(t('The new passwords do not match.')), { code: 'VALIDATION_ERROR' });
      await api.changePassword(v.current, v.next); toast(t('Password changed'), 'ok'); view(); } });
    mount(body, h('section', { class: 'card login' }, h('h1', {}, t('Choose a new password')), h('p', {}, t('For security you must change your temporary password before continuing.')), f.el));
  }
  function view() {
    if (home) { home.destroy(); home = null; }
    if (bell) { bell.destroy(); bell = null; }
    const s = api.session(); mount(headerRight, langBtn, themeBtn);
    if (!s) return loginView();
    if (!s.user.must_change_password) { bell = createNotificationBell({ api }); mount(headerRight, bell.el, langBtn, themeBtn, h('span', { class: 'who' }, s.user.name), logoutBtn()); } else mount(headerRight, langBtn, themeBtn, h('span', { class: 'who' }, s.user.name), logoutBtn());
    if (s.user.must_change_password) return changePasswordView();
    home = createHome({ api, provider, queue }); sched = createScheduleView({ api }); reqs = createRequestsView({ api, onChange: () => { if (home) home.refresh(); } });
    const boxes = { home: h('div', { id: 'view-home' }, home.el), schedule: h('div', { id: 'view-schedule', hidden: true }, sched.el), requests: h('div', { id: 'view-requests', hidden: true }, reqs.el) };
    const tabs = [['home', 'Home'], ['schedule', 'My schedule'], ['requests', 'Requests']].map(([k, label]) => button(t(label), { id: `tab-${k}`, small: true, on: { click: () => show(k) } }));
    const refreshBtn = button('⟳', { id: 'btn-tabs-refresh', small: true, class: 'tab-refresh', aria: t('Refresh'), on: { click: () => { try { if (globalThis.window && window.gopsClearCache) window.gopsClearCache(); } catch (e) {} globalThis.location.reload(); } } });
    refreshBtn.title = t('Refresh');
    function show(k) { Object.keys(boxes).forEach((n) => { boxes[n].hidden = n !== k; }); tabs.forEach((b, i) => { const on = ['home', 'schedule', 'requests'][i] === k; b.classList.toggle('active', on); b.setAttribute('aria-current', on ? 'page' : 'false'); }); if (k === 'schedule') sched.refresh(); if (k === 'requests') reqs.refresh(); else if (k === 'home' && home) home.refresh(); }

    // d99: كارت لينك جوجل ماب (d55) اتشال نهائيًا — التتبع الرسمي بقى Traccar Client بس
    mount(body,
      h('nav', { class: 'tabs', id: 'tabs', 'aria-label': t('Sections') }, ...tabs, refreshBtn),
      boxes.home, boxes.schedule, boxes.requests
    );
    show('home');
  }
  view();
  return { api, view, get home() { return home; } };
}
