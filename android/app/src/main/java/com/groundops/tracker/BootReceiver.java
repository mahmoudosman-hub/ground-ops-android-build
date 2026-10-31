package com.groundops.tracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * v1.4.2: الاستيقاظ بعد إعادة تشغيل الموبايل (أو تحديث التطبيق).
 *
 * المشكلة القديمة: لو الموبايل اتعمله restart والشيفت لسه شغال، التتبع بيقف
 * وسلسلة منبه الـ GPS بتتمسح من نظام الأندرويد — فمفيش حد بيرن ولا اللوكيشن بيوصل
 * للداشبورد لحد ما الكابتن يفتح التطبيق بنفسه.
 *
 * الحل: أول ما الجهاز يقلع (أو التطبيق يتحدّث) ولو فيه شيفت محفوظ:
 * 1) نحاول نرجّع تتبع الشيفت تلقائيًا (محتاج إذن «السماح طوال الوقت» — لو مش متمنح بيفشل بهدوء).
 * 2) نرجّع سلسلة منبه الـ GPS كل 15 دقيقة — لو اللوكيشن فضل مش واصل السيرفر يرن
 *    بنغمة رنين الموبايل + هزاز 5 دقايق.
 *
 * الحارس (v1.4.0): مفيش config محفوظ = مفيش شيفت نشط = مفيش حاجة ترجع خالص.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        boolean trigger = Intent.ACTION_BOOT_COMPLETED.equals(action)
            || "android.intent.action.QUICKBOOT_POWERON".equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        if (trigger) LocationForegroundService.resumeFromBoot(ctx);
    }
}
