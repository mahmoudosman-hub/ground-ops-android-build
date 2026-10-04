import { h, mount } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtTime, fmtDate, fmtDateTime, agoText, addDays, todayLocal } from '../../core/time.js';
import { haversineMeters } from '../../core/geo.js';
import { badge, button, spinner, errorBox, toast, toastError, dataTable } from '../../components/ui.js';
import { createTracker } from '../../services/tracker.js';
import { cfg } from '../../core/config.js';
import { openCheckIn, openCheckOut } from './checkin.js';
import { openTrackingHelp } from './native-help.js';

const CACHE = (id) => `gops.schedule.${id}`;
const isOnline = () => !(globalThis.navigator && globalThis.navigator.onLine === false);

export function createHome({ api, provider, queue }) {
  const user = api.session().user, userId = user.employee_id;
  let schedule = null, fromCache = false, loadError = null, trk = { trackingState: 'STOPPED', pending: 0 }, gps = null, history = null, destroyed = false, awake = false;
  const el = h('div', { class: 'home' });
  const tracker = createTracker({ api, provider, queue, userId, getSettings: () => (schedule && schedule.settings) || {}, getShift: () => (schedule && schedule.assignment) || null, intervalOverrideMs: cfg().TRACKING_INTERVAL_OVERRIDE_MS, onChange: (s) => { trk = s; if (s.ended) refresh(); render(); } });

  const seenHelp = () => { try { return !!globalThis.localStorage.getItem('gops.nativeHelp.' + userId); } catch (e) { return true; } };
  const markHelp = () => { try { globalThis.localStorage.setItem('gops.nativeHelp.' + userId, '1'); } catch (e) { /* ignore */ } };
  function readCache() { try { return JSON.parse(globalThis.localStorage.getItem(CACHE(userId))); } catch (e) { return null; } }
  async function refresh() {
    try { schedule = await api.call('getTodaySchedule', {}); fromCache = false; loadError = null; try { globalThis.localStorage.setItem(CACHE(userId), JSON.stringify({ at: Date.now(), data: schedule })); } catch (e) { /* ignore */ } }
    catch (e) {
      if (['OFFLINE', 'NETWORK_ERROR', 'SERVER_UNAVAILABLE'].includes(e.code)) { const c = readCache(); if (c) { schedule = c.data; fromCache = c.at; loadError = null; } else loadError = e; } else loadError = e;
    }
    syncTracker(); render(); loadHistory();
    if (provider.capabilities.batterySettings && schedule && schedule.attendance && schedule.attendance.state === 'NOT_CHECKED_IN' && !seenHelp()) { markHelp(); openTrackingHelp({ provider }); }
  }
  async function loadHistory() {
    if (!isOnline()) return;
    try { const to = todayLocal(); history = (await api.call('getAttendance', { date_from: addDays(to, -6), date_to: to })).items; } catch (e) { /* history is optional */ }
    render();
  }
  function syncTracker() {
    if (!schedule) return;
    const a = schedule.attendance, end = schedule.assignment && schedule.assignment.scheduled_end ? Date.parse(schedule.assignment.scheduled_end) : 0;
    // Offline start-up with a cached "checked in" schedule: keep collecting points into the durable queue (the server rejects stale shifts when we reconnect).
    const live = fromCache ? Date.now() < end + 6 * 3600000 : schedule.window_state !== 'NONE';
    if (a && a.state === 'CHECKED_IN' && live) tracker.start(); else tracker.stop();
  }

  async function checkGps() {
    gps = { busy: true }; render();
    try { const f = await provider.getPosition({ timeoutMs: 20000 }); gps = { fix: f }; } catch (e) { gps = { error: e.state || 'UNAVAILABLE' }; }
    render();
  }

  /* ---- sections ---- */
  function shiftCard() {
    if (!schedule) return null;
    const a = schedule.assignment, sh = a && a.shift;
    if (!a) return h('section', { class: 'card' }, h('h2', {}, t('Today\'s shift')), h('p', { class: 'empty', id: 'no-shift' }, t('No shift is assigned to you today.')));
    return h('section', { class: 'card', id: 'shift-card' }, h('h2', {}, t('Today\'s shift')),
      h('p', { class: 'big', id: 'shift-time' }, sh ? `${sh.start_time} - ${sh.end_time}` : '-', sh && sh.crosses_midnight ? h('small', {}, ' ' + t('(ends next day)')) : null),
      h('dl', { class: 'kv' }, h('dt', {}, t('Date')), h('dd', {}, fmtDate(a.work_date)), h('dt', {}, t('Assigned branch')), h('dd', { id: 'branch-name' }, a.branch ? a.branch.branch_name : '-'),
        h('dt', {}, t('Status')), h('dd', { id: 'status-badge' }, statusBadge())));
  }
  function statusBadge() {
    const a = schedule.attendance || {};
    if (a.state === 'CHECKED_IN') return [badge('CHECKED_IN'), ' ', a.attendance_status === 'LATE' ? badge('LATE', `Late ${a.late_minutes} min`) : badge('ON_TIME'), a.check_in_time ? ` ${fmtTime(a.check_in_time)}` : ''];
    if (a.state === 'CHECKED_OUT') return [badge('CHECKED_OUT'), ` ${fmtTime(a.check_out_time)}`];
    return badge('NOT_CHECKED_IN');
  }
  function gpsCard() {
    const a = schedule && schedule.assignment, br = a && a.branch; if (!br) return null;
    const fix = (trk.lastFix && (!gps || !gps.fix || trk.lastFix.timestamp > gps.fix.timestamp)) ? trk.lastFix : (gps && gps.fix);
    let body;
    if (gps && gps.busy) body = spinner(t('Getting location...'));
    else if (gps && gps.error) body = [badge(gps.error === 'PERMISSION_DENIED' ? 'PERMISSION_DENIED' : gps.error === 'GPS_DISABLED' ? 'GPS_DISABLED' : 'UNAVAILABLE'), h('p', { class: 'hint' }, gps.error === 'PERMISSION_DENIED' ? t('Allow location access in your browser/phone settings.') : t('Turn on GPS and try again.'))];
    else if (fix) {
      const d = Math.round(haversineMeters(fix.latitude, fix.longitude, br.latitude, br.longitude)), inside = d <= br.geofence_radius_meters;
      body = [badge(inside ? 'INSIDE' : 'OUTSIDE'), h('p', { id: 'gps-detail' }, t('{d} m from branch (limit {r} m), accuracy {a} m', { d, r: br.geofence_radius_meters, a: Math.round(fix.accuracy) })), h('p', { class: 'hint' }, agoText(new Date(fix.timestamp).toISOString()))];
    } else body = h('p', { class: 'hint' }, t('Not checked yet.'));
    return h('section', { class: 'card', id: 'gps-card' }, h('h2', {}, t('GPS')), h('div', { id: 'gps-status' }, body), button(t('Check GPS'), { small: true, id: 'btn-gps', on: { click: checkGps } }));
  }
  function trackingCard() {
    const a = schedule && schedule.attendance; if (!a || a.state === 'NOT_CHECKED_IN' || !schedule.assignment) return null;
    const code = trk.trackingState === 'ACTIVE' ? 'TRACKING_ACTIVE' : trk.trackingState;
    const caps = provider.capabilities, notes = [];
    if (!caps.background) { notes.push(t('Tracking works while the app is active.')); notes.push(t('Browser tracking only works while this app is open on your screen. It cannot track in the background or when the phone is locked.')); }
    else if (trk.running) notes.push(t('Background tracking is running (foreground service with a visible notification).'));
    const stopped = caps.background && !trk.running && trk.error === 'SERVICE_NOT_RUNNING';
    if (trk.pending > 0) notes.push(t('{n} location update(s) waiting to sync.', { n: trk.pending }));
    if (trk.error && !['OFFLINE'].includes(trk.error)) notes.push(t('Last sync problem: {e}', { e: trk.error }));
    return h('section', { class: 'card', id: 'tracking-card' }, h('h2', {}, t('Tracking')), h('div', { id: 'tracking-status' }, badge(code)),
      stopped ? h('div', { class: 'alert alert-bad', id: 'service-stopped' }, t('The tracking service is not running (Android may have stopped it). Your supervisor sees "Tracking unavailable".'), ' ', button(t('Restart tracking'), { small: true, id: 'btn-restart-tracking', on: { click: () => tracker.start() } })) : null,
      caps.background && trk.trackingState === 'PERMISSION_DENIED' ? h('div', { class: 'alert alert-bad' }, t('Location permission is blocked. Allow it for this app in the phone settings.')) : null,
      caps.batterySettings ? button(t('Tracking help and battery settings'), { small: true, id: 'btn-tracking-help', on: { click: () => openTrackingHelp({ provider }) } }) : null,
      trk.lastFixAt ? h('p', { class: 'hint' }, t('Last location: {t}', { t: fmtTime(new Date(trk.lastFixAt).toISOString()) })) : null, notes.map((n) => h('p', { class: 'hint' }, n)),
      caps.keepAwake && a.state === 'CHECKED_IN' ? h('label', { class: 'check-row' }, h('input', { type: 'checkbox', id: 'keep-awake', checked: awake, on: { change: async (e) => { awake = e.target.checked; await provider.setKeepAwake(awake); } } }), ' ', t('Keep screen awake while on duty (uses more battery)')) : null);
  }
  function actions() {
    if (!schedule || !schedule.assignment) return null; const a = schedule.attendance || {}, ws = schedule.window_state, on = isOnline() && !fromCache;
    let btn, msg = null;
    if (a.state === 'NOT_CHECKED_IN') {
      const early = (schedule.settings && schedule.settings.checkin_early_minutes) || 0, opens = schedule.assignment.scheduled_start ? new Date(Date.parse(schedule.assignment.scheduled_start) - early * 60000).toISOString() : null;
      btn = button(t('Check In'), { kind: 'primary', big: true, id: 'btn-checkin', disabled: ws !== 'OPEN' || !on, on: { click: () => openCheckIn({ api, provider, schedule, onDone: () => { refresh(); } }) } });
      msg = ws === 'NOT_YET_OPEN' ? t('Check-in opens at {t}.', { t: fmtTime(opens) }) : ws === 'ENDED' ? t('Your shift has ended.') : !on ? t('You are offline. Check-in needs a connection.') : null;
    } else if (a.state === 'CHECKED_IN') {
      btn = button(t('Check Out'), { kind: 'danger', big: true, id: 'btn-checkout', disabled: !on, on: { click: () => openCheckOut({ api, provider, schedule, onDone: () => { tracker.stop(); refresh(); } }) } });
      msg = !on ? t('You are offline. Check-out needs a connection.') : null;
    } else btn = h('p', { class: 'alert alert-ok', id: 'shift-done' }, t('Your shift is complete. Thank you!'));
    return h('section', { class: 'actions' }, btn, msg ? h('p', { class: 'hint', id: 'action-msg' }, msg) : null);
  }
  function historyCard() {
    if (!history || !history.length) return null;
    return h('section', { class: 'card' }, h('h2', {}, t('Last 7 days')), dataTable({ columns: [{ key: 'work_date', label: 'Date' }, { key: 'check_in_time', label: 'In', render: (r) => fmtTime(r.check_in_time) }, { key: 'check_out_time', label: 'Out', render: (r) => fmtTime(r.check_out_time) },
      { key: 'attendance_status', label: 'Status', render: (r) => badge(r.attendance_status) }], rows: history }));
  }

  function render() {
    if (destroyed) return;
    mount(el,
      fromCache ? h('div', { class: 'alert alert-warn', id: 'cache-note' }, t('Showing your last saved schedule ({t}). Connect to refresh.', { t: fmtDateTime(new Date(fromCache).toISOString()) })) : null,
      loadError ? errorBox(loadError) : null, !schedule && !loadError ? spinner() : null,
      schedule ? h('div', { class: 'greeting' }, h('h1', {}, schedule.employee.name), h('p', { class: 'hint' }, t('Employee ID {id}', { id: schedule.employee.employee_id }))) : null,
      shiftCard(), actions(), gpsCard(), trackingCard(), historyCard());
  }
  const onVis = () => { if (globalThis.document.visibilityState === 'visible') refresh(); };
  const onOnline = () => { tracker.onOnline(); refresh(); };
  globalThis.document.addEventListener('visibilitychange', onVis); globalThis.addEventListener('online', onOnline); globalThis.addEventListener('offline', render);
  const poll = setInterval(() => { if (isOnline()) refresh(); }, 60000);
  render(); refresh();
  return { el, refresh, tracker, destroy() { destroyed = true; clearInterval(poll); tracker.stop(); globalThis.document.removeEventListener('visibilitychange', onVis); globalThis.removeEventListener('online', onOnline); globalThis.removeEventListener('offline', render); } };
}
