/**
 * Provider for the Android (Capacitor) app (see services/native/bridge.js). `nativeSync`: the native foreground service
 * samples GPS, keeps its own durable queue and uploads points to the backend by itself, even while the WebView is
 * suspended (screen locked / app minimised). The PWA must therefore NOT also send points: services/tracker.js only
 * starts/stops the service and mirrors its REAL state. Contract: docs/NATIVE_BRIDGE.md.
 */
export function createNativeProvider(bridge) {
  return {
    id: 'native',
    capabilities: { background: true, foregroundService: true, mockDetection: true, keepAwake: false, nativeSync: typeof bridge.getTrackingStatus === 'function', batterySettings: typeof bridge.openBatterySettings === 'function' },
    permission: async () => { const p = await bridge.permission(); return p === 'granted' || p === 'denied' ? p : 'prompt'; },
    requestPermission: () => (bridge.requestLocationPermission ? bridge.requestLocationPermission() : bridge.requestPermission()),
    getPosition: (o) => bridge.getPosition(o),
    setKeepAwake: async () => true,
    startTracking: (cfg) => bridge.startTracking(cfg), stopTracking: () => bridge.stopTracking(), getTrackingStatus: () => bridge.getTrackingStatus(),
    getNativeStatus: () => bridge.getNativeLocationStatus(), openBatterySettings: () => bridge.openBatterySettings(),
    // classic streaming contract (bridges that push fixes to JS instead of uploading natively)
    watch({ intervalMs, minDistanceMeters }, onFix, onState) {
      const offFix = bridge.onFix(onFix), offState = bridge.onState(onState);
      bridge.start({ intervalMs, minDistanceMeters, notificationTitle: 'Ground OPS Tracker', notificationText: 'Location tracking is active during your shift' });
      return () => { offFix(); offState(); bridge.stop(); };
    },
    openLocationSettings: () => bridge.openLocationSettings && bridge.openLocationSettings(), openAppSettings: () => bridge.openAppSettings && bridge.openAppSettings()
  };
}
