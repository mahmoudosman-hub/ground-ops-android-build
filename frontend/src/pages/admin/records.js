/** Attendance, location history, geofence events, leaves, audit logs. */
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtTime, fmtDateTime, addDays, todayLocal, minutesText } from '../../core/time.js';
import { badge, button, listPage, openModal, buildForm, opt, toast, toastError, confirmDialog, spinner } from '../../components/ui.js';
import { clean } from './lookups.js';
import { createMap, drawBranches, drawPoint, fit } from './map.js';

export const ATT_STATUS = ['', 'ON_TIME', 'LATE', 'PENDING', 'REJECTED', 'OUTSIDE_GEOFENCE', 'GPS_UNAVAILABLE'];
export async function showSelfie(ctx, attendanceId, which = 'check_in') {
  const m = openModal({ title: which === 'check_out' ? t('Check-out selfie') : t('Check-in selfie'), body: spinner(), wide: false });
  try { const r = await ctx.api.call('getSelfie', { attendance_id: attendanceId, which }); m.setBody(h('img', { class: 'selfie-preview', alt: t('Selfie'), src: `data:${r.mime};base64,${r.data_base64}` })); } catch (e) { m.close(); toastError(e); }
}

export async function attendancePage(ctx) {
  const l = await ctx.lookups.load(), today = todayLocal(), can = (p) => ctx.user.permissions.includes(p);
  const lp = listPage({
    filters: [{ name: 'date_from', label: 'From', type: 'date', value: today }, { name: 'date_to', label: 'To', type: 'date', value: today }, { name: 'employee_id', label: 'Employee', type: 'select', options: ctx.lookups.employeeOpts(l) }, { name: 'branch_id', label: 'Branch', type: 'select', options: ctx.lookups.branchOpts(l) },
      { name: 'status', label: 'Status', type: 'select', options: ATT_STATUS.map((s) => opt(s, s ? s.replace(/_/g, ' ') : t('All'))) }],
    columns: [{ key: 'work_date', label: 'Date' }, { key: 'employee_id', label: 'Employee', render: (r) => h('a', { href: `#/employee?id=${r.employee_id}&date=${r.work_date}` }, `${r.employee_id} ${(l.employees.find((e) => e.employee_id === r.employee_id) || {}).employee_name || ''}`) },
      { key: 'check_in_time', label: 'Check-in', render: (r) => fmtTime(r.check_in_time) }, { key: 'check_out_time', label: 'Check-out', render: (r) => fmtTime(r.check_out_time) }, { key: 'attendance_status', label: 'Status', render: (r) => h('span', { class: 'badges' }, badge(r.attendance_status, r.attendance_status === 'LATE' ? `Late ${r.late_minutes} min` : undefined), (r.flags || []).map((f) => badge(f))) },
      { key: 'check_in_distance_meters', label: 'Check-in distance', render: (r) => (r.check_in_distance_meters != null ? `${Math.round(r.check_in_distance_meters)} m` : '-') }, { key: 'early_checkout_minutes', label: 'Early out', render: (r) => (r.early_checkout_minutes ? minutesText(r.early_checkout_minutes) : '-') },
      { key: 'selfie', label: 'Selfie', render: (r) => (can('view_selfies') && (r.selfie_available || r.checkout_selfie_available) ? h('span', { class: 'btn-row' }, r.selfie_available ? button(t('View'), { small: true, on: { click: () => showSelfie(ctx, r.attendance_id) } }) : null, r.checkout_selfie_available ? button(t('View check-out'), { small: true, on: { click: () => showSelfie(ctx, r.attendance_id, 'check_out') } }) : null) : '-') }],
    async load(f, page) { const res = await ctx.api.call('getAttendance', { ...clean(f), page, page_size: 50 }); return { items: res.items, total: res.total, page: res.page, page_size: res.page_size }; }
  });
  return { el: h('div', {}, h('h1', {}, t('Attendance')), lp.el) };
}

