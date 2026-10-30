/**
 * Ground OPS - Delivery 34 v3 (Super Force Close & Mark Read)
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  // بنمسك أي ضغطة على زرار قبل ما كود الموقع الأصلي يحس بيها
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button, a, div[role="button"]');
    if (!btn) return;

    var text = (btn.innerText || "").toLowerCase().trim();

    // لو داس على "Mark all as read" أو الزرار بايظ وواقف على "..."
    if (text.includes('mark all') || text.includes('قراءة الكل') || text === '...') {
      
      // 1. بنوقف الكود الأصلي إنه يتصرف (عشان ميعملش تعليق)
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // 2. بنرجع الزرار لشكله الطبيعي فوراً
      btn.innerText = 'Mark all as read';
      btn.disabled = false;
      btn.style.opacity = '1';

      // 3. بنمسح الإشعارات من الشاشة فوراً (تغيير الشكل)
      var popup = btn.closest('.modal, .dropdown, [class*="notif"], [class*="popup"]');
      if (popup) {
        // إخفاء عناصر الإشعارات
        var items = popup.querySelectorAll('li, .notification-item, [class*="item"]');
        items.forEach(function(item) { item.style.display = 'none'; });
        
        // إضافة رسالة "لا توجد إشعارات"
        if (!popup.querySelector('.gops-empty-msg')) {
           var msg = document.createElement('div');
           msg.className = 'gops-empty-msg';
           msg.innerText = 'لا توجد إشعارات جديدة';
           msg.style.cssText = 'padding: 20px; text-align: center; color: #888;';
           // نحطها قبل زراير الأكشن
           var footer = btn.parentElement.parentElement;
           if (footer) footer.parentElement.insertBefore(msg, footer);
        }
      }

      // 4. بنخفي الشارة الحمراء اللي فوق عند الجرس
      var badges = document.querySelectorAll('.badge, [class*="badge"], .fa-bell span');
      badges.forEach(function(b) { b.style.display = 'none'; b.innerText = ''; });

      // 5. بنبعت للسيرفر في الخلفية (عشان لو عمل ريفريش ميرجعوش تاني)
      var token = null;
      try { token = JSON.parse(localStorage.getItem('gops.session.admin')).token; } catch(err){}
      var apiUrl = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL;
      
      if (token && apiUrl) {
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'markNotificationsRead',
            token: token,
            payload: { all: true },
            client: 'delivery34/3.0'
          })
        }).catch(function(err) { console.log('API ignored error'); });
      }
    }
  }, true); // 👈 الرقم true ده هو السر، بيخلي كودنا يشتغل الأول قبل كود الموقع
})();
