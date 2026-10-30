/**
 * Ground OPS - Delivery 27 (Close Bell Automatically)
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  // نستنى أي ضغطة في الصفحة
  document.addEventListener('click', function (e) {
    var text = (e.target.innerText || "").toLowerCase();
    
    // لو داس على "Mark all" أو "قراءة الكل"
    if (text.includes('mark all') || text.includes('قراءة الكل') || text.includes('mark as read')) {
      
      // بنستنى نص ثانية عشان السيرفر يرد، وبعدين نقفل القائمة
      setTimeout(function () {
        var bell = document.querySelector('.fa-bell') || document.querySelector('[class*="bell"]');
        
        // لو لقينا الجرس، بندوس عليه تاني عشان يقفل القائمة
        if (bell) { bell.click(); }
        
        // كمان بنجبر أي قائمة إشعارات مفتوحة تقفل
        var dropdowns = document.querySelectorAll('[class*="dropdown"], [class*="notification-list"]');
        dropdowns.forEach(function (d) { d.style.display = 'none'; });
        
      }, 800); // 800 مللي ثانية
    }
  });

})();
