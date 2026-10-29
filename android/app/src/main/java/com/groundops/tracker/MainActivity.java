package com.groundops.tracker;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override 
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GopsLocationPlugin.class); // must be registered before super.onCreate
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 👇 ده السطر اللي بيبعت إشارة للخدمة تقولها "اقفل الإنذار"
        try {
            Intent intent = new Intent(this, LocationForegroundService.class);
            intent.setAction(LocationForegroundService.ACTION_RESUME);
            startService(intent);
        } catch (Exception e) {
            // لو حصل أي خطأ، التطبيق هيكمل عادي
        }
    }
}
