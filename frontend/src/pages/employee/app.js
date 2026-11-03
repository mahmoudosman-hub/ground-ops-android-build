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
// d55 — iOS Google Maps Live Share card
// الكابتن يلصق رابط Live Share → يتحفظ على السيرفر
// الأدمن يدوس Watch → يفتح الرابط في تاب جديد ويشوف الكابتن live
// =====================================================================

function createIosLocationCard(api) {
  const input = h('input', {
    type: 'url',
    id: 'ios-gmaps-input',
    placeholder: 'الصق رابط Google Maps هنا...',
    style: 'width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;direction:rtl'
  });

  const statusEl = h('p', {
    id: 'ios-gmaps-status',
    style: 'font-size:12px;color:#666;margin:6px 0 0;min-height:18px;text-align:right'
  });

  const sendBtn = button('📍 شارك موقعي', {
    kind: 'primary',
    small: true,
    id: 'btn-ios-send',
    on: {
      click: async () => {
        const url = (input.value || '').trim();
        if (!url) {
          mount(statusEl, h('span', { style: 'color:#c00' }, '⚠️ الصق الرابط الأول'));
          return;
        }
        // تحقق بسيط إن الرابط من Google Maps
        if (!/google\.com\/maps|maps\.app\.goo\.gl/.test(url)) {
          mount(statusEl, h('span', { style: 'color:#c00' }, '❌ رابط مش صح — لازم يكون من Google Maps'));
          return;
        }
        sendBtn.disabled = true;
        mount(statusEl, h('span', { style: 'color:#888' }, '⏳ بيتحفظ...'));
        try {
          await api.call('saveGmapsLink', { gmaps_link: url });
          mount(statusEl, h('span', { style: 'color:#0a0' }, '✅ تم — الأدمن دلوقتي يقدر يتابع موقعك live'));
          // ماسحش الـ input عشان الكابتن يقدر يشوف اللي بعته
        } catch (e) {
          mount(statusEl, h('span', { style: 'color:#c00' }, '❌ ' + (e.message || 'حصل خطأ، حاول تاني')));
        }
        sendBtn.disabled = false;
      }
    }
  });

  return h('div', {
    id: 'ios-location-card',
    style: 'background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:14px;margin:12px 0'
  },
    h('p', { style: 'font-weight:600;margin:0 0 4px;text-align:right;color:#5d4037' },
      '📍 شارك موقعك مع الأدمن (iPhone)'
    ),
    h('p', { style: 'font-size:12px;color:#666;margin:0 0 10px;text-align:right;line-height:1.6' },
      '١. افتح Google Maps', h('br'),
      '٢. دوس على صورتك ← مشاركة الموقع ← اختار مدة (٨ ساعات مثلاً)', h('br'),
      '٣. دوس "نسخ الرابط" والصقه هنا'
    ),
    input,
    h('div', { style: 'margin-top:8px;display:flex;gap:8px;justify-content:flex-end' }, sendBtn),
    statusEl
  );
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
      { name: 'remember', label: 'Remember me on this device', type: 'checkbox' }], {}, { submitLabel: t('Sign in'), onSubmit: async (v) => { await api.login(v.employee_id, v.password, v.remember); notice = null; view(); } });
    mount(body, h('section', { class: 'card login' }, h('h1', {}, t('Sign in')), notice ? h('div', { class: 'alert alert-warn', id: 'login-notice' }, notice) : null, f.el,
      h('p', { class: 'hint' }, t('Your Employee ID and password are provided by your administrator.'))));
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

    // d55: iOS card — بيظهر بس على iPhone
    const iosCard = isIos() ? createIosLocationCard(api) : null;

    mount(body,
      h('nav', { class: 'tabs', id: 'tabs', 'aria-label': t('Sections') }, ...tabs, refreshBtn),
      iosCard,
      boxes.home, boxes.schedule, boxes.requests
    );
    show('home');
  }
  view();
  return { api, view, get home() { return home; } };
}
