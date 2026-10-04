import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { buildForm, toast, toastError, spinner, errorBox, button, confirmDialog } from '../../components/ui.js';

export async function settingsPage(ctx) {
  const can = ctx.user.permissions.includes('manage_settings'), box = h('div', {}, spinner());
  async function load() {
    try {
      const { settings } = await ctx.api.call('getSettings', {}), vals = Object.fromEntries(settings.map((s) => [s.key, s.value]));
      const f = buildForm(settings.map((s) => ({ name: s.key, label: s.key.replace(/_/g, ' '), type: s.type === 'bool' ? 'checkbox' : (s.type === 'int' ? 'number' : 'text'), min: s.type === 'int' ? s.min : undefined, max: s.type === 'int' ? s.max : undefined, maxlength: s.type === 'str' ? s.max : undefined, step: 1, hint: `${s.description}${s.type === 'int' ? ` (${s.min}-${s.max}, default ${s.default})` : ''}`, disabled: !can })), vals, can ? { submitLabel: t('Save settings'), onSubmit: async (v) => {
        const changed = {}; settings.forEach((s) => { if (v[s.key] !== s.value) changed[s.key] = v[s.key]; });
        if (!Object.keys(changed).length) return toast(t('No changes'), 'info');
        await ctx.api.call('updateSettings', { settings: changed }); toast(t('Settings saved'), 'ok'); load(); } } : {});
      box.replaceChildren(f.el);
    } catch (e) { box.replaceChildren(errorBox(e)); }
  }
  const arch = h('section', { class: 'card', id: 'archive-card' });
  async function loadArchive() {
    if (!ctx.user.permissions.includes('manage_archive')) return;
    try {
      const st = await ctx.api.call('getArchiveStatus', {});
      const f = buildForm([{ name: 'older_than_days', label: 'Archive location logs older than (days)', type: 'number', min: 1, max: 3650, step: 1, required: true, value: 90 }], {}, { submitLabel: t('Archive now'), onSubmit: async (v) => {
        if (!(await confirmDialog(t('Move location logs older than {d} days into monthly archive sheets? Reports keep working.', { d: v.older_than_days })))) return;
        const r = await ctx.api.call('archiveLocationLogs', v); toast(t('Archived {n} rows', { n: r.moved }), 'ok'); loadArchive(); } });
      arch.replaceChildren(h('h2', {}, t('Location log archive')), h('p', { class: 'hint', id: 'archive-status' }, t('{a} rows in Location_Logs, {b} rows in {c} monthly archive sheet(s): {n}', { a: st.live_rows, b: st.archived_rows, c: st.archives.length, n: st.archives.map((x) => `${x.sheet} (${x.rows})`).join(', ') || '-' })),
        h('p', { class: 'hint' }, t('Nothing is deleted by archiving. Deleting old archives happens only if "archive retention months" above is set above 0.')), f.el);
    } catch (e) { arch.replaceChildren(h('p', { class: 'hint' }, t('Archive status unavailable.'))); }
  }
  load(); loadArchive(); return { el: h('div', {}, h('h1', {}, t('Settings')), box, arch) };
}
