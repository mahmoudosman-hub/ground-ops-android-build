import { h, clear, append } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { errorMessage } from '../core/errors.js';

/* ---------- status badges: color AND text (never color alone) ---------- */
const BADGES = {
  ON_TIME: ['ok', 'On time'], LATE: ['bad', 'Late'], ABSENT: ['bad', 'Absent'], NOT_CHECKED_IN: ['muted', 'Not checked in'], CHECKED_IN: ['info', 'On duty'],
  CHECKED_OUT: ['muted', 'Checked out'], ON_LEAVE: ['warn', 'On leave'], INSIDE: ['ok', 'Inside branch'], OUTSIDE: ['bad', 'Outside branch'], UNKNOWN: ['muted', 'Location unknown'],
  ACTIVE: ['ok', 'Active'], INACTIVE: ['muted', 'Inactive'], CANCELLED: ['muted', 'Cancelled'],
  TRACKING_ACTIVE: ['info', 'Tracking active'], PAUSED: ['warn', 'Tracking paused'], PERMISSION_DENIED: ['bad', 'Location permission denied'], BACKGROUND_RESTRICTED: ['warn', 'Background restricted'],
  GPS_DISABLED: ['bad', 'GPS disabled'], UNAVAILABLE: ['muted', 'Tracking unavailable'], TRACKING_UNAVAILABLE: ['warn', 'Tracking unavailable'], STOPPED: ['muted', 'Tracking off'],
  POSSIBLE_SPOOFING: ['bad', 'Possible spoofing'], MISSING_CHECKOUT: ['warn', 'Missing check-out'], LOW_ACCURACY: ['warn', 'Low accuracy'], CHECKOUT_OUTSIDE_GEOFENCE: ['warn', 'Checked out outside branch'],
  CRITICAL: ['bad', 'Critical'], WARN: ['warn', 'Warning'], INFO: ['info', 'Info'],
  PENDING_PARTNER: ['warn', 'Waiting for colleague'], PENDING_ADMIN: ['warn', 'Waiting for admin'], APPROVED: ['ok', 'Approved'], REJECTED: ['bad', 'Rejected'], REJECTED_BY_PARTNER: ['bad', 'Declined by colleague'], CANCELLED: ['muted', 'Cancelled'], EXPIRED: ['muted', 'Expired'], DRAFT: ['muted', 'Draft'], EARLY_LEAVE_SET: ['info', 'Early leave'], SICK_PENDING: ['warn', 'Sick request pending'],
  ON_BREAK: ['info', 'On break'], BREAK_EXCEEDED: ['bad', 'Break over limit'],
  EXIT_GEOFENCE: ['bad', 'Left branch'], ENTER_GEOFENCE: ['ok', 'Returned'], ONLINE: ['ok', 'Online'], OFFLINE: ['bad', 'Offline']
};
export function badge(code, label) {
  const [kind, text] = BADGES[code] || ['muted', code || '-'];
  const icon = { ok: '✔', bad: '✖', warn: '▲', info: '●', muted: '○' }[kind];
  return h('span', { class: `badge badge-${kind}`, dataset: { status: code } }, h('span', { 'aria-hidden': 'true' }, icon + ' '), t(label || text));
}

/* ---------- toast / modal ---------- */
export function toast(message, kind = 'info', ms = 4500) {
  let box = globalThis.document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' }); globalThis.document.body.appendChild(box); }
  const el = h('div', { class: `toast toast-${kind}` }, message); box.appendChild(el);
  setTimeout(() => el.remove(), ms); return el;
}
export function toastError(e) { return toast(errorMessage(e), 'bad', 7000); }

export function openModal({ title, body, actions, wide, onClose }) {
  const doc = globalThis.document, previous = doc.activeElement;
  const close = () => { overlay.remove(); if (previous && previous.focus) previous.focus(); if (onClose) onClose(); };
  const head = h('div', { class: 'modal-head' }, h('h2', { id: 'modal-title' }, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('Close'), on: { click: close } }, '✕'));
  const foot = actions && actions.length ? h('div', { class: 'modal-actions' }, actions) : null;
  const dlg = h('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' }, head, h('div', { class: 'modal-body' }, body), foot);
  const overlay = h('div', { class: 'overlay', on: { keydown: (e) => { if (e.key === 'Escape') close(); } } }, dlg);
  doc.body.appendChild(overlay);
  const first = dlg.querySelector('input,select,textarea,button.btn'); if (first) first.focus();
  return { close, el: dlg, setBody(...n) { const b = dlg.querySelector('.modal-body'); clear(b); append(b, n); } };
}
export function confirmDialog(message, { okLabel = t('Confirm'), danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false; const fin = (v) => { if (!done) { done = true; m.close(); resolve(v); } };
    const m = openModal({ title: t('Please confirm'), body: h('p', {}, message), onClose: () => fin(false),
      actions: [button(t('Cancel'), { on: { click: () => fin(false) } }), button(okLabel, { kind: danger ? 'danger' : 'primary', on: { click: () => fin(true) } })] });
  });
}

export function button(label, o = {}) {
  return h('button', { type: o.type || 'button', class: `btn btn-${o.kind || 'default'}${o.big ? ' btn-big' : ''}${o.small ? ' btn-small' : ''}${o.class ? ' ' + o.class : ''}`, disabled: o.disabled, on: o.on, id: o.id, 'aria-label': o.aria }, label);
}
export const spinner = (msg) => h('div', { class: 'spinner', role: 'status' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), msg || t('Loading...'));
export const emptyState = (msg) => h('p', { class: 'empty' }, msg || t('Nothing to show.'));
export const errorBox = (e) => h('div', { class: 'alert alert-bad', role: 'alert' }, errorMessage(e));

