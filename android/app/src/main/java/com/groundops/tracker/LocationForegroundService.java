package com.groundops.tracker;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.groundops.tracker.core.HttpTransport;
import com.groundops.tracker.core.MiniJson;
import com.groundops.tracker.core.TrackingCore;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground service (type "location") that keeps sampling GPS and uploading points while the screen is locked or the
 * app is minimised. It is started only from the visible app (when the employee is checked in) and stops on check-out,
 * when the server reports the shift is over, when the session ends, or at the configured stop time.
 * START_NOT_STICKY: if Android kills it we do NOT pretend otherwise - the web layer sees "not running" and shows it.
 * All decisions about the filtering/queue/sync live in core/TrackingCore (unit-tested against the real backend).
 */
public class LocationForegroundService extends Service {
    public static final String ACTION_START = "com.groundops.tracker.START", ACTION_STOP = "com.groundops.tracker.STOP", EXTRA_CONFIG = "config";
    private static final String CHANNEL = "gops_tracking"; private static final int NOTIF_ID = 4711; private static final long TICK_MS = 30000;
    public static volatile LocationForegroundService instance;

    private TrackingCore core; private TrackingPrefs prefs; private SqlitePointStore store; private LocationManager lm; private ConnectivityManager cm;
    private HandlerThread thread; private Handler handler; private ExecutorService io; private LocationListener listener; private ConnectivityManager.NetworkCallback netCb;
    private volatile boolean running; private String employeeId = "";
private String cfgApiUrl = "", cfgToken = "";
private long lastSelfiePollMs = 0L;

    public static JSONObject snapshot(Context ctx) {
        LocationForegroundService s = instance;
        if (s != null && s.running && s.core != null) return s.statusJson(true);
        JSONObject last = new TrackingPrefs(ctx).status();
        try { // the service is NOT alive: never report it as running; keep the real reason/ended flag and the real queue size
            last.put("running", false); last.put("state", "STOPPED");
            String cfg = new TrackingPrefs(ctx).config(); String emp = last.optString("employeeId", "");
            if (emp.length() > 0) last.put("pendingPoints", new SqlitePointStore(ctx).count(emp));
        } catch (JSONException e) { /* keep what we have */ }
        return last;
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        if (ACTION_STOP.equals(intent.getAction())) { shutdown("STOP_REQUESTED", false); return START_NOT_STICKY; }
        String cfgJson = intent.getStringExtra(EXTRA_CONFIG);
        if (cfgJson == null) { stopSelf(); return START_NOT_STICKY; }
        try { goForeground(); } catch (RuntimeException e) { // e.g. started while the app is not visible (Android 12+ restriction)
            prefs = new TrackingPrefs(this); writeStatus("UNAVAILABLE", "START_NOT_ALLOWED", false); stopSelf(); return START_NOT_STICKY;
        }
        if (running) return START_NOT_STICKY; // already tracking
        try { begin(cfgJson); } catch (RuntimeException e) { writeStatus("UNAVAILABLE", "START_FAILED", false); shutdown("START_FAILED", false); }
        return START_NOT_STICKY;
    }

