import { h, mount } from '../../core/dom.js';
import { cfg } from '../../core/config.js';
import { t, initLang, getLang, setLang } from '../../core/i18n.js';
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
import { messagesPage } from './messages.js';
import { adminsPage } from './admins.js';
import { createNotificationBell } from '../../components/notifications.js';
import { initTheme } from '../../services/theme.js';
import { alertsPage } from './alerts.js';
import { scheduleImportPage } from './schedule-import.js';
import { requestsPage } from './requests.js';

/* d58: شريط «فيه نسخة جديدة» على الداشبورد — كان موجود في تطبيق الكابتن بس،
 * فالأدمن كان بيفضل على النسخة القديمة من غير ما يدري (وده اللي خلى إصلاح
 * نافذة التأكيد «يوصل متوصلش» أكتر من مرة). أي تحديث جديد هيظهر زرار حدّث فوق. */
globalThis.addEventListener('gops-update-ready', (e) => {
  const box = globalThis.document.getElementById('update-bar');
  if (box) mount(box, h('div', { class: 'alert alert-info' }, t('A new version is available.'), ' ', button(t('Reload'), { small: true, on: { click: () => { const w = e.detail && e.detail.waiting; if (w) w.postMessage('SKIP_WAITING'); globalThis.location.reload(); } } })));
});

