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
    private volatile boolean destroyed = false;

    @Override 
    public void onCreate(Bundle savedInstanceState) {
        // v1.4.4: حارس الكراش — أول سطر قبل أي حاجة: أي استثناء غير متوقع يتسجل
        // بدل رسالة «إيقاف اجباري»، والتقارير القديمة تترفع للسيرفر
        try { CrashGuard.install(getApplicationContext()); } catch (Throwable t) { }
        try { CrashGuard.uploadPending(getApplicationContext()); } catch (Throwable t) { }

        registerPlugin(GopsLocationPlugin.class);
        super.onCreate(savedInstanceState);

        // إضافة الجسر عشان الويب يطلب التوكن في أي وقت
        try {
            if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                this.getBridge().getWebView().addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public String getNativeToken() {
                        return nativeFcmToken;
                    }
                }, "AndroidNative");
            }
        } catch (Throwable t) { Log.w("MainActivity", "js bridge failed", t); }

        fetchFcmToken();
        startInjectionLoop();

        // v1.2.0: شاشة «تجهيز التطبيق» — بتجبر الكابتن على الأذونات المهمة أول ما يفتح
        PermissionsWizard.check(this);
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

            // v1.2.0: نحدّث شاشة التجهيز (بتظهر لو أي إذن ناقص أو اتشال — وبتختفي لو كله تمام)
            PermissionsWizard.check(this);
            
        } catch (Exception e) { 
            Log.e("MainActivity", "Error in onResume", e);
        }
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        try { handler.removeCallbacksAndMessages(null); } catch (Throwable t) { }
        super.onDestroy();
    }

    private void fetchFcmToken() {
        // v1.4.4: FirebaseMessaging.getInstance() بيナルق استثناء على الموبايلات اللي من غير
        // خدمات جوجل (GMS) — وده كان بيقفل التطبيق فور فتحه من غير أي رسالة مفهومة
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    Log.w("FCM", "Fetching FCM registration token failed", task.getException());
                    return;
                }
                nativeFcmToken = task.getResult();
                Log.d("FCM", "Native FCM Token: " + nativeFcmToken);
                isInjected = false; // عشان نجبره يبعت التوكن للويب
            });
        } catch (Throwable t) {
            Log.w("FCM", "Firebase not available on this device", t);
        }
    }

    private void startInjectionLoop() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (destroyed) return;
                try {
                    if (nativeFcmToken != null && !isInjected) {
                        if (getBridge() != null && getBridge().getWebView() != null) {
                            String js = "window.nativeFcmToken = '" + nativeFcmToken + "'; console.log('Native FCM token injected');";
                            getBridge().getWebView().evaluateJavascript(js, null);
                            isInjected = true; // كده التوكن اتبعت، مش هنعيد تاني
                        }
                    }
                    
                    // بنكمل لوب بس لو لسه مبعتناش التوكن
                    if (!isInjected && !destroyed) {
                        handler.postDelayed(this, 2000);
                    }
                } catch (Throwable t) {
                    // v1.4.4: أي خطأ هنا (زي evaluateJavascript بعد تدمير الواجهة) ممنوع يقفل التطبيق
                    Log.w("FCM", "token injection failed", t);
                    if (!isInjected && !destroyed) handler.postDelayed(this, 2000);
                }
            }
        }, 2000);
    }
}
