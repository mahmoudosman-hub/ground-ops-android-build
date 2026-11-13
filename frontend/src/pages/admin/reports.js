import { h, mount, clear } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtDateTime, todayLocal, addDays } from '../../core/time.js';
import { badge, button, buildForm, opt, dataTable, pager, spinner, errorBox, toast, toastError, downloadText } from '../../components/ui.js';
import { clean } from './lookups.js';

const REPORTS = [
  ['daily_attendance',       'Daily Attendance'],
  ['late_employees',         'Late Employees'],
  ['absent_employees',       'Absent Employees'],
  ['on_leave_employees',     'On-Leave Employees'],
  ['geofence_violations',    'Geofence Violations'],
  ['time_outside_branch',    'Time Outside Assigned Branch'],
  ['tracking_unavailable',   'Tracking Unavailable'],
  ['employee_history',       'Employee Attendance History'],
  ['branch_attendance',      'Branch Attendance'],
  ['shift_performance',      'Shift Performance'],
  ['breaks',                 'Breaks'],
  ['captain_daily_summary',  'Captain Daily Summary'],   // ← جديد S22
  ['kpi_scores',             'KPI Scores']               // ← جديد S22
];

const STATUSES = ['', 'ON_TIME', 'LATE', 'ABSENT', 'ON_LEAVE', 'NOT_CHECKED_IN', 'CHECKED_IN', 'CHECKED_OUT', 'MISSING_CHECKOUT'];
const humanize = (k) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function cell(c, v) {
  if (v === null || v === undefined || v === '') return '-';
  if (c.type === 'ts') return fmtDateTime(v); if (c.type === 'bool') return v ? t('Yes') : t('No');
  if (c.type === 'list') return v.length ? v.map((f) => badge(f)) : '-';
  if (c.key === 'attendance_state' || c.key === 'punctuality') return badge(v);
  // KPI score — بيظهر بلون حسب النسبة
  if (c.key === 'kpi_score') {
    const score = Number(v);
    const color = score >= 90 ? '#2e7d32' : score >= 70 ? '#f57f17' : '#c62828';
    return h('strong', { style: `color:${color}` }, `${score}%`);
  }
  return String(v);
}

/* ================= d97: تجميع الريبورت لكل كابتن (عرض + تنزيل بنفس الشكل) =================
 * أي ريبورت أعمدته فيها employee_id/employee_name بيتجمع تلقائيًا لكل كابتن (كل الأنواع تقريبًا
 * ما عدا branch_attendance/shift_performance/employee_history — هي أصلاً مش مقسمة لكل كابتن).
 * - سطر لكل كابتن فيه ملخصه (عدد السجلات + عدّادات الحالات + إجماليات الدقائق)، والدوس عليه
 *   يفتح تفاصيله يوم بيوم بنفس أعمدة الجدول.
 * - الترتيب بين الكباتن: أول عمود دقايق له إجمالي (تأخير / خروج من الفرع / انقطاع تتبع / بريك)
 *   تنازليًا — الأعلى أثرًا الأول، ولما مفيش مقياس دقايق يترتب بعدد السجلات ثم بالاسم.
 * - التنزيل في الوضع المجمّع يطلع CSV بنفس الشكل: ملخص لكل كابتن (مع سطر إجمالي) ثم تفاصيل
 *   كل كابتن يوم بيوم — جاهز يفتح في إكسيل من غير أي تجميع يدوي.
 * دوال البناء (buildGroups/buildGroupedCsv) مُصدَّرة للاختبار الآلي (sim_reports_d97.js).
 */
const METRIC_KEYS = ['late_minutes', 'outside_minutes', 'gap_minutes', 'minutes'];
const PAGE_SIZE_GROUP = 500, MAX_PAGES_GROUP = 20;

export function isGroupable(columns) {
  return !!columns && columns.some((c) => c.key === 'employee_id') && columns.some((c) => c.key === 'employee_name');
}

