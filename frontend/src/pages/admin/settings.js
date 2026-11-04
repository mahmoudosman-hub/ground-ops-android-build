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

  // ── Late Permission card (d82) ────────────────────────────────────
  const lateCard = h('section', { class: 'card', id: 'late-permission-card' });

  async function loadLatePermission() {
    if (!can) return;
    try {
      // القيمة الحالية من السيرفر — لو الأكشن لسه مش متضاف في Apps Script يرجع 15 كافتراضي
      const current = await ctx.api.call('getLatePermissionMinutes', {}).catch(() => ({ minutes: 15 }));
      const mins = current.minutes != null ? current.minutes : 15;

      const input = h('input', {
        type: 'number', min: 0, max: 120, value: mins,
        style: 'width:80px;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:1rem;background:var(--bg);color:var(--text)'
      });

      const saveBtn = button(t('Save'), {
        kind: 'primary', small: true,
        on: {
          click: async () => {
            const val = Number(input.value);
            if (isNaN(val) || val < 0 || val > 120) { toast(t('Value must be between 0 and 120'), 'warn'); return; }
            try {
              await ctx.api.call('updateLatePermissionMinutes', { minutes: val });
              toast(t('Saved ✅'), 'ok');
            } catch (e) { toastError(e); }
          }
        }
      });

      lateCard.replaceChildren(
        h('h2', {}, t('⏰ Late permission')),
        h('p', { class: 'hint' }, t('Minimum time (in minutes) before shift start for the captain to submit a late permission request.')),
        h('div', { style: 'display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap' },
          h('span', { style: 'font-weight:600' }, t('Allowed time:')),
          input,
          h('span', { style: 'color:var(--muted)' }, t('minutes before the shift')),
          saveBtn
        ),
        h('p', { class: 'hint', style: 'margin-top:8px' }, t('Example: 15 means the captain must send the request at least 15 minutes before the shift.'))
      );
    } catch (e) { lateCard.replaceChildren(errorBox(e)); }
  }

  // ── KPI Configuration card (تصميم جديد - بطاقات) ─────────────────
  const kpiCard = h('section', { class: 'card', id: 'kpi-card' });

  // أيقونة لكل معيار
  const METRIC_ICONS = {
    late:                 '⏰',
    late_minutes:         '⏱️',
    absent:               '🚫',
    early_checkout:       '🏃',
    missing_checkout:     '📋',
    break_exceeded:       '☕',
    break_exceeded_count: '🔁',
    geofence_exits:       '📍',
    geofence_minutes:     '🗺️',
    geofence_longest:     '📏',
    gps_gaps:             '📡',
    gps_gaps_count:       '📶',
    tracking_unavailable: '⚠️'
  };

  // لون الكارت حسب الفئة
  function metricColor(key) {
    if (['late','late_minutes'].includes(key))                       return '#E65100';
    if (['absent','missing_checkout','early_checkout'].includes(key)) return '#C62828';
    if (['break_exceeded','break_exceeded_count'].includes(key))      return '#F57F17';
    if (['geofence_exits','geofence_minutes','geofence_longest'].includes(key)) return '#1565C0';
    return '#2E7D32';
  }

  async function loadKpi() {
    if (!can) return;
    kpiCard.replaceChildren(spinner());
    try {
      const { metrics, config } = await ctx.api.call('getKpiConfig', {});

      // بناء الكروت
      const cards = metrics.map((m) => {
        const mcfg  = config[m.key] || {};
        const icon  = METRIC_ICONS[m.key] || '📊';
        const color = metricColor(m.key);
        const enabled = !!mcfg.enabled;
        const unitLabel = m.unit === 'times' ? t('times') : t('min');

        const card = h('div', {
          class: 'kpi-metric-card',
          id: `kpi-card-${m.key}`,
          style: `background:var(--card);border:2px solid ${enabled ? color : 'var(--line)'};border-radius:12px;padding:14px;transition:border-color .2s`
        },
          // Header: أيقونة + اسم + toggle
          h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px' },
            h('span', { style: `font-size:1.5rem;width:36px;height:36px;border-radius:8px;background:${color}22;display:flex;align-items:center;justify-content:center` }, icon),
            h('div', { style: 'flex:1' },
              h('strong', { style: 'display:block;font-size:.9rem' }, m.label),
              h('small', { style: 'color:var(--muted);font-size:.78rem' }, unitLabel)
            ),
            // Toggle switch
            h('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer' },
              h('input', {
                type: 'checkbox',
                id: `kpi-en-${m.key}`,
                checked: enabled,
                style: 'width:20px;height:20px;accent-color:' + color,
                on: {
                  change: (e) => {
                    const c = document.getElementById(`kpi-card-${m.key}`);
                    if (c) c.style.borderColor = e.target.checked ? color : 'var(--line)';
                  }
                }
              })
            )
          ),

          // شرح مبسط للكارت
          h('div', { style: 'background:var(--mute-bg);border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:.8rem;color:var(--muted);line-height:1.5' },
            h('span', {}, '⚖️ '), h('strong', {}, t('Weight')), h('span', {}, ': ' + t('Importance of this metric in the overall KPI score') + '  '),
            h('br'),
            h('span', {}, '✅ '), h('strong', {}, t('Allowed')), h('span', {}, ': ' + t('Number of allowed {u} before deductions start', { u: unitLabel }) + '  '),
            h('br'),
            h('span', {}, '📉 '), h('strong', {}, t('Deduct')), h('span', {}, ': ' + t('Percentage deducted from the KPI score per {u} over the allowed limit', { u: unitLabel }))
          ),

          // Fields: وزن + حد + خصم في صف واحد
          h('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px' },
            // الوزن
            h('div', {},
              h('label', { style: 'display:block;font-size:.75rem;color:var(--muted);margin-bottom:4px;font-weight:600', title: t('Importance of this metric in the overall KPI score') }, '⚖️ ' + t('Weight')),
              h('div', { style: 'display:flex;align-items:center;gap:4px' },
                h('input', { type: 'number', id: `kpi-w-${m.key}`, value: mcfg.weight || 20, min: 1, max: 100, style: 'width:100%;padding:6px;border:1px solid var(--line);border-radius:6px;font-size:.85rem;background:var(--bg);color:var(--text)' }),
                h('span', { style: 'font-size:.75rem;color:var(--muted);white-space:nowrap' }, '%')
              )
            ),
            // الحد المسموح
            h('div', {},
              h('label', { style: 'display:block;font-size:.75rem;color:var(--muted);margin-bottom:4px;font-weight:600', title: t('The accepted amount before any deduction') }, '✅ ' + t('Allowed')),
              h('div', { style: 'display:flex;align-items:center;gap:4px' },
                h('input', { type: 'number', id: `kpi-t-${m.key}`, value: mcfg.threshold || 1, min: 0, max: 999, style: 'width:100%;padding:6px;border:1px solid var(--line);border-radius:6px;font-size:.85rem;background:var(--bg);color:var(--text)' }),
                h('span', { style: 'font-size:.75rem;color:var(--muted);white-space:nowrap' }, unitLabel)
              )
            ),
            // الخصم
            h('div', {},
              h('label', { style: 'display:block;font-size:.75rem;color:var(--muted);margin-bottom:4px;font-weight:600', title: t('Deduction percentage per unit over the allowed limit') }, '📉 ' + t('Deduct')),
              h('div', { style: 'display:flex;align-items:center;gap:4px' },
                h('input', { type: 'number', id: `kpi-p-${m.key}`, value: mcfg.penalty || 5, min: 1, max: 50, style: 'width:100%;padding:6px;border:1px solid var(--line);border-radius:6px;font-size:.85rem;background:var(--bg);color:var(--text)' }),
                h('span', { style: 'font-size:.75rem;color:var(--muted);white-space:nowrap' }, '%')
              )
            )
          )
        );
        return card;
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
                enabled:   en  ? en.checked        : false,
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
        h('p', { class: 'hint' }, t('Enable the metrics you want, and set for each:')),
        h('ul', { class: 'hint', style: 'margin:4px 0 12px;padding-inline-start:20px;line-height:1.8' },
          h('li', {}, h('strong', {}, '⚖️ ' + t('Weight')), t(' — how important this metric is compared to the others (e.g. Late 30% vs Absent 20% means Late matters more)')),
          h('li', {}, h('strong', {}, '✅ ' + t('Allowed')), t(' — the normal accepted amount before we start deducting (e.g. one late arrival per month is fine)')),
          h('li', {}, h('strong', {}, '📉 ' + t('Deduct')), t(' — percentage deducted from the KPI score per unit over the limit (e.g. each extra late arrival = -5%)'))
        ),
        h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:14px 0' }, ...cards),
        h('div', { style: 'margin-top:4px' }, saveBtn)
      );
    } catch (e) { kpiCard.replaceChildren(errorBox(e)); }
  }

  load(); loadArchive(); loadKpi(); loadLatePermission();

  return {
    el: h('div', {},
      h('h1', {}, t('Settings')),
      box,
      arch,
      lateCard,
      kpiCard
    )
  };
}
