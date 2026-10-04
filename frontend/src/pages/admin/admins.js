import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtDateTime } from '../../core/time.js';
import { badge, button, listPage, openModal, buildForm, opt, toast, toastError, confirmDialog, showSecret } from '../../components/ui.js';
import { clean } from './lookups.js';

export async function adminsPage(ctx) {
  const can = ctx.user.permissions.includes('manage_admins'), me = ctx.user.user_id; let roles = ['admin'], managers = 0;
  const lp = listPage({
    toolbar: can ? button(t('Add administrator'), { kind: 'primary', id: 'btn-add-admin', on: { click: () => editor() } }) : null,
    columns: [{ key: 'username', label: 'Username', render: (r) => h('span', {}, h('strong', {}, r.username), r.user_id === me ? h('small', {}, ' ' + t('(you)')) : null) }, { key: 'display_name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      { key: 'active_sessions', label: 'Active sessions' }, { key: 'last_login_at', label: 'Last login', render: (r) => fmtDateTime(r.last_login_at) },
      { key: 'flags', label: 'Flags', render: (r) => h('span', { class: 'badges' }, r.must_change_password ? badge('PAUSED', 'Must change password') : null, r.locked ? badge('GPS_DISABLED', 'Locked') : null) },
      { key: 'actions', label: 'Actions', render: (r) => (can ? h('span', { class: 'btn-row' }, button(t('Edit'), { small: true, on: { click: () => editor(r) } }), button(t('Reset password'), { small: true, on: { click: () => reset(r) } }), button(t('Revoke sessions'), { small: true, on: { click: () => revoke(r) } }),
        r.status === 'ACTIVE' ? button(t('Deactivate'), { small: true, kind: 'danger', on: { click: () => deactivate(r) } }) : button(t('Reactivate'), { small: true, on: { click: () => reactivate(r) } })) : null) }],
    async load() {
      const res = await ctx.api.call('getAdmins', {}); roles = res.roles; managers = res.active_managers;
      return { items: res.admins, before: h('p', { class: 'hint', id: 'admin-count' }, t('{n} active administrator(s). The last active administrator cannot be deactivated or demoted.', { n: managers })) };
    }
  });
  function editor(row) {
    const edit = !!row, m = openModal({ title: edit ? t('Edit administrator') : t('Add administrator'), body: null });
    const f = buildForm([{ name: 'username', label: 'Username', required: true, disabled: edit, hint: 'a-z 0-9 . _ -' }, { name: 'display_name', label: 'Display name', required: true }, { name: 'role', label: 'Role', type: 'select', options: roles.map((r) => opt(r, r)) },
      ...(edit ? [] : [{ name: 'password', label: 'Initial password (optional)', type: 'password', autocomplete: 'new-password', hint: 'Leave empty to generate a temporary password.' }])], row || {}, { cancel: () => m.close(), onSubmit: async (v) => {
      if (edit) await ctx.api.call('updateAdmin', { user_id: row.user_id, display_name: v.display_name, role: v.role });
      else { const r = await ctx.api.call('createAdmin', clean(v)); if (r.temp_password) showSecret({ title: t('Administrator created'), label: t('Temporary password for {u}:', { u: r.admin.username }), secret: r.temp_password }); }
      m.close(); toast(t('Saved'), 'ok'); lp.reload(); } });
    m.setBody(f.el);
  }
  const act = async (fn, okMsg) => { try { await fn(); toast(okMsg, 'ok'); lp.reload(); } catch (e) { toastError(e); } };
  const deactivate = async (r) => { if (await confirmDialog(t('Deactivate administrator {u}? Their sessions end immediately.', { u: r.username }), { danger: true })) act(() => ctx.api.call('deactivateAdmin', { user_id: r.user_id }), t('Deactivated')); };
  const reactivate = (r) => act(() => ctx.api.call('updateAdmin', { user_id: r.user_id, status: 'ACTIVE' }), t('Reactivated'));
  const revoke = async (r) => { if (await confirmDialog(t('Sign {u} out everywhere?', { u: r.username }))) act(() => ctx.api.call('revokeAdminSessions', { user_id: r.user_id }), t('Sessions revoked')); };
  async function reset(r) { if (!(await confirmDialog(t('Reset the password of {u}? Their sessions end.', { u: r.username })))) return; try { const x = await ctx.api.call('resetAdminPassword', { user_id: r.user_id }); showSecret({ title: t('Password reset'), label: t('Temporary password for {u}:', { u: r.username }), secret: x.temp_password }); lp.reload(); } catch (e) { toastError(e); } }
  return { el: h('div', {}, h('h1', {}, t('Administrators')), lp.el) };
}