export async function locationHistoryPage(ctx) {
  const l = await ctx.lookups.load(), mapBox = h('div', { class: 'map', id: 'history-map' }), note = h('p', { class: 'hint' }); let m = null, tried = false;
  async function draw(items, branch) {
    if (!tried) { tried = true; m = await createMap(mapBox); if (!m) { mapBox.hidden = true; note.textContent = t('Map unavailable. The table is complete.'); } }
    if (!m) return; m.layer.clearLayers(); const pts = [];
    if (branch) { drawBranches(m, [branch]); pts.push([branch.latitude, branch.longitude]); }
    items.forEach((r) => { drawPoint(m, { lat: r.latitude, lng: r.longitude, state: r.inside_geofence ? 'INSIDE' : 'OUTSIDE', label: `${fmtTime(r.timestamp)} ${r.inside_geofence ? 'inside' : 'outside'}` }); pts.push([r.latitude, r.longitude]); }); fit(m, pts);
  }
  const lp = listPage({
    filters: [{ name: 'employee_id', label: 'Employee', type: 'select', required: true, options: ctx.lookups.employeeOpts(l, t('Select employee...')) }, { name: 'date', label: 'Date', type: 'date', required: true, value: todayLocal() }],
    columns: [{ key: 'timestamp', label: 'Time', render: (r) => fmtTime(r.timestamp) }, { key: 'latitude', label: 'Latitude' }, { key: 'longitude', label: 'Longitude' }, { key: 'accuracy_meters', label: 'Accuracy (m)', render: (r) => Math.round(r.accuracy_meters) },
      { key: 'distance_from_branch_meters', label: 'Distance (m)', render: (r) => Math.round(r.distance_from_branch_meters) }, { key: 'inside_geofence', label: 'Inside', render: (r) => badge(r.inside_geofence ? 'INSIDE' : 'OUTSIDE') }, { key: 'tracking_source', label: 'Source' },
      { key: 'flags', label: 'Flags', render: (r) => (r.flags ? r.flags.split(',').map((f) => badge(f)) : '-') }],
    empty: t('Select an employee and a date.'),
    async load(f, page) {
      if (!f.employee_id) return { items: [], total: 0, page: 1, page_size: 200 };
      const res = await ctx.api.call('getLocationHistory', { employee_id: f.employee_id, date: f.date, page, page_size: 200 });
      const br = l.branches.find((b) => res.items.length && b.branch_id === res.items[0].branch_id); draw(res.items, br && { name: br.branch_name, latitude: br.latitude, longitude: br.longitude, radius: br.geofence_radius_meters });
      return { items: res.items, total: res.total, page: res.page, page_size: res.page_size };
    }
  });
  return { el: h('div', {}, h('h1', {}, t('Location History')), mapBox, note, lp.el) };
}

export async function geofencePage(ctx) {
  const l = await ctx.lookups.load(), bn = Object.fromEntries(l.branches.map((b) => [b.branch_id, b.branch_name])), en = Object.fromEntries(l.employees.map((e) => [e.employee_id, e.employee_name])), today = todayLocal();
  const lp = listPage({
    filters: [{ name: 'date_from', label: 'From', type: 'date', value: today }, { name: 'date_to', label: 'To', type: 'date', value: today }, { name: 'employee_id', label: 'Employee', type: 'select', options: ctx.lookups.employeeOpts(l) }, { name: 'branch_id', label: 'Branch', type: 'select', options: ctx.lookups.branchOpts(l) },
      { name: 'event_type', label: 'Event', type: 'select', options: [opt('', t('All')), opt('EXIT_GEOFENCE', t('Left branch')), opt('ENTER_GEOFENCE', t('Returned'))] }],
    columns: [{ key: 'timestamp', label: 'Time', render: (r) => fmtDateTime(r.timestamp) }, { key: 'employee_id', label: 'Employee', render: (r) => `${r.employee_id} ${en[r.employee_id] || ''}` }, { key: 'branch_id', label: 'Branch', render: (r) => bn[r.branch_id] || r.branch_id },
      { key: 'event_type', label: 'Event', render: (r) => badge(r.event_type) }, { key: 'distance_from_branch_meters', label: 'Distance (m)', render: (r) => Math.round(r.distance_from_branch_meters) }, { key: 'duration_minutes', label: 'Time outside', render: (r) => (r.duration_minutes !== null && r.duration_minutes !== '' ? minutesText(r.duration_minutes) : '-') }],
    async load(f, page) { const res = await ctx.api.call('getGeofenceEvents', { ...clean(f), page, page_size: 100 }); return { items: res.items, total: res.total, page: res.page, page_size: res.page_size }; }
  });
  return { el: h('div', {}, h('h1', {}, t('Geofence Events')), lp.el) };
}

