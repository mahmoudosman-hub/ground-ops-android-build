/** Break card + start/end flow. The SERVER measures the break and checks the location; this file only asks for a fresh GPS fix and shows the result. */
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtTime } from '../../core/time.js';
import { errorMessage } from '../../core/errors.js';
import { badge, button, openModal, spinner, toast } from '../../components/ui.js';
import { fixPayload, LOC_HELP, infoRows, freshFix } from './checkin.js';

const isOnline = () => !(globalThis.navigator && globalThis.navigator.onLine === false);

/** Minutes used right now: server value at fetch time + time elapsed since (only while a break is open). */
export function liveUsed(schedule, nowMs = Date.now()) {
  const b = schedule.break; if (!b) return 0;
  return b.used_minutes + (b.on_break ? Math.max(0, Math.floor((nowMs - Date.parse(schedule.server_time)) / 60000)) : 0);
}

export function breakCard({ schedule, api, provider, online, onDone, nowMs }) {
  const b = schedule.break; if (!b) return null;
  const used = liveUsed(schedule, nowMs), remaining = Math.max(0, b.allowance_minutes - used), over = Math.max(0, used - b.allowance_minutes);
  const parts = [
    h('h2', {}, t('Break')),
    h('p', { id: 'break-counter', class: 'big' }, t('{r} min left', { r: remaining })),
    h('p', { class: 'hint', id: 'break-detail' }, t('Used {u} of {a} min this shift. You can split the break into several parts.', { u: used, a: b.allowance_minutes }))
  ];
  if (b.on_break) {
    parts.push(h('p', {}, badge('ON_BREAK'), ' ', t('since {t}', { t: fmtTime(b.started_at) }), ' - ', t('location tracking is paused')));
    if (over > 0 || b.exceeded) parts.push(h('div', { class: 'alert alert-bad', role: 'alert', id: 'break-over' }, t('Your break time is over by {n} min. Please end your break now.', { n: over })));
    parts.push(button(t('End break'), { kind: 'primary', big: true, id: 'btn-end-break', disabled: !online, on: { click: () => openBreakFlow({ api, provider, schedule, kind: 'end', onDone }) } }));
    parts.push(h('p', { class: 'hint' }, online ? t('You must be at the branch to end your break.') : t('You are offline. Ending a break needs a connection.')));
  } else {
    parts.push(button(t('Start break'), { big: true, id: 'btn-start-break', disabled: !online || remaining <= 0, on: { click: () => openBreakFlow({ api, provider, schedule, kind: 'start', onDone }) } }));
    parts.push(h('p', { class: 'hint', id: 'break-hint' }, remaining <= 0 ? t('You have used all your break time for this shift.') : online ? t('You must be at the branch to start a break. Location tracking pauses during the break.') : t('You are offline. Starting a break needs a connection.')));
  }
  return h('section', { class: 'card', id: 'break-card' }, ...parts);
}

export function openBreakFlow({ api, provider, schedule, kind, onDone }) {
  const branch = schedule.assignment.branch; let fix = null, modal;
  const title = kind === 'start' ? t('Start break') : t('End break');
  const fail = (head, msg, extra, retry) => modal.setBody(h('div', { class: 'alert alert-bad', role: 'alert', id: 'break-error' }, h('strong', {}, head), h('p', {}, msg)), extra || null,
    h('div', { class: 'form-actions' }, button(t('Close'), { on: { click: () => modal.close() } }), retry ? button(t('Retry'), { kind: 'primary', on: { click: retry } }) : null));
  async function run() {
    if (!isOnline()) return fail(t('You are offline'), t('Starting or ending a break needs a connection. Nothing was changed.'), null, run);
    modal.setBody(spinner(t('Getting your location...')));
    try { fix = await freshFix(provider, null); } catch (e) { return fail(t('Location problem'), t(LOC_HELP[e.state] || LOC_HELP.UNAVAILABLE), null, run); }
    modal.setBody(spinner(kind === 'start' ? t('Starting break...') : t('Ending break...')));
    try {
      const res = await api.call(kind === 'start' ? 'startBreak' : 'endBreak', fixPayload(fix));
      modal.setBody(h('div', { class: 'alert alert-ok', id: 'break-result' }, h('strong', {}, kind === 'start' ? t('Break started') : t('Break ended')),
        h('p', {}, kind === 'start' ? t('Location tracking is paused. {r} min left.', { r: res.break.remaining_minutes }) : t('Location tracking resumes. {r} min of break left.', { r: res.break.remaining_minutes }))),
        h('div', { class: 'form-actions' }, button(t('Done'), { kind: 'primary', id: 'btn-break-done', on: { click: () => { modal.close(); onDone(res); } } })));
    } catch (e) {
      if (e.code === 'OUTSIDE_GEOFENCE') { const d = e.details || {}; return fail(kind === 'start' ? t('You must be at the branch to start your break.') : t('You must be at the branch to end your break.'), '', infoRows([['Current distance', `${Math.round(d.distance_meters)} meters`], ['Required', `Within ${d.required_within_meters} meters`]]), run); }
      if (['LOW_ACCURACY', 'STALE_LOCATION', 'GPS_UNAVAILABLE'].includes(e.code)) return fail(t('Location problem'), errorMessage(e), null, run);
      fail(['OFFLINE', 'NETWORK_ERROR', 'SERVER_UNAVAILABLE'].includes(e.code) ? t('Not done') : t('Break problem'), errorMessage(e), null, ['OFFLINE', 'NETWORK_ERROR', 'SERVER_UNAVAILABLE'].includes(e.code) ? run : null);
    }
  }
  modal = openModal({ title, body: spinner() }); run(); return modal;
}
