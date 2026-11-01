package com.groundops.tracker;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.Arrays;
import java.util.Comparator;

import com.groundops.tracker.core.HttpTransport;
import com.groundops.tracker.core.TrackingCore;

/**
 * v1.4.4 — حارس الكراش.
 *
 * المشكلة: الكابتن بيبقى فاتح التطبيق وفجأة يقفل ويطلع رسالة «إيقاف اجباري / خطأ».
 * السبب: أي استثناء مش متمسوك في أي ثريد (حتى مش الثريد الرئيسي) بيقفل العملية كلها.
 *
 * الحل على 3 طبقات:
 *  1) بيمسك كل استثناء غير متوقع ويسجل تقرير في ملف محلي (آخر 3 تقارير بس).
 *  2) كراشات الخلفية (ثريدات مش الرئيسية) بنبلعها — التطبيق يفضل شغال بدل ما يقفل.
 *     كراش الثريد الرئيسي: لو التطبيق لسه قادر، بنعيد تشغيله تلقائيًا خلال ثانية
 *     (مرتين كحد أقصى في دقيقتين — عشان ما يبقاش لوب مفتوح) وغير كده بنسيبه يقفل عادي.
 *  3) أول ما التطبيق يفتح تاني: لو فيه تقرير كراش محفوظ وشيفت شغال (config محفوظ)،
 *     نبعته للسيرفر (action: clientCrashLog) عشان الأدمن يشوف السبب الحقيقي
 *     من تليفون الكابتن نفسه من غير كمبيوتر ولا adb.
 */
public final class CrashGuard {
    private static final String TAG = "GopsCrashGuard";
    private static final String DIR = "crashlogs";
    private static final String PREFS = "gops_crash_guard";
    private static volatile boolean installed = false;

    private CrashGuard() { }

