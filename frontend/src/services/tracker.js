/**
 * Tracking orchestrator. While an employee is on duty it samples the location provider, stores each point in the
 * durable queue first, then flushes batches to the server (submitLocation). Offline => points wait in the queue and
 * are synced (chronologically, de-duplicated server-side) when the network returns.
 * The SERVER decides inside/outside; this class only transports points and exposes an honest tracking state.
 */
import { cfg } from '../core/config.js';

export function createTracker(opts) { return opts.provider.capabilities.nativeSync ? createNativeTracker(opts) : createWebTracker(opts); }

function createWebTracker({ api, provider, queue, userId, getSettings, onChange, intervalOverrideMs = 0, online = () => (globalThis.navigator ? globalThis.navigator.onLine !== false : true) }) {
  const st = { running: false, trackingState: 'STOPPED', lastFixAt: null, lastSyncAt: null, pending: 0, lastDistance: null, inside: null, lastFix: null, provider: provider.id, background: provider.capabilities.background, error: null, ended: false };
  let stopWatch = null, flushing = false, wantFlush = false, lastReported = null, flushPromise = Promise.resolve();
  const emit = () => onChange && onChange({ ...st });
  const toPoint = (f) => ({ timestamp: new Date(f.timestamp).toISOString(), latitude: f.latitude, longitude: f.longitude, accuracy_meters: Math.max(0, f.accuracy), ...(f.isMock === true || f.isMock === false ? { is_mock_location: f.isMock } : {}), location_source: f.source || 'unknown', tracking_source: provider.id === 'native' ? 'BACKGROUND_NATIVE' : 'FOREGROUND_WEB' });

  /** Callers may await the returned promise: it resolves after the in-flight sync (and any follow-up batch) finished. */
  function flush() {
    if (flushing) { wantFlush = true; return flushPromise; }
    flushing = true; flushPromise = doFlush(); return flushPromise;
  }
  async function doFlush() {
    try {
      for (;;) {
        wantFlush = false;
        const items = await queue.peek(userId, 50); st.pending = await queue.count(userId);
        let again = false, halt = false;
        if (items.length && online()) {
          try {
            const res = await api.call('submitLocation', { points: items.map((i) => i.point), tracking_state: 'ACTIVE' });
            await queue.remove(items.map((i) => i.id)); st.pending = await queue.count(userId); st.lastSyncAt = Date.now(); st.error = null;
            st.inside = res.inside_geofence; const last = (res.results || []).filter((r) => r.status === 'ACCEPTED').pop(); if (last) st.lastDistance = last.distance_meters;
            again = st.pending > 0;
          } catch (e) {
            halt = true;
            if (e.code === 'NO_ACTIVE_SHIFT') { await queue.clear(userId); st.pending = 0; st.ended = true; st.error = e.code; await stop(); }
            else if (['INVALID_SESSION', 'SESSION_EXPIRED', 'FORBIDDEN'].includes(e.code)) { st.error = e.code; await stop(); }
            else if (['VALIDATION_ERROR', 'REQUEST_TOO_LARGE', 'TRACKING_DISABLED'].includes(e.code)) { await queue.remove(items.map((i) => i.id)); st.error = e.code; } // never loop on a bad batch
            else st.error = e.code; // OFFLINE / NETWORK_ERROR / SERVER_UNAVAILABLE / RATE_LIMITED / SERVER_BUSY: keep the points, retry on the next sample or when back online
          }
        }
        if (halt || !(again || wantFlush)) break; // a point queued while we were syncing (wantFlush) is picked up by the next loop
      }
    } finally { flushing = false; emit(); }
  }

  async function reportState(state) { // tell the server when tracking is NOT working (only possible while the app is running & online)
    if (state === lastReported || state === 'ACTIVE' || !online()) return; lastReported = state;
    try { await api.call('submitLocation', { tracking_state: state }); } catch (e) { /* best effort */ }
  }
  const onFix = async (fix) => { st.lastFixAt = fix.timestamp; st.lastFix = { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, timestamp: fix.timestamp }; lastReported = null; await queue.push(userId, toPoint(fix)); await flush(); };
  const onState = (state) => { st.trackingState = state; if (state !== 'ACTIVE') reportState(state); emit(); };

  async function start() {
    if (st.running) return; const s = getSettings() || {};
    if (s.tracking_enabled === false) { st.trackingState = 'PAUSED'; st.error = 'TRACKING_DISABLED'; emit(); return; }
    st.running = true; st.ended = false; st.trackingState = 'ACTIVE'; emit();
    const intervalMs = intervalOverrideMs || Math.max(1, s.location_interval_minutes || 5) * 60000;
    stopWatch = provider.watch({ intervalMs, minDistanceMeters: s.minimum_distance_meters || 0 }, onFix, onState);
    flush(); // sync anything left over from an earlier session
  }
  async function stop() { if (stopWatch) { try { stopWatch(); } catch (e) { /* ignore */ } stopWatch = null; } st.running = false; st.trackingState = 'STOPPED'; emit(); }
  return { start, stop, flush, state: () => ({ ...st }), onOnline: () => flush() };
}

