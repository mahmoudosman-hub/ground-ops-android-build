package com.groundops.tracker;

import android.content.Context;
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

public class GopsAlarm {
    private static MediaPlayer mediaPlayer = null;
    private static Vibrator vibrator = null;
    private static Handler handler = new Handler(Looper.getMainLooper());
    private static Runnable stopRunnable = null;

    public static void start(Context ctx) {
        stop(); // إيقاف أي إنذار قديم شغال

        // 1. إيقاظ الشاشة
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                boolean isScreenOn = Build.VERSION.SDK_INT >= 20 ? pm.isInteractive() : pm.isScreenOn();
                if (!isScreenOn) {
                    PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "GopsAlarm:WakeLock");
                    wl.acquire(10000); // 10 ثواني كفاية لإيقاظ الشاشة
                }
            }
        } catch (Exception e) { Log.w("GopsAlarm", "WakeLock failed", e); }

        try {
            // 2. تشغيل الصوت (نغمة الأذان)
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM) 
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            
            Uri soundUri = getSoundUri(ctx);
            if (soundUri != null) {
                mediaPlayer.setDataSource(ctx, soundUri);
                mediaPlayer.setLooping(true); // إعادة مستمرة
                mediaPlayer.prepare();
                mediaPlayer.start();
            }

            // 3. الهزاز
            vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = { 0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000 };
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }

            // 4. إيقاف الإنذار بعد 5 دقايق تلقائياً
            stopRunnable = new Runnable() {
                @Override public void run() {
                    stop();
                }
            };
            handler.postDelayed(stopRunnable, 5 * 60 * 1000);

        } catch (Exception e) {
            Log.w("GopsAlarm", "Failed to start alarm", e);
        }
    }

    public static void stop() {
        if (stopRunnable != null) {
            handler.removeCallbacks(stopRunnable);
            stopRunnable = null;
        }
        if (mediaPlayer != null) {
            try { mediaPlayer.stop(); mediaPlayer.release(); } catch (Exception e) {}
            mediaPlayer = null;
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception e) {}
            vibrator = null;
        }
    }

    private static Uri getSoundUri(Context ctx) {
        try {
            int resId = ctx.getResources().getIdentifier("adhan", "raw", ctx.getPackageName());
            if (resId != 0) {
                return Uri.parse("android.resource://" + ctx.getPackageName() + "/" + resId);
            }
        } catch (Throwable t) {}
        return android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM);
    }
}
