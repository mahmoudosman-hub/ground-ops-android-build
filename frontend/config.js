/**
 * Ground OPS Tracker - central FRONTEND configuration (used from Batch 2 onward).
 * Contains NO secrets. Server-side settings (Settings sheet) always win over these defaults.
 * The selfie Drive folder id is kept in Apps Script Script Properties on purpose and is not needed here.
 */
window.GOPS_CONFIG = Object.freeze({
  APP_NAME: 'Ground OPS Tracker',
  API_URL: 'https://script.google.com/macros/s/AKfycbzMsUasyw3Rdgyyo8u_6zO0P0pDXuGj7dMAbM0SV3iCVVlK5DXOm0ytGbTy0WMWIlxx/exec', // Apps Script Web App URL (ends with /exec)
  DEFAULT_TIMEZONE: 'Africa/Cairo',
  DEFAULT_GEOFENCE_RADIUS: 300,      // meters
  DEFAULT_LOCATION_INTERVAL: 5,      // minutes
  DEFAULT_ACCURACY_THRESHOLD: 50,    // meters
  TRACKING_TIMEOUT: 15,              // minutes without a fix => "Tracking unavailable"
  DISABLE_MAP: false,                // true = never load Leaflet/OpenStreetMap tiles (tables still work)
  TRACKING_INTERVAL_OVERRIDE_MS: 0,  // TESTING ONLY - keep 0 in production
  DEFAULT_LOCALE: 'en',
  RTL_LOCALES: ['ar']
});
