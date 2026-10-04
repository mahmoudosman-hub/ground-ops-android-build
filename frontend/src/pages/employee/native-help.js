/** "Tracking on this phone" screen: honest explanation + live status of what can stop Android tracking. */
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { openModal, button, badge, spinner } from '../../components/ui.js';

const row = (label, ok, okText, badText) => h('li', {}, h('b', {}, t(label)), ': ', ok === null ? t('unknown') : ok ? h('span', { class: 'badge badge-ok' }, '✔ ' + t(okText)) : h('span', { class: 'badge badge-warn' }, '▲ ' + t(badText)));

export function openTrackingHelp({ provider }) {
  const m = openModal({ title: t('Tracking on this phone'), body: spinner(), wide: false });
  async function render() {
    let s = null; try { s = await provider.getNativeStatus(); } catch (e) { s = null; }
    const rows = s ? h('ul', { class: 'status-list', id: 'native-status' },
      row('Location permission', s.permission === 'granted', 'Allowed', s.permission === 'denied' ? 'Blocked' : 'Not asked yet'),
      row('Location (GPS) switch', s.gpsEnabled, 'On', 'Off'),
      row('Notifications', s.notificationsEnabled, 'Allowed', 'Blocked (tracking still runs, but its status notification is hidden)'),
      row('Battery optimization', s.ignoringBatteryOptimizations === null || s.ignoringBatteryOptimizations === undefined ? null : s.ignoringBatteryOptimizations, 'Not restricted for this app', 'Active - may delay or stop tracking'),
      row('Background restriction', s.backgroundRestricted === null || s.backgroundRestricted === undefined ? null : !s.backgroundRestricted, 'None', 'Restricted by Android')) : h('p', { class: 'hint' }, t('Status unavailable.'));
    m.setBody(
      h('p', {}, t('While you are checked in, this app runs a location service with a visible notification. It keeps working when you lock the screen or switch to another app.')),
      h('h3', {}, t('What can still stop tracking')),
      h('ul', {}, h('li', {}, t('Battery optimization / "battery saver" on some phones (Xiaomi, Huawei, Oppo, Samsung and others) can pause apps in the background. If tracking stops, open the battery settings below and choose "Unrestricted" or "Don\'t optimize" for this app.')),
        h('li', {}, t('Turning off Location, revoking the permission, or force-stopping the app stops tracking. The dashboard then shows "Tracking unavailable" - not that you left the branch.')),
        h('li', {}, t('Without internet the app keeps your location points and uploads them, in order, when the connection returns.'))),
      h('h3', {}, t('Permissions we ask for')),
      h('ul', {}, h('li', {}, t('Location "while using the app" (precise): to check you in and track your shift. We do not ask for "all the time" location.')), h('li', {}, t('Notifications: to show the tracking notification Android requires.')), h('li', {}, t('Camera: only for the check-in selfie.'))),
      h('h3', {}, t('Current status')), rows,
      h('div', { class: 'form-actions' }, button(t('Refresh'), { on: { click: render } }), provider.capabilities.batterySettings ? button(t('Battery settings'), { id: 'btn-battery', on: { click: () => provider.openBatterySettings() } }) : null,
        button(t('Location settings'), { on: { click: () => provider.openLocationSettings && provider.openLocationSettings() } }), button(t('Close'), { kind: 'primary', on: { click: () => m.close() } })));
  }
  render(); return m;
}
