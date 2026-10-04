/** Check-in and check-out flows (modal steppers). The client shows a PREVIEW; the server validates everything again. */
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { haversineMeters } from '../../core/geo.js';
import { errorMessage } from '../../core/errors.js';
import { openModal, button, spinner } from '../../components/ui.js';
import { startCamera, stopCamera, captureToJpeg, fileToImage, CameraError } from '../../services/camera.js';

const isOnline = () => !(globalThis.navigator && globalThis.navigator.onLine === false);
const LOC_HELP = {
  PERMISSION_DENIED: 'Location permission is blocked. Allow location for this app in your browser/phone settings (Android: lock icon > Permissions; iPhone: Settings > Privacy > Location Services > Safari Websites), then tap Retry.',
  GPS_DISABLED: 'Your location is unavailable. Turn on GPS / Location Services and make sure you have a signal, then tap Retry.',
  UNAVAILABLE: 'Could not get a GPS fix in time. Move to an open area and tap Retry.'
};
function fixPayload(fix) {
  return { latitude: fix.latitude, longitude: fix.longitude, accuracy_meters: Math.max(0, fix.accuracy), gps_timestamp: new Date(fix.timestamp).toISOString(), location_source: fix.source || 'unknown', ...(fix.isMock === true || fix.isMock === false ? { is_mock_location: fix.isMock } : {}) };
}
function infoRows(rows) { return h('dl', { class: 'kv' }, rows.map(([k, v]) => [h('dt', {}, t(k)), h('dd', {}, v)])); }
async function freshFix(provider, previous) {
  try { return await provider.getPosition({ timeoutMs: 15000, maxAgeMs: 0 }); }
  catch (e) { if (previous && Date.now() - previous.timestamp < 60000) return previous; throw e; }
}

