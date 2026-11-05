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

  // d93: قايمة روابط — الرابط الأساسي + البديل (الاتنين نفس كود v134 على السيرفر). لو جوجل علّمت على رابط محدد من شبكة معينة (حصل فعلاً قبل d91)، التاني بيتجرب تلقائيًا.
  function urls() { const c = cfg(); const alt = Array.isArray(c.API_URLS) ? c.API_URLS.filter(Boolean) : []; const primary = c.API_URL; return primary ? [primary].concat(alt.filter((u) => u !== primary)) : alt; }
  let pinnedUrl = '';
  try { pinnedUrl = (globalThis.localStorage && localStorage.getItem('gops.api.url')) || ''; } catch (e) { pinnedUrl = ''; }
  function pin(url) { pinnedUrl = url; try { if (globalThis.localStorage) localStorage.setItem('gops.api.url', url); } catch (e) {} }
  function unpin() { pinnedUrl = ''; try { if (globalThis.localStorage) localStorage.removeItem('gops.api.url'); } catch (e) {} }
  function orderList() { return pinnedUrl && urls().indexOf(pinnedUrl) >= 0 ? [pinnedUrl].concat(urls().filter((u) => u !== pinnedUrl)) : urls(); }

  // d92: إعادة محاولة محدودة على فشل الشبكة/الرد غير المتوقع + d93: failover بين الروابط.
  // أخطاء السيرفر الستركترد (INVALID_CREDENTIALS إلخ) مش بتتعاد ولا بتتعملها failover — السيرفر واصل أصلاً.
  async function call(action, payload = {}, o = {}) {
    if (!cfg().API_URL && !urls().length) throw new ApiError('NOT_CONFIGURED', 'The app is not configured: set API_URL in config.js.');
    if (!online()) throw new ApiError('OFFLINE', 'You are offline.');
    const sess = o.auth === false ? null : store.get();
    if (o.auth !== false && !sess) throw new ApiError('INVALID_SESSION', 'Please sign in.');
    const bodyStr = JSON.stringify({ action, token: sess ? sess.token : undefined, payload, client: 'pwa/1.0' });
    const attempts = 1 + Math.max(0, o.retries != null ? o.retries : 1);
    const list = orderList();
    let lastNet = null;
    for (let ui = 0; ui < list.length; ui++) {
      const url = list[ui];
      for (let i = 0; i < attempts; i++) {
        if (i) await new Promise((r) => setTimeout(r, i === 1 ? 1200 : 3000));
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), o.timeoutMs || 30000) : null;
        try {
          const res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: bodyStr, redirect: 'follow', credentials: 'omit', signal: ctl ? ctl.signal : undefined });
          let body; try { body = await res.json(); } catch (e) { body = null; }
          if (!body || typeof body.success !== 'boolean') {
            lastNet = e;
            if (i === attempts - 1) break; // الرد غير متوقع من الرابط ده — جرب الرابط التاني لو موجود
            continue; // رد HTML/فاضي (صفحة حماية جوجل غالبًا) — محاولة تانية
          }
          if (!body.success) {
            if (SESSION_CODES.includes(body.error_code) && sess) { store.clear(); listeners.forEach((fn) => fn(body.error_code)); }
            throw new ApiError(body.error_code, body.message, body.details);
          }
          if (pinnedUrl !== url) pin(url); // d93: الرابط ده شغال — ثبّته للنداءات الجاية
          return body.data;
        } catch (e) {
          if (e instanceof ApiError && e.code !== 'SERVER_UNAVAILABLE') throw e; // خطأ ستركجرت من السيرفر — مفيش إعادة ولا failover
          lastNet = e;
          if (i === attempts - 1) break; // خلصت محاولات الرابط ده — جرب الرابط التاني لو موجود
          // فشل شبكة/مهلة — هيتعاد تلقائيًا
        } finally { if (timer) clearTimeout(timer); }
      }
      if (pinnedUrl === url) unpin(); // الرابط المثبت بقى بايظ — امسح التثبيت وجرب التاني
    }
    throw (lastNet instanceof ApiError) ? lastNet : new ApiError(online() ? 'NETWORK_ERROR' : 'OFFLINE', 'Cannot reach the server.');
  }
  // d93: فحص شبكة مركّب — يميز: النت واصل لجوجل؟ أي رابط سيرفر شغال؟ النت نفسه شغال أصلاً؟
  // بيبعت النداءات no-cors عشان نقيس الوصول بس من غير قيود CORS (مش محتاجين نقرا الرد).
  async function noCorsOk(url, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 6000) : null;
    try { await doFetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: ctl ? ctl.signal : undefined }); return true; }
    catch (e) { return false; }
    finally { if (timer) clearTimeout(timer); }
  }
  async function probeNetwork(timeoutMs = 6000) {
    const netOk = await noCorsOk('https://www.google.com/generate_204', timeoutMs);
    const eps = [];
    for (const u of orderList()) {
      const ok = await noCorsOk(u + (u.indexOf('?') >= 0 ? '&' : '?') + 'action=ping', timeoutMs);
      eps.push({ url: u, ok, ms: 0 });
      if (ok) pin(u); // رابط شغال — ثبّته
    }
    return { netOk, eps, anyOk: eps.some((x) => x.ok) };
  }

  return {
    kind, call, probeNetwork, store,
    onSessionEnd(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    session: () => store.get(),
    async login(id, password, remember) {
      // d92: اللوجين بياخد محاولتين زيادة تلقائيًا على فشل الشبكة + d93: failover تلقائي للرابط البديل داخل call()
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
