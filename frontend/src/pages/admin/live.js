import { h, mount, clear } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtTime, agoText, todayLocal } from '../../core/time.js';
import { badge, listPage, errorBox } from '../../components/ui.js';
import { createMap, drawBranches, drawPoint, fit } from './map.js';
import { locationCell, detailLink } from './dashboard.js';

export async function livePage(ctx) {
  const mapBox = h('div', { id: 'live-map', class: 'map', role: 'img', 'aria-label': t('Map of active employees') }), mapNote = h('p', { class: 'hint', id: 'map-note' });
  let m = null, mapTried = false;
  async function drawMap(items) {
    if (!mapTried) { mapTried = true; m = await createMap(mapBox); if (!m) { mapBox.hidden = true; mapNote.textContent = t('Map unavailable (offline or blocked). The table below is complete.'); } }
    if (!m) return; m.layer.clearLayers(); const pts = [], seen = {};
    items.forEach((r) => { if (r.branch_latitude != null && !seen[r.branch_id]) { seen[r.branch_id] = 1; drawBranches(m, [{ name: r.branch_name, latitude: r.branch_latitude, longitude: r.branch_longitude, radius: r.branch_radius_meters }]); pts.push([r.branch_latitude, r.branch_longitude]); } });
    items.forEach((r) => { if (r.last_latitude != null) { drawPoint(m, { lat: r.last_latitude, lng: r.last_longitude, state: r.location_state, label: `${r.employee_name} - ${r.location_state}${r.tracking_unavailable ? ' (tracking unavailable)' : ''}` }); pts.push([r.last_latitude, r.last_longitude]); } });
    if (!m.fitted && pts.length) { fit(m, pts); m.fitted = true; } else m.map.invalidateSize();
  }
  const lp = listPage({
    auto: 20000,
    columns: [{ key: 'employee_name', label: 'Name', render: (r) => h('span', {}, h('strong', {}, r.employee_name), h('br'), h('small', {}, r.employee_id)) }, { key: 'branch_name', label: 'Branch' }, { key: 'attendance_state', label: 'Current status', render: (r) => badge(r.attendance_state) },
      { key: 'last_location_at', label: 'Last GPS update', render: (r) => (r.last_location_at ? `${fmtTime(r.last_location_at)} (${agoText(r.last_location_at)})` : '-') },
      { key: 'last_distance_meters', label: 'Distance from branch', render: (r) => (r.last_distance_meters != null ? `${Math.round(r.last_distance_meters)} m` : '-') }, { key: 'location_state', label: 'Inside / outside', render: locationCell },
      { key: 'check_in_time', label: 'Check-in', render: (r) => fmtTime(r.check_in_time) }, { key: 'shift_name', label: 'Shift' }, { key: 'actions', label: 'Actions', render: detailLink }],
    empty: t('No employees are currently on duty.'),
    async load() {
      const res = await ctx.api.call('getCurrentStatuses', { date: todayLocal(), page_size: 500 }); const active = res.items.filter((r) => r.attendance_state === 'CHECKED_IN');
      drawMap(active); return { items: active };
    }
  });
  return { el: h('div', {}, h('h1', {}, t('Live Monitoring')), h('p', { class: 'hint' }, t('Refreshes automatically every 20 seconds. "Tracking unavailable" means no recent GPS data - it does not mean the employee left the branch.')), mapBox, mapNote, lp.el), destroy: lp.stop };
}
