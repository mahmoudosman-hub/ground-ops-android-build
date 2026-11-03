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
  try {
    const store = globalThis.localStorage;
    const urlLang = new URLSearchParams(globalThis.location.search).get('lang');
    const saved = store.getItem('gops.lang');
    // اختيار صريح = من زرار اللغة أو من ?lang= — ده بيتحترم دايماً
    const userChose = store.getItem('gops.lang.user') === '1' || !!urlLang;
    const migrated = store.getItem('gops.lang.mig') === 'd47';
    if (saved || urlLang) {
      if (userChose || migrated) want = urlLang || saved || want;
      // أول تحميل بعد تحديث d47: اللي كان لغته إنجليزي من غير اختيار صريح بيتحول للعربي تلقائياً (مرة واحدة)
      else want = cfg().DEFAULT_LOCALE;
    }
    if (!migrated) store.setItem('gops.lang.mig', 'd47');
  } catch (e) { /* storage unavailable */ }
  return setLang(want);
}
export function t(text, vars) {
  let out = (dicts[lang] && dicts[lang][text]) || text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return out;
}