export function buildGroups(rows, columns) {
  const numCols = columns.filter((c) => c.type === 'num').map((c) => c.key);
  const hasState = columns.some((c) => c.key === 'attendance_state');
  const hasPunct = columns.some((c) => c.key === 'punctuality');
  const hasFlags = columns.some((c) => c.key === 'flags');
  const map = new Map(); const groups = [];
  for (const r of rows) {
    const id = String(r.employee_id == null ? '' : r.employee_id);
    let g = map.get(id);
    if (!g) {
      g = { id, name: String(r.employee_name || id || '-'), rows: [], branches: new Set(), shifts: new Set(), states: {}, late: 0, sums: {}, missing: 0 };
      map.set(id, g); groups.push(g);
    }
    g.rows.push(r);
    if (r.branch_name) g.branches.add(String(r.branch_name));
    if (r.shift_name) g.shifts.add(String(r.shift_name));
    if (hasState && r.attendance_state) g.states[r.attendance_state] = (g.states[r.attendance_state] || 0) + 1;
    // التأخير من punctuality (زي فلتر الريبورت نفسه) — مش من attendance_state
    if (hasPunct && r.punctuality === 'LATE') g.late++;
    if (hasFlags && Array.isArray(r.flags) && r.flags.indexOf('MISSING_CHECKOUT') >= 0) g.missing++;
    for (const k of numCols) { const v = Number(r[k]); if (isFinite(v) && v !== 0) g.sums[k] = (g.sums[k] || 0) + v; }
  }
  let metric = null;
  for (const mk of METRIC_KEYS) if (numCols.indexOf(mk) >= 0 && groups.some((g) => (g.sums[mk] || 0) > 0)) { metric = mk; break; }
  for (const g of groups) g.metricSum = metric ? Math.round((g.sums[metric] || 0) * 10) / 10 : g.rows.length;
  groups.sort((a, b) => (b.metricSum - a.metricSum) || a.name.localeCompare(b.name));
  return { groups, metric };
}

function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
function csvVal(c, v) {
  if (v === null || v === undefined || v === '') return '';
  if (c.type === 'bool') return v ? 'TRUE' : 'FALSE';
  if (c.type === 'list') return (v || []).join(' | ');
  if (c.type === 'ts') return String(fmtDateTime(v));
  return String(v);
}
function fmtSum(v) { return String(Math.round(v * 10) / 10); }

export function buildGroupedCsv({ title, from, to, groups, metric, columns, metricLabel }) {
  const L = [];
  L.push([t(title), from, to].map(csvCell).join(','));
  L.push('');
  L.push(csvCell(t('Summary per captain')));
  const stateOrder = ['ABSENT', 'ON_LEAVE', 'NOT_CHECKED_IN'];
  const stateLbl = { ABSENT: 'Absent', ON_LEAVE: 'On leave', NOT_CHECKED_IN: 'Not checked in' };
  const numCols = columns.filter((c) => c.type === 'num');
  const showLate = groups.some((g) => g.late);
  const showStates = stateOrder.filter((s) => groups.some((g) => g.states[s]));
  const showMissing = groups.some((g) => g.missing);
  const showNums = numCols.filter((c) => groups.some((g) => (g.sums[c.key] || 0) > 0));
  const sumHead = ['Captain', 'Employee ID', 'Branch', 'Shift', 'Records'].map((k) => csvCell(t(k)))
    .concat(showLate ? [csvCell(t('Late'))] : [])
    .concat(showStates.map((s) => csvCell(t(stateLbl[s]))))
    .concat(showMissing ? [csvCell(t('Missing check-out'))] : [])
    .concat(showNums.map((c) => csvCell(t(c.label))));
  L.push(sumHead.join(','));
  const tot = { states: {}, missing: 0, sums: {}, records: 0, late: 0 };
  for (const g of groups) {
    const line = [csvCell(g.name), csvCell(g.id), csvCell([...g.branches].join(' / ')), csvCell([...g.shifts].join(' / ')), csvCell(g.rows.length)]
      .concat(showLate ? [csvCell((tot.late += g.late, g.late))] : [])
      .concat(showStates.map((s) => { tot.states[s] = (tot.states[s] || 0) + (g.states[s] || 0); return csvCell(g.states[s] || 0); }))
      .concat(showMissing ? [csvCell((tot.missing += g.missing, g.missing))] : [])
      .concat(showNums.map((c) => { const s = g.sums[c.key] || 0; tot.sums[c.key] = (tot.sums[c.key] || 0) + s; return csvCell(fmtSum(s)); }));
    tot.records += g.rows.length;
    L.push(line.join(','));
  }
  const tl = [csvCell(t('Total')), csvCell(''), csvCell(''), csvCell(''), csvCell(tot.records)]
    .concat(showLate ? [csvCell(tot.late)] : [])
    .concat(showStates.map((s) => csvCell(tot.states[s] || 0)))
    .concat(showMissing ? [csvCell(tot.missing)] : [])
    .concat(showNums.map((c) => csvCell(fmtSum(tot.sums[c.key] || 0))));
  L.push(tl.join(','));
  L.push('');
  L.push(csvCell(t('Details by captain')));
  for (const g of groups) {
    L.push('');
    const headTxt = g.name + ' (' + g.id + ')'
      + (g.branches.size ? ' — ' + [...g.branches].join(' / ') : '')
      + (metric ? ' — ' + metricLabel + ': ' + fmtSum(g.metricSum) : '');
    L.push(csvCell('## ' + headTxt));
    L.push(columns.map((c) => csvCell(t(c.label))).join(','));
    for (const r of g.rows) L.push(columns.map((c) => csvCell(csvVal(c, r[c.key]))).join(','));
  }
  return '\uFEFF' + L.join('\r\n') + '\r\n';
}

