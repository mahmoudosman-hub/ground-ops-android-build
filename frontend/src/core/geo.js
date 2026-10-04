/** Client-side distance is a PREVIEW only. The server recomputes and decides everything. */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = (d) => (d * Math.PI) / 180, dLat = r(lat2 - lat1), dLon = r(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
