package com.groundops.tracker;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class GopsFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        String title = "Ground OPS";
        String body = "New notification";
        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
            body = remoteMessage.getNotification().getBody();
        }

        final String finalTitle = title;
        final String finalBody = body;

        // بنشغل الخدمة في الخلفية عشان نسأل السيرفر هل الكابتن لسه في الشيفت؟
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    TrackingPrefs trackingPrefs = new TrackingPrefs(GopsFirebaseMessagingService.this);
                    String configStr = trackingPrefs.config();
                    if (configStr == null || configStr.isEmpty()) return;

                    JSONObject config = new JSONObject(configStr);
                    String apiUrl = config.optString("apiUrl");
                    String token = config.optString("token");

                    if (apiUrl.isEmpty() || token.isEmpty()) return;

                    URL url = new URL(apiUrl);
                    HttpURLConnection c = (HttpURLConnection) url.openConnection();
                    c.setRequestMethod("POST");
                    c.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
                    c.setDoOutput(true);
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(10000);
                    
                    String requestBody = "{\"action\":\"getTodaySchedule\",\"token\":\"" + token + "\",\"payload\":{},\"client\":\"android-service\"}";
                    try (OutputStream os = c.getOutputStream()) {
                        os.write(requestBody.getBytes(StandardCharsets.UTF_8));
                    }

                    int code = c.getResponseCode();
                    if (code == 200) {
                        StringBuilder sb = new StringBuilder();
                        try (BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                            String line;
                            while ((line = br.readLine()) != null) sb.append(line);
                        }
                        JSONObject response = new JSONObject(sb.toString());
                        if (response.optBoolean("success")) {
                            JSONObject data = response.optJSONObject("data");
                            JSONObject attendance = data != null ? data.optJSONObject("attendance") : null;
                            String state = attendance != null ? attendance.optString("state") : "";
                            
                            // لو الكابتن لسه في الشيفت (CHECKED_IN)، نعرض الإشعار
                            if ("CHECKED_IN".equals(state)) {
                                showNotification(GopsFirebaseMessagingService.this, finalTitle, finalBody);
                            } else {
                                Log.d("FCM", "Notification ignored: Captain is not checked in.");
                            }
                        }
                    }
                    c.disconnect();
                } catch (Exception e) {
                    Log.e("FCM", "Failed to check shift status", e);
                }
            }
        }).start();
    }

    private void showNotification(Context ctx, String title, String body) {
        String CHANNEL = "gops_fcm_native_v1";
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Native FCM", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 1000, 500, 1000, 500});
            nm.createNotificationChannel(ch);
        }

        try {
            GopsAlarm.start(this);
        } catch (Exception e) {}

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_tracking)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pi, true)
            .setAutoCancel(true)
            .setContentIntent(pi);

        nm.notify(9998, builder.build());
    }

    @Override
    public void onNewToken(@NonNull String token) {
        Log.d("FCM", "Refreshed token: " + token);
    }
}
