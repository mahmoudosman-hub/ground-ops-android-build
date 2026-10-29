package com.groundops.tracker;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {
    private String nativeFcmToken = null;

    @Override 
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GopsLocationPlugin.class);
        super.onCreate(savedInstanceState);

        // بنعمل جسر عشان الويب يقدر يطلب التوكن
        if (this.getBridge() != null && this.getBridge().getWebView() != null) {
            this.getBridge().getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public String getNativeToken() {
                    return nativeFcmToken;
                }
            }, "AndroidNative");
        }

        fetchFcmToken();
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            Intent intent = new Intent(this, LocationForegroundService.class);
            intent.setAction(LocationForegroundService.ACTION_RESUME);
            startService(intent);
            SelfieCheckNotifier.stopAlarm(this);
        } catch (Exception e) { }
    }

    private void fetchFcmToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                Log.w("FCM", "Fetching FCM registration token failed", task.getException());
                return;
            }
            nativeFcmToken = task.getResult();
            Log.d("FCM", "Native FCM Token: " + nativeFcmToken);
            
            if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                this.getBridge().getWebView().post(() -> {
                    this.getBridge().getWebView().evaluateJavascript("window.nativeFcmToken = '" + nativeFcmToken + "'; console.log('Native FCM token injected');", null);
                });
            }
        });
    }
}
