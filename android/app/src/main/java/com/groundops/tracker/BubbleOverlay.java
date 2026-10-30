package com.groundops.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

/**
 * v1.1.0 — فقاعة عائمة زي الماسنجر بتظهر طول ما تتبع الشيفت شغال.
 * - ضغطة واحدة = تفتح التطبيق.
 * - ضغطة مطوّلة (نص ثانية من غير تحريك) = تبعت اللوكيشن للسيرفر فوراً (vibration قصيرة + رسالة تأكيد).
 * - بتتسحب بإيدك لأي مكان على الشاشة.
 * كل الكود محمي بالكامل: أي خطأ يخفي الفقاعة بس — عمره ما يؤثر على تتبع الشيفت نفسه.
 */
public final class BubbleOverlay {

    /** الحاجة اللي بتتنفذ لما الكابتن يعمل ضغطة مطوّلة (السيرفر هو اللي بيبعت النقاط المخزنة فوراً). */
    public interface SendNow { void run(); }

    private static final int SIZE_DP = 52;
    private static final long LONG_PRESS_MS = 550;
    private static final int TOUCH_SLOP_PX = 14;
    private static final int HINT_NOTIF_ID = 4713;
    private static final String HINT_CHANNEL = "gops_hints";

    private static View bubble;
    private static WindowManager wm;
    private static WindowManager.LayoutParams params;
    private static Handler main;
    private static long lastHintAt = 0L;

    private BubbleOverlay() { }

    private static Handler main() {
        synchronized (BubbleOverlay.class) {
            if (main == null) main = new Handler(Looper.getMainLooper());
            return main;
        }
    }

    /** إذن «العرض فوق التطبيقات الأخرى» — من أندرويد 6 وطالع بيتاخد من الإعدادات مش من بوب-أب عادي. */
    public static boolean canShow(Context c) {
        try {
            if (Build.VERSION.SDK_INT >= 23) return Settings.canDrawOverlays(c);
            return true; // أندرويد 5.x: الإذن بيتاخد وقت التثبيت
        } catch (Throwable t) { return false; }
    }

    /** ظهّر الفقاعة لو مش ظاهرة (آمن يستدعى من أي ثريد وبكل مرحلة). */
    public static void show(final Context c, final SendNow send) {
        main().post(new Runnable() { @Override public void run() { showInternal(c.getApplicationContext(), send); } });
    }

    /** اختصر الطريق: ظاهرة؟ ولا الإذن ناقص فنبعت إشعار هدوء بالتفعيل (مرة كل 6 ساعات كحد أقصى). */
    public static void ensure(Context c, SendNow send) {
        try {
            if (bubble != null) return;
            if (canShow(c)) { show(c, send); return; }
            long now = System.currentTimeMillis();
            if (now - lastHintAt > 6L * 3600000L) { lastHintAt = now; hintNotification(c); }
        } catch (Throwable t) { }
    }

    /** خبّي الفقاعة (آمن من أي ثريد). */
    public static void hide(Context c) {
        main().post(new Runnable() { @Override public void run() { hideInternal(); } });
    }

    // ---------------- كل ده بيشتغل على الموضوع الرئيسي بس ----------------

