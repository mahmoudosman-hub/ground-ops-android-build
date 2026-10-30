package com.groundops.tracker;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * v1.2.0 — شاشة «تجهيز التطبيق» الإجبارية.
 *
 * بتظهر أول ما التطبيق يفتح (وبترجع تظهر لوحدها لو أي إذن اتشال بعدين)
 * وتغطي الشاشة كلها لحد ما الكابتن يسمح بالأساسيات:
 *   1) الموقع أثناء الاستخدام
 *   2) الموقع في الخلفية «السماح طوال الوقت»
 *   3) الإشعارات
 *   4) الفقاعة العايمة «العرض فوق التطبيقات»
 *   5) البطارية بدون قيود (تذكير قوي — ممكن «كمّل للتطبيق» لو الأساسيات تمّت)
 *
 * جنب كل خانة زرار بيودي الكابتن على المكان بالظبط من غير بحث في الإعدادات.
 * كل الشاشة مبنية بالكود، وأي خطأ في أي حاجة فيها بيشيلها بس —
 * عمره ما يمنع التتبع نفسه من الشغل (نفس فلسفة BubbleOverlay).
 */
public final class PermissionsWizard {

    private static View overlay;
    private static LinearLayout rowsBox;
    private static TextView footerText;
    private static Button skipBtn;
    private static final String PREFS = "gops_setup_prefs";

    private PermissionsWizard() { }

    // ---------------- فحوصات الصلاحيات (كلها fail-open: أي خطأ = نعتبرها مسموحة) ----------------

