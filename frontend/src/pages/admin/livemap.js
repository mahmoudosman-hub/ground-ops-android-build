import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtTime, agoText } from '../../core/time.js';
import { badge, button, listPage, toast, toastError } from '../../components/ui.js';
import { createMap, drawPoint, fit } from './map.js';

function freshness(r) {
  if (r.latitude == null || r.latitude === '' || r.minutes_since_location == null) return 'LOST';
  if (r.minutes_since_location <= 20) return 'FRESH';
  if (r.minutes_since_location <= 45) return 'STALE';
  return 'LOST';
}

/** تاب "الخريطة والنبضات": خريطة حية مجانية (OpenStreetMap) لآخر مواقع الكباتن
 *  + عدّاد النبضات بدون رد + زر نبضة فورية + حالة متابعة خرائط جوجل. */
export async function liveMapPage(ctx) {
  const mapBox = h('div', { id: 'ping-map', class: 'map', role: 'img', 'aria-label': t('Map of captains on duty') });
  const mapNote = h('p', { class: 'hint', id: 'ping-map-note' });
  let m = null, mapTried = false;

  async function drawMap(items) {
    if (!mapTried) { mapTried = true; m = await createMap(mapBox); if (!m) { mapBox.hidden = true; mapNote.textContent = t('Map unavailable (offline or blocked). The table below is complete.'); } }
    if (!m) return;
    m.layer.clearLayers();
    const pts = [];
    items.forEach((r) => {
      if (r.latitude == null || r.latitude === '') return;
      const st = freshness(r);
      const mins = r.minutes_since_location == null ? '-' : r.minutes_since_location + ' min';
      drawPoint(m, { lat: Number(r.latitude), lng: Number(r.longitude), state: st, label: `${r.employee_name} - ${t('Last location')}: ${mins}` });
      pts.push([Number(r.latitude), Number(r.longitude)]);
    });
    if (!m.fitted && pts.length) { fit(m, pts); m.fitted = true; } else m.map.invalidateSize();
  }

  async function pingNow(r) {
    try {
      const res = await ctx.api.call('pingEmployeeNow', { employee_id: r.employee_id });
      if (res && res.sent) toast(t('Ping sent'), 'ok');
      else toast(t('No registered device for this captain'), 'info');
      lpRef.reload();
    } catch (e) { toastError(e); }
  }

  async function toggleGmaps(r) {
    try {
      await ctx.api.call('setGmapsSharing', { employee_id: r.employee_id, shared: !r.gmaps_shared });
      toast(t(r.gmaps_shared ? 'Removed from Google Maps watchlist' : 'Marked as sharing on Google Maps'), 'ok');
      lpRef.reload();
    } catch (e) { toastError(e); }
  }

  let lpRef = null;
  let showAll = false; // الافتراضي: الشغالين في الشيفت بس — الصحاب خارج الشيفت مخفيين
  const lp = lpRef = listPage({
    auto: 60000,
    toolbar: [
      button(t('Refresh'), { id: 'btn-map-refresh', kind: 'primary', on: { click: () => lpRef.reload() } }),
      h('label', { class: 'hint', style: 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap' },
        h('input', { type: 'checkbox', id: 'chk-show-all', on: { change: (e) => { showAll = e.target.checked; lpRef.reload(); } } }),
        t('Show off-duty too')),
      h('span', { class: 'hint' }, t('Updates every minute. Green = fresh (20 min), orange = getting old (45 min), red = no location.'))
    ],
    columns: [
      { key: 'employee_name', label: 'Name', render: (r) => h('span', {}, h('strong', {}, r.employee_name), h('br'), h('small', {}, r.employee_id)) },
      { key: 'shift_active', label: 'On duty', render: (r) => badge(r.shift_active ? 'ON_DUTY' : 'OFF', r.shift_active ? t('On duty') : t('Off')) },
      { key: 'last_location_at', label: 'Last location', render: (r) => (r.last_location_at ? `${fmtTime(r.last_location_at)} (${agoText(r.last_location_at)})` : '-') },
      { key: 'pings_unanswered', label: 'Pings without reply', render: (r) => (r.pings_unanswered ? h('strong', { style: 'color:#c62828' }, String(r.pings_unanswered)) : '0') },
      { key: 'last_ping_at', label: 'Last ping', render: (r) => (r.last_ping_at ? agoText(r.last_ping_at) : '-') },
      { key: 'gmaps_shared', label: 'Google Maps', render: (r) => button(r.gmaps_shared ? t('Watching') : t('Watch'), { small: true, class: r.gmaps_shared ? 'x' : '', on: { click: () => toggleGmaps(r) } }) },
      { key: 'actions', label: 'Actions', render: (r) => h('span', { class: 'btn-row' }, button(t('Ping now'), { small: true, kind: 'primary', on: { click: () => pingNow(r) } })) }
    ],
    empty: t('No captains on duty right now. Tick "Show off-duty too" above to see everyone.'),
    async load() {
      const res = await ctx.api.call('getLiveMap', {});
      const items = (res && res.items) || [];
      const onDuty = items.filter((r) => r.shift_active);
      const rows = showAll ? items : onDuty; // بدون العلم: الشغالين في الشيفت بس
      drawMap(rows);
      const before = h('p', { class: 'hint' }, t('Captains on duty now: {n} of {total}', { n: String(onDuty.length), total: String(items.length) }));
      return { items: rows, before };
    }
  });

  return {
    el: h('div', {},
      h('h1', {}, t('Map & Pings')),
      h('p', { class: 'hint' }, t('Live map of captains on duty (iPhone PWA + Android). The system pings captains whose location is stale every 15 minutes; the counter shows pings without a reply.')),
      mapBox, mapNote, lp.el),
    destroy: lp.stop
  };
}
