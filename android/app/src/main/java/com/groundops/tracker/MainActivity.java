package com.groundops.tracker;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override 
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GopsLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // إشارة للخدمة تقولها "اقفل الإنذار" لما الكابتن يفتح التطبيق
        try {
            Intent intent = new Intent(this, LocationForegroundService.class);
            intent.setAction(LocationForegroundService.ACTION_RESUME);
            startService(intent);
            
            // كمان نقفل صوت السيلفي لو شغال
            SelfieCheckNotifier.stopAlarm(this);
        } catch (Exception e) { }
    }
}
