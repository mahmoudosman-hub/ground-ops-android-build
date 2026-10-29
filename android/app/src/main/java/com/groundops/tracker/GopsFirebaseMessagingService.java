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
import java.util.Map;

public class GopsFirebaseMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // 1. بنجيب البيانات من الـ Data
        Map<String, String> data = remoteMessage.getData();
        String title = data.get("title");
        String body = data.get("body");
        
        if (title == null) title = "Ground OPS";
        if (body == null) body = "New notification";

        // 2. بنتأكد إن الكابتن لسه في الشيفت (عشان منبعتش إشعار بعد الـ Checkout)
        TrackingPrefs prefs = new TrackingPrefs(this);
        String config = prefs.config();
        
        if (config == null || config.isEmpty()) {
            Log.d("FCM", "Notification blocked: Captain checked out.");
            return; // لو مفيش شيفت شغال، بنرفض الإشعار
        }

        // 3. بنشغل الإنذار ونعرض الإشعار
        try {
            GopsAlarm.start(this);
        } catch (Exception e) {
            Log.e("FCM", "Failed to start alarm", e);
        }

        showNotification(this, title, body);
    }

    private void showNotification(Context ctx, String title, String body) {
        String CHANNEL = "gops_fcm_native_v2";
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Native FCM", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 1000, 500, 1000, 500});
            nm.createNotificationChannel(ch);
        }

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
