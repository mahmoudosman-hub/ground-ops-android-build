/** Reads the user-edited frontend/config.js (window.GOPS_CONFIG). Defaults keep the app usable if a key is missing. */
const DEFAULTS = {
  APP_NAME: 'Ground OPS Tracker', API_URL: '', DEFAULT_TIMEZONE: 'Africa/Cairo', DEFAULT_GEOFENCE_RADIUS: 300,
  DEFAULT_LOCATION_INTERVAL: 5, DEFAULT_ACCURACY_THRESHOLD: 50, TRACKING_TIMEOUT: 15, DEFAULT_LOCALE: 'en', RTL_LOCALES: ['ar'],
  NATIVE_POST_SHIFT_MINUTES: 60, // Android service keeps running this long after the scheduled shift end, then stops itself
  TRACKING_INTERVAL_OVERRIDE_MS: 0 // TESTING ONLY: shortens the tracking interval; leave 0 in production
};
export function cfg() { return { ...DEFAULTS, ...(globalThis.GOPS_CONFIG || {}) }; }
