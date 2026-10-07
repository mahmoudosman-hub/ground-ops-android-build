package com.groundops.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Polls the server for a pending selfie check and fires a native notification when one is due.
 * Runs from LocationForegroundService every minute. No interaction with the web layer:
 * tapping the notification opens the app, and the JS polls the server itself for the prompt.
 */
public final class SelfieCheckNotifier {

    private static final String TAG = "GopsSelfieNotifier";
    private static final String CHANNEL = "gops_selfie";
    private static final int NOTIF_ID = 4712;
    private static final String PREFS = "gops_selfie_notify";
    private static final String KEY_LAST_ID = "last_notified_id";

    private SelfieCheckNotifier() {}

    /** Called from the tracking service's tick. Never throws. */
    public static void pollAndNotify(Context ctx, String apiUrl, String token, String employeeId) {
        if (ctx == null || apiUrl == null || token == null || employeeId == null) return;
        if (apiUrl.isEmpty() || token.isEmpty() || employeeId.isEmpty()) return;
        final Context app = ctx.getApplicationContext();
        new Thread(new Runnable() {
            @Override public void run() {
                try { doPoll(app, apiUrl, token, employeeId); }
                catch (Throwable t) { Log.w(TAG, "poll failed", t); }
            }
        }).start();
    }

    private static void doPoll(Context ctx, String apiUrl, String token, String employeeId) throws Exception {
        String body = "{\"action\":\"getPendingSelfieCheck\",\"token\":\"" + esc(token) + "\",\"payload\":{},\"client\":\"android-service\"}";
        HttpURLConnection c = null;
        String response = null;
        try {
            c = (HttpURLConnection) new URL(apiUrl).openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
            c.setDoOutput(true);
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            c.setInstanceFollowRedirects(true);
            try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) return;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
            }
            response = sb.toString();
        } finally {
            if (c != null) try { c.disconnect(); } catch (Exception e) {}
        }
        if (response == null || response.isEmpty()) return;

        JSONObject root = new JSONObject(response);
        if (!root.optBoolean("success", false)) return;
        JSONObject data = root.optJSONObject("data");
        if (data == null) return;
        JSONObject due = data.optJSONObject("due");
        if (due == null) return;
        String checkId = due.optString("check_id", "");
        if (checkId.isEmpty()) return;

        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String lastId = sp.getString(KEY_LAST_ID, "");
        if (checkId.equals(lastId)) return;
        sp.edit().putString(KEY_LAST_ID, checkId).apply();

        fireNotification(ctx, due);
    }

    private static void fireNotification(Context ctx, JSONObject due) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Selfie checks", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Random selfie checks during a shift");
            ch.enableVibration(true);
            ch.setShowBadge(true);
            nm.createNotificationChannel(ch);
        }

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open == null) return;
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(ctx, 9001, open, flags);

        long secondsLeft = 600;
        try { secondsLeft = due.optLong("remaining_seconds", 600L); } catch (Exception e) { /* default */ }
        String text = "You have about " + Math.max(0, secondsLeft / 60) + " min to take a photo.";

        Notification n = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_tracking)
            .setContentTitle("Selfie check requested")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build();

        try { nm.notify(NOTIF_ID, n); } catch (RuntimeException e) { Log.w(TAG, "notify failed", e); }
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
