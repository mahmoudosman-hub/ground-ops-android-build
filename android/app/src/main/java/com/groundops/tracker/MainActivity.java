package com.groundops.tracker;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {
    private String nativeFcmToken = null;
    private Handler handler = new Handler(Looper.getMainLooper());
    private boolean isInjected = false;

    @Override 
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GopsLocationPlugin.class);
        super.onCreate(savedInstanceState);

        // إضافة الجسر عشان الويب يطلب التوكن في أي وقت
        if (this.getBridge() != null && this.getBridge().getWebView() != null) {
            this.getBridge().getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public String getNativeToken() {
                    return nativeFcmToken;
                }
            }, "AndroidNative");
        }

        fetchFcmToken();
        startInjectionLoop();
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            // بنقفل أي صوت شغال (سيلفي أو GPS أو أدمن) أول ما التطبيق يتفتح
            SelfieCheckNotifier.stopAlarm(this);
            GopsAlarm.stop();
            
            // بنطمن على خدمة التتبع إنها شغالة
            Intent intent = new Intent(this, LocationForegroundService.class);
            intent.setAction(LocationForegroundService.ACTION_RESUME);
            startService(intent);
            
        } catch (Exception e) { 
            Log.e("MainActivity", "Error in onResume", e);
        }
    }

    private void fetchFcmToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                Log.w("FCM", "Fetching FCM registration token failed", task.getException());
                return;
            }
            nativeFcmToken = task.getResult();
            Log.d("FCM", "Native FCM Token: " + nativeFcmToken);
            isInjected = false; // عشان نجبره يبعت التوكن للويب
        });
    }

    private void startInjectionLoop() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (nativeFcmToken != null && !isInjected) {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = "window.nativeFcmToken = '" + nativeFcmToken + "'; console.log('Native FCM token injected');";
                        getBridge().getWebView().evaluateJavascript(js, null);
                        isInjected = true; // كده التوكن اتبعت، مش هنعيد تاني
                    }
                }
                
                // بنكمل لوب بس لو لسه مبعتناش التوكن
                if (!isInjected) {
                    handler.postDelayed(this, 2000);
                }
            }
        }, 2000);
    }
}
