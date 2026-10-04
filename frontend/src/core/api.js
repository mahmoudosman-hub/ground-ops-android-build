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

  async function call(action, payload = {}, o = {}) {
    const url = cfg().API_URL;
    if (!url) throw new ApiError('NOT_CONFIGURED', 'The app is not configured: set API_URL in config.js.');
    if (!online()) throw new ApiError('OFFLINE', 'You are offline.');
    const sess = o.auth === false ? null : store.get();
    if (o.auth !== false && !sess) throw new ApiError('INVALID_SESSION', 'Please sign in.');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), o.timeoutMs || 30000) : null;
    let res;
    try {
      res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: sess ? sess.token : undefined, payload, client: 'pwa/1.0' }), redirect: 'follow', credentials: 'omit', signal: ctl ? ctl.signal : undefined });
    } catch (e) {
      throw new ApiError(online() ? 'NETWORK_ERROR' : 'OFFLINE', 'Cannot reach the server.');
    } finally { if (timer) clearTimeout(timer); }
    let body;
    try { body = await res.json(); } catch (e) { throw new ApiError('SERVER_UNAVAILABLE', 'The server returned an unexpected response.'); }
    if (!body || typeof body.success !== 'boolean') throw new ApiError('SERVER_UNAVAILABLE', 'The server returned an unexpected response.');
    if (!body.success) {
      if (SESSION_CODES.includes(body.error_code) && sess) { store.clear(); listeners.forEach((fn) => fn(body.error_code)); }
      throw new ApiError(body.error_code, body.message, body.details);
    }
    return body.data;
  }

  return {
    kind, call, store,
    onSessionEnd(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    session: () => store.get(),
    async login(id, password, remember) {
      const data = kind === 'admin' ? await call('adminLogin', { username: id, password }, { auth: false }) : await call('login', { employee_id: id, password, remember_me: !!remember }, { auth: false });
      store.set({ token: data.token, expires_at: data.expires_at, user: data.user }, kind === 'employee' && !!remember);
      return data.user;
    },
    async logout() { try { await call('logout', {}); } catch (e) { /* offline/expired: still clear locally */ } store.clear(); },
    async changePassword(current_password, new_password) { await call('changePassword', { current_password, new_password }); store.update({ user: { ...store.get().user, must_change_password: false } }); },
    async refreshUser() { const d = await call('getCurrentUser', {}); store.update({ user: d.user }); return d.user; }
  };
}
