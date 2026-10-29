package com.groundops.tracker.core;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

public final class TrackingCore {
    public interface Clock { long now(); }
    public interface Transport { Response post(String url, String body) throws IOException; }
    public interface Store {
        boolean insert(String employeeId, long tsMs, String pointJson);
        List<StoredPoint> peek(String employeeId, int max);
        void delete(List<Long> ids);
        int count(String employeeId);
        void clear(String employeeId);
    }
    public static final class StoredPoint { public final long id; public final String json; public StoredPoint(long id, String json) { this.id = id; this.json = json; } }
    public static final class Response { public final int status; public final String body; public Response(int status, String body) { this.status = status; this.body = body; } }
    public static final class Fix {
        public final long timeMs; public final double lat, lon, accuracy; public final Boolean mock; public final String source; public final Integer battery;
        public Fix(long timeMs, double lat, double lon, double accuracy, Boolean mock, String source, Integer battery) {
            this.timeMs = timeMs; this.lat = lat; this.lon = lon; this.accuracy = accuracy; this.mock = mock; this.source = source; this.battery = battery;
        }
    }
    public static final class Config {
        public String apiUrl, token, employeeId;
        public long intervalMs = 300000, heartbeatMs = 600000, syncIntervalMs = 300000, stopAtMs = Long.MAX_VALUE;
        public double minDistanceMeters = 25;
    }
    public static final class Status {
        public boolean running, ended;
        public String state = "STOPPED", lastError, endedReason;
        public long lastFixAt, lastSyncAt;
        public int pending;
        public Double lastLat, lastLon, lastAccuracy, lastDistance;
        public Boolean inside;
    }

    private static final int BATCH = 50;
    private final Config cfg; private final Store store; private final Transport transport; private final Clock clock;
    private long lastRecordedTs = -1, lastFixAt, lastSyncAt, nextAttemptAt, lastSyncAttemptAt;
    private double lastRecLat, lastRecLon;
    private boolean paused;
    private int failures; private boolean ended; private String endedReason, lastError, providerState, reportedState;
    private Double lastLat, lastLon, lastAcc, lastDistance; private Boolean inside;

    public TrackingCore(Config cfg, Store store, Transport transport, Clock clock) { this.cfg = cfg; this.store = store; this.transport = transport; this.clock = clock; }

    private static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    public static double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
        double r = 6371000, dLat = Math.toRadians(lat2 - lat1), dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    public synchronized boolean onFix(Fix f) {
        if (ended || paused) return false;
        if (f.accuracy > 100) { lastError = "BAD_ACCURACY"; return false; }
        if (lastRecordedTs > 0) {
            long timeDiffMs = f.timeMs - lastRecordedTs;
            double distMoved = distanceMeters(lastRecLat, lastRecLon, f.lat, f.lon);
            if (timeDiffMs > 0 && timeDiffMs < 60000 && distMoved > 150) { lastError = "TELEPORTATION_BLOCKED"; return false; }
        }
        lastFixAt = clock.now(); lastLat = f.lat; lastLon = f.lon; lastAcc = f.accuracy; providerState = null;
        if (lastRecordedTs >= 0) {
            long gap = f.timeMs - lastRecordedTs;
            if (gap <= 0) return false;
            if (gap < cfg.intervalMs / 2) return false;
            double moved = distanceMeters(lastRecLat, lastRecLon, f.lat, f.lon);
            if (moved < cfg.minDistanceMeters && gap < cfg.heartbeatMs) return false;
        }
        StringBuilder j = new StringBuilder("{");
        j.append("\"timestamp\":").append(MiniJson.quote(iso(f.timeMs)));
        j.append(",\"latitude\":").append(f.lat).append(",\"longitude\":").append(f.lon);
        j.append(",\"accuracy_meters\":").append(Math.max(0, f.accuracy));
        if (f.mock != null) j.append(",\"is_mock_location\":").append(f.mock.booleanValue());
        j.append(",\"location_source\":").append(MiniJson.quote(f.source == null ? "unknown" : f.source));
        j.append(",\"tracking_source\":\"BACKGROUND_NATIVE\"");
        if (f.battery != null && f.battery >= 0 && f.battery <= 100) j.append(",\"battery_level\":").append(f.battery);
        j.append('}');
        if (!store.insert(cfg.employeeId, f.timeMs, j.toString())) return false;
        lastRecordedTs = f.timeMs; lastRecLat = f.lat; lastRecLon = f.lon;
        return true;
    }

    public synchronized void setPaused(boolean p) { if (paused && !p) { lastRecordedTs = -1; providerState = null; } paused = p; }
    public synchronized boolean isPaused() { return paused; }
    public synchronized void setProviderState(String state) {
        providerState = state;
        if (state != null && !state.equals(reportedState)) { reportedState = state; reportStateToServer(state); }
    }
    private void reportStateToServer(String state) {
        try { transport.post(cfg.apiUrl, "{\"action\":\"submitLocation\",\"token\":" + MiniJson.quote(cfg.token) + ",\"payload\":{\"tracking_state\":" + MiniJson.quote(state) + "},\"client\":\"android-native/1.0\"}"); }
        catch (IOException e) { }
    }