/**
 * Native-sync tracker (Android APK). The foreground service records and uploads points by itself, so tracking
 * continues with the screen locked / app minimized. This object only starts/stops the service and mirrors its REAL
 * state (read from native storage) - it never reports "active" unless the service says so.
 */
function createNativeTracker({ api, provider, userId, getSettings, getShift, onChange, pollMs = 10000, now = () => Date.now() }) {
  const st = { running: false, trackingState: 'STOPPED', lastFixAt: null, lastSyncAt: null, pending: 0, lastDistance: null, inside: null, lastFix: null, provider: 'native', background: true, error: null, ended: false, native: null };
  let timer = null, config = null, lastRestart = 0, wantRunning = false;
  const emit = () => onChange && onChange({ ...st });

  function buildConfig() {
    const s = getSettings() || {}, shift = (getShift && getShift()) || {}, session = api.session();
    const intervalMs = Math.max(1, s.location_interval_minutes || 5) * 60000, timeoutMs = Math.max(2, s.tracking_timeout_minutes || 15) * 60000;
    return { apiUrl: cfg().API_URL, token: session ? session.token : '', employeeId: userId, intervalMs, minDistanceMeters: s.minimum_distance_meters || 0,
      heartbeatMs: Math.min(intervalMs * 2, Math.floor(timeoutMs * 0.6)), syncIntervalMs: Math.min(Math.max(1, s.location_sync_minutes || s.location_interval_minutes || 5) * 60000, Math.floor(timeoutMs / 2)),
      stopAtMs: shift.scheduled_end ? Date.parse(shift.scheduled_end) + (cfg().NATIVE_POST_SHIFT_MINUTES || 60) * 60000 : now() + 12 * 3600000 };
  }
  async function refresh() {
    let s; try { s = await provider.getTrackingStatus(); } catch (e) { st.error = 'STATUS_UNREADABLE'; emit(); return; }
    st.native = s; st.pending = s.pendingPoints || 0; st.lastFixAt = s.lastFixAt || null; st.lastSyncAt = s.lastSyncAt || null; st.error = s.lastError || null;
    if (s.lastLatitude !== undefined && s.lastLatitude !== null) st.lastFix = { latitude: s.lastLatitude, longitude: s.lastLongitude, accuracy: s.lastAccuracy, timestamp: s.lastFixAt };
    if (s.ended) { st.ended = true; st.running = false; st.trackingState = 'STOPPED'; wantRunning = false; clearInterval(timer); timer = null; }
    else if (s.running) { st.running = true; st.trackingState = s.state && s.state !== 'STOPPED' ? s.state : 'ACTIVE'; }
    else if (wantRunning) { // we expect tracking, the OS stopped the service: say so, and try to bring it back (allowed while the app is in the foreground)
      st.running = false; st.trackingState = 'UNAVAILABLE'; st.error = 'SERVICE_NOT_RUNNING';
      if (now() - lastRestart > 60000 && config) { lastRestart = now(); try { config = { ...buildConfig() }; await provider.startTracking(config); } catch (e) { /* stays UNAVAILABLE */ } }
    }
    emit();
  }
  async function start() {
    if (wantRunning) return; const s = getSettings() || {};
    if (s.tracking_enabled === false) { st.trackingState = 'PAUSED'; st.error = 'TRACKING_DISABLED'; emit(); return; }
    let perm = 'prompt'; try { perm = await provider.permission(); } catch (e) { /* treated as not granted */ }
    if (perm !== 'granted') { st.trackingState = 'PERMISSION_DENIED'; st.error = 'PERMISSION_DENIED'; emit(); return; }
    config = buildConfig(); wantRunning = true; st.ended = false; st.error = null;
    try { await provider.startTracking(config); } catch (e) { wantRunning = false; st.trackingState = e.state || 'UNAVAILABLE'; st.error = e.code || e.state || 'START_FAILED'; emit(); return; }
    st.running = true; st.trackingState = 'ACTIVE'; emit(); await refresh(); timer = setInterval(refresh, pollMs);
  }
  async function stop() { wantRunning = false; clearInterval(timer); timer = null; try { await provider.stopTracking(); } catch (e) { /* already stopped */ } st.running = false; st.trackingState = 'STOPPED'; emit(); }
  return { start, stop, flush: refresh, state: () => ({ ...st }), onOnline: refresh, refresh };
}
