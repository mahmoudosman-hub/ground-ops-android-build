/**
 * Browser (PWA) location provider.
 * HONEST LIMITS: web pages cannot track GPS in the background. On Android Chrome and iOS Safari the page is
 * throttled/suspended when the screen turns off or the app is switched away. This provider therefore only
 * delivers fixes while the app is visible. Optional "keep screen awake" (Screen Wake Lock API) lets the app keep
 * tracking while it stays open on screen. Mock-location flags are not exposed to browsers (is_mock = null).
 *
 * Provider contract (shared with the Capacitor native provider, Batch 3):
 *   id, capabilities{background, foregroundService, mockDetection, keepAwake}
 *   async permission() -> 'granted'|'denied'|'prompt'|'unsupported'
 *   async getPosition({timeoutMs, highAccuracy, maxAgeMs}) -> Fix
 *   watch({intervalMs, minDistanceMeters}, onFix, onState) -> stop()
 *   async setKeepAwake(bool)
 * Fix = { latitude, longitude, accuracy, timestamp(ms), isMock(true|false|null), source('gps'|'network'|'fused'|'unknown') }
 * States passed to onState: ACTIVE | PAUSED | PERMISSION_DENIED | BACKGROUND_RESTRICTED | GPS_DISABLED | UNAVAILABLE
 */
export class LocationError extends Error { constructor(state, message) { super(message); this.name = 'LocationError'; this.state = state; } }

export function createBrowserProvider(env = globalThis) {
  const nav = env.navigator, doc = env.document;
  let wake = null, wantAwake = false;
  const toFix = (p) => ({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp || Date.now(), isMock: null, source: 'unknown' });
  const mapErr = (e) => (e && e.code === 1 ? new LocationError('PERMISSION_DENIED', 'Location permission denied')
    : e && e.code === 2 ? new LocationError('GPS_DISABLED', 'Location is unavailable (GPS off or no signal)') : new LocationError('UNAVAILABLE', 'Timed out waiting for a GPS fix'));

  async function lockScreen() {
    try { if (wantAwake && nav.wakeLock && doc.visibilityState === 'visible' && !wake) { wake = await nav.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; }
  }
  const provider = {
    id: 'browser',
    capabilities: { background: false, foregroundService: false, mockDetection: false, keepAwake: !!(nav && nav.wakeLock) },
    async permission() {
      if (!nav || !nav.geolocation) return 'unsupported';
      try { if (nav.permissions && nav.permissions.query) return (await nav.permissions.query({ name: 'geolocation' })).state; } catch (e) { /* Safari: unsupported */ }
      return 'prompt';
    },
    getPosition({ timeoutMs = 20000, highAccuracy = true, maxAgeMs = 0 } = {}) {
      return new Promise((resolve, reject) => {
        if (!nav || !nav.geolocation) return reject(new LocationError('UNAVAILABLE', 'This device/browser has no geolocation support'));
        nav.geolocation.getCurrentPosition((p) => resolve(toFix(p)), (e) => reject(mapErr(e)), { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: maxAgeMs });
      });
    },
    watch({ intervalMs }, onFix, onState) {
      let stopped = false, timer = null, busy = false;
      const sample = async () => {
        if (stopped || busy || doc.visibilityState !== 'visible') return; busy = true;
        try { const fix = await provider.getPosition({ timeoutMs: 25000 }); if (!stopped) { onState('ACTIVE'); onFix(fix); } }
        catch (e) { if (!stopped) onState(e.state || 'UNAVAILABLE', e); } finally { busy = false; }
      };
      const onVis = () => {
        if (doc.visibilityState === 'visible') { onState('ACTIVE'); lockScreen(); sample(); }
        else onState('BACKGROUND_RESTRICTED'); // timers are throttled/suspended now; we cannot report it until the app is visible again
      };
      doc.addEventListener('visibilitychange', onVis);
      timer = setInterval(sample, intervalMs); sample();
      return () => { stopped = true; clearInterval(timer); doc.removeEventListener('visibilitychange', onVis); };
    },
    async setKeepAwake(on) {
      wantAwake = !!on;
      if (on) await lockScreen(); else if (wake) { try { await wake.release(); } catch (e) { /* ignore */ } wake = null; }
      return !!wake || !on;
    }
  };
  return provider;
}
