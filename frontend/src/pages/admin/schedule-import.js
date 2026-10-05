import { h, mount } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtDateTime } from '../../core/time.js';
import { badge, button, dataTable, spinner, errorBox, toast, toastError, confirmDialog } from '../../components/ui.js';

const OPS = { CREATE: ['ok', 'New'], UPDATE: ['warn', 'Changed'], CANCEL: ['bad', 'Removed'], LEAVE_CREATE: ['info', 'Leave added'], LEAVE_CANCEL: ['muted', 'Leave removed'] };
const opBadge = (op) => { const [k, l] = OPS[op] || ['muted', op]; return h('span', { class: `badge badge-${k}` }, t(l)); };
const SUM = [['create', 'New assignments'], ['update', 'Changed'], ['cancel', 'Removed'], ['leave_create', 'Leave days added'], ['leave_cancel', 'Leave days removed'], ['unchanged', 'Unchanged'], ['locked_days', 'Days with attendance (frozen)'], ['manual_conflicts', 'Manual assignments kept'], ['unresolved', 'Cells not understood']];

export async function scheduleImportPage(ctx) {
  const can = ctx.user.permissions.includes('assign_shifts'), box = h('div', { id: 'import-result' }), statusBox = h('section', { class: 'card', id: 'import-status' }, spinner());
  let preview = null, previewBtn, applyBtn;

  async function loadStatus() {
    try {
      const s = await ctx.api.call('getScheduleImportStatus', {}), l = s.last;
      mount(statusBox, h('h2', {}, t('Roster sheet')), h('dl', { class: 'kv' },
        h('dt', {}, t('Connected')), h('dd', { id: 'import-configured' }, s.configured ? badge('ACTIVE', 'Yes') : badge('INACTIVE', 'Not set - open Settings and fill "schedule spreadsheet id"')),
        h('dt', {}, t('Tab')), h('dd', {}, s.sheet_name), h('dt', {}, t('Daily automatic check')), h('dd', {}, s.enabled ? badge('ACTIVE', 'On') : badge('INACTIVE', 'Off (turn on in Settings: schedule import enabled)')),
        h('dt', {}, t('Looks ahead')), h('dd', {}, t('{n} days from today', { n: s.days_ahead })),
        h('dt', {}, t('Last run')), h('dd', { id: 'import-last' }, l ? [fmtDateTime(l.at), ' · ', l.mode === 'AUTO' ? t('automatic') : t('manual'), ' · ', l.error ? badge('GPS_DISABLED', 'Failed') : (l.held ? badge('PAUSED', 'Held - waiting for your Apply') : badge('ON_TIME', 'Applied')), l.error ? h('p', { class: 'hint' }, l.error) : (l.summary ? h('p', { class: 'hint' }, t('{a} new, {b} changed, {c} removed, {d} issues', { a: l.summary.create, b: l.summary.update, c: l.summary.cancel + l.summary.leave_cancel, d: l.issue_count !== undefined ? l.issue_count : (l.issues || []).length })) : null)] : t('never'))));
    } catch (e) { mount(statusBox, errorBox(e)); }
  }

  function render(res, applied) {
    const s = res.summary;
    const cards = h('div', { class: 'chips', id: 'import-summary' }, SUM.map(([k, label]) => h('span', { class: 'chip' }, h('b', {}, s[k]), ' ', t(label))));
    const head = applied ? h('div', { class: `alert ${res.held ? 'alert-warn' : 'alert-ok'}`, id: 'import-banner' }, res.held ? t('Held: this is a large change. Nothing was applied.') : t('Applied. The assignments are now in the dashboard.')) : h('div', { class: 'alert alert-info', id: 'import-banner' }, t('Preview only - nothing has been changed yet. Window: {a} to {b}.', { a: res.window.from, b: res.window.to }));
    const changes = res.changes.length ? dataTable({ columns: [{ key: 'op', label: 'Change', render: (c) => opBadge(c.op) }, { key: 'work_date', label: 'Date' }, { key: 'employee_name', label: 'Captain', render: (c) => `${c.employee_id} ${c.employee_name}` },
      { key: 'shift_name', label: 'Shift', render: (c) => c.shift_name || c.leave_type || '-' }, { key: 'branch_name', label: 'Branch', render: (c) => c.branch_name || '-' }], rows: res.changes }) : h('p', { class: 'empty' }, t('Nothing to change: the system already matches the roster.'));
    const issues = res.issues.length ? h('section', { class: 'card', id: 'import-issues' }, h('h2', {}, t('Needs your attention ({n})', { n: res.issues.length })), h('p', { class: 'hint' }, t('These cells were NOT imported. Fix the name/branch spelling (or add an alias in Settings) and run again.')),
      dataTable({ columns: [{ key: 'type', label: 'Problem', render: (i) => i.type.replace(/_/g, ' ').toLowerCase() }, { key: 'name', label: 'Name / text', render: (i) => i.name || '-' }, { key: 'date', label: 'Date', render: (i) => i.date || (i.count ? `${i.count} cells` : '-') }, { key: 'cell', label: 'Cell', render: (i) => i.cell || '-' }, { key: 'detail', label: 'Detail' }], rows: res.issues })) : null;
    mount(box, head, cards, h('h2', {}, t('Changes ({n})', { n: res.changes_total })), changes, issues);
  }

  async function run(apply) {
    mount(box, spinner(t(apply ? 'Applying...' : 'Reading the roster...')));
    previewBtn.disabled = applyBtn.disabled = true;
    try { const res = await ctx.api.call(apply ? 'applyScheduleImport' : 'previewScheduleImport', {}); preview = apply ? null : res; render(res, apply); if (apply) { toast(res.held ? t('Held') : t('Applied'), res.held ? 'warn' : 'ok'); loadStatus(); } }
    catch (e) { preview = null; mount(box, errorBox(e)); }
    finally { previewBtn.disabled = false; applyBtn.disabled = !preview || !preview.changes_total; }
  }
  previewBtn = button(t('Preview'), { kind: 'primary', id: 'btn-import-preview', disabled: !can, on: { click: () => run(false) } });
  applyBtn = button(t('Apply'), { id: 'btn-import-apply', disabled: true, on: { click: async () => { if (await confirmDialog(t('Apply {n} change(s) from the roster to the assignments?', { n: preview.changes_total }))) run(true); } } });
  loadStatus();
  return { el: h('div', {}, h('h1', {}, t('Schedule Import')),
    h('p', { class: 'hint' }, t('Reads the weekly roster sheet (read-only) and creates the daily assignments. Days that already have attendance, assignments you made by hand, and past days are never changed.')),
    statusBox, h('div', { class: 'toolbar' }, previewBtn, applyBtn), box) };
}
