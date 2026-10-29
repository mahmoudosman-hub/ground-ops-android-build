package com.groundops.tracker;

import android.util.Log;
import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class GopsFirebaseMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Log.d("FCM", "From: " + remoteMessage.getFrom());
        
        String title = "Ground OPS";
        String body = "New notification";
        
        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
            body = remoteMessage.getNotification().getBody();
        }
        
        // هنشغل الإنذار اللي إحنا عملناه (صوت + هزاز + شاشة)
        try {
            GopsAlarm.start(this);
            SelfieCheckNotifier.showNativeNotification(this, title, body);
        } catch (Exception e) {
            Log.e("FCM", "Failed to start alarm", e);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        Log.d("FCM", "Refreshed token: " + token);
    }
}
