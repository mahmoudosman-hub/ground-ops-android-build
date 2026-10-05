/** Captain screens: "My schedule" and "Requests" (swaps, leave incl. sick with proof files, early leave). All rules are enforced by the server; this file only collects input and shows results. */
import { h, mount } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtDate, fmtDateTime, todayLocal, addDays } from '../../core/time.js';
import { errorMessage } from '../../core/errors.js';
import { badge, button, buildForm, openModal, spinner, toast, toastError, emptyState, errorBox } from '../../components/ui.js';
import { captureToJpeg, fileToImage } from '../../services/camera.js';

export const MAX_PDF_BYTES = 1000000;
const coded = (code, msg) => Object.assign(new Error(msg), { code });
const TYPE_LABEL = { SHIFT_SWAP: 'Shift swap', OFF_SWAP: 'Days-off swap', EARLY_LEAVE: 'Early leave' };
const LEAVE_LABEL = { ANNUAL: 'Annual leave', CASUAL: 'Casual leave', SICK: 'Sick leave', OTHER: 'Other leave' };
export const requestTypeLabel = (r) => t(r.type === 'LEAVE' ? (LEAVE_LABEL[r.leave_type] || 'Leave') : (TYPE_LABEL[r.type] || r.type));
const weekday = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

/* ---------------- My schedule ---------------- */
export function createScheduleView({ api }) {
  const el = h('div', { id: 'schedule-view' });
  async function refresh() {
    mount(el, spinner());
    try {
      const r = await api.call('getMySchedule', { days: 14 }), b = r.balance;
      mount(el, h('section', { class: 'card', id: 'balance-card' }, h('h2', {}, t('Annual leave balance {y}', { y: b.year })),
        h('p', { class: 'big', id: 'balance-remaining' }, t('{n} days left', { n: b.remaining })),
        h('p', { class: 'hint' }, t('{e} per year · used {u} · waiting for approval {p}. Casual leave is taken from the same balance. At most {w} leave days per week.', { e: b.entitlement, u: b.used, p: b.pending, w: b.per_week_limit }))),
      h('section', { class: 'card' }, h('h2', {}, t('My schedule - next 14 days')), h('ul', { class: 'sched-list', id: 'schedule-list' }, r.days.map((d) => {
        const a = d.assignment, what = a ? h('span', {}, h('strong', {}, `${a.start_time} - ${a.end_time}`), ' · ', a.branch_name, a.end_overridden ? h('span', {}, ' ', badge('EARLY_LEAVE_SET', t('early leave'))) : null)
          : d.leave ? badge(d.leave.leave_type === 'SICK' ? 'ON_LEAVE' : 'ON_LEAVE', t(LEAVE_LABEL[d.leave.leave_type] || 'Leave')) : h('span', { class: 'hint' }, t('Day off'));
        return h('li', { class: d.date === todayLocal() ? 'today' : '', 'data-date': d.date }, h('span', { class: 'day' }, `${weekday(d.date)} ${fmtDate(d.date)}`), ' ', what, d.pending.length ? h('span', {}, ' ', badge('PENDING_ADMIN', t('request pending'))) : null);
      }))));
    } catch (e) { mount(el, errorBox(e), button(t('Retry'), { on: { click: refresh } })); }
  }
  return { el, refresh };
}

