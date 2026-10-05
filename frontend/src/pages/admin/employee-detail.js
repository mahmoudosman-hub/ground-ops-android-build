import { h, mount } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtTime, fmtDateTime, todayLocal, addDays, minutesText } from '../../core/time.js';
import { badge, button, dataTable, spinner, errorBox, emptyState } from '../../components/ui.js';
import { showSelfie } from './records.js';
import { createMap, drawBranches, drawPoint, fit } from './map.js';
import { statusCells, locationCell } from './dashboard.js';

const settle = async (p) => { try { return { ok: await p }; } catch (e) { return { err: e }; } };

export async function employeeDetailPage(ctx) {
  const id = (ctx.params.id || '').toUpperCase(), date = ctx.params.date || todayLocal();
  if (!id) return { el: errorBox({ message: t('No employee selected.') }) };
  const root = h('div', { id: 'employee-detail' }, spinner());
  const [emp, att, hist, ev, asg, stat, late, absent, leaves, l] = await Promise.all([settle(ctx.api.call('getEmployee', { employee_id: id })), settle(ctx.api.call('getAttendance', { employee_id: id, date_from: date, date_to: date })),
    settle(ctx.api.call('getLocationHistory', { employee_id: id, date, page_size: 500 })), settle(ctx.api.call('getGeofenceEvents', { employee_id: id, date_from: date, date_to: date, page_size: 200 })), settle(ctx.api.call('getAssignments', { employee_id: id, date_from: date, date_to: date })),
    settle(ctx.api.call('getCurrentStatuses', { date, employee_id: id })), settle(ctx.api.call('getReports', { report: 'late_employees', employee_id: id, date_from: addDays(todayLocal(), -89), date_to: todayLocal(), page_size: 100 })),
    settle(ctx.api.call('getReports', { report: 'absent_employees', employee_id: id, date_from: addDays(todayLocal(), -89), date_to: todayLocal(), page_size: 100 })), settle(ctx.api.call('getLeaves', { employee_id: id, page_size: 100 })), ctx.lookups.load()]);
  if (emp.err) return { el: errorBox(emp.err) };
  const brk = await settle(ctx.api.call('getBreaks', { employee_id: id, date_from: date, date_to: date, page_size: 50 }));
  const sec = (title, node, id2) => h('section', { class: 'card', id: id2 }, h('h2', {}, t(title)), node);
  const guard = (r, render) => (r.err ? h('p', { class: 'hint' }, r.err.code === 'FORBIDDEN' ? t('You do not have permission to view this section.') : errorBox(r.err)) : render(r.ok));
  const e = emp.ok.employee, a = att.ok && att.ok.items[0], row = stat.ok && stat.ok.items[0], bn = Object.fromEntries(l.branches.map((b) => [b.branch_id, b.branch_name]));
  const profile = sec('Profile', h('dl', { class: 'kv' }, h('dt', {}, t('Employee ID')), h('dd', {}, e.employee_id), h('dt', {}, t('Name')), h('dd', { id: 'emp-name' }, e.employee_name), h('dt', {}, t('Phone')), h('dd', {}, e.phone || '-'), h('dt', {}, t('Email')), h('dd', {}, e.email || '-'),
    h('dt', {}, t('Status')), h('dd', {}, badge(e.status)), h('dt', {}, t('Default branch')), h('dd', {}, bn[e.default_branch_id] || '-'), h('dt', {}, t('Last login')), h('dd', {}, fmtDateTime(e.last_login_at))));
  const datePick = h('form', { class: 'form form-inline', on: { submit: (ev2) => { ev2.preventDefault(); ctx.navigate(`employee?id=${encodeURIComponent(id)}&date=${ev2.target.elements.d.value}`); } } }, h('div', { class: 'field' }, h('label', { for: 'dpick' }, t('Date')), h('input', { id: 'dpick', name: 'd', type: 'date', value: date })), h('button', { class: 'btn btn-primary', type: 'submit' }, t('Show')));
  const today = sec('Shift and attendance', guard(asg, (x) => h('div', {}, x.items.length ? h('p', {}, h('strong', {}, `${x.items[0].work_date}`), ' - ', (l.shifts.find((s) => s.shift_id === x.items[0].shift_id) || {}).shift_name || x.items[0].shift_id, ' @ ', bn[x.items[0].branch_id] || x.items[0].branch_id) : emptyState(t('No shift assigned on this date.')),
    row ? h('p', {}, statusCells(row), ' ', locationCell(row)) : null, a ? h('dl', { class: 'kv' }, h('dt', {}, t('Check-in')), h('dd', {}, fmtDateTime(a.check_in_time)), h('dt', {}, t('Check-in location')), h('dd', {}, `${a.check_in_latitude}, ${a.check_in_longitude} (${Math.round(a.check_in_distance_meters)} m from branch, accuracy ${Math.round(a.check_in_accuracy_meters)} m)`),
      h('dt', {}, t('Check-out')), h('dd', {}, a.check_out_time ? fmtDateTime(a.check_out_time) : '-'), h('dt', {}, t('Early check-out')), h('dd', {}, a.early_checkout_minutes ? minutesText(a.early_checkout_minutes) : '-'), h('dt', {}, t('Flags')), h('dd', {}, (a.flags || []).length ? a.flags.map((f) => badge(f)) : '-'),
      h('dt', {}, t('Selfie')), h('dd', {}, ctx.user.permissions.includes('view_selfies') && (a.selfie_available || a.checkout_selfie_available) ? h('span', { class: 'btn-row' }, a.selfie_available ? button(t('View selfie'), { small: true, id: 'btn-selfie', on: { click: () => showSelfie(ctx, a.attendance_id) } }) : null, a.checkout_selfie_available ? button(t('View check-out selfie'), { small: true, id: 'btn-selfie-out', on: { click: () => showSelfie(ctx, a.attendance_id, 'check_out') } }) : null) : '-')) : emptyState(t('No check-in on this date.')),
    row && row.last_location_at ? h('p', { class: 'hint' }, t('Current/last location: {la}, {lo} at {t}', { la: row.last_latitude, lo: row.last_longitude, t: fmtTime(row.last_location_at) })) : null)), 'detail-today');

  // timeline: check-in, GPS fixes (inside/outside), geofence events, check-out
  const tl = [];
  if (a && a.check_in_time) tl.push([a.check_in_time, 'Check-in', 'CHECKED_IN']);
  if (hist.ok) hist.ok.items.filter((p) => p.tracking_source !== 'CHECK_IN' && p.tracking_source !== 'CHECK_OUT').forEach((p) => tl.push([p.timestamp, p.inside_geofence ? 'Inside' : 'Outside', p.inside_geofence ? 'INSIDE' : 'OUTSIDE']));
  if (ev.ok) ev.ok.items.forEach((x) => tl.push([x.timestamp, x.event_type === 'EXIT_GEOFENCE' ? 'Left the branch' : `Returned (outside ${minutesText(x.duration_minutes)})`, x.event_type]));
  if (a && a.check_out_time) tl.push([a.check_out_time, 'Check-out', 'CHECKED_OUT']);
  tl.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  const timeline = sec('Timeline', tl.length ? h('ol', { class: 'timeline', id: 'timeline' }, tl.map(([ts, label, code]) => h('li', {}, h('time', {}, fmtTime(ts)), ' ', badge(code, label)))) : emptyState(t('No activity recorded on this date.')), 'detail-timeline');
  const mapBox = h('div', { class: 'map', id: 'detail-map' }); const mapSec = sec('Location map', mapBox, 'detail-map-card');
  const evSec = sec('Geofence events', guard(ev, (x) => (x.items.length ? dataTable({ columns: [{ key: 'timestamp', label: 'Time', render: (r) => fmtTime(r.timestamp) }, { key: 'event_type', label: 'Event', render: (r) => badge(r.event_type) }, { key: 'distance_from_branch_meters', label: 'Distance (m)', render: (r) => Math.round(r.distance_from_branch_meters) }, { key: 'duration_minutes', label: 'Outside', render: (r) => (r.duration_minutes !== null && r.duration_minutes !== '' ? minutesText(r.duration_minutes) : '-') }], rows: x.items }) : emptyState(t('No geofence events.')))));
  const brkSec = sec('Breaks', guard(brk, (x) => (x.items.length ? dataTable({ columns: [{ key: 'started_at', label: 'Start', render: (r) => fmtTime(r.started_at) }, { key: 'ended_at', label: 'End', render: (r) => (r.ended_at ? fmtTime(r.ended_at) : badge('ON_BREAK')) }, { key: 'seconds', label: 'Minutes', render: (r) => (r.ended_at ? Math.round(r.seconds / 60) : '-') }, { key: 'ended_by', label: 'Ended by' }, { key: 'exceeded', label: 'Over allowance', render: (r) => (r.exceeded ? badge('BREAK_EXCEEDED', 'Yes') : 'No') }], rows: x.items }) : emptyState(t('No breaks on this date.')))), 'detail-breaks');
  const lateSec = sec('Late history (90 days)', guard(late, (x) => (x.rows.length ? dataTable({ columns: [{ key: 'work_date', label: 'Date' }, { key: 'check_in_time', label: 'Check-in', render: (r) => fmtTime(r.check_in_time) }, { key: 'late_minutes', label: 'Late (min)' }], rows: x.rows }) : emptyState(t('No late arrivals.')))), 'detail-late');
  const absSec = sec('Absence history (90 days)', guard(absent, (x) => (x.rows.length ? dataTable({ columns: [{ key: 'work_date', label: 'Date' }, { key: 'shift_name', label: 'Shift' }, { key: 'branch_name', label: 'Branch' }], rows: x.rows }) : emptyState(t('No absences.')))), 'detail-absent');
  const lvSec = sec('Leave history', guard(leaves, (x) => (x.items.length ? dataTable({ columns: [{ key: 'date', label: 'Date' }, { key: 'leave_type', label: 'Type' }, { key: 'status', label: 'Status', render: (r) => badge(r.status) }, { key: 'notes', label: 'Notes' }], rows: x.items }) : emptyState(t('No leave recorded.')))), 'detail-leave');
  mount(root, h('div', { class: 'detail-head' }, h('a', { href: '#/employees', class: 'btn btn-small' }, '← ' + t('Employees')), h('h1', {}, e.employee_name)), datePick, h('div', { class: 'grid-2' }, profile, today), timeline, mapSec, evSec, brkSec, h('div', { class: 'grid-3' }, lateSec, absSec, lvSec));
  createMap(mapBox).then((m) => {
    if (!m) { mapSec.hidden = true; return; }
    const pts = [], br = a && l.branches.find((b) => b.branch_id === a.branch_id); if (br) { drawBranches(m, [{ name: br.branch_name, latitude: br.latitude, longitude: br.longitude, radius: br.geofence_radius_meters }]); pts.push([br.latitude, br.longitude]); }
    if (hist.ok) hist.ok.items.forEach((p) => { drawPoint(m, { lat: p.latitude, lng: p.longitude, state: p.inside_geofence ? 'INSIDE' : 'OUTSIDE', label: `${fmtTime(p.timestamp)}` }); pts.push([p.latitude, p.longitude]); }); fit(m, pts);
  });
  return { el: root };
}