export async function reportsPage(ctx) {
  const l = await ctx.lookups.load(), can = (p) => ctx.user.permissions.includes(p), today = todayLocal(), out = h('div', { id: 'report-out' });
  let page = 1, last = null, mode = 'group', lastGroupable = false, groupsState = null, lastAllRows = null, lastMeta = null;
  const f = buildForm([
    { name: 'report', label: 'Report', type: 'select', required: true, options: REPORTS.map(([v, n]) => opt(v, t(n))) },
    { name: 'date_from', label: 'From', type: 'date', value: addDays(today, -6), required: true },
    { name: 'date_to', label: 'To', type: 'date', value: today, required: true },
    { name: 'employee_id', label: 'Employee', type: 'select', options: ctx.lookups.employeeOpts(l) },
    { name: 'branch_id', label: 'Branch', type: 'select', options: ctx.lookups.branchOpts(l) },
    { name: 'shift_id', label: 'Shift', type: 'select', options: ctx.lookups.shiftOpts(l) },
    { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => opt(s, s ? humanize(s.toLowerCase()) : t('All statuses'))) }
  ], {}, { submitLabel: t('Run report'), compact: true, onSubmit: async () => { page = 1; await run(); } });

  const params = () => clean(f.get());
  const effMode = () => (mode === 'group' && lastGroupable) ? 'group' : 'flat';

  function segRow() {
    if (!lastGroupable) return null;
    const segBtn = (label, m) => h('button', { type: 'button', class: 'btn btn-default btn-small',
      'aria-pressed': effMode() === m ? 'true' : 'false', on: { click: () => setMode(m) } }, label);
    return h('div', { class: 'rep-mode-row' },
      h('div', { class: 'seg', role: 'group', 'aria-label': t('Report layout') },
        segBtn(t('Grouped by captain'), 'group'),
        segBtn(t('Flat list'), 'flat')),
      h('span', { class: 'hint' }, t('Tap a captain to show or hide their day-by-day details.')));
  }

  function setAllGroups(outEl, open) {
    outEl.querySelectorAll('.rep-group').forEach((grp) => {
      const bodyEl = grp.querySelector('.rep-group-body'), headEl = grp.querySelector('.rep-group-head');
      if (bodyEl) bodyEl.hidden = !open;
      if (headEl) headEl.setAttribute('aria-expanded', open ? 'true' : 'false');
      grp.dataset.open = open ? '1' : '0';
    });
  }

  function groupChips(g, metric, columns) {
    const chips = [h('span', { class: 'rep-stat rep-stat-n' }, t('{n} records', { n: g.rows.length }))];
    if (g.late) chips.push(h('span', { class: 'rep-stat bad' }, t('Late') + ': ' + g.late));
    if (g.states.ABSENT) chips.push(h('span', { class: 'rep-stat bad' }, t('Absent') + ': ' + g.states.ABSENT));
    if (g.states.ON_LEAVE) chips.push(h('span', { class: 'rep-stat warn' }, t('On leave') + ': ' + g.states.ON_LEAVE));
    if (g.states.NOT_CHECKED_IN) chips.push(h('span', { class: 'rep-stat' }, t('Not checked in') + ': ' + g.states.NOT_CHECKED_IN));
    if (g.missing) chips.push(h('span', { class: 'rep-stat warn' }, t('Missing check-out') + ': ' + g.missing));
    for (const c of columns) if (c.type === 'num' && (g.sums[c.key] || 0) > 0) chips.push(h('span', { class: 'rep-stat' + (metric === c.key ? ' rep-stat-main' : '') }, t(c.label) + ': ' + fmtSum(g.sums[c.key])));
    return chips;
  }

  function renderGrouped(r0, rows) {
    groupsState = buildGroups(rows, r0.columns);
    lastAllRows = rows; lastMeta = { title: r0.title, from: r0.filters.date_from, to: r0.filters.date_to, columns: r0.columns };
    const cols = r0.columns.map((c) => ({ key: c.key, label: c.label, render: (row) => cell(c, row[c.key]) }));
    const chips = h('div', { class: 'chips', id: 'report-summary' }, Object.entries(r0.summary).map(([k, v]) => h('span', { class: 'chip' }, h('b', {}, v === null ? '-' : v), ' ', humanize(k))));
    if (!groupsState.groups.length) {
      mount(out, h('h2', {}, t(r0.title), h('small', {}, ` ${r0.filters.date_from} - ${r0.filters.date_to}`)), chips, segRow(), dataTable({ columns: cols, rows: [], empty: t('No records match these filters.') }));
      return;
    }
    const blocks = groupsState.groups.map((g) => {
      const bodyEl = h('div', { class: 'rep-group-body', hidden: true }, dataTable({ columns: cols, rows: g.rows, empty: '' }));
      const headEl = h('button', { type: 'button', class: 'rep-group-head', 'aria-expanded': 'false',
        on: { click: () => { const open = bodyEl.hidden; bodyEl.hidden = !open; headEl.setAttribute('aria-expanded', open ? 'true' : 'false'); grp.dataset.open = open ? '1' : '0'; } } },
        h('span', { class: 'chev', 'aria-hidden': 'true' }, '▸'),
        h('b', {}, g.name),
        h('span', { class: 'rep-group-sub' }, g.id + (g.branches.size ? ' · ' + [...g.branches].join(' / ') : '')),
        h('span', { class: 'rep-group-stats' }, groupChips(g, groupsState.metric, r0.columns)));
      const grp = h('div', { class: 'rep-group', dataset: { open: '0' } }, headEl, bodyEl);
      return grp;
    });
    mount(out, h('h2', {}, t(r0.title), h('small', {}, ` ${r0.filters.date_from} - ${r0.filters.date_to}`)), chips, segRow(),
      h('div', { class: 'rep-groups-tools' },
        button(t('Expand all'), { small: true, on: { click: () => setAllGroups(out, true) } }),
        button(t('Collapse all'), { small: true, on: { click: () => setAllGroups(out, false) } })),
      ...blocks);
  }

  function renderFlat(r) {
    const chips = h('div', { class: 'chips', id: 'report-summary' }, Object.entries(r.summary).map(([k, v]) => h('span', { class: 'chip' }, h('b', {}, v === null ? '-' : v), ' ', humanize(k))));
    mount(out, h('h2', {}, t(r.title), h('small', {}, ` ${r.filters.date_from} - ${r.filters.date_to}`)), chips, segRow(),
      dataTable({ columns: r.columns.map((c) => ({ key: c.key, label: c.label, render: (row) => cell(c, row[c.key]) })), rows: r.rows, empty: t('No records match these filters.') }),
      r.total > r.page_size ? pager(r, (p) => { page = p; run(); }) : null);
  }

  async function run() {
    mount(out, spinner());
    try {
      const r0 = await ctx.api.call('getReports', { ...params(), page: 1, page_size: 100 });
      last = r0; lastGroupable = isGroupable(r0.columns); syncExportLabel();
      if (effMode() === 'flat') { renderFlat(r0); return; }
      const rows = r0.rows.slice();
      let total = r0.total || rows.length, pg = 1;
      while (rows.length < total && pg < MAX_PAGES_GROUP && r0.rows.length) {
        pg++;
        const rn = await ctx.api.call('getReports', { ...params(), page: pg, page_size: PAGE_SIZE_GROUP });
        if (!rn.rows || !rn.rows.length) break;
        rows.push(...rn.rows);
        total = rn.total || total;
      }
      renderGrouped(r0, rows);
    } catch (e) { mount(out, errorBox(e)); }
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m; page = 1; syncExportLabel(); run();
  }

  async function exportCsv() {
    try {
      if (effMode() === 'group' && groupsState && groupsState.groups.length) {
        const metricCol = groupsState.metric ? (lastMeta.columns.find((c) => c.key === groupsState.metric) || null) : null;
        const csv = buildGroupedCsv({
          title: lastMeta.title, from: lastMeta.from, to: lastMeta.to,
          groups: groupsState.groups, metric: groupsState.metric, columns: lastMeta.columns,
          metricLabel: metricCol ? t(metricCol.label) : ''
        });
        const fname = 'ground-ops-' + (params().report || 'report') + '-grouped_' + lastMeta.from + '_' + lastMeta.to + '.csv';
        downloadText(fname, csv, 'text/csv;charset=utf-8');
        toast(t('Grouped export ready: {c} captains, {n} rows', { c: groupsState.groups.length, n: lastAllRows.length }), 'ok');
        return;
      }
      const r = await ctx.api.call('exportReport', params()); downloadText(r.filename, r.csv, r.mime); toast(t('Exported {n} rows', { n: r.row_count }), 'ok');
    } catch (e) { toastError(e); }
  }

  const exportBtn = button(t('Export CSV'), { id: 'btn-export', on: { click: exportCsv } });
  function syncExportLabel() { exportBtn.textContent = (mode === 'group' && lastGroupable) ? t('Download grouped (CSV)') : t('Export CSV'); }

  const tools = h('div', { class: 'toolbar' },
    can('export_reports') ? exportBtn : null,
    h('span', { class: 'hint' }, t('Employee is required for "Employee Attendance History". Tracking gaps are limited to 31 days.'))
  );

  return { el: h('div', {}, h('h1', {}, t('Reports')), f.el, tools, out) };
}