    private static boolean fineOk(Activity a) {
        try {
            return ContextCompat.checkSelfPermission(a, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(a, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable t) { return true; }
    }

    private static boolean bgOk(Activity a) {
        try {
            if (Build.VERSION.SDK_INT < 29) return fineOk(a); // قبل أندرويد 10 مفيش إذن خلفية منفصل
            return ContextCompat.checkSelfPermission(a, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable t) { return true; }
    }

    private static boolean notifOk(Activity a) {
        try {
            if (Build.VERSION.SDK_INT < 33) return true; // قبل أندرويد 13 الإشعارات مسموحة افتراضياً
            return ContextCompat.checkSelfPermission(a, "android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable t) { return true; }
    }

    private static boolean overlayOk(Activity a) {
        try {
            if (Build.VERSION.SDK_INT < 23) return true;
            return Settings.canDrawOverlays(a);
        } catch (Throwable t) { return true; }
    }

    private static boolean batteryOk(Activity a) {
        try {
            if (Build.VERSION.SDK_INT < 23) return true;
            PowerManager pm = (PowerManager) a.getSystemService(Activity.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(a.getPackageName());
        } catch (Throwable t) { return true; }
    }

    // ---------------- نقطة الدخول: استدعِها من onCreate و onResume ----------------

    public static void check(final Activity a) {
        try {
            boolean fine = fineOk(a), bg = bgOk(a), notif = notifOk(a), ov = overlayOk(a), bat = batteryOk(a);
            boolean coreOk = fine && bg && notif && ov;
            boolean skipFresh = false;
            if (coreOk && !bat) {
                SharedPreferences sp = a.getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
                skipFresh = System.currentTimeMillis() - sp.getLong("battery_skip_at", 0L) < 24L * 3600000L;
            }
            if (coreOk && (bat || skipFresh)) { hide(a); return; }
            show(a, fine, bg, notif, ov, bat, coreOk);
        } catch (Throwable t) {
            try { hide(a); } catch (Throwable ignore) { }
        }
    }

    // ---------------- بناء الشاشة ----------------

    private static void show(final Activity a, boolean fine, boolean bg, boolean notif, boolean ov, boolean bat, boolean coreOk) {
        try {
            ViewGroup content = (ViewGroup) a.findViewById(android.R.id.content);
            if (content == null) return;
            if (overlay != null && overlay.getParent() == content && rowsBox != null) {
                refreshRows(a, fine, bg, notif, ov, bat, coreOk);
                return;
            }
            hide(a);

            ScrollView sv = new ScrollView(a);
            sv.setBackgroundColor(0xFFF6F8F7);
            sv.setFillViewport(true);

            LinearLayout box = new LinearLayout(a);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setPadding(dp(a, 22), dp(a, 34), dp(a, 22), dp(a, 24));
            sv.addView(box, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

            TextView title = new TextView(a);
            title.setText("📋 تجهيز التطبيق");
            title.setTextSize(22);
            title.setTypeface(null, Typeface.BOLD);
            title.setTextColor(0xFF12332B);
            title.setGravity(Gravity.CENTER);
            box.addView(title);

            TextView sub = new TextView(a);
            sub.setText("خطوة واحدة ومرة واحدة بس ✍️\nمن غيرها التتبع والفقاعة مش هيشتغلوا صح");
            sub.setTextSize(14);
            sub.setTextColor(0xFF5B6B66);
            sub.setGravity(Gravity.CENTER);
            sub.setPadding(0, dp(a, 8), 0, dp(a, 14));
            box.addView(sub);

            rowsBox = new LinearLayout(a);
            rowsBox.setOrientation(LinearLayout.VERTICAL);
            rowsBox.setBackground(rounded(a, 0xFFFFFFFF, 16));
            box.addView(rowsBox);

            footerText = new TextView(a);
            footerText.setTextSize(13);
            footerText.setTextColor(0xFF5B6B66);
            footerText.setGravity(Gravity.CENTER);
            footerText.setPadding(0, dp(a, 16), 0, dp(a, 4));
            box.addView(footerText);

            skipBtn = new Button(a);
            skipBtn.setText("كمّل للتطبيق ←");
            skipBtn.setTextSize(15);
            skipBtn.setTextColor(0xFF0E7A5F);
            skipBtn.setBackgroundColor(0x00000000);
            skipBtn.setAllCaps(false);
            skipBtn.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) {
                try {
                    a.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                        .edit().putLong("battery_skip_at", System.currentTimeMillis()).apply();
                } catch (Throwable t) { }
                hide(a);
            }});
            LinearLayout.LayoutParams skipLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            skipLp.gravity = Gravity.CENTER_HORIZONTAL;
            box.addView(skipBtn, skipLp);

            TextView ver = new TextView(a);
            ver.setText(versionLine(a));
            ver.setTextSize(12);
            ver.setTextColor(0xFF9AA8A3);
            ver.setGravity(Gravity.CENTER);
            ver.setPadding(0, dp(a, 10), 0, 0);
            box.addView(ver);

            content.addView(sv, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            overlay = sv;
            refreshRows(a, fine, bg, notif, ov, bat, coreOk);
        } catch (Throwable t) {
            try { hide(a); } catch (Throwable ignore) { }
        }
    }

    private static void refreshRows(final Activity a, boolean fine, boolean bg, boolean notif, boolean ov, boolean bat, boolean coreOk) {
        try {
            if (rowsBox == null) return;
            rowsBox.removeAllViews();
            rowsBox.addView(row(a, "الموقع أثناء الاستخدام", fine, "اسمح", new View.OnClickListener() {
                @Override public void onClick(View v) { askFine(a); } }));
            rowsBox.addView(row(a, "الموقع في الخلفية «السماح طوال الوقت»", bg, "اسمح", new View.OnClickListener() {
                @Override public void onClick(View v) { askBackground(a); } }));
            rowsBox.addView(row(a, "الإشعارات (التنبيهات المهمة)", notif, "اسمح", new View.OnClickListener() {
                @Override public void onClick(View v) { askNotif(a); } }));
            rowsBox.addView(row(a, "الفقاعة العايمة 🛵 «العرض فوق التطبيقات»", ov, "فعّل", new View.OnClickListener() {
                @Override public void onClick(View v) { askOverlay(a); } }));
            rowsBox.addView(row(a, "البطارية بدون قيود (عشان الموبايل ما يوقفش التتبع)", bat, "اضبط", new View.OnClickListener() {
                @Override public void onClick(View v) { askBattery(a); } }));
            if (footerText != null) {
                footerText.setText(coreOk
                    ? "تمّت الأساسيات ✅ — فاضل حاجة اختيارية بس، أو دوس «كمّل للتطبيق»"
                    : "التطبيق هيفتح على طول أول ما الخانات الأساسية تبقى ✅");
            }
            if (skipBtn != null) skipBtn.setVisibility(coreOk ? View.VISIBLE : View.GONE);
        } catch (Throwable t) { }
    }

    private static View row(final Activity a, String label, boolean done, String btnText, View.OnClickListener action) {
        LinearLayout r = new LinearLayout(a);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(a, 14), dp(a, 12), dp(a, 14), dp(a, 12));

        TextView st = new TextView(a);
        st.setText(done ? "✅" : "⬜");
        st.setTextSize(18);
        r.addView(st);

        TextView lb = new TextView(a);
        lb.setText(label);
        lb.setTextSize(15);
        lb.setTextColor(done ? 0xFF0E7A5F : 0xFF222222);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(a, 10), 0, dp(a, 10), 0);
        r.addView(lb, lp);

        if (!done) {
            Button b = new Button(a);
            b.setText(btnText);
            b.setTextSize(14);
            b.setTextColor(0xFFFFFFFF);
            b.setAllCaps(false);
            b.setBackground(rounded(a, 0xFF0E7A5F, 20));
            b.setPadding(dp(a, 18), dp(a, 4), dp(a, 18), dp(a, 4));
            b.setOnClickListener(action);
            r.addView(b);
        }
        return r;
    }

    // ---------------- أزرار كل خانة ----------------

    private static void askFine(final Activity a) {
        try {
            ActivityCompat.requestPermissions(a, new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION}, 9001);
        } catch (Throwable t) {
            toast(a, "افتح إعدادات الموبايل ← التطبيقات ← Ground OPS Tracker ← الصلاحيات ← الموقع");
        }
    }

    private static void askNotif(final Activity a) {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                ActivityCompat.requestPermissions(a, new String[]{"android.permission.POST_NOTIFICATIONS"}, 9002);
            }
        } catch (Throwable t) { }
    }

