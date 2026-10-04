/** Service worker registration, install prompt (Android/desktop Chrome) and iOS "Add to Home Screen" hint. */
let deferred = null; const subs = new Set();
export function initPwa(env = globalThis) {
  env.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()); });
  env.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
  // Service workers need a secure context (HTTPS, or localhost/127.0.0.1 for development).
  const native = env.Capacitor && typeof env.Capacitor.isNativePlatform === 'function' && env.Capacitor.isNativePlatform();
  if (!native && 'serviceWorker' in env.navigator && env.isSecureContext) {
    const register = () => env.navigator.serviceWorker.register('./service-worker.js').then((reg) => {
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && env.navigator.serviceWorker.controller) env.dispatchEvent(new CustomEvent('gops-update-ready', { detail: reg })); }); });
    }).catch(() => { /* the app still works online without the worker */ });
    if (env.document.readyState === 'complete') register(); else env.addEventListener('load', register);
  }
}
export const onInstallChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const canInstall = () => !!deferred;
export async function promptInstall() { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; subs.forEach((f) => f()); return r.outcome === 'accepted'; }
export const isStandalone = (env = globalThis) => !!(env.matchMedia && env.matchMedia('(display-mode: standalone)').matches) || env.navigator.standalone === true;
export const isIos = (env = globalThis) => /iphone|ipad|ipod/i.test(env.navigator.userAgent) || (env.navigator.platform === 'MacIntel' && env.navigator.maxTouchPoints > 1);