export function openCheckIn({ api, provider, schedule, onDone }) {
  const branch = schedule.assignment.branch, radius = branch.geofence_radius_meters, s = schedule.settings || {};
  const needSelfie = s.selfie_required !== false, maxBytes = s.selfie_max_bytes || 600000, maxAcc = s.gps_accuracy_threshold_meters || 50;
  let stream = null, fix = null, photo = null, modal;
  const cleanup = () => { stopCamera(stream); stream = null; };
  const fail = (title, msg, extra, retry) => modal.setBody(h('div', { class: 'alert alert-bad', role: 'alert' }, h('strong', {}, title), h('p', {}, msg)), extra || null,
    h('div', { class: 'form-actions' }, button(t('Close'), { on: { click: () => modal.close() } }), retry ? button(t('Retry'), { kind: 'primary', on: { click: retry } }) : null));

  async function stepLocation() {
    cleanup(); modal.setBody(spinner(t('Getting your location...')));
    try {
      if (provider.capabilities.nativeSync && (await provider.permission()) !== 'granted') { if ((await provider.requestPermission()) !== 'granted') throw Object.assign(new Error('denied'), { state: 'PERMISSION_DENIED' }); }
      fix = await provider.getPosition({ timeoutMs: 25000 });
    }
    catch (e) { return fail(t('Location problem'), t(LOC_HELP[e.state] || LOC_HELP.UNAVAILABLE), null, stepLocation); }
    const dist = haversineMeters(fix.latitude, fix.longitude, branch.latitude, branch.longitude), d = Math.round(dist);
    const rows = infoRows([['Assigned branch', branch.branch_name], ['Current distance', `${d} meters`], ['Required', `Within ${radius} meters`], ['GPS accuracy', `${Math.round(fix.accuracy)} meters`]]);
    if (fix.accuracy > maxAcc) return fail(t('GPS accuracy is too low'), t('Accuracy is {a} m but {m} m or better is required. Move to an open area and retry.', { a: Math.round(fix.accuracy), m: maxAcc }), rows, stepLocation);
    if (dist > radius) return fail(t('You are outside the assigned branch.'), '', rows, stepLocation);
    modal.setBody(h('div', { class: 'alert alert-ok' }, '✔ ', t('You are inside the branch area.')), rows,
      h('div', { class: 'form-actions' }, button(t('Cancel'), { on: { click: () => modal.close() } }), button(needSelfie ? t('Continue to selfie') : t('Check in now'), { kind: 'primary', big: true, id: 'btn-continue', on: { click: needSelfie ? stepCamera : submit } })));
  }

  async function stepCamera() {
    const video = h('video', { class: 'camera', autoplay: true, playsinline: true, muted: true, 'aria-label': t('Camera preview') });
    const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'user', class: 'sr-only', id: 'selfie-file', on: { change: async (ev) => { const f = ev.target.files[0]; if (!f) return; try { photo = await captureToJpeg(await fileToImage(f), maxBytes); stepPreview(); } catch (e) { fail(t('Selfie problem'), errorMessage(e)); } } } });
    const shoot = button(t('Take photo'), { kind: 'primary', big: true, id: 'btn-shoot', on: { click: async () => { try { photo = await captureToJpeg(video, maxBytes); cleanup(); stepPreview(); } catch (e) { fail(t('Selfie problem'), e.message, null, stepCamera); } } } });
    modal.setBody(h('p', {}, t('Take a clear selfie. It is stored privately for your supervisor.')), video, h('div', { class: 'form-actions' }, button(t('Back'), { on: { click: () => { cleanup(); stepLocation(); } } }), shoot), fileInput);
    try { stream = await startCamera(video); } catch (e) {
      const msg = e instanceof CameraError && e.kind === 'DENIED' ? t('Camera permission denied. Allow camera access for this app in your browser/phone settings, then tap Retry.') : e.message;
      modal.setBody(h('div', { class: 'alert alert-bad', role: 'alert', id: 'camera-error' }, h('strong', {}, t('Camera problem')), h('p', {}, msg)),
        h('div', { class: 'form-actions' }, button(t('Close'), { on: { click: () => modal.close() } }), button(t('Retry'), { kind: 'primary', on: { click: stepCamera } }), button(t('Use camera app instead'), { on: { click: () => fileInput.click() } })), fileInput);
    }
  }

  function stepPreview() {
    const url = URL.createObjectURL(photo.blob);
    modal.setBody(h('img', { class: 'selfie-preview', src: url, alt: t('Your selfie') }), h('p', { class: 'hint' }, `${Math.round(photo.bytes / 1024)} KB`),
      h('div', { class: 'form-actions' }, button(t('Retake'), { on: { click: stepCamera } }), button(t('Check in now'), { kind: 'primary', big: true, id: 'btn-submit', on: { click: submit } })));
  }

  async function submit() {
    if (!isOnline()) return fail(t('You are offline'), t('Nothing was recorded. Check-in is only confirmed when the server receives it. Connect to the internet and try again.'), null, submit);
    modal.setBody(spinner(t('Checking in...')));
    try {
      fix = await freshFix(provider, fix);
      const res = await api.call('checkIn', { ...fixPayload(fix), ...(photo ? { selfie_base64: photo.base64, selfie_mime: photo.mime } : {}) });
      cleanup();
      const late = res.attendance_status === 'LATE';
      modal.setBody(h('div', { class: `alert ${late ? 'alert-warn' : 'alert-ok'}`, id: 'checkin-result' }, h('strong', {}, late ? t('Checked in - late by {n} minutes', { n: res.late_minutes }) : t('Checked in - on time')),
        h('p', {}, t('Distance from branch: {d} m', { d: Math.round(res.distance_meters) }))), h('div', { class: 'form-actions' }, button(t('Done'), { kind: 'primary', id: 'btn-done', on: { click: () => { modal.close(); onDone(res); } } })));
    } catch (e) {
      if (e.code === 'OUTSIDE_GEOFENCE') { const d = e.details || {}; return fail(t('You are outside the assigned branch.'), '', infoRows([['Current distance', `${Math.round(d.distance_meters)} meters`], ['Required', `Within ${d.required_within_meters} meters`]]), stepLocation); }
      if (['STALE_LOCATION', 'LOW_ACCURACY', 'GPS_UNAVAILABLE'].includes(e.code)) return fail(t('Location problem'), errorMessage(e), null, stepLocation);
      if (e.state) return fail(t('Location problem'), t(LOC_HELP[e.state] || LOC_HELP.UNAVAILABLE), null, submit);
      if (['OFFLINE', 'NETWORK_ERROR', 'SERVER_UNAVAILABLE'].includes(e.code)) return fail(t('Not checked in'), t('{m} Nothing was recorded. Please try again.', { m: errorMessage(e) }), null, submit);
      fail(t('Check-in failed'), errorMessage(e), null, ['DUPLICATE_CHECKIN', 'NO_ASSIGNMENT', 'ON_LEAVE', 'CHECKIN_WINDOW_CLOSED'].includes(e.code) ? null : submit);
    }
  }
  modal = openModal({ title: t('Check In'), body: spinner(), onClose: cleanup });
  stepLocation(); return modal;
}

