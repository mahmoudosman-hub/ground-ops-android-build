/** Optional map (Leaflet + OpenStreetMap tiles, free). Every page works without it: callers must handle `null`. */
let loading = null;
export function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  if (globalThis.GOPS_CONFIG && globalThis.GOPS_CONFIG.DISABLE_MAP) return Promise.resolve(null); // option for installs that must not contact map servers
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const d = globalThis.document, done = (v) => resolve(v);
    const css = d.createElement('link'); css.rel = 'stylesheet'; css.href = './vendor/leaflet/leaflet.css'; d.head.appendChild(css);
    const s = d.createElement('script'); s.src = './vendor/leaflet/leaflet.js'; s.onload = () => done(globalThis.L || null); s.onerror = () => done(null); d.head.appendChild(s);
    setTimeout(() => done(globalThis.L || null), 8000);
  });
  return loading;
}
export async function createMap(container, { lat = 30.0456, lng = 31.2129, zoom = 14 } = {}) {
  const L = await loadLeaflet(); if (!L) return null;
  try {
    const map = L.map(container, { zoomControl: true }).setView([lat, lng], zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    return { L, map, layer: L.layerGroup().addTo(map) };
  } catch (e) { return null; }
}
export const STATE_COLOR = { INSIDE: '#1b8a3a', OUTSIDE: '#c62828', UNKNOWN: '#6b7280', default: '#1565c0' };
const textTip = (text) => { const el = globalThis.document.createElement('span'); el.textContent = text; return el; }; // Leaflet treats strings as HTML: pass a text node instead
export function drawBranches(m, branches) { branches.forEach((b) => { if (b.latitude == null) return; m.L.circle([b.latitude, b.longitude], { radius: b.radius, color: '#1565c0', weight: 2, fillOpacity: 0.08 }).bindTooltip(textTip(`${b.name} (${b.radius} m)`)).addTo(m.layer); }); }
export function drawPoint(m, { lat, lng, state, label }) { m.L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 2, fillColor: STATE_COLOR[state] || STATE_COLOR.default, fillOpacity: 1 }).bindTooltip(textTip(label), { permanent: false }).addTo(m.layer); }
export function fit(m, points) { if (points.length) m.map.fitBounds(points, { padding: [30, 30], maxZoom: 16 }); }
