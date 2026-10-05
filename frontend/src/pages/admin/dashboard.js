import { h, mount, clear } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtTime, fmtDateTime, agoText, todayLocal, minutesText } from '../../core/time.js';
import { badge, button, listPage, opt, toastError } from '../../components/ui.js';
import { clean } from './lookups.js';
import { typeLabel } from './alerts.js';

export const AUTO_REFRESH_MS = 10 * 60 * 1000; // dashboard refreshes itself every 10 minutes; the Refresh button updates it right away
export const STATUS_OPTS = ['', 'ABSENT', 'NOT_CHECKED_IN', 'ON_TIME', 'LATE', 'CHECKED_IN', 'CHECKED_OUT', 'ON_LEAVE', 'ON_BREAK', 'INSIDE', 'OUTSIDE', 'TRACKING_UNAVAILABLE', 'POSSIBLE_SPOOFING', 'MISSING_CHECKOUT'];
const statusLabel = (s) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : t('All statuses'));

export function statusCells(r) {
  const flags = (r.flags || []).filter((f) => f === 'POSSIBLE_SPOOFING' || f === 'MISSING_CHECKOUT');
  const brk = r.on_break ? badge(r.break_exceeded ? 'BREAK_EXCEEDED' : 'ON_BREAK', `${r.break_exceeded ? 'Break over limit' : 'On break'} ${r.break_used_minutes}/${r.break_allowance_minutes} min`) : null;
  return h('span', { class: 'badges' }, badge(r.attendance_state), brk, r.sick_pending ? badge('SICK_PENDING') : null, r.punctuality === 'LATE' ? badge('LATE', `Late ${r.late_minutes} min`) : (r.punctuality === 'ON_TIME' ? badge('ON_TIME') : null), flags.map((f) => badge(f)));
}
export function locationCell(r) {
  if (!r.location_state) return '-';
  return h('span', { class: 'badges' }, badge(r.location_state), r.tracking_unavailable ? badge('TRACKING_UNAVAILABLE') : (r.tracking_state && r.tracking_state !== 'ACTIVE' ? badge(r.tracking_state) : null));
}
export const detailLink = (r) => h('a', { class: 'btn btn-small', href: `#/employee?id=${encodeURIComponent(r.employee_id)}&date=${r.work_date || ''}` }, t('Details'));

export async function dashboardPage(ctx) {
  const l = await ctx.lookups.load(), cards = h('div', { class: 'cards', id: 'summary-cards' }), strip = h('section', { class: 'card', id: 'alert-strip', hidden: true });
  async function loadAlerts() {
    if (!ctx.user.permissions.includes('view_alerts')) return;
    try {
      const r = await ctx.api.call('getAlerts', { state: 'OPEN', page_size: 5 }); strip.hidden = r.open_count === 0; if (strip.hidden) return;
      mount(strip, h('h2', {}, t('Open alerts ({n})', { n: r.open_count })), h('ul', { class: 'alert-list' }, r.items.map((a) => h('li', {}, badge(a.severity), ' ', h('b', {}, fmtTime(a.created_at)), ' ', t(typeLabel(a.alert_type)), ' - ', a.message))), h('a', { class: 'btn btn-small', href: '#/alerts' }, t('Open alerts page')));
    } catch (e) { strip.hidden = true; }
  }
  let lpRef = null;
  const lp = lpRef = listPage({
    auto: AUTO_REFRESH_MS,
    toolbar: [button(t('Refresh'), { id: 'btn-refresh', kind: 'primary', on: { click: () => lpRef.reload() } }), h('span', { class: 'hint', id: 'refresh-note' }, t('Updates automatically every 10 minutes. Press Refresh for the latest data now.'))],
    filters: [{ name: 'date', label: 'Date', type: 'date', value: todayLocal() }, { name: 'branch_id', label: 'Branch', type: 'select', options: ctx.lookups.branchOpts(l) }, { name: 'shift_id', label: 'Shift', type: 'select', options: ctx.lookups.shiftOpts(l) },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTS.map((s) => opt(s, statusLabel(s))) }, { name: 'search', label: 'Search (ID or name)', placeholder: '1001 / Ahmed' }],
    columns: [{ key: 'employee_name', label: 'Employee', render: (r) => h('span', {}, h('strong', {}, r.employee_name), h('br'), h('small', {}, r.employee_id)) }, { key: 'branch_name', label: 'Branch' }, { key: 'shift_name', label: 'Shift' },
      { key: 'check_in_time', label: 'Check-in', render: (r) => fmtTime(r.check_in_time) }, { key: 'attendance_state', label: 'Status', render: statusCells }, { key: 'location_state', label: 'Current location status', render: locationCell },
      { key: 'last_location_at', label: 'Last location update', render: (r) => (r.last_location_at ? `${fmtTime(r.last_location_at)} (${agoText(r.last_location_at)})` : '-') },
      { key: 'outside_minutes', label: 'Outside duration', render: (r) => (r.outside_minutes ? minutesText(r.outside_minutes) : '-') }, { key: 'actions', label: 'Actions', render: detailLink }],
    empty: t('No scheduled employees for the selected filters.'),
    async load(f, page) {
      loadAlerts(); const res = await ctx.api.call('getCurrentStatuses', { ...clean(f), page, page_size: 100 }); const s = res.summary;
      const card = (id, label, v, kind) => h('div', { class: `card stat stat-${kind}`, id: `card-${id}` }, h('div', { class: 'stat-num' }, v), h('div', { class: 'stat-label' }, t(label)));
      mount(cards, card('total', 'Total Employees', s.total_employees, 'info'), card('present', 'Present', s.present, 'ok'), card('late', 'Late', s.late, 'bad'), card('absent', 'Absent', s.absent, 'bad'), card('leave', 'On Leave', s.on_leave, 'warn'), card('outside', 'Outside Geofence', s.outside_geofence, 'bad'), card('tracking', 'Tracking Unavailable', s.tracking_unavailable, 'warn'), card('break', 'On Break', s.on_break || 0, 'info'));
      return { items: res.items, total: res.total, page: res.page, page_size: res.page_size };
    }
  });
  return { el: h('div', {}, h('h1', {}, t('Dashboard')), strip, cards, lp.el), destroy: lp.stop };
}
