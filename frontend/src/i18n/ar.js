/** القاموس العربي الرئيسي — الإنجليزي هو المفتاح والعربي هو القيمة.
 *  d47: اتبط بالفعل بنظام الترجمة (كان مفصول قبل كده) وبيتحمّل في صفحات الأدمن والموظف.
 *  لو مفتاح مش موجود هنا، بيتعمله merge تلقائي من قاموس admin-translations.js القديم. */
import { registerLang } from '../core/i18n.js';

const AR = {
  // ---------- عام ----------
  'Loading...': 'جاري التحميل...', 'Refresh': 'تحديث', 'Apply': 'تطبيق', 'Cancel': 'إلغاء', 'Close': 'إغلاق',
  'Confirm': 'تأكيد', 'Please confirm': 'تأكيد', 'Copied': 'اتنسخ ✅', 'Copy': 'نسخ', 'Done': 'تم',
  'Nothing to show.': 'مفيش حاجة تظهر.', '{n} records': '{n} سجل', 'Page {p} of {n}': 'صفحة {p} من {n}',
  'Shown once. It is not stored and cannot be retrieved later.': 'بتتعرض مرة واحدة — مش متخزنة ومش هينفع تجيبها تاني.',
  'Select and copy it manually': 'حددها وانسخها بإيدك', 'Admin': 'إدارة', 'Menu': 'القائمة', 'Main navigation': 'القائمة الرئيسية',
  'Page not found': 'الصفحة مش موجودة', 'You do not have permission to open this page.': 'معندكش صلاحية تفتح الصفحة دي.',
  'Sign in': 'تسجيل الدخول', 'Sign out': 'تسجيل الخروج', 'Username': 'اسم المستخدم', 'Password': 'كلمة المرور',
  'Administrator sign in': 'دخول المشرف',
  'Choose a new password': 'اختار كلمة مرور جديدة',
  'You must change your password before using the admin console.': 'لازم تغير كلمة المرور الأول قبل ما تستخدم لوحة الإدارة.',
  'Current (temporary) password': 'كلمة المرور الحالية (المؤقتة)', 'New password': 'كلمة المرور الجديدة', 'Repeat new password': 'أعد كتابة كلمة المرور',
  'At least 8 characters with letters and digits.': '8 حروف على الأقل وفيها حروف وأرقام.',
  'The new passwords do not match.': 'كلمتا المرور مش زي بعض.', 'Change password': 'تغيير كلمة المرور', 'Password changed': 'كلمة المرور اتغيرت ✅',

  // ---------- الموظف ----------
  'Employee ID': 'رقم الموظف', 'Check In': 'تسجيل الحضور', 'Check Out': 'تسجيل الانصراف',
  'Today\'s shift': 'وردية اليوم', 'Assigned branch': 'الفرع المحدد', 'Tracking': 'التتبع', 'Offline': 'غير متصل',

  // ---------- لوحة القيادة + المراقبة المباشرة ----------
  'Dashboard': 'لوحة القيادة', 'Live Monitoring': 'المراقبة المباشرة',
  'Map of active employees': 'خريطة الكباتن الشغالين', 'Map of captains on duty': 'خريطة الكباتن الشغالين',
  'Map unavailable (offline or blocked). The table below is complete.': 'الخريطة مش شغالة دلوقتي (مفيش نت أو محجوبة). الجدول اللي تحت فيه كل البيانات.',
  'Updates automatically every 10 minutes. Press Refresh for the latest data now.': 'بتتحدث لوحدها كل 10 دقايق. دوس «تحديث» عشان تجيب أحدث بيانات دلوقتي.',
  'Tip: the table scrolls sideways - drag the bar under the table (or hold Shift and roll the mouse wheel) to see the rest of the columns.': 'ملحوظة: الجدول بيتحرك يمين وشمال — اسحب الشريط اللي تحت الجدول (أو دوس Shift مع عجلة الماوس) عشان تشوف باقي الأعمدة.',
  'No employees are currently on duty.': 'مفيش كباتن شغالين دلوقتي.',
  'No scheduled employees for the selected filters.': 'مفيش كباتن مجدولين بالفلاتر دي.',
  '"On break" means the captain is allowed to have location off. "Tracking unavailable" means no recent GPS data - it does not mean the employee left the branch.': '«في بريك» معناها الكابتن مسموح له يقفل الموقع وقتها. «التتبع واقف» معناها مفيش بيانات موقع واصلة آخر فترة — مش معناها إنه ساب الفرع.',
  'Pings: the system automatically pings captains whose location is stale (every 15 minutes). "Pings without reply" shows who did not respond, and "Ping now" sends a ping yourself.': 'النبضات: النظام بينادي تلقائياً على أي كابتن موقعه بقى قديم (كل 15 دقيقة)، وعمود «نبضات بدون رد» بيوضح مين ما ردش، وزرار «نبضة فورية» تبعت بيها نداء بنفسك.',
  'End the break of {n}? Location tracking resumes for them.': 'هتقفل بريك {n}؟ التتبع هيرجع يشتغل عنده تاني.',
  'Break ended': 'اتقفل البريك ✅',
  'End break': 'قفل البريك',
  'End the shift of {n}? Their open break ends too, and they can check in again right after.': 'هتقفل شيفت {n} دلوقتي؟ أي بريك مفتوح هيقفل معاه، والكابتن يقدر يفتح شيفت جديد بعدها على طول.',
  'End shift': 'قفل الشيفت',
  'Shift ended': 'اتقفل الشيفت ✅',
  'No open shift for this captain': 'مفيش شيفت مفتوحة للكابتن ده',
  'Open alerts ({n})': 'تنبيهات مفتوحة ({n})', 'Open alerts page': 'افتح صفحة التنبيهات',

  // ---------- أعمدة الجداول ----------
  'Name': 'الاسم', 'Employee': 'الكابتن', 'Branch': 'الفرع', 'Shift': 'الوردية', 'Date': 'التاريخ', 'Status': 'الحالة',
  'Current status': 'الحالة دلوقتي', 'Last GPS update': 'آخر تحديث للموقع', 'Distance from branch': 'المسافة من الفرع',
  'Inside / outside': 'جوه الفرع ولا بره', 'Check-in': 'تسجيل الحضور', 'Check-out': 'تسجيل الانصراف',
  'Check-in time': 'وقت الحضور', 'Check-out time': 'وقت الانصراف',
  'Current location status': 'حالة الموقع دلوقتي', 'Last location update': 'آخر تحديث للموقع', 'Outside duration': 'مدة البره من الفرع',
  'Last location': 'آخر موقع', 'Search (ID or name)': 'بحث (الرقم أو الاسم)', 'Actions': 'إجراءات', 'Details': 'التفاصيل',

  // ---------- النبضات ----------
  'Map & Pings': 'الخريطة والنبضات', 'Pings without reply': 'نبضات بدون رد', 'Last ping': 'آخر نبضة',
  'Ping now': 'نبضة فورية', 'Ping sent': 'اتبعتت النبضة ✅', 'No registered device for this captain': 'مفيش جهاز مسجل للكابتن ده',
  'Show off-duty too': 'إظهار اللي خارج الشيفت كمان',
  'Captains on duty now: {n} of {total}': 'شغالين في الشيفت دلوقتي: {n} من أصل {total}',
  'No captains on duty right now. Tick "Show off-duty too" above to see everyone.': 'مفيش حد شغال في الشيفت دلوقتي. لو عايز تشوف الكل، علّم من فوق على «إظهار اللي خارج الشيفت كمان».',
  'Updates every minute. Green = fresh (20 min), orange = getting old (45 min), red = no location.': 'بتتحدث كل دقيقة. أخضر = موقع حديث (20 دقيقة)، برتقالي = بدأ يقصر، أحمر = مفيش موقع.',
  'Live map of captains on duty (iPhone PWA + Android). The system pings captains whose location is stale every 15 minutes; the counter shows pings without a reply.': 'خريطة حية للكباتن الشغالين (آيفون + أندرويد). النظام بيتبع أي كابتن موقعه قديم كل 15 دقيقة، والعدّاد بيوضح مين ما ردش.',

  // ---------- خرائط جوجل ----------
  'Google Maps': 'خرائط جوجل', 'Watch': 'متابعة', 'Watching': 'بيتم المتابعة',
  'Removed from Google Maps watchlist': 'اتشالت من قائمة متابعة خرائط جوجل', 'Marked as sharing on Google Maps': 'اتسجل على قائمة متابعة خرائط جوجل',
  'Watch Live': 'متابعة لايف',
  '🗺️ iPhone captains: if a captain shared their Google Maps link, the Watch button turns green and opens their live location directly.': '🗺️ كباتن الآيفون: لو كابتن شارك رابط خرائط جوجل بتاعه، زرار المتابعة بيتحول لأخضر وبيفتح موقعه لايف على طول.',

  // ---------- الإشعارات (d48) ----------
  'Notifications': 'الإشعارات', 'Notifications ({n} unread)': 'الإشعارات ({n} غير مقروء)',
  'Mark all as read': 'تحديد الكل كمقروء', 'Mark as read': 'تحديد كمقروء',
  'All notifications marked as read': 'تمام — كل الإشعارات اتقرت ✅',
  'Tap to mark as read': 'دوس هنا عشان يتحدد كمقروء',
  'No notifications.': 'مفيش إشعارات.',

  // ---------- الحالات (Badges) ----------
  'On duty': 'شغال', 'Off': 'مش شغال', 'On break': 'في بريك', 'Break over limit': 'البريك عدى وقته',
  'Inside branch': 'جوه الفرع', 'Outside branch': 'بره الفرع', 'Location unknown': 'مفيش موقع', 'Off the grid': 'مقطوع عن النظام',
  'GPS grace period: for up to 15 minutes after his last GPS update the captain keeps his last known state (green "Inside branch"). Only after a full 15 minutes with no GPS update does he show as "Off the grid".': 'مهلة الـ 15 دقيقة: لحد 15 دقيقة بعد آخر تحديث لوكيشن الكابتن يفضل ظاهر بآخر حالة معروفة (✔ جوه الفرع). وبعد ما تعدي الـ 15 دقيقة كاملة من غير أي تحديث لوكيشن يظهر «مقطوع عن النظام».',
  'Tracking active': 'التتبع شغال', 'Tracking paused': 'التتبع واقف مؤقتاً', 'Tracking unavailable': 'التتبع واقف', 'Tracking off': 'التتبع مقفول',
  'Location permission denied': 'إذن الموقع مرفوض', 'GPS disabled': 'الـ GPS مقفول', 'Background restricted': 'الشغل في الخلفية مقفول',
  'Low accuracy': 'دقة الموقع ضعيفة', 'Possible spoofing': 'شبهة موقع مزيّف', 'Missing check-out': 'لم يسجل الانصراف',
  'Left branch': 'ساب الفرع', 'Returned': 'رجع الفرع', 'Not checked in': 'لم يسجل الحضور',
  'Checked out': 'سجل الانصراف', 'On leave': 'في إجازة', 'Late': 'متأخر', 'On time': 'في المعاد', 'Absent': 'غايب',

  // ---------- S16: تبديل بين كابتنين ----------
  'Swap captains': 'تبديل بين كابتنين', 'Swap': 'بدّل',
  'Captain 1': 'الكابتن الأول', 'Captain 2': 'الكابتن التاني',
  'Pick two different captains.': 'اختار كابتنين مختلفين.',
  'Swap the shifts of {a} and {b} on {d}? Each one gets a notification with the new branch.': 'هتبدل شيفت {a} و {b} يوم {d}؟ كل واحد فيهم هيوصله إشعار بالفرع الجديد.',
  'Swapped ✅ {a} → {ab} and {b} → {bb}. Push delivered to {n} device(s).': 'اتبدل ✅ {a} ← فرع {ab} ، و {b} ← فرع {bb}. الإشعار وصل لـ {n} جهاز.',
  'Swapping... please wait': 'جاري التبديل... استنى لحظة', // d58
  'A new version is available.': 'فيه نسخة جديدة من البرنامج جاهزة.', 'Reload': 'حدّث', // d58
  'No active assignment on that date for {n}.': '{n} مالوش شيفت مسجلة في اليوم ده.',
  'No registered device for: {n}': 'مفيش جهاز مسجل بإشعارات لـ: {n}',
  // d66: رسايل التايمآوت في صفحة استيراد الجدول
  'The server is taking longer than expected. The changes were most likely applied successfully.': 'السيرفر بياخد وقت أطول من المتوقع. التغييرات غالبًا اتنفذت بنجاح.',
  'Reload the page to confirm.': 'حدّث الصفحة للتأكيد.',
  'Taking longer than expected — reload to confirm': 'بياخد وقت أطول من المتوقع — حدّث الصفحة للتأكيد',
  // d66: ميزة زرار «✅ شغال» (d56) في المراقبة المباشرة
  'Active': 'شغال',
  'Confirm that {n} is active? This will reset their "off the grid" timer for 15 minutes.': 'تأكيد إن {n} شغال؟ ده هيصفّر مؤقت «خارج الشبكة» بتاعه لمدة ١٥ دقيقة.',
  '✅ Yes, they are active': '✅ أيوه، شغال',
  'Updated — {n} is now shown as active for 15 minutes': 'تم — {n} هيظهر شغال لمدة ١٥ دقيقة',
  'I confirmed this captain is active via Google Maps. Reset their off-grid timer.': 'أنا متأكد إن الكابتن ده شغال من خرائط جوجل. ده هيصفّر مؤقت «خارج الشبكة» بتاعه.',
  '🗺️ iPhone captains: Watch Live opens their Google Maps location. ✅ Active confirms they are working and resets their off-grid timer for 15 minutes.': '🗺️ كباتن الآيفون: «متابعة لايف» بتفتح موقعهم على خرائط جوجل. و«✅ شغال» بتأكد إن الكابتن بيشتغل وبتصفّر مؤقت «خارج الشبكة» ١٥ دقيقة.',

  // ---------- S22: التقارير الجديدة + كارت KPI في الإعدادات ----------
  'Captain Daily Summary': 'ملخص الكابتن اليومي', 'KPI Scores': 'درجات الـ KPI',
  'Run report': 'اعرض التقرير', 'Exported {n} rows': 'تم تصدير {n} سجل',
  'No records match these filters.': 'مفيش سجلات مطابقة للفلاتر دي.',
  'Employee is required for "Employee Attendance History". Tracking gaps are limited to 31 days.': 'لازم تختار كابتن عشان تقرير «سجل حضور الكابتن». فجوات التتبع بتتعرض بحد أقصى 31 يوم.',
  'KPI Configuration': 'إعدادات مؤشرات الأداء (KPI)',
  'Choose which metrics count toward the KPI score, their weight (%), the allowed threshold before deductions start, and the deduction per unit above the threshold.': 'اختار المعايير اللي بتحسب في درجة الـ KPI، ووزن كل معيار (%)، والحد المسموح قبل ما الخصم يبدأ، وقيمة الخصم لكل وحدة زيادة عن الحد.',
  'Metric': 'المعيار', 'Weight': 'الوزن', 'Threshold (allowed)': 'الحد المسموح', 'Deduction per unit': 'الخصم لكل وحدة',
  'Save KPI settings': 'حفظ إعدادات الـ KPI', 'KPI settings saved': 'إعدادات الـ KPI اتحفظت ✅',
  'min': 'دقيقة', 'times': 'مرات', 'time': 'مرة',
  'No changes': 'مفيش تغييرات', 'Settings saved': 'الإعدادات اتحفظت ✅',
  'Location log archive': 'أرشيف سجل المواقع', 'Archive now': 'أرشفة دلوقتي',
  'Archive status unavailable.': 'حالة الأرشيف مش متاحة.',
  'Archived {n} rows': 'اتأرشف {n} سجل',
  'Move location logs older than {d} days into monthly archive sheets? Reports keep working.': 'هتنقل سجلات المواقع الأقدم من {d} يوم لأوراق أرشيف شهرية؟ التقارير هتفضل شغالة زي ما هي.',
  'Nothing is deleted by archiving. Deleting old archives happens only if "archive retention months" above is set above 0.': 'مفيش حاجة بتتحذف بالأرشفة. حذف الأرشيف القديم بيحصل بس لو قيمة «archive retention months» اللي فوق معمولة أكبر من 0.',
  '{a} rows in Location_Logs, {b} rows in {c} monthly archive sheet(s): {n}': '{a} سجل في Location_Logs، {b} سجل في {c} ورقة أرشيف شهرية: {n}',

  // ---------- d70: فجوات ترجمة قديمة في تطبيق الكابتن (بانر التثبيت + شاشة تغيير كلمة المرور) ----------
  'For security you must change your temporary password before continuing.': 'لأمان حسابك لازم تغيّر كلمة المرور المؤقتة قبل ما تكمل.',
  'Install app': 'ثبّت التطبيق',
  'Install this app on your phone for quick access.': 'ثبّت التطبيق على موبايلك للوصول السريع.',
  'Sections': 'الأقسام',
  'To install on iPhone: tap the Share button in Safari, then "Add to Home Screen".': 'للتثبيت على الآيفون: دوس زرار المشاركة في Safari وبعدين اختار "Add to Home Screen".',
  'Your Employee ID and password are provided by your administrator.': 'رقم الموظف وكلمة المرور بيوفّرهم لك المدير المسؤول.',

  // ---------- d72: كارت «مؤشرات أدائي» في هوم الكابتن (getMyKpi) ----------
  'My KPI': 'مؤشرات أدائي',
  'Excellent': 'ممتاز',
  'Good': 'جيد',
  'Needs improvement': 'محتاج تحسين',
  '{n} days this month': '{n} يوم في الشهر ده',
  'No KPI data yet this month.': 'مفيش بيانات KPI للشهر ده لسه.'
};

// دمج قاموس الأدمن القديم (admin-translations.js) — المفاتيح اللي مكتوبة فوق ليها الأولوية دايماً
try {
  const legacy = (globalThis.GOPS_ADMIN_I18N && globalThis.GOPS_ADMIN_I18N.ui) || {};
  for (const k in legacy) if (!(k in AR)) AR[k] = legacy[k];
} catch (e) { /* القاموس القديم اختياري (موجود في admin.html بس) */ }

registerLang('ar', AR, true);
