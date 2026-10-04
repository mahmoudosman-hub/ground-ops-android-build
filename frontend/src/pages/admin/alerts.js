import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtDateTime, todayLocal, addDays } from '../../core/time.js';
import { badge, button, listPage, opt, toast, toastError, confirmDialog } from '../../components/ui.js';
import { clean } from './lookups.js';

export const ALERT_TYPES = [['', 'All types'], ['EMPLOYEE_LATE', 'Employee late'], ['EMPLOYEE_ABSENT', 'Employee absent'], ['GEOFENCE_EXIT', 'Left geofence'], ['GEOFENCE_ENTER', 'Returned'], ['TRACKING_UNAVAILABLE', 'Tracking unavailable'], ['POSSIBLE_SPOOFING', 'Possible GPS spoofing']];
export const typeLabel = (c) => (ALERT_TYPES.find((x) => x[0] === c) || [0, c])[1];

export async function alertsPage(ctx) {
  const can = ctx.user.permissions.includes('manage_alerts'), today = todayLocal();
  const ack = async (ids, all) => { try { const r = await ctx.api.call('acknowledgeAlerts', all ? { all_open: true } : { alert_ids: ids }); toast(t('{n} alert(s) acknowledged', { n: r.acknowledged }), 'ok'); lp.reload(); } catch (e) { toastError(e); } };
  const lp = listPage({
    filters: [{ name: 'state', label: 'State', type: 'select', options: [opt('', t('All')), opt('OPEN', t('Open')), opt('ACKNOWLEDGED', t('Acknowledged'))] }, { name: 'alert_type', label: 'Type', type: 'select', options: ALERT_TYPES.map(([v, l]) => opt(v, t(l))) },
      { name: 'date_from', label: 'From', type: 'date', value: addDays(today, -6) }, { name: 'date_to', label: 'To', type: 'date', value: today }],
    toolbar: can ? button(t('Acknowledge all open'), { id: 'btn-ack-all', on: { click: async () => { if (await confirmDialog(t('Acknowledge every open alert?'))) ack([], true); } } }) : null,
    columns: [{ key: 'created_at', label: 'Time', render: (r) => fmtDateTime(r.created_at) }, { key: 'severity', label: 'Severity', render: (r) => badge(r.severity) }, { key: 'alert_type', label: 'Type', render: (r) => t(typeLabel(r.alert_type)) },
      { key: 'employee_name', label: 'Employee', render: (r) => h('a', { href: `#/employee?id=${encodeURIComponent(r.employee_id)}&date=${r.work_date || ''}` }, `${r.employee_id} ${r.employee_name || ''}`) }, { key: 'message', label: 'Message' },
      { key: 'acknowledged', label: 'State', render: (r) => (r.acknowledged ? badge('CHECKED_OUT', 'Acknowledged') : badge('LATE', 'Open')) },
      { key: 'actions', label: 'Actions', render: (r) => (can && !r.acknowledged ? button(t('Acknowledge'), { small: true, on: { click: () => ack([r.alert_id]) } }) : null) }],
    empty: t('No alerts in this range.'),
    async load(f, page) { const res = await ctx.api.call('getAlerts', { ...clean(f), page, page_size: 50 }); return { items: res.items, total: res.total, page: res.page, page_size: res.page_size, before: h('p', { class: 'hint', id: 'alert-open-count' }, t('{n} open alert(s) in total.', { n: res.open_count })) }; }
  });
  return { el: h('div', {}, h('h1', {}, t('Alerts')), h('p', { class: 'hint' }, t('Alerts are created when employees are late or absent, leave or return to the branch, lose tracking, or report a possible fake location. Repeats are suppressed by a cooldown (see Settings).')), lp.el), destroy: lp.stop };
}
