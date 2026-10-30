package com.groundops.tracker;

import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
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
    private static final String OVERLAY_PREFS = "gops_overlay_hint";
    private static final long OVERLAY_HINT_INTERVAL_MS = 24L * 3600000L; // مرة في اليوم كحد أقصى

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

            // v1.1.1: لو إذن «العرض فوق التطبيقات» ناقص نعرض دليل التفعيل على طول (مرة في اليوم) — عشان الفقاعة متفضلش مخبية
            maybeShowOverlayGuide();
            
        } catch (Exception e) { 
            Log.e("MainActivity", "Error in onResume", e);
        }
    }

    /** v1.1.1: نافذة توجيه للفقاعة العايمة — بتفعّل الإذن من غير ما الكابتن يدور في الإعدادات. */
    private void maybeShowOverlayGuide() {
        try {
            if (BubbleOverlay.canShow(this)) return; // الإذن موجود — الفقاعة شغالة
            SharedPreferences sp = getSharedPreferences(OVERLAY_PREFS, MODE_PRIVATE);
            long last = sp.getLong("last_hint_at", 0L);
            if (System.currentTimeMillis() - last < OVERLAY_HINT_INTERVAL_MS) return;
            sp.edit().putLong("last_hint_at", System.currentTimeMillis()).apply();
            new AlertDialog.Builder(this)
                .setTitle("فعّل فقاعة التتبع 🛵")
                .setMessage("الفقاعة العايمة بتظهر طول الشيفت فوق أي شاشة:\n• ضغطة واحدة = يفتح التطبيق\n• ضغطة مطوّلة (نص ثانية) = يبعت موقعك فوراً\n\nعشان تشتغل: من الشاشة الجاية فعّل «العرض فوق التطبيقات الأخرى» للتطبيق.")
                .setPositiveButton("فعّل دلوقتي", (d, w) -> {
                    try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); } catch (Throwable t) { Log.w("MainActivity", "overlay settings open failed", t); }
                })
                .setNegativeButton("بعدين", null)
                .show();
        } catch (Throwable t) { Log.w("MainActivity", "overlay guide failed", t); }
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