    public synchronized boolean syncDue(long now) { return !ended && now - lastSyncAttemptAt >= cfg.syncIntervalMs && store.count(cfg.employeeId) > 0; }

    public synchronized int flush(boolean force) {
        int sent = 0;
        lastSyncAttemptAt = clock.now();
        for (;;) {
            if (ended) return sent;
            long now = clock.now();
            if (!force && now < nextAttemptAt) return sent;
            List<StoredPoint> items = store.peek(cfg.employeeId, BATCH);
            if (items.isEmpty()) return sent;
            StringBuilder pts = new StringBuilder("[");
            List<Long> ids = new ArrayList<Long>();
            for (int k = 0; k < items.size(); k++) { if (k > 0) pts.append(','); pts.append(items.get(k).json); ids.add(items.get(k).id); }
            pts.append(']');
            String body = "{\"action\":\"submitLocation\",\"token\":" + MiniJson.quote(cfg.token) + ",\"payload\":{\"points\":" + pts + ",\"tracking_state\":\"ACTIVE\"},\"client\":\"android-native/1.0\"}";
            Response res;
            try { res = transport.post(cfg.apiUrl, body); }
            catch (IOException e) { return backoff("NETWORK_ERROR", sent); }
            Map<String, Object> json;
            try { json = MiniJson.asMap(MiniJson.parse(res.body)); } catch (RuntimeException e) { json = null; }
            if (res.status < 200 || res.status >= 300 || json == null || !(json.get("success") instanceof Boolean)) return backoff("SERVER_UNAVAILABLE", sent);
            if (Boolean.TRUE.equals(json.get("success"))) {
                store.delete(ids); sent += ids.size(); failures = 0; lastError = null; lastSyncAt = clock.now(); nextAttemptAt = 0; reportedState = null;
                Map<String, Object> data = MiniJson.asMap(json.get("data"));
                if (data != null) {
                    if (data.get("inside_geofence") instanceof Boolean) inside = (Boolean) data.get("inside_geofence");
                    List<Object> rs = MiniJson.asList(data.get("results"));
                    if (rs != null) for (Object o : rs) { Map<String, Object> m = MiniJson.asMap(o); if (m != null && "ACCEPTED".equals(m.get("status")) && m.get("distance_meters") instanceof Double) lastDistance = (Double) m.get("distance_meters"); }
                }
                continue;
            }
            String code = String.valueOf(json.get("error_code"));
            if ("NO_ACTIVE_SHIFT".equals(code)) { store.clear(cfg.employeeId); return end("SHIFT_OVER", code, sent); }
            if ("INVALID_SESSION".equals(code) || "SESSION_EXPIRED".equals(code) || "FORBIDDEN".equals(code) || "PASSWORD_CHANGE_REQUIRED".equals(code)) { store.clear(cfg.employeeId); return end("SESSION_ENDED", code, sent); }
            
            // 👇 هنا التعديل: ضفنا TELEPORTATION_BLOCKED عشان يمسح اللوكيشن من الطابور
            if ("VALIDATION_ERROR".equals(code) || "REQUEST_TOO_LARGE".equals(code) || "TRACKING_DISABLED".equals(code) || "TELEPORTATION_BLOCKED".equals(code)) { 
                store.delete(ids); lastError = code; sent += 0; continue; 
            }
            
            return backoff(code, sent);
        }
    }

    private int backoff(String code, int sent) {
        failures++; lastError = code;
        long delay = Math.min(300000L, 15000L << Math.min(failures - 1, 5));
        nextAttemptAt = clock.now() + delay;
        return sent;
    }

    private int end(String reason, String code, int sent) { ended = true; endedReason = reason; lastError = code; return sent; }

    public synchronized boolean shouldStop() {
        if (!ended && clock.now() >= cfg.stopAtMs) { ended = true; endedReason = "SHIFT_WINDOW_OVER"; }
        return ended;
    }

    public synchronized Status status(boolean serviceRunning) {
        Status s = new Status();
        long now = clock.now();
        s.ended = ended; s.endedReason = endedReason; s.lastError = lastError;
        s.running = serviceRunning && !ended; s.lastFixAt = lastFixAt; s.lastSyncAt = lastSyncAt; s.pending = store.count(cfg.employeeId);
        s.lastLat = lastLat; s.lastLon = lastLon; s.lastAccuracy = lastAcc; s.lastDistance = lastDistance; s.inside = inside;
        if (!s.running) s.state = "STOPPED";
        else if (paused) s.state = "ON_BREAK";
        else if (providerState != null) s.state = providerState;
        else if (lastFixAt == 0 || now - lastFixAt > Math.max(2 * cfg.intervalMs, cfg.heartbeatMs)) s.state = "UNAVAILABLE";
        else s.state = "ACTIVE";
        return s;
    }
}