export const ROUTES = [
  { path: 'dashboard', title: 'Dashboard', perm: 'view_current_status', page: dashboardPage, nav: true }, { path: 'live', title: 'Live Monitoring', perm: 'view_current_status', page: livePage, nav: true },
  { path: 'requests', title: 'Requests', perm: 'manage_requests', page: requestsPage, nav: true },
  { path: 'alerts', title: 'Alerts', perm: 'view_alerts', page: alertsPage, nav: true },
  { path: 'messages', title: 'Ready Messages', perm: 'view_current_status', page: messagesPage, nav: true },
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

  // ── Page Cache — بيحفظ الصفحات المحملة عشان التنقل يبقى فوري ──
  const pageCache = new Map(); // path → { page, loadedAt }
  const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق
  // employee مستثنى كمان: بيتغير مع الـ params (id الموظف) ومفيهوش refresh —
  // لو اتخزن، فتح موظف تاني خلال الـ 5 دقايق كان هيعرض بيانات الموظف القديم
  const NO_CACHE = ['live', 'requests', 'dashboard', 'employee']; // صفحات دايماً تتحدث

  function getCached(path) {
    const c = pageCache.get(path);
    if (!c) return null;
    if (Date.now() - c.loadedAt > CACHE_TTL) { pageCache.delete(path); return null; }
    return c;
  }
  function setCache(path, page) {
    if (!NO_CACHE.includes(path)) pageCache.set(path, { page, loadedAt: Date.now() });
  }
  function clearCache() { pageCache.forEach((c) => { if (c.page && c.page.destroy) try { c.page.destroy(); } catch (e) { /* ignore */ } }); pageCache.clear(); }
  // ──────────────────────────────────────────────────────────────────

  const content = h('main', { id: 'main', class: 'content', tabindex: '-1' }), nav = h('nav', { class: 'sidebar', id: 'sidebar', 'aria-label': t('Main navigation') }), who = h('span', { class: 'who' }), bellBox = h('span', { id: 'bell-box' });
  const APP_VER = 'd84'; // d84: الحزمة الأربعة (سيرفر S29) — 1) كارت «⏰ إذن التأخير» شغال بالكامل (الأكشنز رجعت للسيرفر + الحد من الإعدادات) 2) كارت «📱 بوابة لينك المتابعة للآيفون» (تفعيل/تعطيل من الإعدادات — يفرض على كباتن الآيفون لينك Google Maps Live قبل الحضور، السيلفي زي ما هي) 3) صفحة «📨 الرسائل الجاهزة» في الأدمن (تيمبلتس محفوظة + إرسال كإشعار + Push لكابتن محدد أو الكل) 4) سجل الحضور: زرار «تصفير» انتقائي (تأخير/خروج مبكر/ملاحظات) + زرار «حضور يدوي» لأيام الغياب — كله مسجل في Audit والتقارير بتتحدث فورًا // d83: Page Cache للتنقل الفوري — الصفحة بتتحفظ 5 دقايق وبتتعرض فوراً من الـ cache مع تحديث خلفي هادي (live/requests/dashboard/employee دايماً fresh — employee بياخد id الموظف في الـ params ومفيهوش refresh) + tooltip App version اتحط في t() // d82: كارت «⏰ إذن التأخير» في الإعدادات — تحديد الحد الأدنى للدقايق قبل الشيفت لتقديم طلب إذن التأخير (getLatePermissionMinutes/updateLatePermissionMinutes — محتاج إضافة الأكشنين في Apps Script) + ترجمات d82 // d81: شرح مبسط لقسم KPI — قايمة ⚖️ الوزن/✅ المسموح/📉 الخصم بأمثلة فوق الكروت + بوكس شرح جوا كل كارت مع tooltips — كله ملفوف t() (9 مفاتيح ترجمة جديدة) // d80: إعادة تصميم قسم KPI في الإعدادات — كروت grid بدل الجدول (أيقونة + لون مميز لكل معيار + toggle بيلوّن الكارت + 3 أرقام: الوزن/المسموح/الخصم) + مفاتيح ترجمة ناقصة (Allowed/Deduct/Save settings/Settings + وصف الكروت) // d79: إصلاح تسريبات لغوية ابليكشن الكابتن — تابات Home/My schedule/Requests + شارة Online + أسماء أيام الجدول بلغة التطبيق + labels/units الـ KPI من السيرفر بتترجم (delivery32) + بقايا أدمن (delivery26/34/35/21) // d78: إصلاح انفتاخ الهيدر لما السايدبار يتخفي أو المحتوى قصير — grid-template-rows: auto 1fr على .admin-shell (align-content:stretch كان يوزع المساحة الفاضية على صف الهيدر) // d77: تحكم إظهار/إخفاء السايدبار — زرار ✕ جوه السايدبار + ☰ شغال على كل المقاسات (ديسكتوب يخفي/يظهر العمود مع حفظ الحالة) // d76: إصلاح اختفاء أزرار السايدبار السفلية في الوضع اللايت (Language/Hints/Week Grid/Selfie/Auto Scheduler/إشعار) — color: var(--sidebar-text) على .sidebar // d75: توحيد اللغات — 324 مفتاح ترجمة جديد في ar.js + تغليف كل النصوص الهاردكود بـ t() (delivery9/18/30/31/36 + ping-response + pray26 + كارت الآيفون) // d74: تحديث app.css — Dark Mode أفتح وأوضح (#221010/#2E1618 + muted #B09080) + سايدبار أغمق (#2C0E10) مع الحفاظ على بلوك الـ compat (.big/.sr-only/.btn-danger/.ver) // d73: تاب «📊 إحصائياتي» في شريط تابات الكابتن (delivery32.js) — KPI + إحصائيات الشهر كصفحة كاملة بدل الكارت في الهوم // d72: كارت «مؤشرات أدائي» (getMyKpi) في هوم الكابتن + زرار تبديل اللغة عربي/English في هيدر الكابتن
  const langBtn = button(getLang() === 'ar' ? 'EN' : 'عربي', { small: true, id: 'btn-lang', aria: 'Language / اللغة', on: { click: () => { const next = getLang() === 'ar' ? 'en' : 'ar'; setLang(next); try { localStorage.setItem('gops.admin.lang', next); localStorage.setItem('gops.lang.user', '1'); } catch (e) { /* ignore */ } globalThis.location.reload(); } } });
  const isWide = () => globalThis.matchMedia('(min-width: 960px)').matches;
  const menuBtn = h('button', { class: 'icon-btn menu-btn', type: 'button', id: 'btn-menu', 'aria-label': t('Menu'), 'aria-expanded': 'false', on: { click: () => {
    if (isWide()) {
      const off = shell.classList.toggle('side-off');
      menuBtn.setAttribute('aria-expanded', String(!off));
      try { localStorage.setItem('gops.admin.side', off ? 'off' : 'on'); } catch (e) { /* ignore */ }
    } else {
      const open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    }
  } } }, '☰');
  const closeBtn = h('button', { class: 'side-close', type: 'button', id: 'side-close', 'aria-label': t('Close menu'), title: t('Close menu'), on: { click: () => {
    if (isWide()) {
      shell.classList.add('side-off');
      try { localStorage.setItem('gops.admin.side', 'off'); } catch (e) { /* ignore */ }
    } else {
      nav.classList.remove('open');
    }
    menuBtn.setAttribute('aria-expanded', 'false');
  } } }, '✕');
  const themeBtn = initTheme();
  const shell = h('div', { class: 'admin-shell' }, h('header', { class: 'app-header' }, menuBtn, h('div', { class: 'brand' }, h('img', { src: './assets/icons/icon-192.png', alt: '', width: 28, height: 28 }), h('span', {}, cfg().APP_NAME + ' - ' + t('Admin')), h('span', { class: 'ver', id: 'app-ver', title: t('App version') }, APP_VER)), bellBox, langBtn, themeBtn, who,
    button(t('Sign out'), { small: true, id: 'btn-logout', on: { click: async () => { clearCache(); cleanup(); await api.logout(); notice = null; boot(); } } })), nav, content);
  try { if (isWide() && localStorage.getItem('gops.admin.side') === 'off') shell.classList.add('side-off'); } catch (e) { /* ignore */ }
  api.onSessionEnd((code) => { notice = errorMessage({ code }); clearCache(); cleanup(); boot(); });

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
    clearCache(); cleanup(); const s = api.session(); if (!s) return loginView();
    if (s.user.must_change_password) return changePwView();
    try { const u = await api.refreshUser(); s.user = u; } catch (e) { if (!api.session()) return; }
    const user = api.session().user, allowed = ROUTES.filter((r) => r.nav && user.permissions.includes(r.perm));
    if (bell) bell.destroy(); bell = createNotificationBell({ api, intervalMs: 300000 }); mount(bellBox, bell.el); mount(who, user.name);
    mount(nav, [closeBtn, ...allowed.map((r) => h('a', { href: `#/${r.path}`, dataset: { route: r.path } }, t(r.title)))]);
    mount(root, shell);
    if (!parseHash(globalThis.location.hash).path) globalThis.location.hash = `#/${allowed[0] ? allowed[0].path : 'dashboard'}`; else route();
  }

  async function route() {
    const s = api.session(); if (!s || s.user.must_change_password) return;
    const { path, params } = parseHash(globalThis.location.hash), r = ROUTES.find((x) => x.path === path), user = s.user;
    cleanup(); nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false');
    nav.querySelectorAll('a').forEach((a) => { const on = a.dataset.route === path || (path === 'employee' && a.dataset.route === 'employees'); a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!r) return mount(content, h('h1', {}, t('Page not found')));
    if (!user.permissions.includes(r.perm)) return mount(content, h('div', { class: 'alert alert-bad', id: 'forbidden' }, t('You do not have permission to open this page.')));

    // ── Cache check: لو الصفحة محملة قبل كده — اعرضها فوراً ──
    const cached = getCached(path);
    if (cached) {
      current = cached.page;
      mount(content, cached.page.el);
      document.title = `${t(r.title)} - ${cfg().APP_NAME}`;
      content.focus({ preventScroll: true });
      // حدّث البيانات في الخلفية بهدوء — listPage بيسمي الدالة reload وبعض الصفحات refresh
      const bg = cached.page.refresh || cached.page.reload;
      if (bg) { try { bg.call(cached.page).catch(() => {}); } catch (e) { /* ignore */ } }
      return;
    }
    // ──────────────────────────────────────────────────────────────

    mount(content, h('p', { class: 'spinner' }, t('Loading...')));
    const my = {}; current = my;
    try {
      const page = await r.page({ api, lookups, user, params, navigate: (p) => { globalThis.location.hash = `#/${p}`; } });
      if (current !== my) { if (page.destroy) page.destroy(); return; }
      current = page;
      setCache(path, page); // ← حفظ في الـ cache
      mount(content, page.el); document.title = `${t(r.title)} - ${cfg().APP_NAME}`; content.focus({ preventScroll: true });
    } catch (e) { if (current === my) mount(content, h('div', { class: 'alert alert-bad', role: 'alert' }, errorMessage(e))); }
  }

  globalThis.addEventListener('hashchange', route);
  boot();
  return { api, boot, route };
}
