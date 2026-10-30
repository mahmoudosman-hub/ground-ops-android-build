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
  'Checked out': 'سجل الانصراف', 'On leave': 'في إجازة', 'Late': 'متأخر', 'On time': 'في المعاد', 'Absent': 'غايب'
};

// دمج قاموس الأدمن القديم (admin-translations.js) — المفاتيح اللي مكتوبة فوق ليها الأولوية دايماً
try {
  const legacy = (globalThis.GOPS_ADMIN_I18N && globalThis.GOPS_ADMIN_I18N.ui) || {};
  for (const k in legacy) if (!(k in AR)) AR[k] = legacy[k];
} catch (e) { /* القاموس القديم اختياري (موجود في admin.html بس) */ }

registerLang('ar', AR, true);
