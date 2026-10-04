/**
 * Session storage per account kind. "Remember me" -> localStorage, otherwise sessionStorage (cleared on tab close).
 * Only the opaque session token + public profile are stored. Never passwords.
 */
const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
export function sessionStore(kind) {
  const key = `gops.session.${kind}`;
  const stores = () => [globalThis.localStorage, globalThis.sessionStorage].filter(Boolean);
  return {
    get(now = Date.now()) {
      for (const s of stores()) {
        const raw = safe(() => s.getItem(key), null); if (!raw) continue;
        const v = safe(() => JSON.parse(raw), null);
        if (v && v.token && Date.parse(v.expires_at) > now) return v;
        safe(() => s.removeItem(key));
      }
      return null;
    },
    set(data, persist) { this.clear(); safe(() => (persist ? globalThis.localStorage : globalThis.sessionStorage).setItem(key, JSON.stringify(data))); },
    update(patch) { const cur = this.get(); if (!cur) return; const persist = !!safe(() => globalThis.localStorage.getItem(key), null); this.set({ ...cur, ...patch }, persist); },
    clear() { stores().forEach((s) => safe(() => s.removeItem(key))); }
  };
}
