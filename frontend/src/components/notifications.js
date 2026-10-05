/** In-app notification bell. Free-stack limit: there is no phone push when the app is closed; notifications appear while the app is open (polled). */
import { h, mount } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { fmtDateTime } from '../core/time.js';
import { openModal, button, toast, emptyState } from './ui.js';

export function createNotificationBell({ api, intervalMs = 60000 }) {
  let items = [], unread = null, timer = null, destroyed = false;
  const count = h('span', { class: 'bell-count', id: 'bell-count', hidden: true }), btn = h('button', { type: 'button', class: 'icon-btn bell', id: 'btn-bell', 'aria-label': t('Notifications'), on: { click: open } }, h('span', { 'aria-hidden': 'true' }, '🔔'), count);
  function paint() { count.hidden = !unread; count.textContent = unread > 99 ? '99+' : String(unread || ''); btn.setAttribute('aria-label', unread ? t('Notifications ({n} unread)', { n: unread }) : t('Notifications')); }
  async function refresh() {
    if (destroyed) return;
    try {
      const r = await api.call('getNotifications', { page_size: 30 });
      const fresh = r.items.filter((n) => !n.read && !items.some((o) => o.notification_id === n.notification_id));
      if (unread !== null) fresh.slice(0, 2).forEach((n) => toast(`${n.title}: ${n.body}`, 'warn', 9000)); // announce what arrived since the last poll (not the backlog at start-up)
      items = r.items; unread = r.unread_count; paint();
    } catch (e) { /* offline or signed out: keep the last known state */ }
  }
  function open() {
    const list = () => (items.length ? h('ul', { class: 'notif-list', id: 'notif-list' }, items.map((n) => h('li', { class: n.read ? 'read' : 'unread' }, h('strong', {}, (n.read ? '' : '● ') + n.title), h('p', {}, n.body), h('small', {}, fmtDateTime(n.created_at))))) : emptyState(t('No notifications.')));
    const m = openModal({ title: t('Notifications'), body: list(), actions: [
      button(t('Mark all as read'), { id: 'btn-mark-read', on: { click: async () => { try { await api.call('markNotificationsRead', { all: true }); await refresh(); m.setBody(list()); } catch (e) { /* ignore */ } } } }),
      button(t('Close'), { kind: 'primary', on: { click: () => m.close() } })] });
  }
  timer = setInterval(() => { if (!globalThis.document || globalThis.document.visibilityState !== 'hidden') refresh(); }, intervalMs);
  refresh(); paint();
  return { el: btn, refresh, destroy() { destroyed = true; clearInterval(timer); }, state: () => ({ unread, items }) };
}