/* ---------------- file preparation (sick leave proof) ---------------- */
function toBase64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return globalThis.btoa(s); }
function readBuffer(file) { return new Promise((resolve, reject) => { const r = new globalThis.FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(coded('INVALID_FILE', t('This file could not be read.'))); r.readAsArrayBuffer(file); }); } // FileReader works in every browser (Blob.arrayBuffer is missing in older ones)
export async function prepareProofFile(file) {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw coded('IMAGE_TOO_LARGE', t('This PDF is larger than 1 MB. Take photos of its pages instead.'));
    return { base64: toBase64(new Uint8Array(await readBuffer(file))), mime: 'application/pdf', name: file.name };
  }
  if (!/^image\//.test(file.type)) throw coded('INVALID_FILE', t('Only photos and PDF files can be attached.'));
  const p = await captureToJpeg(await fileToImage(file), 700000, { maxDim: 1600 }); // readable but small
  return { base64: p.base64, mime: p.mime, name: String(file.name || 'proof').replace(/\.\w+$/, '') + '.jpg' };
}
export async function uploadProofAndSubmit(api, requestId, files, onProgress) {
  for (let i = 0; i < files.length; i++) {
    onProgress && onProgress(t('Uploading file {i} of {n}...', { i: i + 1, n: files.length }));
    const f = await prepareProofFile(files[i]);
    await api.call('attachRequestFile', { request_id: requestId, file_base64: f.base64, file_mime: f.mime, file_name: f.name });
  }
  onProgress && onProgress(t('Sending the request...'));
  return api.call('submitRequest', { request_id: requestId });
}

/* ---------------- Requests ---------------- */
function partnerPicker(api) {
  let chosen = null; const out = h('p', { class: 'hint', id: 'partner-chosen' }, t('Nobody selected yet.')), list = h('div', { id: 'partner-results' }), q = h('input', { type: 'search', id: 'partner-q', placeholder: t('Type part of the colleague name'), autocomplete: 'off', maxlength: 40 });
  const search = async () => {
    mount(list, spinner());
    try {
      const r = await api.call('searchColleagues', { q: q.value.trim() });
      if (!r.items.length) return mount(list, emptyState(t('No colleague found.')));
      mount(list, ...r.items.map((i) => button(`${i.name} (${i.employee_id})`, { small: true, on: { click: () => { chosen = i; mount(out, t('Selected: {n}', { n: `${i.name} (${i.employee_id})` })); mount(list); } } })));
    } catch (e) { mount(list, errorBox(e)); }
  };
  return { value: () => chosen, el: h('div', { class: 'field' }, h('label', { for: 'partner-q' }, t('The other captain'), h('span', { class: 'req' }, ' *')), h('div', { class: 'btn-row' }, q, button(t('Search'), { id: 'btn-partner-search', on: { click: search } })), list, out) };
}
const needPartner = (picker) => { if (!picker.value()) throw coded('VALIDATION_ERROR', t('Choose the other captain first.')); return picker.value().employee_id; };