/* ---------- table (stacks into cards on narrow screens) ---------- */
export function dataTable({ columns, rows, empty }) {
  if (!rows.length) return emptyState(empty);
  const thead = h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col' }, t(c.label)))));
  const tbody = h('tbody', {}, rows.map((r) => h('tr', {}, columns.map((c) => {
    const v = c.render ? c.render(r) : r[c.key]; return h('td', { 'data-label': t(c.label), class: c.class }, v === null || v === undefined || v === '' ? '-' : v);
  }))));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, thead, tbody));
}
export function pager({ page, page_size, total }, go) {
  const pages = Math.max(1, Math.ceil(total / page_size));
  return h('div', { class: 'pager' }, h('span', {}, t('{n} records', { n: total })),
    button(t('Previous'), { small: true, disabled: page <= 1, on: { click: () => go(page - 1) } }), h('span', {}, t('Page {p} of {n}', { p: page, n: pages })),
    button(t('Next'), { small: true, disabled: page >= pages, on: { click: () => go(page + 1) } }));
}

/* ---------- forms ---------- */
export function opt(value, label) { return { value, label }; }
export function buildForm(fields, values = {}, { onSubmit, submitLabel, cancel, compact } = {}) {
  const inputs = {};
  const rows = fields.map((f) => {
    const id = `f-${f.name}-${Math.random().toString(36).slice(2, 7)}`; let input;
    const val = values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : (f.value !== undefined ? f.value : '');
    if (f.type === 'select') input = h('select', { id, name: f.name }, (f.options || []).map((o) => h('option', { value: o.value, selected: String(o.value) === String(val) }, o.label)));
    else if (f.type === 'textarea') input = h('textarea', { id, name: f.name, rows: 3, maxlength: f.max }, val);
    else if (f.type === 'checkbox') input = h('input', { id, name: f.name, type: 'checkbox', checked: !!val });
    else input = h('input', { id, name: f.name, type: f.type || 'text', value: val, min: f.min, max: f.max, step: f.step, maxlength: f.maxlength, placeholder: f.placeholder, autocomplete: f.autocomplete || 'off', inputmode: f.inputmode, pattern: f.pattern });
    if (f.required) input.required = true; if (f.disabled) input.disabled = true; input.dataset.type = f.type || 'text';
    inputs[f.name] = input;
    return f.type === 'checkbox' ? h('div', { class: 'field field-check' }, input, h('label', { for: id }, t(f.label)), f.hint ? h('small', {}, t(f.hint)) : null)
      : h('div', { class: 'field' }, h('label', { for: id }, t(f.label), f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), input, f.hint ? h('small', {}, t(f.hint)) : null);
  });
  const get = () => { const o = {}; for (const f of fields) { const el = inputs[f.name]; let v = el.type === 'checkbox' ? el.checked : el.value; if (f.type === 'number') v = v === '' ? undefined : Number(v); else if (typeof v === 'string' && f.trim !== false) v = v.trim(); o[f.name] = v; } return o; };
  const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const form = h('form', { class: `form${compact ? ' form-inline' : ''}`, novalidate: false },
    ...rows, err, onSubmit ? h('div', { class: 'form-actions' }, cancel ? button(t('Cancel'), { on: { click: cancel } }) : null, h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel || t('Save'))) : null);
  if (onSubmit) form.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = form.querySelector('button[type=submit]'); err.hidden = true; if (btn) btn.disabled = true;
    try { await onSubmit(get()); } catch (x) { err.textContent = errorMessage(x); err.hidden = false; } finally { if (btn) btn.disabled = false; }
  });
  return { el: form, get, inputs, set(n, v) { inputs[n].value = v; } };
}

/* ---------- paged list page: filters + table + pager ---------- */
export function listPage({ filters = [], load, columns, empty, toolbar, auto }) {
  const body = h('div', { class: 'list-body' }); let page = 1, timer = null;
  const filterForm = filters.length ? buildForm(filters, {}, { compact: true, onSubmit: async () => { page = 1; await reload(); }, submitLabel: t('Apply') }) : null;
  async function reload() {
    clear(body); body.appendChild(spinner());
    try {
      const res = await load(filterForm ? filterForm.get() : {}, page); clear(body);
      if (res.before) body.appendChild(res.before);
      body.appendChild(dataTable({ columns, rows: res.items, empty })); if (res.total !== undefined) body.appendChild(pager(res, (p) => { page = p; reload(); }));
    } catch (e) { clear(body); body.appendChild(errorBox(e)); }
  }
  const el = h('div', { class: 'list-page' }, toolbar ? h('div', { class: 'toolbar' }, toolbar) : null, filterForm ? filterForm.el : null, body);
  if (auto) timer = setInterval(() => { if (el.isConnected) reload(); else clearInterval(timer); }, auto);
  reload(); return { el, reload, stop() { clearInterval(timer); }, filterForm };
}

export function copyText(text) { try { return globalThis.navigator.clipboard.writeText(text); } catch (e) { return Promise.reject(e); } }
export function showSecret({ title, label, secret, note }) {
  const code = h('code', { class: 'secret', id: 'secret-value' }, secret);
  let m;
  m = openModal({ title, body: [h('p', {}, label), code, h('p', { class: 'hint' }, note || t('Shown once. It is not stored and cannot be retrieved later.'))],
    actions: [button(t('Copy'), { on: { click: () => copyText(secret).then(() => toast(t('Copied'), 'ok'), () => toast(t('Select and copy it manually'), 'warn')) } }), button(t('Done'), { kind: 'primary', on: { click: () => m.close() } })] });
  return m;
}
export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob), a = h('a', { href: url, download: filename });
  globalThis.document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
