import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { badge, button, listPage, openModal, buildForm, opt, toast, toastError, confirmDialog } from '../../components/ui.js';
import { createMap } from './map.js';
import { selectProvider } from '../../services/location/index.js';

export async function branchesPage(ctx) {
  const can = (p) => ctx.user.permissions.includes(p);
  const lp = listPage({
    filters: [{ name: 'status', label: 'Status', type: 'select', options: [opt('', t('All')), opt('ACTIVE', t('Active')), opt('INACTIVE', t('Inactive'))] }],
    toolbar: can('create_branches') ? button(t('Add branch'), { kind: 'primary', id: 'btn-add-branch', on: { click: () => editor() } }) : null,
    columns: [{ key: 'branch_name', label: 'Branch' }, { key: 'address', label: 'Address' }, { key: 'latitude', label: 'Latitude' }, { key: 'longitude', label: 'Longitude' }, { key: 'geofence_radius_meters', label: 'Radius (m)' }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      { key: 'actions', label: 'Actions', render: (r) => h('span', { class: 'btn-row' }, can('edit_branches') ? button(t('Edit'), { small: true, on: { click: () => editor(r) } }) : null,
        r.status === 'ACTIVE' ? (can('deactivate_branches') ? button(t('Deactivate'), { small: true, kind: 'danger', on: { click: () => deactivate(r) } }) : null) : (can('edit_branches') ? button(t('Reactivate'), { small: true, on: { click: () => setStatus(r, 'ACTIVE') } }) : null)) }],
    async load(f) { const res = await ctx.api.call('getBranches', f.status ? { status: f.status } : {}); return { items: res.branches }; }
  });
  function editor(row) {
    const edit = !!row, m = openModal({ title: edit ? t('Edit branch') : t('Add branch'), body: null, wide: true }); let pin = null, mapObj = null;
    const f = buildForm([{ name: 'branch_name', label: 'Branch name', required: true }, { name: 'address', label: 'Address' }, { name: 'latitude', label: 'Latitude', type: 'number', step: 'any', required: true, min: -90, max: 90 }, { name: 'longitude', label: 'Longitude', type: 'number', step: 'any', required: true, min: -180, max: 180 },
      { name: 'geofence_radius_meters', label: 'Geofence radius (meters)', type: 'number', min: 20, max: 5000, step: 1, required: true, value: 300 }], row || {}, {
      cancel: () => m.close(), onSubmit: async (v) => {
        if (edit) await ctx.api.call('updateBranch', { branch_id: row.branch_id, ...v }); else await ctx.api.call('createBranch', v);
        m.close(); toast(t('Saved'), 'ok'); ctx.lookups.invalidate(); lp.reload();
      } });
    const place = (lat, lng) => { f.set('latitude', +lat.toFixed(6)); f.set('longitude', +lng.toFixed(6)); if (mapObj) { if (pin) pin.setLatLng([lat, lng]); else pin = mapObj.L.marker([lat, lng]).addTo(mapObj.map); } };
    const here = button(t('Use my current location'), { small: true, id: 'btn-here', on: { click: async () => { try { const p = await selectProvider().getPosition({ timeoutMs: 15000 }); place(p.latitude, p.longitude); if (mapObj) mapObj.map.setView([p.latitude, p.longitude], 17); } catch (e) { toastError({ code: 'GPS_UNAVAILABLE' }); } } } });
    const box = h('div', { class: 'map map-picker', id: 'picker-map' }), note = h('p', { class: 'hint' }, t('Click the map to set the branch location, or type the coordinates.'));
    m.setBody(h('div', { class: 'two-col' }, f.el, h('div', {}, box, note, here)));
    createMap(box, { lat: row ? row.latitude : 30.0456, lng: row ? row.longitude : 31.2129, zoom: row ? 17 : 12 }).then((mp) => {
      if (!mp) { box.hidden = true; note.textContent = t('Map unavailable - enter latitude and longitude manually.'); return; }
      mapObj = mp; if (row) place(row.latitude, row.longitude); mp.map.on('click', (e) => place(e.latlng.lat, e.latlng.lng)); setTimeout(() => mp.map.invalidateSize(), 150);
    });
  }
  async function setStatus(r, status) { try { await ctx.api.call('updateBranch', { branch_id: r.branch_id, status }); toast(t('Saved'), 'ok'); ctx.lookups.invalidate(); lp.reload(); } catch (e) { toastError(e); } }
  async function deactivate(r) { if (!(await confirmDialog(t('Deactivate branch {n}?', { n: r.branch_name }), { danger: true }))) return; try { await ctx.api.call('deactivateBranch', { branch_id: r.branch_id }); toast(t('Deactivated'), 'ok'); ctx.lookups.invalidate(); lp.reload(); } catch (e) { toastError(e); } }
  return { el: h('div', {}, h('h1', {}, t('Branches')), lp.el) };
}
