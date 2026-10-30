/**
 * Ground OPS - Delivery 26 (Admin Notifications UI Fixer - Aggressive)
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  // 1. إضافة كود CSS قوي لتحسين شكل الإشعارات مهما كانت الكلاسات
  var style = document.createElement('style');
  style.innerHTML = `
    /* إجبار أي قائمة إشعارات تفتح إنها تكون ثابتة تحت الجرس */
    .notifications-dropdown, .notification-list, [class*="notif-dropdown"], [class*="notification-menu"], div[style*="position: absolute"] > div {
      position: fixed !important;
      top: 60px !important; 
      right: 20px !important;
      width: 350px !important;
      max-height: 400px !important;
      overflow-y: auto !important;
      background: #fff !important;
      border: 1px solid #ddd !important;
      border-radius: 8px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2) !important;
      z-index: 99999 !important;
    }

    /* تنسيق شكل كل إشعار */
    .notifications-dropdown li, .notifications-dropdown div, .notification-item {
      padding: 12px !important;
      border-bottom: 1px solid #eee !important;
    }
    
    .notifications-dropdown li:hover, .notifications-dropdown div:hover {
      background-color: #f9f9f9 !important;
    }

    /* إخفاء الشارة الحمراء */
    .badge, [class*="badge"], #notif-count {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  // دالة لإغلاق القائمة
  function closePopup() {
    var popups = document.querySelectorAll('.notifications-dropdown, .notification-list, [class*="notif-dropdown"], [class*="notification-menu"]');
    popups.forEach(function(p) { p.style.display = 'none'; });
  }

  // دالة لمسح الإشعارات من الشاشة
  function clearNotificationsUI() {
    var lists = document.querySelectorAll('.notifications-dropdown, .notification-list');
    lists.forEach(function(list) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">لا توجد إشعارات جديدة</div>';
    });
    closePopup();
  }

  // اعتراض الضغطات
  document.addEventListener('click', function (e) {
    var text = e.target.innerText || "";
    
    // لو داس على "Mark all as read" أو "قراءة الكل"
    if (text.includes('Mark all') || text.includes('قراءة الكل') || text.includes('قراءة الكل')) {
      clearNotificationsUI();
      
      // إخفاء الشارة الحمراء فوق الجرس
      var badge = document.querySelector('.badge, [class*="badge"], #notif-count');
      if (badge) badge.style.display = 'none';
    }

    // لو داس على الجرس، نفتح القائمة ونطبق عليها الكلاس بتاعنا
    if (e.target.closest('.fa-bell') || e.target.closest('[class*="bell"]')) {
      setTimeout(function () {
        var popups = document.querySelectorAll('.notifications-dropdown, .notification-list, [class*="notif-dropdown"], [class*="notification-menu"]');
        popups.forEach(function(p) {
            p.classList.add('notifications-dropdown'); // بنجبر الكلاس يتطبق
        });
      }, 100);
    }
  });

  // قفل القائمة لو داس في أي مكان فاضي
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('.fa-bell') && !e.target.closest('[class*="bell"]') && !e.target.closest('.notifications-dropdown')) {
      closePopup();
    }
  });

})();
