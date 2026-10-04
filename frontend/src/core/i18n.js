/**
 * Gettext-style translation: the English text IS the key. To add Arabic, fill i18n/ar.js
 * ({ 'Check In': '...' }) - no code changes needed. RTL is switched on <html dir> and the CSS uses logical properties.
 */
import { cfg } from './config.js';
const dicts = { en: {} };
const rtl = new Set(['ar']);
let lang = 'en';
export function registerLang(code, dict, isRtl) { dicts[code] = dict; if (isRtl) rtl.add(code); }
export function getLang() { return lang; }
export function isRtl() { return rtl.has(lang); }
export function setLang(code) {
  lang = dicts[code] ? code : 'en';
  const root = globalThis.document && globalThis.document.documentElement;
  if (root) { root.lang = lang; root.dir = rtl.has(lang) ? 'rtl' : 'ltr'; }
  try { globalThis.localStorage.setItem('gops.lang', lang); } catch (e) { /* storage unavailable */ }
  return lang;
}
export function initLang() {
  let want = cfg().DEFAULT_LOCALE;
  try { want = new URLSearchParams(globalThis.location.search).get('lang') || globalThis.localStorage.getItem('gops.lang') || want; } catch (e) { /* ignore */ }
  return setLang(want);
}
export function t(text, vars) {
  let out = (dicts[lang] && dicts[lang][text]) || text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return out;
}
