import { h, mount } from '../../core/dom.js';
import { cfg } from '../../core/config.js';
import { t, initLang } from '../../core/i18n.js';
import { createApi } from '../../core/api.js';
import { errorMessage } from '../../core/errors.js';
import { buildForm, badge, button, toast } from '../../components/ui.js';
import { createLookups } from './lookups.js';
import { dashboardPage } from './dashboard.js';
import { livePage } from './live.js';
import { employeesPage } from './employees.js';
import { employeeDetailPage } from './employee-detail.js';
import { branchesPage } from './branches.js';
import { shiftsPage } from './shifts.js';
import { assignmentsPage } from './assignments.js';
import { attendancePage, locationHistoryPage, geofencePage, leavesPage, auditPage } from './records.js';
import { reportsPage } from './reports.js';
import { settingsPage } from './settings.js';
import { adminsPage } from './admins.js';
import { createNotificationBell } from '../../components/notifications.js';
import { alertsPage } from './alerts.js';
import { scheduleImportPage } from './schedule-import.js';

export const ROUTES = [
  { path: 'dashboard', title: 'Dashboard', perm: 'view_current_status', page: dashboardPage, nav: true }, { path: 'live', title: 'Live Monitoring', perm: 'view_current_status', page: livePage, nav: true },
  { path: 'alerts', title: 'Alerts', perm: 'view_alerts', page: alertsPage, nav: true },
  { path: 'employees', title: 'Employees', perm: 'view_employees', page: employeesPage, nav: true }, { path: 'employee', title: 'Employee Details', perm: 'view_employees', page: employeeDetailPage },
  { path: 'branches', title: 'Branches', perm: 'view_branches', page: branchesPage, nav: true }, { path: 'shifts', title: 'Shifts', perm: 'view_shifts', page: shiftsPage, nav: true },
  { path: 'assignments', title: 'Assignments', perm: 'view_shifts', page: assignmentsPage, nav: true }, { path: 'import', title: 'Schedule Import', perm: 'view_shifts', page: scheduleImportPage, nav: true }, { path: 'attendance', title: 'Attendance', perm: 'view_attendance', page: attendancePage, nav: true },
  { path: 'locations', title: 'Location History', perm: 'view_location_history', page: locationHistoryPage, nav: true }, { path: 'geofence', title: 'Geofence Events', perm: 'view_geofence_events', page: geofencePage, nav: true },
  { path: 'leaves', title: 'Leaves', perm: 'manage_leave', page: leavesPage, nav: true }, { path: 'reports', title: 'Reports', perm: 'view_reports', page: reportsPage, nav: true },
  { path: 'audit', title: 'Audit Logs', perm: 'view_audit_logs', page: auditPage, nav: true }, { path: 'settings', title: 'Settings', perm: 'view_settings', page: settingsPage, nav: true },
  { path: 'admins', title: 'Administrators', perm: 'view_admins', page: adminsPage, nav: true }
];

