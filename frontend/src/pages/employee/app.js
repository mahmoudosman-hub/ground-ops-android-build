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

export function mountEmployeeApp(root, deps = {}) {
  initLang();
  const api = deps.api || createApi('employee'), provider = deps.provider || selectProvider(), queue = deps.queue || createQueue();
  let home = null, notice = null, bell = null, sched = null, reqs = null;
  const online = () => !(globalThis.navigator && globalThis.navigator.onLine === false);
  const netBadge = h('span', { id: 'net-badge' });
  const updateNet = () => mount(netBadge, badge(online() ? 'ONLINE' : 'OFFLINE'));
  globalThis.addEventListener('online', updateNet); globalThis.addEventListener('offline', updateNet); updateNet();
  const body = h('main', { id: 'main', class: 'container narrow' }), headerRight = h('div', { class: 'header-right' });
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
    const s = api.session(); mount(headerRight);
    if (!s) return loginView();
    if (!s.user.must_change_password) { bell = createNotificationBell({ api }); mount(headerRight, bell.el, h('span', { class: 'who' }, s.user.name), logoutBtn()); } else mount(headerRight, h('span', { class: 'who' }, s.user.name), logoutBtn());
    if (s.user.must_change_password) return changePasswordView();
    home = createHome({ api, provider, queue }); sched = createScheduleView({ api }); reqs = createRequestsView({ api, onChange: () => { if (home) home.refresh(); } });
    const boxes = { home: h('div', { id: 'view-home' }, home.el), schedule: h('div', { id: 'view-schedule', hidden: true }, sched.el), requests: h('div', { id: 'view-requests', hidden: true }, reqs.el) };
    const tabs = [['home', 'Home'], ['schedule', 'My schedule'], ['requests', 'Requests']].map(([k, label]) => button(t(label), { id: `tab-${k}`, small: true, on: { click: () => show(k) } }));
    function show(k) { Object.keys(boxes).forEach((n) => { boxes[n].hidden = n !== k; }); tabs.forEach((b, i) => { const on = ['home', 'schedule', 'requests'][i] === k; b.classList.toggle('active', on); b.setAttribute('aria-current', on ? 'page' : 'false'); }); if (k === 'schedule') sched.refresh(); if (k === 'requests') reqs.refresh(); else if (k === 'home' && home) home.refresh(); }
    mount(body, h('nav', { class: 'tabs', id: 'tabs', 'aria-label': t('Sections') }, ...tabs), boxes.home, boxes.schedule, boxes.requests); show('home');
  }
  view();
  return { api, view, get home() { return home; } };
}
