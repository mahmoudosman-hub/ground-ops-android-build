package com.groundops.tracker;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * App-private persisted tracking state: the active configuration (REMOVED on stop, so a session token never outlives
 * tracking) and the last status snapshot (what the web layer reads when the service is not alive: always "not running").
 * allowBackup=false in the manifest keeps this out of device backups.
 */
public final class TrackingPrefs {
    private final SharedPreferences p;
    public TrackingPrefs(Context ctx) { p = ctx.getApplicationContext().getSharedPreferences("gops_tracking", Context.MODE_PRIVATE); }

    public void saveConfig(String json) { p.edit().putString("config", json).apply(); }
    public String config() { return p.getString("config", null); }
    public void clearConfig() { p.edit().remove("config").apply(); }
    public void saveStatus(JSONObject status) { p.edit().putString("status", status.toString()).apply(); }
    public JSONObject status() {
        String s = p.getString("status", null);
        if (s == null) return new JSONObject();
        try { return new JSONObject(s); } catch (JSONException e) { return new JSONObject(); }
    }
    public boolean askedLocation() { return p.getBoolean("askedLocation", false); }
    public void markAskedLocation() { p.edit().putBoolean("askedLocation", true).apply(); }
}