export function parseHash(hash) {
  const raw = (hash || '').replace(/^#\/?/, ''), [path, qs] = raw.split('?');
  return { path: path || '', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export function mountAdminApp(root, deps = {}) {
  initLang();
  const api = deps.api || createApi('admin'), lookups = createLookups(api);
  let current = null, notice = null, bell = null;
  const content = h('main', { id: 'main', class: 'content', tabindex: '-1' }), nav = h('nav', { class: 'sidebar', id: 'sidebar', 'aria-label': t('Main navigation') }), who = h('span', { class: 'who' }), bellBox = h('span', { id: 'bell-box' });
  const menuBtn = h('button', { class: 'icon-btn menu-btn', type: 'button', id: 'btn-menu', 'aria-label': t('Menu'), 'aria-expanded': 'false', on: { click: () => { const open = nav.classList.toggle('open'); menuBtn.setAttribute('aria-expanded', String(open)); } } }, '☰');
  const shell = h('div', { class: 'admin-shell' }, h('header', { class: 'app-header' }, menuBtn, h('div', { class: 'brand' }, h('img', { src: './assets/icons/icon-192.png', alt: '', width: 28, height: 28 }), h('span', {}, cfg().APP_NAME + ' - ' + t('Admin'))), bellBox, who,
    button(t('Sign out'), { small: true, id: 'btn-logout', on: { click: async () => { cleanup(); await api.logout(); notice = null; boot(); } } })), nav, content);
  api.onSessionEnd((code) => { notice = errorMessage({ code }); cleanup(); boot(); });

  function dropBell() { if (bell) { bell.destroy(); bell = null; } }
  function cleanup() { if (current && current.destroy) { try { current.destroy(); } catch (e) { /* ignore */ } } current = null; }
  function loginView() {
    dropBell();
    const f = buildForm([{ name: 'username', label: 'Username', required: true, autocomplete: 'username' }, { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password', trim: false }], {}, { submitLabel: t('Sign in'), onSubmit: async (v) => { await api.login(v.username, v.password); notice = null; boot(); } });
    mount(root, h('main', { class: 'container narrow' }, h('section', { class: 'card login' }, h('h1', {}, cfg().APP_NAME), h('h2', {}, t('Administrator sign in')), notice ? h('div', { class: 'alert alert-warn', id: 'login-notice' }, notice) : null, f.el)));
  }
  function changePwView() {
    dropBell();
    const f = buildForm([{ name: 'current', label: 'Current (temporary) password', type: 'password', required: true, trim: false, autocomplete: 'current-password' }, { name: 'next', label: 'New password', type: 'password', required: true, trim: false, autocomplete: 'new-password', hint: 'At least 8 characters with letters and digits.' }, { name: 'again', label: 'Repeat new password', type: 'password', required: true, trim: false, autocomplete: 'new-password' }], {}, {
      submitLabel: t('Change password'), onSubmit: async (v) => { if (v.next !== v.again) throw Object.assign(new Error(t('The new passwords do not match.')), { code: 'VALIDATION_ERROR' }); await api.changePassword(v.current, v.next); toast(t('Password changed'), 'ok'); boot(); } });
    mount(root, h('main', { class: 'container narrow' }, h('section', { class: 'card login' }, h('h1', {}, t('Choose a new password')), h('p', {}, t('You must change your password before using the admin console.')), f.el, button(t('Sign out'), { small: true, on: { click: async () => { await api.logout(); boot(); } } }))));
  }
  async function boot() {
    cleanup(); const s = api.session(); if (!s) return loginView();
    if (s.user.must_change_password) return changePwView();
    try { const u = await api.refreshUser(); s.user = u; } catch (e) { if (!api.session()) return; /* offline: keep cached profile */ }
    const user = api.session().user, allowed = ROUTES.filter((r) => r.nav && user.permissions.includes(r.perm));
    if (bell) bell.destroy(); bell = createNotificationBell({ api, intervalMs: 300000 }); mount(bellBox, bell.el); mount(who, user.name); mount(nav, allowed.map((r) => h('a', { href: `#/${r.path}`, dataset: { route: r.path } }, t(r.title)))); mount(root, shell);
    if (!parseHash(globalThis.location.hash).path) globalThis.location.hash = `#/${allowed[0] ? allowed[0].path : 'dashboard'}`; else route();
  }
  async function route() {
    const s = api.session(); if (!s || s.user.must_change_password) return;
    const { path, params } = parseHash(globalThis.location.hash), r = ROUTES.find((x) => x.path === path), user = s.user;
    cleanup(); nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false');
    nav.querySelectorAll('a').forEach((a) => { const on = a.dataset.route === path || (path === 'employee' && a.dataset.route === 'employees'); a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!r) return mount(content, h('h1', {}, t('Page not found')));
    if (!user.permissions.includes(r.perm)) return mount(content, h('div', { class: 'alert alert-bad', id: 'forbidden' }, t('You do not have permission to open this page.')));
    mount(content, h('p', { class: 'spinner' }, t('Loading...')));
    const my = {}; current = my;
    try {
      const page = await r.page({ api, lookups, user, params, navigate: (p) => { globalThis.location.hash = `#/${p}`; } });
      if (current !== my) { if (page.destroy) page.destroy(); return; }
      current = page; mount(content, page.el); document.title = `${t(r.title)} - ${cfg().APP_NAME}`; content.focus({ preventScroll: true });
    } catch (e) { if (current === my) mount(content, h('div', { class: 'alert alert-bad', role: 'alert' }, errorMessage(e))); }
  }
  globalThis.addEventListener('hashchange', route);
  boot();
  return { api, boot, route };
}