export function openCheckOut({ api, provider, schedule, onDone }) {
  const branch = schedule.assignment.branch, radius = branch.geofence_radius_meters, st = schedule.settings || {};
  const needSelfie = st.checkout_selfie_required !== false, maxBytes = st.selfie_max_bytes || 600000;
  let fix = null, photo = null, stream = null, modal;
  const cleanup = () => { stopCamera(stream); stream = null; };
  const fail = (title, msg, extra, retry) => modal.setBody(h('div', { class: 'alert alert-bad', role: 'alert' }, h('strong', {}, title), h('p', {}, msg)), extra || null, h('div', { class: 'form-actions' }, button(t('Close'), { on: { click: () => modal.close() } }), retry ? button(t('Retry'), { kind: 'primary', on: { click: retry } }) : null));
  async function locate() {
    cleanup(); modal.setBody(spinner(t('Getting your location...')));
    try { fix = await provider.getPosition({ timeoutMs: 25000 }); } catch (e) { return fail(t('Location problem'), t(LOC_HELP[e.state] || LOC_HELP.UNAVAILABLE), null, locate); }
    const d = Math.round(haversineMeters(fix.latitude, fix.longitude, branch.latitude, branch.longitude)), outside = d > radius;
    modal.setBody(outside ? h('div', { class: 'alert alert-warn' }, t('You are {d} m from the branch (limit {r} m). Your supervisor will see this.', { d, r: radius })) : h('div', { class: 'alert alert-ok' }, '✔ ', t('You are inside the branch area.')),
      h('p', {}, needSelfie ? t('A selfie is required to end your shift.') : t('End your shift now?')), h('div', { class: 'form-actions' }, button(t('Cancel'), { on: { click: () => modal.close() } }),
        button(needSelfie ? t('Continue to selfie') : t('Check Out'), { kind: 'primary', big: true, id: 'btn-confirm-checkout', on: { click: needSelfie ? stepCamera : submit } })));
  }
  async function stepCamera() {
    const video = h('video', { class: 'camera', autoplay: true, playsinline: true, muted: true, 'aria-label': t('Camera preview') });
    const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'user', class: 'sr-only', id: 'selfie-file', on: { change: async (ev) => { const f = ev.target.files[0]; if (!f) return; try { photo = await captureToJpeg(await fileToImage(f), maxBytes); stepPreview(); } catch (e) { fail(t('Selfie problem'), errorMessage(e)); } } } });
    const shoot = button(t('Take photo'), { kind: 'primary', big: true, id: 'btn-shoot', on: { click: async () => { try { photo = await captureToJpeg(video, maxBytes); cleanup(); stepPreview(); } catch (e) { fail(t('Selfie problem'), e.message, null, stepCamera); } } } });
    modal.setBody(h('p', {}, t('Take a clear selfie. It is stored privately for your supervisor.')), video, h('div', { class: 'form-actions' }, button(t('Back'), { on: { click: locate } }), shoot), fileInput);
    try { stream = await startCamera(video); } catch (e) {
      const msg = e instanceof CameraError && e.kind === 'DENIED' ? t('Camera permission denied. Allow camera access for this app in your browser/phone settings, then tap Retry.') : e.message;
      modal.setBody(h('div', { class: 'alert alert-bad', role: 'alert', id: 'camera-error' }, h('strong', {}, t('Camera problem')), h('p', {}, msg)),
        h('div', { class: 'form-actions' }, button(t('Close'), { on: { click: () => modal.close() } }), button(t('Retry'), { kind: 'primary', on: { click: stepCamera } }), button(t('Use camera app instead'), { on: { click: () => fileInput.click() } })), fileInput);
    }
  }
  function stepPreview() {
    const url = URL.createObjectURL(photo.blob);
    modal.setBody(h('img', { class: 'selfie-preview', src: url, alt: t('Your selfie') }), h('p', { class: 'hint' }, `${Math.round(photo.bytes / 1024)} KB`),
      h('div', { class: 'form-actions' }, button(t('Retake'), { on: { click: stepCamera } }), button(t('Check out now'), { kind: 'primary', big: true, id: 'btn-submit', on: { click: submit } })));
  }
  async function submit() {
    if (!isOnline()) return fail(t('You are offline'), t('Nothing was recorded. Check-out is only confirmed when the server receives it.'), null, submit);
    modal.setBody(spinner(t('Checking out...')));
    try {
      fix = await freshFix(provider, fix); const res = await api.call('checkOut', { ...fixPayload(fix), ...(photo ? { selfie_base64: photo.base64, selfie_mime: photo.mime } : {}) }); cleanup();
      modal.setBody(h('div', { class: 'alert alert-ok', id: 'checkout-result' }, h('strong', {}, t('Checked out')), res.early_checkout_minutes > 0 ? h('p', {}, t('Early check-out: {n} minutes before shift end.', { n: res.early_checkout_minutes })) : null),
        h('div', { class: 'form-actions' }, button(t('Done'), { kind: 'primary', on: { click: () => { modal.close(); onDone(res); } } })));
    } catch (e) {
      if (e.code === 'OUTSIDE_GEOFENCE') return fail(t('You are outside the assigned branch.'), t('Check-out requires you to be at the branch.'), infoRows([['Current distance', `${Math.round((e.details || {}).distance_meters)} meters`], ['Required', `Within ${(e.details || {}).required_within_meters} meters`]]), locate);
      if (e.code === 'SELFIE_REQUIRED') return fail(t('Selfie required'), errorMessage(e), null, stepCamera);
      if (['STALE_LOCATION', 'LOW_ACCURACY', 'GPS_UNAVAILABLE'].includes(e.code)) return fail(t('Location problem'), errorMessage(e), null, locate);
      if (e.state) return fail(t('Location problem'), t(LOC_HELP[e.state] || LOC_HELP.UNAVAILABLE), null, locate);
      fail(['OFFLINE', 'NETWORK_ERROR', 'SERVER_UNAVAILABLE'].includes(e.code) ? t('Not checked out') : t('Check-out failed'), errorMessage(e), null, ['ALREADY_CHECKED_OUT', 'NOT_CHECKED_IN'].includes(e.code) ? null : submit);
    }
  }
  modal = openModal({ title: t('Check Out'), body: spinner(), onClose: cleanup }); locate(); return modal;
}
