/**
 * Durable queue for location points ONLY (non-sensitive telemetry). Attendance actions (check-in/out) are never
 * queued: they are confirmed only when the server has received and validated them.
 * Uses IndexedDB; falls back to memory when unavailable (e.g. private mode).
 */
export function createQueue(env = globalThis) {
  const idb = env.indexedDB; let dbp = null, mem = [], seq = 1;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const r = idb.open('gops-queue', 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore('points', { keyPath: 'id', autoIncrement: true }); s.createIndex('user', 'user'); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((resolve, reject) => { const t = db.transaction('points', mode), s = t.objectStore('points'); let out; try { out = fn(s); } catch (e) { reject(e); return; } t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out); t.onerror = () => reject(t.error); }); };
  const useIdb = () => !!idb;
  return {
    async push(user, point) { if (!useIdb()) { mem.push({ id: seq++, user, point }); return; } try { await tx('readwrite', (s) => s.add({ user, point })); } catch (e) { mem.push({ id: seq++, user, point }); } },
    async peek(user, n = 50) {
      const all = []; if (useIdb()) { try { const db = await open(); await new Promise((res, rej) => { const rq = db.transaction('points').objectStore('points').index('user').getAll(user); rq.onsuccess = () => { all.push(...rq.result); res(); }; rq.onerror = () => rej(rq.error); }); } catch (e) { /* fall back to memory only */ } }
      return all.concat(mem.filter((m) => m.user === user)).sort((a, b) => a.point.timestamp.localeCompare(b.point.timestamp)).slice(0, n);
    },
    async remove(ids) { mem = mem.filter((m) => !ids.includes(m.id)); if (useIdb()) { try { await tx('readwrite', (s) => { ids.forEach((i) => s.delete(i)); }); } catch (e) { /* ignore */ } } },
    async count(user) { return (await this.peek(user, 100000)).length; },
    async clear(user) { const items = await this.peek(user, 100000); await this.remove(items.map((i) => i.id)); }
  };
}
