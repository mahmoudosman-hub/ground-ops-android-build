/**
 * Capacitor <-> PWA bridge for Android (Batch 3).
 *
 * The Android app (Capacitor WebView) loads THE SAME frontend as the PWA. This file feature-detects the native
 * plugin "GopsLocation" and, if present, publishes `globalThis.GopsNativeLocation`, which services/location/index.js
 * then prefers. In a normal browser/iPhone PWA nothing is installed and the browser provider is used.
 *
 * Native responsibilities (Java, see android/app/src/main/java/com/groundops/tracker):
 *   - foreground service that keeps recording AND uploading location points while the screen is off / app minimized
 *   - durable SQLite queue (UNIQUE timestamp => no duplicates), ordered sync, network-recovery retry
 *   - mock-location flag (Location.isMock) and provider source
 * The app NEVER decides inside/outside or lateness: the native layer only transports raw coordinates to the same API.
 */
import { LocationError } from '../location/browser-provider.js';

const STATE_BY_CODE = { PERMISSION_DENIED: 'PERMISSION_DENIED', GPS_DISABLED: 'GPS_DISABLED', TIMEOUT: 'UNAVAILABLE', UNAVAILABLE: 'UNAVAILABLE' };
const asLocationError = (e) => { const err = new LocationError(STATE_BY_CODE[(e && (e.code || e.message)) || ''] || 'UNAVAILABLE', (e && e.message) || 'Location unavailable'); err.code = (e && e.code) || null; return err; }; // keeps the native error code (e.g. START_NOT_ALLOWED)

export function installNativeBridge(env = globalThis) {
  const cap = env.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null; // not inside the APK: browser behaviour
  const plugin = typeof cap.registerPlugin === 'function' ? cap.registerPlugin('GopsLocation') : (cap.Plugins && cap.Plugins.GopsLocation);
  if (!plugin) return null;
  env.GopsNativeLocation = createNativeBridge(plugin);
  return env.GopsNativeLocation;
}

export function createNativeBridge(plugin) {
  const call = async (name, arg) => { try { return await plugin[name](arg || {}); } catch (e) { throw asLocationError(e); } };
  const emptyStatus = { running: false, state: 'STOPPED', pendingPoints: 0, lastFixAt: null, lastSyncAt: null, lastError: null, ended: false, endedReason: null };
  return {
    isAvailable: () => true,
    /** 'granted' | 'denied' | 'prompt' for foreground (while-in-use) precise location. Background location is deliberately NOT requested. */
    async permission() { const s = await call('permissionStatus'); return s.location === 'granted' ? 'granted' : s.location === 'denied' ? 'denied' : 'prompt'; },
    async requestPermission() { const s = await call('askPermissions'); return s.location === 'granted' ? 'granted' : 'denied'; },
    async requestLocationPermission() { return this.requestPermission(); },
    async getPosition(opts) { const p = await call('getCurrentPosition', opts); return { latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy, timestamp: p.timestamp, isMock: typeof p.isMock === 'boolean' ? p.isMock : null, source: p.source || 'fused' }; },
    /** Starts the foreground service. config: {apiUrl, token, employeeId, intervalMs, minDistanceMeters, heartbeatMs, syncIntervalMs, stopAtMs} */
    async startTracking(config) { return call('startTracking', config); },
    async stopTracking() { return call('stopTracking'); },
    /** Break: stop sampling GPS but keep the service (and its notification) alive. Needs the app build that includes these methods. */
    async pauseTracking() { return call('pauseTracking'); },
    async resumeTracking() { return call('resumeTracking'); },
    /** The REAL state, read from the native service/database (never inferred by the web layer). */
    async getTrackingStatus() { return { ...emptyStatus, ...(await call('getTrackingStatus')) }; },
    /** permissions, GPS switch, notification permission, battery optimisation, background restriction, device info */
    async getNativeLocationStatus() { return call('getNativeLocationStatus'); },
    async openBatterySettings() { return call('openBatterySettings'); },
    async openLocationSettings() { return call('openLocationSettings'); },
    async openAppSettings() { return call('openAppSettings'); }
  };
}
