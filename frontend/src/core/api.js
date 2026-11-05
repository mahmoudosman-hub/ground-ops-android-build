/**
 * API client for the Apps Script Web App.
 * - POST only; token travels in the JSON body (never in the URL).
 * - Content-Type text/plain => "simple" CORS request (Apps Script cannot answer preflights).
 * - Distinguishes OFFLINE / NETWORK_ERROR / SERVER_UNAVAILABLE from structured server errors.
 */
import { cfg } from './config.js';
import { sessionStore } from './session.js';

export class ApiError extends Error {
  constructor(code, message, details) { super(message || code); this.name = 'ApiError'; this.code = code; this.details = details || null; }
}
const SESSION_CODES = ['INVALID_SESSION', 'SESSION_EXPIRED'];

export function createApi(kind, opts = {}) {
  const store = sessionStore(kind), listeners = new Set();
  const doFetch = (...a) => (opts.fetch || globalThis.fetch)(...a);
  const online = () => (globalThis.navigator && globalThis.navigator.onLine === false ? false : true);

  // d92: إعادة محاولة محدودة على فشل الشبكة/الرد غير المتوقع (DNS/TLS متقطع من شبكات الموبايل + صفحة حماية جوجل العابرة).
  // الافتراضي محاولة إضافية واحدة (1.2ث) — اللوجين بياخد محاولتين زيادة. أخطاء السيرفر الستركترد (INVALID_CREDENTIALS إلخ) مش بتتعاد أبدًا.
  async function call(action, payload = {}, o = {}) {
    const url = cfg().API_URL;
    if (!url) throw new ApiError('NOT_CONFIGURED', 'The app is not configured: set API_URL in config.js.');
    if (!online()) throw new ApiError('OFFLINE', 'You are offline.');
    const sess = o.auth === false ? null : store.get();
    if (o.auth !== false && !sess) throw new ApiError('INVALID_SESSION', 'Please sign in.');
    const bodyStr = JSON.stringify({ action, token: sess ? sess.token : undefined, payload, client: 'pwa/1.0' });
    const attempts = 1 + Math.max(0, o.retries != null ? o.retries : 1);
    for (let i = 0; i < attempts; i++) {
      if (i) await new Promise((r) => setTimeout(r, i === 1 ? 1200 : 3000));
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), o.timeoutMs || 30000) : null;
      try {
        const res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: bodyStr, redirect: 'follow', credentials: 'omit', signal: ctl ? ctl.signal : undefined });
        let body; try { body = await res.json(); } catch (e) { body = null; }
        if (!body || typeof body.success !== 'boolean') {
          if (i === attempts - 1) throw new ApiError('SERVER_UNAVAILABLE', 'The server returned an unexpected response.');
          continue; // رد HTML/فاضي (صفحة حماية جوجل غالبًا) — محاولة تانية
        }
        if (!body.success) {
          if (SESSION_CODES.includes(body.error_code) && sess) { store.clear(); listeners.forEach((fn) => fn(body.error_code)); }
          throw new ApiError(body.error_code, body.message, body.details);
        }
        return body.data;
      } catch (e) {
        if (e instanceof ApiError && e.code !== 'SERVER_UNAVAILABLE') throw e; // خطأ ستركجرت من السيرفر — مفيش إعادة محاولة
        if (i === attempts - 1) throw (e instanceof ApiError) ? e : new ApiError(online() ? 'NETWORK_ERROR' : 'OFFLINE', 'Cannot reach the server.');
        // فشل شبكة/مهلة — هيتعاد تلقائيًا
      } finally { if (timer) clearTimeout(timer); }
    }
    throw new ApiError(online() ? 'NETWORK_ERROR' : 'OFFLINE', 'Cannot reach the server.');
  }
  // d92: فحص تشخيصي سريع — السيرفر نفسه reachable من الجهاز ده ولا لأ؟ بيتنده بعد فشل اللوجين لتحديد مين المشكلة (الشبكة ولا السيرفر)
  async function probeServer(timeoutMs = 8000) {
    const url = cfg().API_URL; const t0 = Date.now();
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await doFetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'action=ping', { method: 'GET', redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      return { ok: !!res.ok, status: res.status, ms: Date.now() - t0 };
    } catch (e) { return { ok: false, status: 0, ms: Date.now() - t0 }; }
    finally { if (timer) clearTimeout(timer); }
  }

  return {
    kind, call, probeServer, store,
    onSessionEnd(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    session: () => store.get(),
    async login(id, password, remember) {
      // d92: اللوجين بياخد محاولتين زيادة تلقائيًا على فشل الشبكة — بيحل «Cannot reach the server» المتقطع من شبكات 4G
      const data = kind === 'admin' ? await call('adminLogin', { username: id, password }, { auth: false, retries: 2, timeoutMs: 25000 }) : await call('login', { employee_id: id, password, remember_me: !!remember }, { auth: false, retries: 2, timeoutMs: 25000 });
      store.set({ token: data.token, expires_at: data.expires_at, user: data.user }, kind === 'employee' && !!remember);
      return data.user;
    },
    async logout() {
      // إلغاء توكن الإشعارات لهذا الجهاز قبل الخروج — عشان الإشعارات تتوقف فوراً على الموبايل ده
      let fcm = '';
      try { fcm = globalThis.localStorage ? (localStorage.getItem('gops.fcm.token') || '') : ''; } catch (e) {}
      if (fcm) { try { await call('unregisterPushToken', { token: fcm }); } catch (e) { /* best effort */ } }
      try { if (globalThis.localStorage) localStorage.removeItem('gops.fcm.token'); } catch (e) {}
      try { if (globalThis.localStorage) localStorage.removeItem('gops.fcm.state'); } catch (e) {}
      try { await call('logout', {}); } catch (e) { /* offline/expired: still clear locally */ } store.clear();
    },
    async changePassword(current_password, new_password) { await call('changePassword', { current_password, new_password }); store.update({ user: { ...store.get().user, must_change_password: false } }); },
    async refreshUser() { const d = await call('getCurrentUser', {}); store.update({ user: d.user }); return d.user; }
  };
}