export async function leavesPage(ctx) {
  const l = await ctx.lookups.load(), en = Object.fromEntries(l.employees.map((e) => [e.employee_id, e.employee_name])), today = todayLocal();
  const lp = listPage({
    filters: [{ name: 'date_from', label: 'From', type: 'date', value: addDays(today, -30) }, { name: 'date_to', label: 'To', type: 'date', value: addDays(today, 30) }, { name: 'employee_id', label: 'Employee', type: 'select', options: ctx.lookups.employeeOpts(l) }],
    toolbar: button(t('Add leave'), { kind: 'primary', id: 'btn-add-leave', on: { click: () => editor() } }),
    columns: [{ key: 'date', label: 'Date' }, { key: 'employee_id', label: 'Employee', render: (r) => `${r.employee_id} ${en[r.employee_id] || ''}` }, { key: 'leave_type', label: 'Type' }, { key: 'status', label: 'Status', render: (r) => badge(r.status) }, { key: 'notes', label: 'Notes' },
      { key: 'actions', label: 'Actions', render: (r) => (r.status === 'ACTIVE' ? button(t('Cancel leave'), { small: true, kind: 'danger', on: { click: async () => { if (await confirmDialog(t('Cancel this leave?'), { danger: true })) { try { await ctx.api.call('cancelLeave', { leave_id: r.leave_id }); lp.reload(); } catch (e) { toastError(e); } } } } }) : null) }],
    async load(f, page) { const res = await ctx.api.call('getLeaves', { ...clean(f), page, page_size: 100 }); return { items: res.items, total: res.total, page: res.page, page_size: res.page_size }; }
  });
  function editor() {
    const m = openModal({ title: t('Add leave'), body: null });
    const f = buildForm([{ name: 'employee_id', label: 'Employee', type: 'select', required: true, options: ctx.lookups.employeeOpts(l, t('Select employee...')) }, { name: 'date', label: 'Date', type: 'date', required: true, value: todayLocal() },
      { name: 'leave_type', label: 'Type', type: 'select', required: true, options: ['ANNUAL', 'CASUAL', 'SICK', 'OTHER'].map((x) => opt(x, x.charAt(0) + x.slice(1).toLowerCase())) }, { name: 'notes', label: 'Notes', type: 'textarea', max: 300 }], {}, {
      cancel: () => m.close(), onSubmit: async (v) => { await ctx.api.call('createLeave', clean(v)); m.close(); toast(t('Saved'), 'ok'); lp.reload(); } });
    m.setBody(f.el);
  }
  return { el: h('div', {}, h('h1', {}, t('Leaves')), h('p', { class: 'hint' }, t('Employees on leave appear as "On leave", never as absent.')), lp.el) };
}

export async function auditPage(ctx) {
  const today = todayLocal();
  const lp = listPage({
    filters: [{ name: 'date_from', label: 'From', type: 'date', value: addDays(today, -6) }, { name: 'date_to', label: 'To', type: 'date', value: today }, { name: 'user_id', label: 'User ID' }, { name: 'action', label: 'Action (e.g. CREATE_BRANCH)', pattern: '[A-Z_]*' }],
    columns: [{ key: 'timestamp', label: 'Time', render: (r) => fmtDateTime(r.timestamp) }, { key: 'user_id', label: 'User' }, { key: 'action', label: 'Action' }, { key: 'target_type', label: 'Target', render: (r) => `${r.target_type} ${r.target_id}` }, { key: 'details', label: 'Details', class: 'mono', render: (r) => r.details }, { key: 'ip_or_source_if_available', label: 'Source' }],
    async load(f, page) { const res = await ctx.api.call('getAuditLogs', { ...clean(f), page, page_size: 100 }); return { items: res.items, total: res.total, page: res.page, page_size: res.page_size }; }
  });
  return { el: h('div', {}, h('h1', {}, t('Audit Logs')), h('p', { class: 'hint' }, t('Read-only. Entries cannot be edited or deleted through the application.')), lp.el) };
}
