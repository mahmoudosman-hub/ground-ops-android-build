package com.groundops.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class SelfieCheckNotifier {
    private static final String TAG = "GopsSelfieNotifier";
    private static final String CHANNEL = "gops_selfie_v8";
    private static final int NOTIF_ID = 4712;
    private static final String PREFS = "gops_selfie_notify";
    private static final String KEY_LAST_ID = "last_notified_id";
    
    private static MediaPlayer mediaPlayer = null;
    private static Vibrator vibrator = null;
    private static Handler handler = new Handler(Looper.getMainLooper());

    private SelfieCheckNotifier() {}

    public static void stopAlarm(Context ctx) {
        if (mediaPlayer != null) {
            try { mediaPlayer.stop(); mediaPlayer.release(); } catch (Exception e) {}
            mediaPlayer = null;
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception e) {}
            vibrator = null;
        }
    }

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
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Selfie checks (urgent v8)", NotificationManager.IMPORTANCE_HIGH);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ch.setSound(null, null); // الصوت هيشتغل من الميديا بلاير
            nm.createNotificationChannel(ch);
        }

        // 1. إيقاظ الشاشة
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "GopsSelfie:WakeLock");
                wl.acquire(10000);
            }
        } catch (Exception e) {}

        // 2. تشغيل الأذان + الهزاز (لوب لمدة 5 دقايق)
        stopAlarm(ctx);
        try {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            int resId = ctx.getResources().getIdentifier("adhan", "raw", ctx.getPackageName());
            if (resId != 0) mediaPlayer.setDataSource(ctx, Uri.parse("android.resource://" + ctx.getPackageName() + "/" + resId));
            else mediaPlayer.setDataSource(ctx, android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM));
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();

            vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = { 0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000 };
                if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                else vibrator.vibrate(pattern, 0);
            }

            handler.postDelayed(new Runnable() { @Override public void run() { stopAlarm(ctx); } }, 5 * 60 * 1000);
        } catch (Exception e) { Log.w(TAG, "Failed to start alarm", e); }

        // 3. إظهار الإشعار
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, 9001, open, flags);
            long secondsLeft = 600;
            try { secondsLeft = due.optLong("remaining_seconds", 600L); } catch (Exception e) { }
            String text = "You have about " + Math.max(0, secondsLeft / 60) + " min to take a photo.";
            Notification n = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_tracking).setContentTitle("📸 Selfie check requested").setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text)).setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL).setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(pi, true).setAutoCancel(true).setContentIntent(pi).build();
            try { nm.notify("gops_selfie_urgent_v8", NOTIF_ID, n); } catch (RuntimeException e) { }
        }
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
