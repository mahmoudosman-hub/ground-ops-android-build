import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { addDays, todayLocal } from '../../core/time.js';
import { badge, button, listPage, openModal, buildForm, toast, toastError, confirmDialog } from '../../components/ui.js';
import { clean } from './lookups.js';

function datesBetween(from, to) { const out = []; for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) out.push(d); return out; }

export async function assignmentsPage(ctx) {
  const l = await ctx.lookups.load(), can = (p) => ctx.user.permissions.includes(p);
  const en = Object.fromEntries(l.employees.map((e) => [e.employee_id, e.employee_name])), bn = Object.fromEntries(l.branches.map((b) => [b.branch_id, b.branch_name])), sn = Object.fromEntries(l.shifts.map((s) => [s.shift_id, `${s.shift_name} ${s.start_time}-${s.end_time}`]));
  const today = todayLocal();
  const lp = listPage({
    filters: [{ name: 'date_from', label: 'From', type: 'date', value: today }, { name: 'date_to', label: 'To', type: 'date', value: addDays(today, 6) }, { name: 'employee_id', label: 'Employee', type: 'select', options: ctx.lookups.employeeOpts(l) }, { name: 'branch_id', label: 'Branch', type: 'select', options: ctx.lookups.branchOpts(l) }],
    toolbar: can('assign_shifts') ? button(t('Assign shift'), { kind: 'primary', id: 'btn-assign', on: { click: () => editor() } }) : null,
    columns: [{ key: 'work_date', label: 'Date' }, { key: 'employee_id', label: 'Employee', render: (r) => `${r.employee_id} - ${en[r.employee_id] || ''}` }, { key: 'shift_id', label: 'Shift', render: (r) => sn[r.shift_id] || r.shift_id }, { key: 'branch_id', label: 'Branch', render: (r) => bn[r.branch_id] || r.branch_id }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      { key: 'actions', label: 'Actions', render: (r) => (can('assign_shifts') ? h('span', { class: 'btn-row' }, button(t('Change'), { small: true, on: { click: () => editor(r) } }), button(t('Cancel'), { small: true, kind: 'danger', on: { click: () => cancel(r) } })) : null) }],
    empty: t('No assignments in this range.'),
    async load(f, page) { const res = await ctx.api.call('getAssignments', { ...clean(f), page, page_size: 100 }); return { items: res.items, total: res.total, page: res.page, page_size: res.page_size }; }
  });
  function editor(row) {
    const m = openModal({ title: row ? t('Change assignment') : t('Assign shift'), body: null }), emp = row ? row.employee_id : '';
    const f = buildForm([{ name: 'employee_id', label: 'Employee', type: 'select', required: true, disabled: !!row, options: ctx.lookups.employeeOpts(l, t('Select employee...')).filter((o) => o.value === '' || l.employees.find((e) => e.employee_id === o.value).status === 'ACTIVE' || o.value === emp) },
      { name: 'date_from', label: row ? 'Date' : 'From date', type: 'date', required: true, value: row ? row.work_date : today, disabled: !!row }, ...(row ? [] : [{ name: 'date_to', label: 'To date (same day if empty)', type: 'date' }]),
      { name: 'shift_id', label: 'Shift', type: 'select', required: true, options: ctx.lookups.shiftOpts(l, t('Select shift...')).filter((o) => o.value === '' || l.shifts.find((s) => s.shift_id === o.value).status === 'ACTIVE') },
      { name: 'branch_id', label: 'Branch', type: 'select', required: true, options: ctx.lookups.branchOpts(l, t('Select branch...')).filter((o) => o.value === '' || l.branches.find((b) => b.branch_id === o.value).status === 'ACTIVE') }],
      row ? { employee_id: row.employee_id, shift_id: row.shift_id, branch_id: row.branch_id } : {}, { cancel: () => m.close(), onSubmit: async (v) => {
        const to = v.date_to || v.date_from, dates = datesBetween(v.date_from, to);
        if (to < v.date_from) throw Object.assign(new Error(t('The end date is before the start date.')), { code: 'VALIDATION_ERROR' });
        await ctx.api.call('assignShift', { employee_id: v.employee_id, work_dates: dates, shift_id: v.shift_id, branch_id: v.branch_id }); m.close(); toast(t('Assigned {n} day(s)', { n: dates.length }), 'ok'); lp.reload(); } });
    if (!row) f.inputs.employee_id.addEventListener('change', () => { const e = l.employees.find((x) => x.employee_id === f.inputs.employee_id.value); if (e) { if (e.default_shift_id) f.set('shift_id', e.default_shift_id); if (e.default_branch_id) f.set('branch_id', e.default_branch_id); } });
    m.setBody(f.el);
  }
  async function cancel(r) { if (!(await confirmDialog(t('Cancel the assignment of {n} on {d}?', { n: en[r.employee_id] || r.employee_id, d: r.work_date }), { danger: true }))) return; try { await ctx.api.call('assignShift', { employee_id: r.employee_id, work_date: r.work_date, status: 'CANCELLED' }); toast(t('Cancelled'), 'ok'); lp.reload(); } catch (e) { toastError(e); } }
  return { el: h('div', {}, h('h1', {}, t('Daily Assignments')), h('p', { class: 'hint' }, t('Each employee is assigned a shift and branch per date. The geofence for a day always uses that day\'s branch.')), lp.el) };
}
