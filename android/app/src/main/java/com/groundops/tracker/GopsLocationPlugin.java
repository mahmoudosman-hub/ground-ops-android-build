package com.groundops.tracker;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

@CapacitorPlugin(name = "GopsLocation", permissions = {
    @Permission(alias = "location", strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
    @Permission(alias = "notifications", strings = {"android.permission.POST_NOTIFICATIONS"})
})
public class GopsLocationPlugin extends Plugin {
    private Context ctx() { return getContext(); }
    private boolean hasLocation() {
        return ContextCompat.checkSelfPermission(ctx(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(ctx(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }
    private String locationState() { return hasLocation() ? "granted" : (new TrackingPrefs(ctx()).askedLocation() ? "denied" : "prompt"); }

    @PluginMethod public void isAvailable(PluginCall call) { JSObject o = new JSObject(); o.put("available", true); call.resolve(o); }

    @PluginMethod public void permissionStatus(PluginCall call) { JSObject o = new JSObject(); o.put("location", locationState()); call.resolve(o); }

    @PluginMethod public void askPermissions(PluginCall call) {
        if (!hasLocation()) requestPermissionForAlias("location", call, "locationCallback"); else afterLocation(call);
    }
    @PermissionCallback private void locationCallback(PluginCall call) { new TrackingPrefs(ctx()).markAskedLocation(); afterLocation(call); }
    private void afterLocation(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) requestPermissionForAlias("notifications", call, "notifCallback"); else resolvePerms(call);
    }
    @PermissionCallback private void notifCallback(PluginCall call) { resolvePerms(call); }
    private void resolvePerms(PluginCall call) {
        JSObject o = new JSObject(); o.put("location", locationState()); o.put("notifications", NotificationManagerCompat.from(ctx()).areNotificationsEnabled()); call.resolve(o);
    }

    @PluginMethod public void getCurrentPosition(final PluginCall call) {
        if (!hasLocation()) { call.reject("Location permission denied", "PERMISSION_DENIED"); return; }
        final LocationManager lm = (LocationManager) ctx().getSystemService(Context.LOCATION_SERVICE);
        
        // 🛑 التعديل هنا: قللنا الوقت لـ 7 ثواني بالكتير
        final long timeout = 7000L; 
        
        String provider = null;
        try { 
            // 🛑 التعديل هنا: بنجبره يستخدم GPS بس، ومش بنقبل Network في زرار الـ Check GPS
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                provider = LocationManager.GPS_PROVIDER;
            }
        } catch (RuntimeException e) { provider = null; }
        
        if (provider == null) { call.reject("GPS is switched off or not available. Please turn on Location.", "GPS_DISABLED"); return; }
        
        final AtomicBoolean done = new AtomicBoolean(false);
        final Handler main = new Handler(Looper.getMainLooper());
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                final CancellationSignal cs = new CancellationSignal();
                main.postDelayed(new Runnable() { @Override public void run() { cs.cancel(); } }, timeout);
                Executor ex = ContextCompat.getMainExecutor(ctx());
                lm.getCurrentLocation(provider, cs, ex, new Consumer<Location>() { @Override public void accept(Location l) { finish(call, done, l); } });
            } else {
                final android.location.LocationListener one = new android.location.LocationListener() {
                    @Override public void onLocationChanged(Location l) { finish(call, done, l); }
                    @Override public void onProviderDisabled(String p) { }
                    @Override public void onProviderEnabled(String p) { }
                    @Override public void onStatusChanged(String p, int s, android.os.Bundle e) { }
                };
                lm.requestSingleUpdate(provider, one, Looper.getMainLooper());
                main.postDelayed(new Runnable() { @Override public void run() { try { lm.removeUpdates(one); } catch (RuntimeException e) { } finish(call, done, null); } }, timeout);
            }
        } catch (SecurityException e) { call.reject("Location permission denied", "PERMISSION_DENIED"); }
    }
    
    private void finish(PluginCall call, AtomicBoolean done, Location l) {
        if (!done.compareAndSet(false, true)) return;
        if (l == null) { call.reject("No GPS fix in time. Move to an open area and try again.", "TIMEOUT"); return; }
        JSObject o = new JSObject(); o.put("latitude", l.getLatitude()); o.put("longitude", l.getLongitude()); o.put("accuracy", l.hasAccuracy() ? l.getAccuracy() : 1000);
        o.put("timestamp", l.getTime() > 0 ? l.getTime() : System.currentTimeMillis()); o.put("isMock", Build.VERSION.SDK_INT >= 31 ? l.isMock() : l.isFromMockProvider());
        String p = l.getProvider(); o.put("source", LocationManager.GPS_PROVIDER.equals(p) ? "gps" : LocationManager.NETWORK_PROVIDER.equals(p) ? "network" : "fused".equals(p) ? "fused" : "unknown");
        call.resolve(o);
    }

    @PluginMethod public void startTracking(PluginCall call) {
        if (!hasLocation()) { call.reject("Location permission denied", "PERMISSION_DENIED"); return; }
        String url = call.getString("apiUrl", ""), token = call.getString("token", ""), emp = call.getString("employeeId", "");
        if (!url.startsWith("https://") || token.isEmpty() || emp.isEmpty()) { call.reject("apiUrl (https), token and employeeId are required", "BAD_CONFIG"); return; }
        try {
            JSONObject c = new JSONObject();
            c.put("apiUrl", url); c.put("token", token); c.put("employeeId", emp);
            c.put("intervalMs", call.getLong("intervalMs", 300000L)); c.put("minDistanceMeters", call.getDouble("minDistanceMeters", 25.0)); c.put("heartbeatMs", call.getLong("heartbeatMs", 600000L));
            c.put("syncIntervalMs", call.getLong("syncIntervalMs", 300000L)); c.put("stopAtMs", call.getLong("stopAtMs", System.currentTimeMillis() + 12L * 3600000L));
            Intent i = new Intent(ctx(), LocationForegroundService.class).setAction(LocationForegroundService.ACTION_START).putExtra(LocationForegroundService.EXTRA_CONFIG, c.toString());
            ContextCompat.startForegroundService(ctx(), i);
            JSObject o = new JSObject(); o.put("started", true); call.resolve(o);
        } catch (JSONException e) { call.reject("bad config", "BAD_CONFIG"); }
        catch (RuntimeException e) { call.reject("Android did not allow the tracking service to start (keep the app open and try again)", "START_NOT_ALLOWED"); }
    }

    @PluginMethod public void stopTracking(PluginCall call) {
        LocationForegroundService s = LocationForegroundService.instance;
        if (s != null) s.stopTracking(); else new TrackingPrefs(ctx()).clearConfig();
        JSObject o = new JSObject(); o.put("stopped", true); call.resolve(o);
    }

    @PluginMethod public void pauseTracking(PluginCall call) {
        LocationForegroundService s = LocationForegroundService.instance;
        if (s == null) { call.reject("Tracking service is not running", "NOT_RUNNING"); return; }
        s.pauseTracking(); JSObject o = new JSObject(); o.put("paused", true); call.resolve(o);
    }
    @PluginMethod public void resumeTracking(PluginCall call) {
        LocationForegroundService s = LocationForegroundService.instance;
        if (s == null) { call.reject("Tracking service is not running", "NOT_RUNNING"); return; }
        s.resumeTracking(); JSObject o = new JSObject(); o.put("paused", false); call.resolve(o);
    }

    @PluginMethod public void getTrackingStatus(PluginCall call) {
        try { call.resolve(JSObject.fromJSONObject(LocationForegroundService.snapshot(ctx()))); } catch (JSONException e) { call.reject("status unreadable", "STATUS_UNREADABLE"); }
    }

    @PluginMethod public void getNativeLocationStatus(PluginCall call) {
        JSObject o = new JSObject(); LocationManager lm = (LocationManager) ctx().getSystemService(Context.LOCATION_SERVICE);
        boolean gps = false; try { gps = lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } catch (RuntimeException e) { }
        o.put("permission", locationState()); o.put("gpsEnabled", gps); o.put("notificationsEnabled", NotificationManagerCompat.from(ctx()).areNotificationsEnabled());
        PowerManager pm = (PowerManager) ctx().getSystemService(Context.POWER_SERVICE);
        o.put("ignoringBatteryOptimizations", Build.VERSION.SDK_INT >= 23 && pm != null ? pm.isIgnoringBatteryOptimizations(ctx().getPackageName()) : JSONObject.NULL);
        ActivityManager am = (ActivityManager) ctx().getSystemService(Context.ACTIVITY_SERVICE);
        o.put("backgroundRestricted", Build.VERSION.SDK_INT >= 28 && am != null ? am.isBackgroundRestricted() : JSONObject.NULL);
        o.put("sdkInt", Build.VERSION.SDK_INT); o.put("manufacturer", Build.MANUFACTURER); o.put("model", Build.MODEL);
        call.resolve(o);
    }

    @PluginMethod public void openBatterySettings(PluginCall call) {
        open(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), call);
    }
    @PluginMethod public void openLocationSettings(PluginCall call) { open(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS), call); }
    @PluginMethod public void openAppSettings(PluginCall call) { open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx().getPackageName())), call); }
    private void open(Intent i, PluginCall call) {
        try { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx().startActivity(i); call.resolve(); }
        catch (RuntimeException e) {
            try { Intent f = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx().startActivity(f); call.resolve(); }
            catch (RuntimeException e2) { call.reject("Settings screen not available on this device", "UNAVAILABLE"); }
        }
    }
}