    private static void showInternal(final Context c, final SendNow send) {
        try {
            if (bubble != null) return; // ظاهرة بالفعل
            if (!canShow(c)) { long now = System.currentTimeMillis(); if (now - lastHintAt > 6L * 3600000L) { lastHintAt = now; hintNotification(c); } return; }
            WindowManager w = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
            if (w == null) return;

            int type = Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE; // أندرويد 5.x-7.x

            final int size = dp(c, SIZE_DP);
            final TextView v = new TextView(c);
            v.setText("🛵");
            v.setTextSize(24);
            v.setGravity(Gravity.CENTER);
            GradientDrawable bg = new GradientDrawable();
            bg.setShape(GradientDrawable.OVAL);
            bg.setColor(0xFF0E7A5F); // أخضر براند التطبيق
            bg.setStroke(dp(c, 2), 0xFFFFFFFF);
            v.setBackground(bg);
            v.setElevation(dp(c, 6));

            final WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                size, size, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
            p.gravity = Gravity.TOP | Gravity.START;
            p.x = dp(c, 12);
            p.y = dp(c, 180);

            // ضغطة مطوّلة: بعد LONG_PRESS_MS من غير تحريك → ابعت اللوكيشن
            final Runnable longPress = new Runnable() { @Override public void run() {
                try {
                    vibrate(c, 80);
                    if (send != null) send.run();
                    toast(c, "تم إرسال موقعك ✅");
                } catch (Throwable t) { toast(c, "عذراً — حاول تاني"); }
            }};

            v.setOnTouchListener(new View.OnTouchListener() {
                private float downRawX, downRawY;
                private int startX, startY;
                private long downAt;
                private boolean moved, fired;

                @Override public boolean onTouch(View vv, MotionEvent ev) {
                    try {
                        switch (ev.getActionMasked()) {
                            case MotionEvent.ACTION_DOWN:
                                downRawX = ev.getRawX(); downRawY = ev.getRawY();
                                startX = p.x; startY = p.y;
                                downAt = System.currentTimeMillis();
                                moved = false; fired = false;
                                main().postDelayed(longPress, LONG_PRESS_MS);
                                return true;
                            case MotionEvent.ACTION_MOVE: {
                                float dx = ev.getRawX() - downRawX, dy = ev.getRawY() - downRawY;
                                if (Math.abs(dx) > TOUCH_SLOP_PX || Math.abs(dy) > TOUCH_SLOP_PX) {
                                    if (!moved) { moved = true; main().removeCallbacks(longPress); }
                                }
                                if (moved) {
                                    p.x = startX + (int) dx;
                                    p.y = startY + (int) dy;
                                    try { w.updateViewLayout(v, p); } catch (Throwable t) { }
                                }
                                return true;
                            }
                            case MotionEvent.ACTION_UP:
                            case MotionEvent.ACTION_CANCEL:
                                main().removeCallbacks(longPress);
                                if (!fired && !moved && System.currentTimeMillis() - downAt < LONG_PRESS_MS) {
                                    openApp(c); // ضغطة واحدة = افتح التطبيق
                                }
                                return true;
                            default:
                                return false;
                        }
                    } catch (Throwable t) { return false; }
                }
            });

            w.addView(v, p);
            wm = w; params = p; bubble = v;
        } catch (Throwable t) {
            hideInternal();
        }
    }

    private static void hideInternal() {
        try {
            if (bubble != null && wm != null) wm.removeView(bubble);
        } catch (Throwable t) {
        } finally {
            bubble = null; wm = null; params = null;
        }
    }

    private static void openApp(Context c) {
        try {
            Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (i == null) return;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            c.startActivity(i);
        } catch (Throwable t) { }
    }

    private static void vibrate(Context c, int ms) {
        try {
            Vibrator vb = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            if (vb == null || !vb.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) vb.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            else vb.vibrate(ms);
        } catch (Throwable t) { }
    }

    private static void toast(Context c, String msg) {
        try { android.widget.Toast.makeText(c, msg, android.widget.Toast.LENGTH_SHORT).show(); } catch (Throwable t) { }
    }

    /** إشعار هدوء (مرة كل 6 ساعات كحد أقصى) يودّي الكابتن على صفحة تفعيل «العرض فوق التطبيقات». */
    private static void hintNotification(Context c) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(HINT_CHANNEL, "نصائح التطبيق", NotificationManager.IMPORTANCE_DEFAULT));
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(c, HINT_NOTIF_ID, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification n = new NotificationCompat.Builder(c, HINT_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_tracking)
                .setContentTitle("فقاعة التتبع مش مفعّلة")
                .setContentText("اضغط هنا وخلي «العرض فوق التطبيقات الأخرى» مفعّل — الفقاعة هتظهر فوق أي شاشة")
                .setContentIntent(pi).setAutoCancel(true).build();
            nm.notify(HINT_NOTIF_ID, n);
        } catch (Throwable t) { }
    }

    private static int dp(Context c, int v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }
}
