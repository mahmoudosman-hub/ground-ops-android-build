import { h, mount } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { buildForm, toast, toastError, spinner, errorBox, button, confirmDialog } from '../../components/ui.js';

export async function settingsPage(ctx) {
  const can = ctx.user.permissions.includes('manage_settings'), box = h('div', {}, spinner());

  async function load() {
    try {
      const { settings } = await ctx.api.call('getSettings', {}), vals = Object.fromEntries(settings.map((s) => [s.key, s.value]));
      const f = buildForm(settings.map((s) => ({
        name: s.key, label: s.key.replace(/_/g, ' '),
        type: s.type === 'bool' ? 'checkbox' : (s.type === 'int' ? 'number' : 'text'),
        min: s.type === 'int' ? s.min : undefined, max: s.type === 'int' ? s.max : undefined,
        maxlength: s.type === 'str' ? s.max : undefined, step: 1,
        hint: `${s.description}${s.type === 'int' ? ` (${s.min}-${s.max}, default ${s.default})` : ''}`,
        disabled: !can
      })), vals, can ? {
        submitLabel: t('Save settings'), onSubmit: async (v) => {
          const changed = {}; settings.forEach((s) => { if (v[s.key] !== s.value) changed[s.key] = v[s.key]; });
          if (!Object.keys(changed).length) return toast(t('No changes'), 'info');
          await ctx.api.call('updateSettings', { settings: changed }); toast(t('Settings saved'), 'ok'); load();
        }
      } : {});
      box.replaceChildren(f.el);
    } catch (e) { box.replaceChildren(errorBox(e)); }
  }

  // ── Archive card ───────────────────────────────────────────────────
  const arch = h('section', { class: 'card', id: 'archive-card' });
  async function loadArchive() {
    if (!ctx.user.permissions.includes('manage_archive')) return;
    try {
      const st = await ctx.api.call('getArchiveStatus', {});
      const f = buildForm([{ name: 'older_than_days', label: 'Archive location logs older than (days)', type: 'number', min: 1, max: 3650, step: 1, required: true, value: 90 }], {}, {
        submitLabel: t('Archive now'), onSubmit: async (v) => {
          if (!(await confirmDialog(t('Move location logs older than {d} days into monthly archive sheets? Reports keep working.', { d: v.older_than_days })))) return;
          const r = await ctx.api.call('archiveLocationLogs', v); toast(t('Archived {n} rows', { n: r.moved }), 'ok'); loadArchive();
        }
      });
      arch.replaceChildren(h('h2', {}, t('Location log archive')),
        h('p', { class: 'hint', id: 'archive-status' }, t('{a} rows in Location_Logs, {b} rows in {c} monthly archive sheet(s): {n}', { a: st.live_rows, b: st.archived_rows, c: st.archives.length, n: st.archives.map((x) => `${x.sheet} (${x.rows})`).join(', ') || '-' })),
        h('p', { class: 'hint' }, t('Nothing is deleted by archiving. Deleting old archives happens only if "archive retention months" above is set above 0.')),
        f.el);
    } catch (e) { arch.replaceChildren(h('p', { class: 'hint' }, t('Archive status unavailable.'))); }
  }

  // ── KPI Configuration card ─────────────────────────────────────────
  const kpiCard = h('section', { class: 'card', id: 'kpi-card' });

  async function loadKpi() {
    if (!can) return;
    try {
      const { metrics, config } = await ctx.api.call('getKpiConfig', {});
      const kpiRows = metrics.map((m) => {
        const mcfg = config[m.key] || {};
        return h('tr', {},
          // اسم المعيار
          h('td', {}, h('strong', {}, m.label), h('br'), h('small', { class: 'hint' }, m.unit)),
          // تفعيل
          h('td', { style: 'text-align:center' },
            h('input', { type: 'checkbox', id: `kpi-en-${m.key}`, checked: !!mcfg.enabled })
          ),
          // الوزن
          h('td', {},
            h('input', { type: 'number', id: `kpi-w-${m.key}`, value: mcfg.weight || 20, min: 1, max: 100, style: 'width:60px' }),
            h('span', { class: 'hint' }, ' %')
          ),
          // الـ threshold
          h('td', {},
            h('input', { type: 'number', id: `kpi-t-${m.key}`, value: mcfg.threshold || 1, min: 0, max: 999, style: 'width:60px' }),
            h('span', { class: 'hint' }, ' ' + (m.unit === 'times' ? t('times') : t('min')))
          ),
          // الخصم لكل وحدة
          h('td', {},
            h('input', { type: 'number', id: `kpi-p-${m.key}`, value: mcfg.penalty || 5, min: 1, max: 50, style: 'width:60px' }),
            h('span', { class: 'hint' }, ' %/' + (m.unit === 'times' ? t('time') : t('min')))
          )
        );
      });

      const saveBtn = button(t('Save KPI settings'), {
        kind: 'primary', id: 'btn-kpi-save',
        on: {
          click: async () => {
            const newCfg = {};
            metrics.forEach((m) => {
              const en  = globalThis.document.getElementById(`kpi-en-${m.key}`);
              const w   = globalThis.document.getElementById(`kpi-w-${m.key}`);
              const thr = globalThis.document.getElementById(`kpi-t-${m.key}`);
              const pen = globalThis.document.getElementById(`kpi-p-${m.key}`);
              newCfg[m.key] = {
                enabled:   en  ? en.checked : false,
                weight:    w   ? Number(w.value)   : 20,
                threshold: thr ? Number(thr.value) : 1,
                penalty:   pen ? Number(pen.value) : 5
              };
            });
            try {
              await ctx.api.call('updateKpiConfig', { config: newCfg });
              toast(t('KPI settings saved'), 'ok');
            } catch (e) { toastError(e); }
          }
        }
      });

      kpiCard.replaceChildren(
        h('h2', {}, '📊 ' + t('KPI Configuration')),
        h('p', { class: 'hint' }, t('Choose which metrics count toward the KPI score, their weight (%), the allowed threshold before deductions start, and the deduction per unit above the threshold.')),
        h('div', { style: 'overflow-x:auto' },
          h('table', { class: 'data-table', style: 'min-width:600px' },
            h('thead', {},
              h('tr', {},
                h('th', {}, t('Metric')),
                h('th', {}, t('Active')),
                h('th', {}, t('Weight')),
                h('th', {}, t('Threshold (allowed)')),
                h('th', {}, t('Deduction per unit'))
              )
            ),
            h('tbody', {}, ...kpiRows)
          )
        ),
        h('div', { style: 'margin-top:12px' }, saveBtn)
      );
    } catch (e) { kpiCard.replaceChildren(errorBox(e)); }
  }

  load(); loadArchive(); loadKpi();

  return {
    el: h('div', {},
      h('h1', {}, t('Settings')),
      box,
      arch,
      kpiCard
    )
  };
}