    private static void askBackground(final Activity a) {
        try {
            if (!fineOk(a)) { askFine(a); return; } // الأول الموقع الأساسي، وبعده الخلفية
            new AlertDialog.Builder(a)
                .setTitle("السماح طوال الوقت ⏱️")
                .setMessage("من الشاشة الجاية اعمل التلاتة دول:\n\n1️⃣ اختار «الصلاحيات»\n2️⃣ اختار «الموقع»\n3️⃣ اختار «السماح طوال الوقت»\n\nوبعدها ارجع للتطبيق على طول.")
                .setPositiveButton("افتح الإعدادات", new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int w) { openAppDetails(a); }
                })
                .setNegativeButton("بعدين", null)
                .show();
        } catch (Throwable t) {
            openAppDetails(a);
        }
    }

    private static void askOverlay(final Activity a) {
        try {
            a.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + a.getPackageName())));
        } catch (Throwable t) {
            try { a.startActivity(new Intent(Settings.ACTION_SETTINGS)); }
            catch (Throwable t2) { toast(a, "افتح الإعدادات ← التطبيقات ← Ground OPS Tracker ← «العرض فوق التطبيقات»"); }
        }
    }

    private static void askBattery(final Activity a) {
        try {
            a.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + a.getPackageName())));
        } catch (Throwable t) {
            try { a.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
            catch (Throwable t2) { toast(a, "افتح إعدادات البطارية وخلّي التطبيق «بدون قيود»"); }
        }
    }

    private static void openAppDetails(final Activity a) {
        try {
            a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + a.getPackageName())));
        } catch (Throwable t) {
            toast(a, "افتح الإعدادات ← التطبيقات ← Ground OPS Tracker");
        }
    }

    // ---------------- إخفاء + أدوات مساعدة ----------------

    public static void hide(final Activity a) {
        try {
            if (overlay != null) {
                ViewGroup p = (ViewGroup) overlay.getParent();
                if (p != null) p.removeView(overlay);
            }
        } catch (Throwable t) {
        } finally {
            overlay = null; rowsBox = null; footerText = null; skipBtn = null;
        }
    }

    private static String versionLine(Activity a) {
        try {
            return "النسخة " + a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionName;
        } catch (Throwable t) { return "النسخة 1.2.0"; }
    }

    private static GradientDrawable rounded(Context c, int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(c, Math.round(radiusDp)));
        return g;
    }

    private static int dp(Context c, int v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    private static void toast(Context c, String msg) {
        try { Toast.makeText(c, msg, Toast.LENGTH_LONG).show(); } catch (Throwable t) { }
    }
}