    public static void install(final Context ctx) {
        if (installed) return;
        installed = true;
        final Context app = ctx.getApplicationContext();
        final Thread.UncaughtExceptionHandler system = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override public void uncaughtException(final Thread th, final Throwable ex) {
                try { save(app, th, ex); } catch (Throwable t) { }
                if (isMainThread(th)) {
                    if (canRelaunch(app)) { relaunch(app); return; } // ما بنعرضش رسالة الإيقاف — التطبيق يفتح لوحده
                    if (system != null) system.uncaughtException(th, ex); else System.exit(2);
                    return;
                }
                // ثريد خلفية: نبلع الكراش — العملية تفضل حية والتتبع مكمل
            }
        });
    }

    private static boolean isMainThread(Thread t) {
        return t != null && ("main".equals(t.getName()) || t.getId() == 1L);
    }

    /** مرتين كحد أقصى في آخر 120 ثانية — فوق كده بنسيب النظام يعرض رسالة الإيقاف العادية. */
    private static boolean canRelaunch(Context c) {
        try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            long now = System.currentTimeMillis();
            long r1 = sp.getLong("r1", 0L), r2 = sp.getLong("r2", 0L);
            if (now - r1 < 120000L && now - r2 < 120000L) return false;
            sp.edit().putLong("r2", r1).putLong("r1", now).apply();
            return true;
        } catch (Throwable t) { return false; }
    }

    private static void relaunch(Context c) {
        try {
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (open == null) { System.exit(2); return; }
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(c, 7001, open, flags);
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                    am.setWindow(AlarmManager.RTC, System.currentTimeMillis() + 150L, 2000L, pi);
                } else if (Build.VERSION.SDK_INT >= 19) {
                    am.setExact(AlarmManager.RTC, System.currentTimeMillis() + 150L, pi);
                } else {
                    am.set(AlarmManager.RTC, System.currentTimeMillis() + 150L, pi);
                }
            }
        } catch (Throwable t) { Log.w(TAG, "relaunch failed", t); }
        // قفل العملية بنفسنا — من غير رسالة «إيقاف اجباري»، والمنبه اللي فوق هيفتح التطبيق تاني
        try { android.os.Process.killProcess(android.os.Process.myPid()); } catch (Throwable t) { }
        System.exit(2);
    }

    // ---------------- حفظ التقرير محليًا ----------------

    private static File dir(Context c) {
        File d = new File(c.getNoBackupFilesDir(), DIR);
        if (!d.exists()) { try { d.mkdirs(); } catch (Throwable t) { } }
        return d;
    }

    private static void save(Context c, Thread th, Throwable ex) throws Exception {
        File d = dir(c);
        File[] old = d.listFiles();
        if (old != null && old.length >= 3) {
            Arrays.sort(old, new Comparator<File>() { @Override public int compare(File a, File b) { return a.lastModified() < b.lastModified() ? -1 : 1; } });
            old[0].delete();
        }
        File f = new File(d, "crash-" + System.currentTimeMillis() + ".txt");
        StringBuilder sb = new StringBuilder();
        sb.append("time=").append(new java.util.Date().toString()).append('\n');
        sb.append("thread=").append(th == null ? "?" : th.getName()).append('\n');
        sb.append("version=").append(version(c)).append('\n');
        sb.append("device=").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append(" SDK").append(Build.VERSION.SDK_INT).append('\n');
        sb.append("exc=").append(ex == null ? "?" : ex.getClass().getName()).append(": ").append(ex == null ? "" : String.valueOf(ex.getMessage())).append('\n');
        if (ex != null) {
            StackTraceElement[] st = ex.getStackTrace();
            for (int i = 0; i < st.length && i < 40; i++) sb.append("  at ").append(st[i].toString()).append('\n');
            Throwable cause = ex.getCause();
            if (cause != null) sb.append("cause=").append(cause.getClass().getName()).append(": ").append(cause.getMessage()).append('\n');
        }
        FileOutputStream fo = new FileOutputStream(f);
        fo.write(sb.toString().getBytes("UTF-8"));
        fo.close();
    }

    private static String version(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; }
        catch (Throwable t) { return "?"; }
    }

    // ---------------- رفع التقارير للسيرفر أول ما التطبيق يفتح ----------------

    /** يتنادى من MainActivity.onCreate — واحدة في المرة، وصمت تام لو مفيش نت أو مفيش شيفت شغال. */
    public static void uploadPending(final Context ctx) {
        try {
            final Context app = ctx.getApplicationContext();
            final File[] files = dir(app).listFiles();
            if (files == null || files.length == 0) return;
            final String cfg = new TrackingPrefs(app).config();
            if (cfg == null || cfg.trim().isEmpty()) return; // مفيش شيفت نشط = مفيش توكن نبعت بيه
            new Thread(new Runnable() { @Override public void run() {
                try { uploadOne(app, files[0], cfg); } catch (Throwable t) { Log.w(TAG, "upload failed", t); }
            } }, "gops-crash-upload").start();
        } catch (Throwable t) { }
    }

    private static void uploadOne(Context app, File f, String cfg) {
        FileInputStream in = null;
        String content;
        try { in = new FileInputStream(f); byte[] buf = new byte[(int) Math.min(f.length(), 7000)];
            int n = in.read(buf); content = n > 0 ? new String(buf, 0, n, "UTF-8") : "";
        } catch (Exception e) { return; } finally { try { in.close(); } catch (Exception e) { } }
        if (content.trim().isEmpty()) { f.delete(); return; }
        try {
            JSONObject c = new JSONObject(cfg);
            String apiUrl = c.optString("apiUrl", ""), token = c.optString("token", "");
            if (!apiUrl.startsWith("https://") || token.isEmpty()) { f.delete(); return; }
            JSONObject payload = new JSONObject();
            payload.put("app_version", version(app));
            payload.put("device", Build.MANUFACTURER + " " + Build.MODEL + " SDK" + Build.VERSION.SDK_INT);
            payload.put("tag", field(content, "thread"));
            payload.put("message", field(content, "exc"));
            payload.put("stack", content.length() > 5000 ? content.substring(0, 5000) : content);
            JSONObject body = new JSONObject();
            body.put("action", "clientCrashLog");
            body.put("token", token);
            body.put("client", "android-crash/1.0");
            body.put("payload", payload);
            TrackingCore.Response res = new HttpTransport(10000, false).post(apiUrl, body.toString());
            if (res.status >= 200 && res.status < 300 && res.body != null && res.body.contains("\"success\":true")) f.delete();
            else if (res.body != null && (res.body.contains("INVALID_SESSION") || res.body.contains("SESSION_EXPIRED"))) f.delete(); // السيشن مات — مفيش طريقة نبعث بيها
        } catch (Throwable t) { Log.w(TAG, "uploadOne failed", t); }
    }

    private static String field(String content, String key) {
        int i = content.indexOf(key + "=");
        if (i < 0) return "";
        int j = content.indexOf('\n', i);
        String v = j < 0 ? content.substring(i + key.length() + 1) : content.substring(i + key.length() + 1, j);
        return v.length() > 480 ? v.substring(0, 480) : v;
    }
}
