import { cfg } from './config.js';
const tz = () => cfg().DEFAULT_TIMEZONE;
const pick = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hourCycle: 'h23', ...opts });
export function fmtTime(iso) { return iso ? pick({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '-'; }
export function fmtDateTime(iso) { return iso ? pick({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', '') : '-'; }
export function fmtDate(v) { // 'YYYY-MM-DD' (already a Cairo date) or ISO instant
  if (!v) return '-'; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const p = Object.fromEntries(pick({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(v)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`;
}
export function todayLocal(now = Date.now()) { return fmtDate(new Date(now).toISOString()); }
export function addDays(dateStr, n) { const d = dateStr.split('-').map(Number); return new Date(Date.UTC(d[0], d[1] - 1, d[2] + n)).toISOString().slice(0, 10); }
export function minutesText(m) { if (m === null || m === undefined) return '-'; if (m < 60) return `${m} min`; return `${Math.floor(m / 60)} h ${m % 60} min`; }
export function agoText(iso, now = Date.now()) { if (!iso) return '-'; const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`; }
