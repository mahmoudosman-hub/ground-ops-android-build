import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { badge, button, listPage, openModal, buildForm, opt, toast, toastError } from '../../components/ui.js';
import { minutesText } from '../../core/time.js';

export async function shiftsPage(ctx) {
  const can = (p) => ctx.user.permissions.includes(p);
  const lp = listPage({
    toolbar: can('create_shifts') ? button(t('Add shift'), { kind: 'primary', id: 'btn-add-shift', on: { click: () => editor() } }) : null,
    columns: [{ key: 'shift_name', label: 'Shift' }, { key: 'start_time', label: 'Start' }, { key: 'end_time', label: 'End', render: (r) => h('span', {}, r.end_time, r.crosses_midnight ? h('small', {}, ' ' + t('(next day)')) : null) }, { key: 'duration_minutes', label: 'Duration', render: (r) => minutesText(r.duration_minutes) },
      { key: 'grace_period_minutes', label: 'Grace (min)' }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      { key: 'actions', label: 'Actions', render: (r) => (can('edit_shifts') ? h('span', { class: 'btn-row' }, button(t('Edit'), { small: true, on: { click: () => editor(r) } }), button(r.status === 'ACTIVE' ? t('Deactivate') : t('Reactivate'), { small: true, kind: r.status === 'ACTIVE' ? 'danger' : 'default', on: { click: () => toggle(r) } })) : null) }],
    async load() { return { items: (await ctx.api.call('getShifts', {})).shifts }; }
  });
  function editor(row) {
    const edit = !!row, m = openModal({ title: edit ? t('Edit shift') : t('Add shift'), body: null });
    const f = buildForm([{ name: 'shift_name', label: 'Name (Morning, Evening, Night, Custom...)', required: true }, { name: 'start_time', label: 'Start', type: 'time', required: true }, { name: 'end_time', label: 'End', type: 'time', required: true, hint: 'An end time earlier than the start means the shift ends the next day (e.g. 18:00-03:00).' },
      { name: 'grace_period_minutes', label: 'Grace period (minutes)', type: 'number', min: 0, max: 120, step: 1, required: true, value: 10 }], row || {}, {
      cancel: () => m.close(), onSubmit: async (v) => { if (edit) await ctx.api.call('updateShift', { shift_id: row.shift_id, ...v }); else await ctx.api.call('createShift', v); m.close(); toast(t('Saved'), 'ok'); ctx.lookups.invalidate(); lp.reload(); } });
    m.setBody(f.el);
  }
  async function toggle(r) { try { await ctx.api.call('updateShift', { shift_id: r.shift_id, status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }); toast(t('Saved'), 'ok'); ctx.lookups.invalidate(); lp.reload(); } catch (e) { toastError(e); } }
  return { el: h('div', {}, h('h1', {}, t('Shifts')), lp.el) };
}
