/** Admin: captain requests (swaps, leave, sick leave with proof files, early leave). The admin's approval is what changes the schedule. */
import { h, mount } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fmtDateTime } from '../../core/time.js';
import { badge, button, buildForm, listPage, opt, openModal, spinner, toast, toastError, errorBox, emptyState } from '../../components/ui.js';
import { clean } from './lookups.js';
import { requestTypeLabel } from '../employee/requests.js';

const STATUS = [['', 'All'], ['PENDING_ADMIN', 'Waiting for the admin'], ['PENDING_PARTNER', 'Waiting for the other captain'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['REJECTED_BY_PARTNER', 'Declined by the other captain'], ['CANCELLED', 'Cancelled'], ['EXPIRED', 'Expired'], ['DRAFT', 'Draft']];
const TYPES = [['', 'All types'], ['SHIFT_SWAP', 'Shift swap'], ['OFF_SWAP', 'Days-off swap'], ['LEAVE', 'Leave'], ['EARLY_LEAVE', 'Early leave']];

export async function showProof(ctx, file) {
  const m = openModal({ title: file.name || t('Proof file'), body: spinner(), wide: true });
  try {
    const r = await ctx.api.call('getRequestFile', { file_id: file.file_id }), url = `data:${r.mime};base64,${r.data_base64}`;
    m.setBody(r.mime === 'application/pdf' ? h('p', {}, h('a', { href: url, download: r.name || 'proof.pdf', id: 'proof-download' }, t('Download the PDF')), ' ', h('small', { class: 'hint' }, t('(opening is recorded in the audit log)'))) : h('div', { class: 'proof-view' }, h('img', { src: url, alt: t('Proof file'), id: 'proof-image' })));
  } catch (e) { m.setBody(errorBox(e)); }
}

export function openReview(ctx, id, onDone) {
  const canFiles = ctx.user.permissions.includes('view_request_files'), canDecide = ctx.user.permissions.includes('manage_requests');
  const m = openModal({ title: t('Request'), body: spinner(), wide: true });
  (async () => {
    try {
      const { request: r } = await ctx.api.call('getRequest', { request_id: id }); const picked = {};
      const dates = r.type === 'LEAVE' ? r.dates : null; (dates || []).forEach((d) => { picked[d] = true; });
      const dateBox = dates ? h('fieldset', { class: 'field', id: 'approve-dates' }, h('legend', {}, t('Days to approve')), dates.map((d) => { const day = (r.schedule || []).find((x) => x.date === d), cb = h('input', { type: 'checkbox', checked: true, value: d, on: { change: (e) => { picked[d] = e.target.checked; } } });
        return h('label', { class: 'inline' }, cb, ' ', d, day && day.assignment ? ` (${day.assignment.start_time}-${day.assignment.end_time})` : day && day.leave ? ` (${day.leave.leave_type})` : ` (${t('day off')})`, ' '); })) : null;
      const note = h('textarea', { id: 'decision-note', rows: 2, maxlength: 300, placeholder: t('Note for the captain (optional)') });
      const act = async (decision) => {
        const body = { request_id: r.request_id, decision, note: note.value.trim() || undefined };
        if (decision === 'APPROVE' && dates) { const sel = dates.filter((d) => picked[d]); if (!sel.length) return toastError(new Error(t('Select at least one day.'))); if (sel.length !== dates.length) body.approved_dates = sel; }
        try { const res = await ctx.api.call('decideRequest', body); m.close(); toast(decision === 'APPROVE' ? (res.result || t('Approved')) : t('Request rejected'), 'ok', 8000); onDone(); } catch (e) { toastError(e); }
      };
      const open = r.status === 'PENDING_ADMIN', canReject = r.status === 'PENDING_PARTNER' || open;
      m.setBody(h('div', { id: 'review-body' }, h('h3', {}, requestTypeLabel(r), ' ', badge(r.status)), h('p', { id: 'review-summary' }, r.summary), r.note ? h('p', {}, t('Captain note: {n}', { n: r.note })) : null, r.partner_note ? h('p', { class: 'hint' }, t('Colleague note: {n}', { n: r.partner_note })) : null,
        r.check ? h('div', { class: `alert ${r.check.ok ? 'alert-ok' : 'alert-warn'}`, id: 'review-check' }, r.check.ok ? t('All rules are still satisfied.') : r.check.message) : null,
        r.balance ? h('p', { class: 'hint', id: 'review-balance' }, t('Balance {y}: {e} per year, used {u}, other pending {p}, left {r}.', { y: r.balance.year, e: r.balance.entitlement, u: r.balance.used, p: r.balance.pending, r: r.balance.remaining })) : null,
        r.leave_type === 'SICK' ? h('div', { id: 'review-files' }, h('h4', {}, t('Proof files ({n})', { n: r.files.length })), canFiles ? h('span', { class: 'btn-row' }, r.files.map((f, i) => button(`${t('View')} ${i + 1} · ${f.name}`, { small: true, class: 'view-proof', on: { click: () => showProof(ctx, f) } }))) : h('p', { class: 'hint' }, t('You do not have permission to open the files.'))) : null,
        r.status === 'APPROVED' ? h('p', { class: 'hint' }, r.result) : null, r.admin_note ? h('p', { class: 'hint' }, t('Admin note: {n}', { n: r.admin_note })) : null,
        canDecide && canReject ? h('div', {}, open ? dateBox : null, note, h('div', { class: 'form-actions' }, button(t('Close'), { on: { click: () => m.close() } }), button(t('Reject'), { id: 'btn-reject', on: { click: () => act('REJECT') } }),
          open ? button(t('Approve'), { kind: 'primary', id: 'btn-approve', on: { click: () => act('APPROVE') } }) : h('span', { class: 'hint' }, t('Approval is possible after the other captain agrees.')))) : h('div', { class: 'form-actions' }, button(t('Close'), { on: { click: () => m.close() } }))));
    } catch (e) { m.setBody(errorBox(e)); }
  })();
  return m;
}

export async function requestsPage(ctx) {
  const lp = listPage({
    filters: [{ name: 'status', label: 'Status', type: 'select', options: STATUS.map((s) => opt(s[0], t(s[1]))), value: 'PENDING_ADMIN' }, { name: 'type', label: 'Type', type: 'select', options: TYPES.map((s) => opt(s[0], t(s[1]))) }, { name: 'employee_id', label: 'Employee ID' }],
    columns: [{ key: 'created_at', label: 'Sent', render: (r) => fmtDateTime(r.created_at) }, { key: 'type', label: 'Type', render: (r) => requestTypeLabel(r) }, { key: 'summary', label: 'Request' }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      { key: 'file_count', label: 'Files', render: (r) => (r.file_count ? String(r.file_count) : '-') }, { key: 'actions', label: 'Actions', render: (r) => button(t('Review'), { small: true, class: 'review', on: { click: () => openReview(ctx, r.request_id, () => lp.reload()) } }) }],
    empty: t('No requests match.'), auto: 300000,
    async load(f, page) { const res = await ctx.api.call('getRequests', { ...clean(f), page, page_size: 50 }); return { items: res.items, total: res.total, page: res.page, page_size: res.page_size, before: h('p', { class: 'hint', id: 'open-count' }, t('{n} request(s) waiting for your decision.', { n: res.open_count })) }; }
  });
  return { el: h('div', {}, h('h1', {}, t('Requests')), h('p', { class: 'hint' }, t('Swaps, leave, sick leave (with proof files) and early leave asked for by captains. Your approval is what changes the schedule; it overrides the Google roster for those days.')), lp.el), destroy: lp.stop };
}
