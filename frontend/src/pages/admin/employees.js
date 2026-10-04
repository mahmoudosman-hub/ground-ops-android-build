import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtDateTime } from '../../core/time.js';
import { badge, button, listPage, openModal, buildForm, opt, toast, toastError, confirmDialog, showSecret } from '../../components/ui.js';
import { clean } from './lookups.js';

export async function employeesPage(ctx) {
  const l = await ctx.lookups.load(), can = (p) => ctx.user.permissions.includes(p), bn = Object.fromEntries(l.branches.map((b) => [b.branch_id, b.branch_name])), sn = Object.fromEntries(l.shifts.map((s) => [s.shift_id, s.shift_name]));
  const lp = listPage({
    filters: [{ name: 'search', label: 'Search (ID or name)' }, { name: 'status', label: 'Status', type: 'select', options: [opt('', t('All')), opt('ACTIVE', t('Active')), opt('INACTIVE', t('Inactive'))] }],
    toolbar: can('create_employees') ? button(t('Add employee'), { kind: 'primary', id: 'btn-add-employee', on: { click: () => editor() } }) : null,
    columns: [{ key: 'employee_id', label: 'Employee ID' }, { key: 'employee_name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'default_branch_id', label: 'Default branch', render: (r) => bn[r.default_branch_id] || '-' }, { key: 'default_shift_id', label: 'Default shift', render: (r) => sn[r.default_shift_id] || '-' },
      { key: 'status', label: 'Status', render: (r) => badge(r.status) }, { key: 'last_login_at', label: 'Last login', render: (r) => fmtDateTime(r.last_login_at) },
      { key: 'actions', label: 'Actions', render: (r) => h('span', { class: 'btn-row' }, h('a', { class: 'btn btn-small', href: `#/employee?id=${encodeURIComponent(r.employee_id)}` }, t('Details')),
        can('edit_employees') ? button(t('Edit'), { small: true, on: { click: () => editor(r) } }) : null, can('reset_passwords') ? button(t('Reset password'), { small: true, on: { click: () => reset(r) } }) : null,
        r.status === 'ACTIVE' ? (can('deactivate_employees') ? button(t('Deactivate'), { small: true, kind: 'danger', on: { click: () => deactivate(r) } }) : null) : (can('edit_employees') ? button(t('Reactivate'), { small: true, on: { click: () => reactivate(r) } }) : null)) }],
    async load(f, page) { const res = await ctx.api.call('getEmployees', { ...clean(f), page, page_size: 50 }); return { items: res.items, total: res.total, page: res.page, page_size: res.page_size }; }
  });
  function editor(row) {
    const edit = !!row, m = openModal({ title: edit ? t('Edit employee') : t('Add employee'), body: null });
    const f = buildForm([{ name: 'employee_id', label: 'Employee ID', required: true, disabled: edit, hint: '3-20 letters, digits, _ or -' }, { name: 'employee_name', label: 'Name', required: true }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' },
      { name: 'default_branch_id', label: 'Default branch', type: 'select', options: ctx.lookups.branchOpts(l, t('(none)')) }, { name: 'default_shift_id', label: 'Default shift', type: 'select', options: ctx.lookups.shiftOpts(l, t('(none)')) },
      ...(edit ? [] : [{ name: 'password', label: 'Initial password (optional)', type: 'password', autocomplete: 'new-password', hint: 'Leave empty to generate a temporary password.' }])], row || {}, {
      cancel: () => m.close(), onSubmit: async (v) => {
        if (edit) { const { employee_id, ...rest } = v; await ctx.api.call('updateEmployee', { employee_id: row.employee_id, ...rest }); }
        else { const p = clean(v); const r = await ctx.api.call('createEmployee', p); if (r.temp_password) showSecret({ title: t('Employee created'), label: t('Temporary password for {n} ({id}):', { n: r.employee.employee_name, id: r.employee.employee_id }), secret: r.temp_password }); }
        m.close(); toast(t('Saved'), 'ok'); ctx.lookups.invalidate(); lp.reload();
      } });
    m.setBody(f.el);
  }
  async function reset(r) { if (!(await confirmDialog(t('Reset the password of {n}? Their sessions will end.', { n: r.employee_name })))) return; try { const x = await ctx.api.call('resetPassword', { employee_id: r.employee_id }); showSecret({ title: t('Password reset'), label: t('Temporary password for {n}:', { n: r.employee_name }), secret: x.temp_password }); } catch (e) { toastError(e); } }
  async function deactivate(r) { if (!(await confirmDialog(t('Deactivate {n}? History is kept; they can no longer sign in.', { n: r.employee_name }), { danger: true }))) return; try { await ctx.api.call('deactivateEmployee', { employee_id: r.employee_id }); toast(t('Deactivated'), 'ok'); lp.reload(); } catch (e) { toastError(e); } }
  async function reactivate(r) { try { await ctx.api.call('updateEmployee', { employee_id: r.employee_id, status: 'ACTIVE' }); toast(t('Reactivated'), 'ok'); lp.reload(); } catch (e) { toastError(e); } }
  return { el: h('div', {}, h('h1', {}, t('Employees')), lp.el) };
}
