import { h, mount, clear } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtTime, agoText, todayLocal } from '../../core/time.js';
import { badge, button, listPage, errorBox, confirmDialog, toast, toastError } from '../../components/ui.js';
import { createMap, drawBranches, drawPoint, fit } from './map.js';
import { locationCell, detailLink, AUTO_REFRESH_MS, effectiveLocationState } from './dashboard.js';

/** صفحة "المراقبة المباشرة" الموحدة
 *  d101: عمود «عداد البريك» — كابتن في بريك حاليًا = عدّاد حي بيعد بالثواني من بداية البريك (بيبان لك دايماً بقاله كام دقيقة)
 *  والإجمالي التراكمي للشيفت بيكمل عالتايم المحفوظ من السيرفر لما يقفل البريك ويأخد بريك تاني (مرساة server_time)
 *  d100: عمود المتابعة القديم باللينك (Watch + ✅ شغال) اتشال نهائيًا — قرار المالك: التتبع الرسمي Traccar Client بس،
 *  والنبض الحقيقي بيحدّث last_location_at تلقائيًا فمش محتاج تأكيد يدوي للإدمن */
export async function livePage(ctx) {
  const mapBox = h('div', { id: 'live-map', class: 'map', role: 'img', 'aria-label': t('Map of active employees') }), mapNote = h('p', { class: 'hint', id: 'map-note' });
  let m = null, mapTried = false;
  async function drawMap(items) {
    if (!mapTried) { mapTried = true; m = await createMap(mapBox); if (!m) { mapBox.hidden = true; mapNote.textContent = t('Map unavailable (offline or blocked). The table below is complete.'); } }
    if (!m) return; m.layer.clearLayers(); const pts = [], seen = {};
    items.forEach((r) => { if (r.branch_latitude != null && !seen[r.branch_id]) { seen[r.branch_id] = 1; drawBranches(m, [{ name: r.branch_name, latitude: r.branch_latitude, longitude: r.branch_longitude, radius: r.branch_radius_meters }]); pts.push([r.branch_latitude, r.branch_longitude]); } });
    items.forEach((r) => { if (r.last_latitude != null) { const eff = effectiveLocationState(r); const stTxt = { INSIDE: t('Inside branch'), OUTSIDE: t('Outside branch'), UNKNOWN: t('Location unknown'), OFF_GRID: t('Off the grid') }[eff] || eff; drawPoint(m, { lat: r.last_latitude, lng: r.last_longitude, state: eff, label: `${r.employee_name} - ${stTxt}${(eff === 'UNKNOWN' && r.tracking_unavailable) ? ' (' + t('Tracking unavailable') + ')' : ''}` }); pts.push([r.last_latitude, r.last_longitude]); } });
    if (!m.fitted && pts.length) { fit(m, pts); m.fitted = true; } else m.map.invalidateSize();
  }
  let lpRef = null;
  async function endBreak(r) { if (!(await confirmDialog(t('End the break of {n}? Location tracking resumes for them.', { n: r.employee_name })))) return; try { await ctx.api.call('adminEndBreak', { employee_id: r.employee_id }); toast(t('Break ended'), 'ok'); lpRef.reload(); } catch (e) { toastError(e); } }
  async function endShift(r) { if (!(await confirmDialog(t('End the shift of {n}? Their open break ends too, and they can check in again right after.', { n: r.employee_name }), { okLabel: t('End shift'), danger: true }))) return; try { const res = await ctx.api.call('adminEndShift', { employee_id: r.employee_id, reason: 'admin-dashboard' }); toast(res && res.closed_shifts ? t('Shift ended') : t('No open shift for this captain'), res && res.closed_shifts ? 'ok' : 'info'); lpRef.reload(); } catch (e) { toastError(e); } }
  async function pingNow(r) {
    try {
      const res = await ctx.api.call('pingEmployeeNow', { employee_id: r.employee_id });
      if (res && res.sent) toast(t('Ping sent'), 'ok');
      else toast(t('No registered device for this captain'), 'info');
      lpRef.reload();
    } catch (e) { toastError(e); }
  }

  // ── d101: عداد البريك الحي ──
  // مرساة وقت السيرفر (server_time) لآخر تحميل: الإجمالي المحفوظ (break_used_minutes) بيكمل عليه عدّ حي طالما الكابتن لسه في البريك
  let serverAnchorMs = Date.now();
  const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`; };
  function breakCell(r) {
    const used = Number(r.break_used_minutes) || 0, onBrk = !!(r.on_break && r.break_started_at);
    if (!onBrk && used <= 0) return h('span', { class: 'hint' }, '—');
    const parts = [];
    if (onBrk) {
      parts.push(h('span', { class: 'brk-live' }, badge('ON_BREAK'),
        h('span', { class: 'brk-timer' + (r.break_exceeded ? ' brk-over' : ''), dir: 'ltr', dataset: { brkStart: r.break_started_at } }, mmss(Date.now() - Date.parse(r.break_started_at)))));
      if (r.break_exceeded) parts.push(badge('BREAK_EXCEEDED'));
    }
    parts.push(h('span', { class: 'brk-total', dataset: { brkUsed: String(used), brkOn: onBrk ? '1' : '', brkAnchor: String(serverAnchorMs) } }, t('Total break this shift: {m} min', { m: used })));
    return h('span', { class: 'brk-cell' }, ...parts);
  }
  // مُعدّ الثواني: عداد الجلسة المفتوحة بيتحدث كل ثانية + الإجمالي بيكمل من التايم المحفوظ (من غيره مفيش عدّ بين التحميلات)
  const ticker = setInterval(() => {
    const doc = globalThis.document, now = Date.now(); if (!doc) return;
    doc.querySelectorAll('.brk-timer[data-brk-start]').forEach((el) => { const st = Date.parse(el.dataset.brkStart); if (!isNaN(st)) el.textContent = mmss(now - st); });
    doc.querySelectorAll('.brk-total[data-brk-used]').forEach((el) => {
      const used = Number(el.dataset.brkUsed) || 0, drift = el.dataset.brkOn === '1' ? Math.max(0, now - (Number(el.dataset.brkAnchor) || now)) : 0;
      el.textContent = t('Total break this shift: {m} min', { m: Math.floor((used * 60000 + drift) / 60000) });
    });
  }, 1000);

  const lp = lpRef = listPage({
    auto: AUTO_REFRESH_MS,
    toolbar: [
      button(t('Refresh'), { id: 'btn-refresh', kind: 'primary', on: { click: () => lpRef.reload() } }),
      h('span', { class: 'hint' }, t('Updates automatically every 10 minutes. Press Refresh for the latest data now.'))
    ],
    columns: [
      { key: 'employee_name', label: 'Name', render: (r) => h('span', {}, h('strong', {}, r.employee_name), h('br'), h('small', {}, r.employee_id)) },
      { key: 'branch_name', label: 'Branch' },
      { key: 'attendance_state', label: 'Current status', render: (r) => badge(r.attendance_state) },
      { key: 'break_timer', label: 'Break timer', render: (r) => breakCell(r) },
      { key: 'last_location_at', label: 'Last GPS update', render: (r) => (r.last_location_at ? `${fmtTime(r.last_location_at)} (${agoText(r.last_location_at)})` : '-') },
      { key: 'last_distance_meters', label: 'Distance from branch', render: (r) => (r.last_distance_meters != null ? `${Math.round(r.last_distance_meters)} m` : '-') },
      { key: 'location_state', label: 'Inside / outside', render: locationCell },
      { key: 'check_in_time', label: 'Check-in', render: (r) => fmtTime(r.check_in_time) },
      { key: 'shift_name', label: 'Shift' },
      { key: 'pings_unanswered', label: 'Pings without reply', render: (r) => (r.pings_unanswered ? h('strong', { style: 'color:#c62828' }, String(r.pings_unanswered)) : '0') },
      { key: 'last_ping_at', label: 'Last ping', render: (r) => (r.last_ping_at ? agoText(r.last_ping_at) : '-') },
      {
        key: 'actions',
        label: 'Actions',
        render: (r) => h('span', { class: 'btn-row' },
          detailLink(r),
          r.on_break && ctx.user.permissions.includes('assign_shifts')
            ? button(t('End break'), { small: true, class: 'x', on: { click: () => endBreak(r) } })
            : null,
          ctx.user.permissions.includes('assign_shifts')
            ? button(t('End shift'), { small: true, class: 'x', on: { click: () => endShift(r) } })
            : null,
          button(t('Ping now'), { small: true, kind: 'primary', on: { click: () => pingNow(r) } })
        )
      }
    ],
    empty: t('No employees are currently on duty.'),
    async load() {
      // parallel calls — بيشتغلوا مع بعض مش متتاليين
      const [res, lmRes] = await Promise.all([
        ctx.api.call('getCurrentStatuses', { date: todayLocal(), page_size: 500 }),
        ctx.api.call('getLiveMap', {}).catch(() => null)
      ]);
      serverAnchorMs = (res && res.server_time) ? Date.parse(res.server_time) : Date.now();
      const active = res.items.filter((r) => r.attendance_state === 'CHECKED_IN');
      const pings = {};
      ((lmRes && lmRes.items) || []).forEach((x) => { pings[x.employee_id] = x; });
      const merged = active.map((r) => {
        const p = pings[r.employee_id] || {};
        return Object.assign({}, r, {
          pings_unanswered: p.pings_unanswered || 0,
          last_ping_at:     p.last_ping_at     || ''
        });
      });
      drawMap(merged);
      return { items: merged };
    }
  });

  return {
    el: h('div', {},
      h('h1', {}, t('Live Monitoring')),
      h('p', { class: 'hint' }, t('"On break" means the captain is allowed to have location off. "Tracking unavailable" means no recent GPS data - it does not mean the employee left the branch.')),
      h('p', { class: 'hint' }, t('Break counter: it counts up live while a captain is on break, and the total keeps the saved minutes when he takes another break.')),
      h('p', { class: 'hint' }, t('Pings: the system automatically pings captains whose location is stale (every 15 minutes). "Pings without reply" shows who did not respond, and "Ping now" sends a ping yourself.')),
      h('p', { class: 'hint' }, t('GPS grace period: for up to 15 minutes after his last GPS update the captain keeps his last known state (green "Inside branch"). Only after a full 15 minutes with no GPS update does he show as "Off the grid".')),
      h('p', { class: 'hint' }, t('Tip: the table scrolls sideways - drag the bar under the table (or hold Shift and roll the mouse wheel) to see the rest of the columns.')),
      mapBox, mapNote, lp.el),
    destroy() { lp.stop(); clearInterval(ticker); }
  };
}
