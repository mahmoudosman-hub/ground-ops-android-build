package com.groundops.tracker;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.groundops.tracker.core.HttpTransport;
import com.groundops.tracker.core.MiniJson;
import com.groundops.tracker.core.TrackingCore;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocationForegroundService extends Service {
    public static final String ACTION_START = "com.groundops.tracker.START", ACTION_STOP = "com.groundops.tracker.STOP", EXTRA_CONFIG = "config";
    public static final String ACTION_RESUME = "com.groundops.tracker.RESUME";
    private static final String CHANNEL = "gops_tracking"; 
    private static final String ALARM_CHANNEL = "gops_gps_alarm_v99";
    private static final int NOTIF_ID = 4711; 
    private static final int ALARM_NOTIF_ID = 9999;
    private static final int ALARM_REQUEST_CODE = 555;
    private static final long TICK_MS = 30000;
    public static volatile LocationForegroundService instance;

    private TrackingCore core; private TrackingPrefs prefs; private SqlitePointStore store; private LocationManager lm; private ConnectivityManager cm;
    private HandlerThread thread; private Handler handler; private ExecutorService io; private LocationListener listener; private ConnectivityManager.NetworkCallback netCb;
    private volatile boolean running; private String employeeId = "";
    private String cfgApiUrl = "", cfgToken = "";
    private long lastSelfiePollMs = 0L;
    private long lastLocationTimeMs = 0L;
    // v1.4.2: وقت آخر إرسال ناجح للسيرفر — المنبه بقى يرن لو موقع الكابتن مش واصل الداشبورد من 15 دقيقة
    // أيًا كان السبب (نت واقف، GPS مقفول، التطبيق اتصفر...) — مش بس لو الجهاز مش بيقدر يلقط موقع زي قبل.
    private long lastSendOkMs = 0L;
    // v1.4.2: حالة الرنة الحالية + وقت آخر بداية رنة — بنرن مرة واحدة كل 15 دقيقة
    // (رنة 5 دقايق + سكتة 10) ومانرنش فوق بعض، والفحص الدقيق بيحصل كل 30 ثانية جوه الخدمة نفسها.
    private static volatile boolean alarmRinging = false;
    private volatile long lastAlarmFiredMs = 0L;
    
    private static MediaPlayer alarmPlayer = null;
    private static Vibrator alarmVibrator = null;

    public static JSONObject snapshot(Context ctx) {
        LocationForegroundService s = instance;
        if (s != null && s.running && s.core != null) return s.statusJson(true);
        JSONObject last = new TrackingPrefs(ctx).status();
        try {
            last.put("running", false); last.put("state", "STOPPED");
            String emp = last.optString("employeeId", "");
            if (emp.length() > 0) last.put("pendingPoints", new SqlitePointStore(ctx).count(emp));
        } catch (JSONException e) { }
        return last;
    }

    @Override public void onCreate() {
        super.onCreate();
        io = Executors.newSingleThreadExecutor();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override 
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        String action = intent.getAction();
        
        if (ACTION_STOP.equals(action)) { 
            stopAlarm();
            shutdown("STOP_REQUESTED", false); 
            return START_STICKY; 
        }
        
        if (ACTION_RESUME.equals(action)) {
            stopAlarm();
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ALARM_NOTIF_ID);
            return START_STICKY;
        }
        
        if ("GPS_ALARM_CHECK".equals(action)) {
            long __now = System.currentTimeMillis();
            // v1.4.0 حارس «مفيش شيفت»: أول ما الكابتن يعمل Check-Out (أو الشيفت يخلص/فشل التشغيل) الـ config بيتمسح من الجهاز.
            // العيب القديم: المنبه كان بيفضل مسجل في AlarmManager بتاع نظام الأندرويد بعد الـ Check-Out،
            // فيرن كل 15 دقيقة (كانت 10) بـ «اللوكيشن متوقف» لحد ما الكابتن يعمل Force Close.
            // من دلوقتي: مفيش config = مفيش شيفت شغال = نلغي سلسلة المنبه نهائيًا ونطفي أي صوت/إشعار شغال.
            if (prefs == null) prefs = new TrackingPrefs(this);
            String __cfg = prefs.config();
            if (__cfg == null || __cfg.trim().isEmpty()) {
                cancelGpsAlarmChain();
                stopSelf();
                return START_NOT_STICKY;
            }
            // v1.3.0: أثناء البريك (وكذلك بريك الصلاة — نفس آلية الـ pause) مفيش إرسال لوكيشن متوقع — الإنذار ممنوع يرن
            TrackingCore coreSnap = core;
            boolean pausedNow = coreSnap != null && coreSnap.isPaused();
            // v1.4.2b: لو العملية كانت اتصفرت والمنبه هو اللي رجّع الخدمة — نقرأ حالة البريك المحفوظة من آخر persist
            // (قاعدة السكتة: بريك أو بريك صلاة = ممنوع الرن حتى لو الخدمة لسه مش جاهزة)
            if (coreSnap == null) { try { pausedNow = prefs.status().optBoolean("paused", false); } catch (Throwable t) { } }
            // v1.4.2: خط الأساس = آخر إرسال ناجح للسيرفر (مش آخر لوكيشن محلي زي قبل).
            // بناخد أحدث قيمة من: الذاكرة (آخر flush ناجح) أو آخر قيمة متخزنة في prefs
            // (لو العملية اتصفرت بعد قتل التطبيق/إعادة تشغيل الموبايل والـ core لسه مش جاهز).
            long baselineMs = lastSendOkMs;
            if (coreSnap != null) {
                long __ls = coreSnap.lastSuccessfulSyncAt();
                if (__ls > baselineMs) baselineMs = __ls;
            } else {
                try { long __ls = prefs.status().optLong("lastSyncAt", 0L); if (__ls > baselineMs) baselineMs = __ls; } catch (Throwable t) { }
            }
            if (baselineMs <= 0) baselineMs = __now; // لسه مابعتش حاجة خالص → عدّ الـ 15 دقيقة من دلوقتي (begin() بتصفّره عند تشغيل الشيفت)
            // v1.0.9 → v1.4.2: لو عدّت 15 دقيقة ومفيش لوكيشن واصل السيرفر → الإنذار يرن (نغمة رنين الموبايل + هزاز 5 دقايق).
            // الحارس: مش بيرن وهو رنّان أصلاً، وبيرن مرة كل 15 دقيقة كحد أقصى (رنة 5 دقايق + سكتة 10).
            if (!pausedNow && !alarmRinging && __now - baselineMs >= 15 * 60 * 1000
                    && (lastAlarmFiredMs == 0 || __now - lastAlarmFiredMs >= 15 * 60 * 1000)) {
                fireGpsAlarm();
            }
            scheduleAlarm();
            return START_STICKY;
        }
        
        final String cfgJson = intent.getStringExtra(EXTRA_CONFIG);
        if (cfgJson == null) { stopSelf(); return START_STICKY; }
        
        try { goForeground(); } catch (RuntimeException e) { 
            prefs = new TrackingPrefs(this); writeStatus("UNAVAILABLE", "START_NOT_ALLOWED", false); stopSelf(); return START_STICKY;
        }
        
        if (running) return START_STICKY;

        if (io == null) io = Executors.newSingleThreadExecutor();
        io.execute(new Runnable() {
            @Override public void run() {
                try { begin(cfgJson); } 
                catch (RuntimeException e) { 
                    writeStatus("UNAVAILABLE", "START_FAILED", false); 
                    shutdown("START_FAILED", false); 
                }
            }
        });
        
        return START_STICKY;
    }

    private Notification buildNotification(boolean onBreak) {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_stat_tracking).setContentTitle("Ground OPS Tracker")
            .setContentText(onBreak ? "On break - location paused" : "Location tracking is active during your shift").setOngoing(true).setOnlyAlertOnce(true).setContentIntent(pi).setCategory(NotificationCompat.CATEGORY_SERVICE).build();
    }

    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Shift tracking", NotificationManager.IMPORTANCE_LOW));
        Notification n = buildNotification(false);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION); else startForeground(NOTIF_ID, n);
    }

    private void begin(String cfgJson) {
        prefs = new TrackingPrefs(this); prefs.saveConfig(cfgJson);
        Map<String, Object> m = MiniJson.asMap(MiniJson.parse(cfgJson));
        TrackingCore.Config c = new TrackingCore.Config();
        c.apiUrl = (String) m.get("apiUrl"); c.token = (String) m.get("token"); c.employeeId = (String) m.get("employeeId");
        c.intervalMs = num(m, "intervalMs", 300000); c.heartbeatMs = num(m, "heartbeatMs", 600000); c.syncIntervalMs = num(m, "syncIntervalMs", 300000);
        c.stopAtMs = num(m, "stopAtMs", System.currentTimeMillis() + 12L * 3600000L); c.minDistanceMeters = num(m, "minDistanceMeters", 25);
        employeeId = c.employeeId;
        cfgApiUrl = c.apiUrl == null ? "" : c.apiUrl;
        cfgToken = c.token == null ? "" : c.token;
        store = new SqlitePointStore(this);
        core = new TrackingCore(c, store, new HttpTransport(30000, false), new TrackingCore.Clock() { @Override public long now() { return System.currentTimeMillis(); } });
        thread = new HandlerThread("gops-location"); thread.start(); handler = new Handler(thread.getLooper());
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE); cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        
        lastLocationTimeMs = System.currentTimeMillis();
        lastSendOkMs = System.currentTimeMillis(); // v1.4.2: بداية عدّ «آخر إرسال ناجح» من لحظة تشغيل الشيفت

        if (!running) {
            instance = this; running = true;
            listener = new LocationListener() {
                @Override public void onLocationChanged(final Location l) { io.execute(new Runnable() { @Override public void run() { handleFix(l); } }); }
                @Override public void onProviderDisabled(String p) { io.execute(new Runnable() { @Override public void run() { checkProviders(); } }); }
                @Override public void onProviderEnabled(String p) { io.execute(new Runnable() { @Override public void run() { checkProviders(); } }); }
                @Override public void onStatusChanged(String p, int s, Bundle e) { }
            };
            requestUpdates();
            if (cm != null) {
                netCb = new ConnectivityManager.NetworkCallback() { @Override public void onAvailable(Network n) { io.execute(new Runnable() { @Override public void run() { if (core != null) { core.flush(true); persist(); } } }); } };
                try { cm.registerNetworkCallback(new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), netCb); } catch (RuntimeException e) { netCb = null; }
            }
            handler.postDelayed(tick, TICK_MS);
            scheduleAlarm();
            io.execute(new Runnable() { @Override public void run() { checkProviders(); core.flush(true); persist(); } });
            persist();
            // v1.1.0: ظهّر فقاعة الماسنجر طول ما الشيفت شغال (ضغطة = يفتح التطبيق / ضغطة مطوّلة = يبعت اللوكيشن)
            BubbleOverlay.show(this, sendNowAction());
        }
    }

    /** v1.1.0: ضغطة مطوّلة على الفقاعة = تبعت النقاط المخزنة (آخر لوكيشن) للسيرفر فوراً. */
    private BubbleOverlay.SendNow sendNowAction() {
        return new BubbleOverlay.SendNow() { @Override public void run() {
            io.execute(new Runnable() { @Override public void run() {
                try { if (core != null) { core.flush(true); persist(); } } catch (Throwable t) { }
            } });
        } };
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            io.execute(new Runnable() { @Override public void run() {
                if (core == null) return;
                if (core.shouldStop()) { shutdown(null, true); return; }
                checkProviders();
                if (core.syncDue(System.currentTimeMillis())) core.flush(false);
                // v1.4.2: لو النقاط وصلت السيرفر فعلًا (آخر مزامنة ناجحة اتقدمت) — نصفّر خط الأساس ونوقف أي رنة شغالة
                long __ls = core.lastSuccessfulSyncAt();
                if (__ls > lastSendOkMs) {
                    lastSendOkMs = __ls;
                    stopAlarm();
                    NotificationManager __nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (__nm != null) __nm.cancel(ALARM_NOTIF_ID);
                }
                // v1.1.0: لو الفقاعة اختفت أو الإذن اتمنح من شوية — نصلح الوضع لوحنا كل 30 ثانية
                BubbleOverlay.ensure(LocationForegroundService.this, sendNowAction());
                long __now = System.currentTimeMillis();
                // v1.4.2: الفحص الرئيسي لإنذار «اللوكيشن مش واصل» — كل 30 ثانية من جوه الخدمة نفسها.
                // ليه؟ منبه النظام (AlarmManager) بتأجله موبايلات كتير (شاومي/أوبو/سامسونج في وضع توفير البطارية)
                // وده كان سبب وصول الرنة بعد 42 دقيقة بدل 15. الخدمة الـ foreground بتشتغل بدقة،
                // ومنبه الـ 15 دقيقة فضل شغال احتياطيًا لو العملية نفسها اتصفرت أو الموبايل اتعمله restart.
                if (!core.isPaused() && !alarmRinging && __now - lastSendOkMs >= 15 * 60 * 1000
                        && (lastAlarmFiredMs == 0 || __now - lastAlarmFiredMs >= 15 * 60 * 1000)) {
                    fireGpsAlarm();
                }
                if (__now - lastSelfiePollMs >= 60000L) {
                    lastSelfiePollMs = __now;
                    SelfieCheckNotifier.pollAndNotify(LocationForegroundService.this, cfgApiUrl, cfgToken, employeeId);
                }
                persist();
                if (core.shouldStop()) shutdown(null, true);
            } });
            if (handler != null) handler.postDelayed(this, TICK_MS);
        }
    };

    private void scheduleAlarm() { scheduleAlarmAt(this); }

    /** v1.4.2: نسخة static عشان BootReceiver يقدر يعيد بناء سلسلة المنبه بعد إعادة تشغيل الموبايل. */
    static void scheduleAlarmAt(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(ctx, LocationForegroundService.class);
        intent.setAction("GPS_ALARM_CHECK");
        PendingIntent pi = PendingIntent.getService(ctx, ALARM_REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long triggerTime = System.currentTimeMillis() + 15 * 60 * 1000; // كل 15 دقيقة
        // v1.4.2: على أندرويد 12+ (خصوصًا 14) إذن المنبه الدقيق ممكن يكون مش متمنح —
        // من غير الفحص ده setExactAndAllowWhileIdle بيرمي SecurityException وسلسلة المنبه تموت خالص
        // (الرنة مستحيل ترن). الفحص الدقيق جوه الخدمة بيغطي الفرق، وده احتياطي تقريبي ±10 دقايق.
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setWindow(AlarmManager.RTC_WAKEUP, triggerTime, 10 * 60 * 1000, pi);
        } else if (Build.VERSION.SDK_INT >= 23) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pi);
        }
        else am.setExact(AlarmManager.RTC_WAKEUP, triggerTime, pi);
    }

    /**
     * v1.4.2: بعد إعادة تشغيل الموبايل أو تحديث التطبيق — لو فيه شيفت لسه شغال (config محفوظ):
     * 1) نحاول نرجّع التتبع نفسه (محتاج إذن «السماح طوال الوقت» — لو مش متمنح بيفشل بهدوء من غير كراش).
     * 2) نضمن سلسلة منبه الـ GPS: المنبه هيشتغل كل 15 دقيقة ولو لقى اللوكيشن مش واصل السيرفر → يرن.
     */
    static void resumeFromBoot(Context ctx) {
        try {
            TrackingPrefs p = new TrackingPrefs(ctx);
            String cfg = p.config();
            if (cfg == null || cfg.trim().isEmpty()) return; // مفيش شيفت نشط = مفيش حاجة ترجع (حارس v1.4.0)
            try {
                Intent svc = new Intent(ctx, LocationForegroundService.class);
                svc.putExtra(EXTRA_CONFIG, cfg);
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(svc); else ctx.startService(svc);
            } catch (Throwable t) { Log.w("GPS_ALARM", "boot resume FGS failed: " + t); }
            scheduleAlarmAt(ctx);
        } catch (Throwable t) { Log.w("GPS_ALARM", "resumeFromBoot failed: " + t); }
    }

    private synchronized void fireGpsAlarm() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(ALARM_CHANNEL, "GPS Missing Alarm", NotificationManager.IMPORTANCE_HIGH);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000});
            android.net.Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (soundUri != null) {
                AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
                ch.setSound(soundUri, attrs);
            }
            nm.createNotificationChannel(ch);
        }

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "GpsAlarm:WakeLock");
                wl.acquire(10000);
            }
        } catch (Exception e) {}

        stopAlarm();
        // v1.4.2: سجّل إن الرنة بدأت دلوقتي — الحارس بيمنع تكرارها قبل ما تخلص دورة الـ 15 دقيقة
        lastAlarmFiredMs = System.currentTimeMillis();
        alarmRinging = true;
        try {
            alarmPlayer = new MediaPlayer();
            alarmPlayer.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            alarmPlayer.setDataSource(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));
            alarmPlayer.setLooping(true);
            alarmPlayer.prepare();
            alarmPlayer.start();

            alarmVibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (alarmVibrator != null && alarmVibrator.hasVibrator()) {
                long[] pattern = { 0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000 };
                if (Build.VERSION.SDK_INT >= 26) alarmVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                else alarmVibrator.vibrate(pattern, 0);
            }
            // v1.4.2b: إيقاف الرنة تلقائيًا بعد 5 دقايق عبر main-looper handler —
            // لو المنبه رجّع الخدمة بعد قتل العملية، handler بتاع التتبع بيبقى null
            // (كانت NPE بتمنع جدولة الإيقاف والرنة تفضل شغالة للأبد).
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() { @Override public void run() { stopAlarm(); } }, 5 * 60 * 1000);
        } catch (Exception e) { Log.w("GPS_ALARM", "Failed to start alarm", e); }

        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) return;
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 9999, open, flags);

        Notification n = new NotificationCompat.Builder(this, ALARM_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_tracking).setContentTitle("🚨 تحذير: اللوكيشن متوقف")
            .setContentText("مرّت 15 دقيقة بدون إرسال موقعك. يرجى فتح التطبيق والضغط على Check GPS فوراً.")
            .setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setFullScreenIntent(pi, true).setAutoCancel(true).setContentIntent(pi).build();
        try { nm.notify(ALARM_NOTIF_ID, n); } catch (RuntimeException e) { }
    }

    private synchronized void stopAlarm() {
        alarmRinging = false; // v1.4.2: الرنة وقفت
        if (alarmPlayer != null) { try { alarmPlayer.stop(); alarmPlayer.release(); } catch (Exception e) {} alarmPlayer = null; }
        if (alarmVibrator != null) { try { alarmVibrator.cancel(); } catch (Exception e) {} alarmVibrator = null; }
    }

    private boolean hasPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestUpdates() {
        long minTime = Math.max(15000L, core == null ? 60000L : readInterval() / 2);
        try {
            if (lm.getAllProviders().contains(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, minTime, 0f, listener, thread.getLooper());
            if (lm.getAllProviders().contains(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, minTime, 0f, listener, thread.getLooper());
        } catch (SecurityException e) { if (core != null) core.setProviderState("PERMISSION_DENIED"); }
    }
    private long readInterval() { try { return new JSONObject(prefs.config()).optLong("intervalMs", 300000); } catch (Exception e) { return 300000; } }

    private void checkProviders() {
        if (core == null || lm == null || core.isPaused()) return;
        if (!hasPermission()) { core.setProviderState("PERMISSION_DENIED"); return; }
        boolean gps = false, net = false;
        try { gps = lm.isProviderEnabled(LocationManager.GPS_PROVIDER); net = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } catch (RuntimeException e) { }
        if (!gps && !net) core.setProviderState("GPS_DISABLED");
    }

    private void handleFix(Location l) {
        if (core == null || !running) return;
        long t = l.getTime() > 0 ? l.getTime() : System.currentTimeMillis();
        Boolean mock = Build.VERSION.SDK_INT >= 31 ? Boolean.valueOf(l.isMock()) : Boolean.valueOf(l.isFromMockProvider());
        String p = l.getProvider(), src = LocationManager.GPS_PROVIDER.equals(p) ? "gps" : LocationManager.NETWORK_PROVIDER.equals(p) ? "network" : "fused".equals(p) ? "fused" : "unknown";
        double acc = l.hasAccuracy() ? l.getAccuracy() : 1000;
        boolean recorded = core.onFix(new TrackingCore.Fix(t, l.getLatitude(), l.getLongitude(), acc, mock, src, batteryPercent()));
        if (recorded) {
            lastLocationTimeMs = System.currentTimeMillis();
            // v1.4.2b: مبنوقفش الرنة هنا — وصول موقع محلي مش معناه إن النقاط وصلت السيرفر
            // (مثال: GPS شغال بس النت واقف → الرنة كانت بتتقفل بعد ثواني والكابتن مش بيسمعها).
            // الرنة والإشعار بيقفوا بس لما الإرسال للسيرفر ينجح (فحص الـ 30 ثانية في tick) —
            // وده معنى «اللوكيشن واصل فعلًا» على الداشبورد.
            scheduleAlarm();
            if (core.syncDue(System.currentTimeMillis())) core.flush(false);
        }
        persist();
        if (core.shouldStop()) shutdown(null, true);
    }

    private Integer batteryPercent() {
        try {
            Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b == null) return null; int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            return level < 0 || scale <= 0 ? null : Integer.valueOf(Math.round(level * 100f / scale));
        } catch (RuntimeException e) { return null; }
    }

    private JSONObject statusJson(boolean serviceRunning) {
        JSONObject o = new JSONObject();
        try {
            TrackingCore.Status s = core.status(serviceRunning);
            o.put("running", s.running); o.put("state", s.state); o.put("ended", s.ended); o.put("endedReason", s.endedReason == null ? JSONObject.NULL : s.endedReason);
            o.put("lastError", s.lastError == null ? JSONObject.NULL : s.lastError); o.put("pendingPoints", s.pending); o.put("employeeId", employeeId);
            o.put("paused", core != null && core.isPaused()); // v1.4.2b: حالة البريك/بريك الصلاة تتخزن — حارس السكتة لما العملية تكون اتصفرت
            o.put("lastFixAt", s.lastFixAt == 0 ? JSONObject.NULL : s.lastFixAt); o.put("lastSyncAt", s.lastSyncAt == 0 ? JSONObject.NULL : s.lastSyncAt);
            if (s.lastLat != null) { o.put("lastLatitude", s.lastLat); o.put("lastLongitude", s.lastLon); o.put("lastAccuracy", s.lastAccuracy); }
            if (s.lastDistance != null) { o.put("lastDistance", s.lastDistance); } if (s.inside != null) { o.put("inside", s.inside); }
        } catch (JSONException e) { }
        return o;
    }
    private void persist() { if (core != null && prefs != null) prefs.saveStatus(statusJson(running)); }
    private void writeStatus(String state, String error, boolean ended) {
        if (prefs == null) prefs = new TrackingPrefs(this);
        try { JSONObject o = new JSONObject(); o.put("running", false); o.put("state", state); o.put("lastError", error); o.put("ended", ended); o.put("pendingPoints", 0); prefs.saveStatus(o); } catch (JSONException e) { }
    }

    // v1.4.0: إلغاء سلسلة منبه الـ GPS بالكامل: المنبه المسجل في AlarmManager (نظام الأندرويد) + صوت الرن + إشعار «اللوكيشن متوقف».
    // بتتنادى من shutdown() أي وقت التتبع بيوقف (Check-Out / نهاية الشيفت / فشل التشغيل / خدمة اتقفلت) — عشان المنبه عمره ما يصحى بعد الخروج.
    private void cancelGpsAlarmChain() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                Intent i = new Intent(this, LocationForegroundService.class);
                i.setAction("GPS_ALARM_CHECK");
                PendingIntent pi = PendingIntent.getService(this, ALARM_REQUEST_CODE, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.cancel(pi);
            }
        } catch (Exception e) { Log.w("GPS_ALARM", "cancel alarm failed", e); }
        stopAlarm();
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ALARM_NOTIF_ID);
        } catch (Exception e) { }
    }

    private synchronized void shutdown(String reason, boolean ended) {
        boolean wasRunning = running; running = false;
        cancelGpsAlarmChain(); // v1.4.0: التتبع وقف = منبه الـ GPS يتلغى من نظام الأندرويد فورًا (كان بيفضل شغال بعد الـ Check-Out)
        BubbleOverlay.hide(this); // v1.1.0: قفل الشيفت = الفقاعة تختفي
        try { if (lm != null && listener != null) lm.removeUpdates(listener); } catch (RuntimeException e) { }
        try { if (cm != null && netCb != null) cm.unregisterNetworkCallback(netCb); } catch (RuntimeException e) { }
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (core != null && wasRunning) { JSONObject o = statusJson(false); try { o.put("running", false); o.put("state", "STOPPED"); if (reason != null && !ended) o.put("endedReason", reason); o.put("ended", ended || o.optBoolean("ended")); } catch (JSONException e) { } if (prefs != null) prefs.saveStatus(o); }
        if (prefs != null) prefs.clearConfig();
        if (io != null) io.shutdown();
        if (thread != null) thread.quitSafely();
        instance = null;
        stopForeground(true); stopSelf();
    }
    public void stopTracking() { shutdown("STOP_REQUESTED", false); }

    public void pauseTracking() {
        if (!running || io == null) return;
        io.execute(new Runnable() { @Override public void run() {
            if (core == null || core.isPaused()) return;
            try { if (lm != null && listener != null) lm.removeUpdates(listener); } catch (RuntimeException e) { }
            core.setPaused(true); showNotification(true); persist();
            // v1.1.0: أثناء بريك الصلاة الفقاعة تختفي (مفيش تتبع = مفيش إرسال موقع)
            BubbleOverlay.hide(LocationForegroundService.this);
        } });
    }

    public void resumeTracking() {
        if (!running || io == null) return;
        io.execute(new Runnable() { @Override public void run() {
            if (core == null) return;
            // v1.3.0 إصلاح «البريك الغلط»: كان فيه شرط !core.isPaused() بيمنع الرجوع لو الحالة اتلخبطت
            // (الصفحة عملت reload أثناء البريك → النسخة الجديدة مش شايفة إن الخدمة واقفة) فالخدمة فضلت متوقفة
            // على وضع البريك لحد force close والداشبورد يورّيه مقطوع. setPaused idempotent فالنداء المتكرر آمن.
            core.setPaused(false);
            // v1.3.0: نصحّح وقت آخر لوكيشن عشان إنذار الـ GPS ميرنّش فور الرجوع من بريك طويل
            lastLocationTimeMs = System.currentTimeMillis();
            lastSendOkMs = System.currentTimeMillis(); // v1.4.2: رجعنا من بريك/صلاة → عدّ الـ 15 دقيقة من جديد
            requestUpdates(); showNotification(false); persist();
            // v1.1.0: رجعنا من البريك — الفقاعة ترجع تظهر
            BubbleOverlay.show(LocationForegroundService.this, sendNowAction());
        } });
    }

    private void showNotification(boolean onBreak) {
        try { NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.notify(NOTIF_ID, buildNotification(onBreak)); } catch (RuntimeException e) { }
    }

    @Override public void onDestroy() { if (running) shutdown("SERVICE_DESTROYED", false); instance = null; super.onDestroy(); }
    @Override public void onTaskRemoved(Intent rootIntent) { super.onTaskRemoved(rootIntent); }

    private static long num(Map<String, Object> m, String k, long def) { Object o = m.get(k); return o instanceof Double ? ((Double) o).longValue() : def; }
}