    private Notification buildNotification(boolean onBreak) {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_stat_tracking).setContentTitle("Ground OPS Tracker")
            .setContentText(onBreak ? "On break - location paused" : "Location tracking is active during your shift").setOngoing(true).setOnlyAlertOnce(true).setContentIntent(pi).setCategory(NotificationCompat.CATEGORY_SERVICE).build();
        return n;
    }

    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Shift tracking", NotificationManager.IMPORTANCE_LOW));
        Notification n = buildNotification(false);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION); else startForeground(NOTIF_ID, n);
    }

    private void begin(String cfgJson) {
        prefs = new TrackingPrefs(this); prefs.saveConfig(cfgJson);
        Map<String, Object> m = MiniJson.asMap(MiniJson.parse(cfgJson));
        TrackingCore.Config c = new TrackingCore.Config();
        c.apiUrl = (String) m.get("apiUrl"); c.token = (String) m.get("token"); c.employeeId = (String) m.get("employeeId");
        c.intervalMs = num(m, "intervalMs", 300000); c.heartbeatMs = num(m, "heartbeatMs", 600000); c.syncIntervalMs = num(m, "syncIntervalMs", 300000);
        c.stopAtMs = num(m, "stopAtMs", System.currentTimeMillis() + 12L * 3600000L); c.minDistanceMeters = num(m, "minDistanceMeters", 25);
        employeeId = c.employeeId;
cfgApiUrl = c.apiUrl == null ? "" : c.apiUrl;
cfgToken = c.token == null ? "" : c.token;
        store = new SqlitePointStore(this);
        core = new TrackingCore(c, store, new HttpTransport(30000, false), new TrackingCore.Clock() { @Override public long now() { return System.currentTimeMillis(); } });
        thread = new HandlerThread("gops-location"); thread.start(); handler = new Handler(thread.getLooper()); io = Executors.newSingleThreadExecutor();
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE); cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        instance = this; running = true;
        listener = new LocationListener() {
            @Override public void onLocationChanged(final Location l) { io.execute(new Runnable() { @Override public void run() { handleFix(l); } }); }
            @Override public void onProviderDisabled(String p) { io.execute(new Runnable() { @Override public void run() { checkProviders(); } }); }
            @Override public void onProviderEnabled(String p) { io.execute(new Runnable() { @Override public void run() { checkProviders(); } }); }
            @Override public void onStatusChanged(String p, int s, Bundle e) { /* deprecated, required below API 29 */ }
        };
        requestUpdates();
        if (cm != null) {
            netCb = new ConnectivityManager.NetworkCallback() { @Override public void onAvailable(Network n) { io.execute(new Runnable() { @Override public void run() { if (core != null) { core.flush(true); persist(); } } }); } };
            try { cm.registerNetworkCallback(new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), netCb); } catch (RuntimeException e) { netCb = null; }
        }
        handler.postDelayed(tick, TICK_MS);
        io.execute(new Runnable() { @Override public void run() { checkProviders(); core.flush(true); persist(); } }); // upload anything left from an earlier session
        persist();
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            io.execute(new Runnable() { @Override public void run() {
                if (core == null) return;
                if (core.shouldStop()) { shutdown(null, true); return; }
                checkProviders();
                if (core.syncDue(System.currentTimeMillis())) core.flush(false);
                persist();
                if (core.shouldStop()) shutdown(null, true);
            } });
            if (handler != null) handler.postDelayed(this, TICK_MS);
        }
    };

    private boolean hasPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestUpdates() {
        long minTime = Math.max(15000L, core == null ? 60000L : readInterval() / 2);
        try {
            if (lm.getAllProviders().contains(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, minTime, 0f, listener, thread.getLooper());
            if (lm.getAllProviders().contains(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, minTime, 0f, listener, thread.getLooper());
        } catch (SecurityException e) { if (core != null) core.setProviderState("PERMISSION_DENIED"); }
    }
    private long readInterval() { try { return new JSONObject(prefs.config()).optLong("intervalMs", 300000); } catch (Exception e) { return 300000; } }

    /** Reports the REAL reason when no usable provider/permission exists. */
    private void checkProviders() {
        if (core == null || lm == null || core.isPaused()) return; // on a break location may be off: not an error
        if (!hasPermission()) { core.setProviderState("PERMISSION_DENIED"); return; }
        boolean gps = false, net = false;
        try { gps = lm.isProviderEnabled(LocationManager.GPS_PROVIDER); net = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } catch (RuntimeException e) { /* treated as off */ }
        if (!gps && !net) core.setProviderState("GPS_DISABLED");
    }

    private void handleFix(Location l) {
        if (core == null || !running) return;
        long t = l.getTime() > 0 ? l.getTime() : System.currentTimeMillis();
        Boolean mock = Build.VERSION.SDK_INT >= 31 ? Boolean.valueOf(l.isMock()) : Boolean.valueOf(l.isFromMockProvider());
        String p = l.getProvider(), src = LocationManager.GPS_PROVIDER.equals(p) ? "gps" : LocationManager.NETWORK_PROVIDER.equals(p) ? "network" : "fused".equals(p) ? "fused" : "unknown";
        double acc = l.hasAccuracy() ? l.getAccuracy() : 1000;
        boolean recorded = core.onFix(new TrackingCore.Fix(t, l.getLatitude(), l.getLongitude(), acc, mock, src, batteryPercent()));
        if (recorded && core.syncDue(System.currentTimeMillis())) core.flush(false);
        persist();
        if (core.shouldStop()) shutdown(null, true);
    }

    private Integer batteryPercent() {
        try {
            Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b == null) return null; int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            return level < 0 || scale <= 0 ? null : Integer.valueOf(Math.round(level * 100f / scale));
        } catch (RuntimeException e) { return null; }
    }

    private JSONObject statusJson(boolean serviceRunning) {
        JSONObject o = new JSONObject();
        try {
            TrackingCore.Status s = core.status(serviceRunning);
            o.put("running", s.running); o.put("state", s.state); o.put("ended", s.ended); o.put("endedReason", s.endedReason == null ? JSONObject.NULL : s.endedReason);
            o.put("lastError", s.lastError == null ? JSONObject.NULL : s.lastError); o.put("pendingPoints", s.pending); o.put("employeeId", employeeId);
            o.put("lastFixAt", s.lastFixAt == 0 ? JSONObject.NULL : s.lastFixAt); o.put("lastSyncAt", s.lastSyncAt == 0 ? JSONObject.NULL : s.lastSyncAt);
            if (s.lastLat != null) { o.put("lastLatitude", s.lastLat); o.put("lastLongitude", s.lastLon); o.put("lastAccuracy", s.lastAccuracy); }
            if (s.lastDistance != null) o.put("lastDistance", s.lastDistance); if (s.inside != null) o.put("inside", s.inside);
        } catch (JSONException e) { /* cannot happen for these types */ }
        return o;
    }
    private void persist() { if (core != null && prefs != null) prefs.saveStatus(statusJson(running)); }
    private void writeStatus(String state, String error, boolean ended) {
        if (prefs == null) prefs = new TrackingPrefs(this);
        try { JSONObject o = new JSONObject(); o.put("running", false); o.put("state", state); o.put("lastError", error); o.put("ended", ended); o.put("pendingPoints", 0); prefs.saveStatus(o); } catch (JSONException e) { /* ignore */ }
    }

    /** Stops tracking for good: no more updates, token removed from storage, notification gone. */
    private synchronized void shutdown(String reason, boolean ended) {
        boolean wasRunning = running; running = false;
        try { if (lm != null && listener != null) lm.removeUpdates(listener); } catch (RuntimeException e) { /* ignore */ }
        try { if (cm != null && netCb != null) cm.unregisterNetworkCallback(netCb); } catch (RuntimeException e) { /* ignore */ }
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (core != null && wasRunning) { JSONObject o = statusJson(false); try { o.put("running", false); o.put("state", "STOPPED"); if (reason != null && !ended) o.put("endedReason", reason); o.put("ended", ended || o.optBoolean("ended")); } catch (JSONException e) { /* ignore */ } if (prefs != null) prefs.saveStatus(o); }
        if (prefs != null) prefs.clearConfig();
        if (io != null) io.shutdown();
        if (thread != null) thread.quitSafely();
        instance = null;
        stopForeground(true); stopSelf();
    }
    public void stopTracking() { shutdown("STOP_REQUESTED", false); }

    /** Break: stop sampling the GPS but keep the service and its notification alive. Queued points still upload. */
    public void pauseTracking() {
        if (!running || io == null) return;
        io.execute(new Runnable() { @Override public void run() {
            if (core == null || core.isPaused()) return;
            try { if (lm != null && listener != null) lm.removeUpdates(listener); } catch (RuntimeException e) { /* ignore */ }
            core.setPaused(true); showNotification(true); persist();
        } });
    }

    /** End of a break: sample again right away (the next fix is recorded immediately). */
    public void resumeTracking() {
        if (!running || io == null) return;
        io.execute(new Runnable() { @Override public void run() {
            if (core == null || !core.isPaused()) return;
            core.setPaused(false); requestUpdates(); showNotification(false); persist();
        } });
    }

    private void showNotification(boolean onBreak) {
        try { NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.notify(NOTIF_ID, buildNotification(onBreak)); } catch (RuntimeException e) { /* notification is cosmetic */ }
    }

    @Override public void onDestroy() { if (running) shutdown("SERVICE_DESTROYED", false); instance = null; super.onDestroy(); }
    @Override public void onTaskRemoved(Intent rootIntent) { /* keep tracking: the foreground service survives the app being swiped away on most devices */ super.onTaskRemoved(rootIntent); }

    private static long num(Map<String, Object> m, String k, long def) { Object o = m.get(k); return o instanceof Double ? ((Double) o).longValue() : def; }
}
