import { h, mount, clear } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtDateTime, todayLocal, addDays } from '../../core/time.js';
import { badge, button, buildForm, opt, dataTable, pager, spinner, errorBox, toast, toastError, downloadText } from '../../components/ui.js';
import { clean } from './lookups.js';

const REPORTS = [['daily_attendance', 'Daily Attendance'], ['late_employees', 'Late Employees'], ['absent_employees', 'Absent Employees'], ['on_leave_employees', 'On-Leave Employees'], ['geofence_violations', 'Geofence Violations'], ['time_outside_branch', 'Time Outside Assigned Branch'],
  ['tracking_unavailable', 'Tracking Unavailable'], ['employee_history', 'Employee Attendance History'], ['branch_attendance', 'Branch Attendance'], ['shift_performance', 'Shift Performance'], ['breaks', 'Breaks']];
const STATUSES = ['', 'ON_TIME', 'LATE', 'ABSENT', 'ON_LEAVE', 'NOT_CHECKED_IN', 'CHECKED_IN', 'CHECKED_OUT', 'MISSING_CHECKOUT'];
const humanize = (k) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function cell(c, v) {
  if (v === null || v === undefined || v === '') return '-';
  if (c.type === 'ts') return fmtDateTime(v); if (c.type === 'bool') return v ? t('Yes') : t('No');
  if (c.type === 'list') return v.length ? v.map((f) => badge(f)) : '-';
  if (c.key === 'attendance_state' || c.key === 'punctuality') return badge(v);
  return String(v);
}

export async function reportsPage(ctx) {
  const l = await ctx.lookups.load(), can = (p) => ctx.user.permissions.includes(p), today = todayLocal(), out = h('div', { id: 'report-out' }); let page = 1, last = null;
  const f = buildForm([{ name: 'report', label: 'Report', type: 'select', required: true, options: REPORTS.map(([v, n]) => opt(v, t(n))) }, { name: 'date_from', label: 'From', type: 'date', value: addDays(today, -6), required: true }, { name: 'date_to', label: 'To', type: 'date', value: today, required: true },
    { name: 'employee_id', label: 'Employee', type: 'select', options: ctx.lookups.employeeOpts(l) }, { name: 'branch_id', label: 'Branch', type: 'select', options: ctx.lookups.branchOpts(l) }, { name: 'shift_id', label: 'Shift', type: 'select', options: ctx.lookups.shiftOpts(l) },
    { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => opt(s, s ? humanize(s.toLowerCase()) : t('All statuses'))) }], {}, { submitLabel: t('Run report'), compact: true, onSubmit: async () => { page = 1; await run(); } });
  const params = () => clean(f.get());
  async function run() {
    mount(out, spinner());
    try {
      const r = await ctx.api.call('getReports', { ...params(), page, page_size: 100 }); last = r;
      const chips = h('div', { class: 'chips', id: 'report-summary' }, Object.entries(r.summary).map(([k, v]) => h('span', { class: 'chip' }, h('b', {}, v === null ? '-' : v), ' ', humanize(k))));
      mount(out, h('h2', {}, t(r.title), h('small', {}, ` ${r.filters.date_from} - ${r.filters.date_to}`)), chips, dataTable({ columns: r.columns.map((c) => ({ key: c.key, label: c.label, render: (row) => cell(c, row[c.key]) })), rows: r.rows, empty: t('No records match these filters.') }),
        r.total > r.page_size ? pager(r, (p) => { page = p; run(); }) : null);
    } catch (e) { mount(out, errorBox(e)); }
  }
  async function exportCsv() {
    try { const r = await ctx.api.call('exportReport', params()); downloadText(r.filename, r.csv, r.mime); toast(t('Exported {n} rows', { n: r.row_count }), 'ok'); } catch (e) { toastError(e); }
  }
  const tools = h('div', { class: 'toolbar' }, can('export_reports') ? button(t('Export CSV'), { id: 'btn-export', on: { click: exportCsv } }) : null, h('span', { class: 'hint' }, t('Employee is required for "Employee Attendance History". Tracking gaps are limited to 31 days.')));
  return { el: h('div', {}, h('h1', {}, t('Reports')), f.el, tools, out) };
}