export function createRequestsView({ api, onChange }) {
  const el = h('div', { id: 'requests-view' }); let modal = null;
  const done = (msg) => { if (modal) modal.close(); toast(msg, 'ok'); refresh(); if (onChange) onChange(); };

  function formModal(title, fields, extraTop, extraBottom, submit, values) {
    const f = buildForm(fields, values || {}, { submitLabel: t('Send request'), onSubmit: submit });
    if (extraBottom) f.el.insertBefore(extraBottom, f.el.querySelector('.form-actions') || null);
    modal = openModal({ title, body: h('div', {}, extraTop || null, f.el) }); return f;
  }
  function swapShift() {
    const picker = partnerPicker(api);
    formModal(t('Swap shift'), [{ name: 'date_from', label: 'Date of the shifts to swap', type: 'date', required: true, min: todayLocal() }, { name: 'note', label: 'Note (optional)', type: 'textarea', max: 300 }],
      h('p', { class: 'hint' }, t('You and the other captain both work on this date with different shifts. After you send it, the other captain must agree, then the admin must approve.')), picker.el,
      async (v) => { await api.call('createRequest', { type: 'SHIFT_SWAP', partner_id: needPartner(picker), date_from: v.date_from, note: v.note || undefined }); done(t('Request sent to the other captain')); });
  }
  function swapOff() {
    const picker = partnerPicker(api);
    formModal(t('Swap days off'), [{ name: 'date_from', label: 'A day you work now (you will be off)', type: 'date', required: true, min: todayLocal() }, { name: 'date_b', label: 'A day you are off now (you will work)', type: 'date', required: true, min: todayLocal() }, { name: 'note', label: 'Note (optional)', type: 'textarea', max: 300 }],
      h('p', { class: 'hint' }, t('The other captain is off on your first date and works on your second date, and takes your working day while you take theirs.')), picker.el,
      async (v) => { await api.call('createRequest', { type: 'OFF_SWAP', partner_id: needPartner(picker), date_from: v.date_from, date_b: v.date_b, note: v.note || undefined }); done(t('Request sent to the other captain')); });
  }
  function leave() {
    const fileInput = h('input', { type: 'file', id: 'proof-files', accept: 'image/*,application/pdf', multiple: true }), progress = h('p', { class: 'hint', id: 'proof-progress' });
    const box = h('div', { class: 'field', id: 'proof-box', hidden: true }, h('label', { for: 'proof-files' }, t('Proof (medical report)'), h('span', { class: 'req' }, ' *')), fileInput, h('small', {}, t('Up to 5 photos or PDF files (PDF up to 1 MB). The admin will review them.')), progress);
    const f = formModal(t('Request leave'), [{ name: 'leave_type', label: 'Type', type: 'select', options: [{ value: 'ANNUAL', label: t('Annual leave') }, { value: 'CASUAL', label: t('Casual leave (deducted from annual)') }, { value: 'SICK', label: t('Sick leave') }, { value: 'OTHER', label: t('Other leave') }] },
      { name: 'date_from', label: 'From', type: 'date', required: true }, { name: 'date_to', label: 'To', type: 'date', required: true }, { name: 'note', label: 'Note (optional)', type: 'textarea', max: 300 }], null, box, async (v) => {
      const body = { type: 'LEAVE', leave_type: v.leave_type, date_from: v.date_from, date_to: v.date_to || v.date_from, note: v.note || undefined };
      if (v.leave_type !== 'SICK') { await api.call('createRequest', body); return done(t('Request sent to the admin')); }
      const files = [...fileInput.files]; if (!files.length) throw coded('FILE_REQUIRED', t('Attach at least one proof file (medical report).')); if (files.length > 5) throw coded('TOO_MANY_FILES', t('At most 5 files.'));
      const { request } = await api.call('createRequest', body); try { await uploadProofAndSubmit(api, request.request_id, files, (m) => { progress.textContent = m; }); } catch (e) { refresh(); throw e; }
      done(t('Sick leave request sent to the admin'));
    });
    const sel = f.el.querySelector('[name=leave_type]'); sel.addEventListener('change', () => { box.hidden = sel.value !== 'SICK'; });
  }
  function early() {
    formModal(t('Early leave'), [{ name: 'date_from', label: 'Date', type: 'date', required: true, value: todayLocal(), min: todayLocal() }, { name: 'time_value', label: 'I will leave at', type: 'time', required: true }, { name: 'note', label: 'Reason (optional)', type: 'textarea', max: 300 }],
      h('p', { class: 'hint' }, t('If the admin approves, your shift ends at this time. If not, your shift stays as it is.')), null,
      async (v) => { await api.call('createRequest', { type: 'EARLY_LEAVE', date_from: v.date_from, time_value: v.time_value, note: v.note || undefined }); done(t('Request sent to the admin')); });
  }
  function continueSick(r) {
    const fileInput = h('input', { type: 'file', id: 'proof-files', accept: 'image/*,application/pdf', multiple: true }), progress = h('p', { class: 'hint', id: 'proof-progress' }), err = h('div', { class: 'form-error', hidden: true });
    modal = openModal({ title: t('Add proof and send'), body: h('div', {}, h('p', {}, r.summary), h('div', { class: 'field' }, fileInput), progress, err), actions: [button(t('Send'), { kind: 'primary', id: 'btn-sick-send', on: { click: async () => {
      try { if (!fileInput.files.length) throw coded('FILE_REQUIRED', t('Attach at least one proof file (medical report).')); await uploadProofAndSubmit(api, r.request_id, [...fileInput.files], (m) => { progress.textContent = m; }); done(t('Sick leave request sent to the admin')); } catch (e) { err.hidden = false; err.textContent = errorMessage(e); } } } }), button(t('Close'), { on: { click: () => modal.close() } })] });
  }
  async function answer(r, decision) {
    if (decision === 'APPROVE') { try { await api.call('respondToRequest', { request_id: r.request_id, decision }); toast(t('You agreed. Now the admin decides.'), 'ok'); refresh(); } catch (e) { toastError(e); refresh(); } return; }
    modal = openModal({ title: t('Decline swap'), body: buildForm([{ name: 'note', label: 'Reason (optional)', type: 'textarea', max: 300 }], {}, { submitLabel: t('Decline'), onSubmit: async (v) => { await api.call('respondToRequest', { request_id: r.request_id, decision, note: v.note || undefined }); modal.close(); toast(t('Swap declined'), 'ok'); refresh(); } }).el });
  }
  async function cancel(r) { try { await api.call('cancelRequest', { request_id: r.request_id }); toast(t('Request cancelled'), 'ok'); refresh(); if (onChange) onChange(); } catch (e) { toastError(e); refresh(); } }

  const statusLabel = { DRAFT: 'Draft - proof not sent yet', PENDING_PARTNER: 'Waiting for the other captain', PENDING_ADMIN: 'Waiting for the admin', APPROVED: 'Approved', REJECTED: 'Rejected by the admin', REJECTED_BY_PARTNER: 'Declined by the other captain', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };
  const card = (r, incoming) => h('li', { class: 'req', id: `req-${r.request_id}`, 'data-status': r.status }, h('strong', {}, requestTypeLabel(r)), ' ', badge(r.status, t(statusLabel[r.status] || r.status)), h('p', {}, r.summary),
    r.admin_note ? h('p', { class: 'hint' }, t('Admin: {n}', { n: r.admin_note })) : null, r.partner_note ? h('p', { class: 'hint' }, t('Colleague: {n}', { n: r.partner_note })) : null, r.result && r.status === 'APPROVED' ? h('p', { class: 'hint' }, r.result) : null,
    h('p', { class: 'hint' }, fmtDateTime(r.created_at)),
    h('span', { class: 'btn-row' }, incoming && r.can_respond ? [button(t('Agree'), { kind: 'primary', small: true, class: 'req-agree', on: { click: () => answer(r, 'APPROVE') } }), button(t('Decline'), { small: true, class: 'req-decline', on: { click: () => answer(r, 'REJECT') } })] : null,
      r.status === 'DRAFT' ? button(t('Add proof and send'), { small: true, class: 'req-continue', on: { click: () => continueSick(r) } }) : null, r.can_cancel ? button(t('Cancel request'), { small: true, class: 'req-cancel', on: { click: () => cancel(r) } }) : null));

  async function refresh() {
    mount(el, spinner());
    try {
      const r = await api.call('getMyRequests', {});
      mount(el, h('section', { class: 'card' }, h('h2', {}, t('New request')), h('div', { class: 'btn-row' }, button(t('Swap shift'), { id: 'btn-new-swap', on: { click: swapShift } }), button(t('Swap days off'), { id: 'btn-new-offswap', on: { click: swapOff } }),
        button(t('Leave'), { id: 'btn-new-leave', on: { click: leave } }), button(t('Early leave'), { id: 'btn-new-early', on: { click: early } }))),
      r.incoming.length ? h('section', { class: 'card', id: 'incoming-card' }, h('h2', {}, t('Waiting for your answer')), h('ul', { class: 'req-list' }, r.incoming.map((x) => card(x, true)))) : null,
      h('section', { class: 'card' }, h('h2', {}, t('My requests')), r.mine.length ? h('ul', { class: 'req-list', id: 'my-requests' }, r.mine.map((x) => card(x, false))) : emptyState(t('You have no requests yet.'))));
    } catch (e) { mount(el, errorBox(e), button(t('Retry'), { on: { click: refresh } })); }
  }
  return { el, refresh };
}
