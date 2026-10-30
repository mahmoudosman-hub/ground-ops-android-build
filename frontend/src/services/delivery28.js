/**
 * Ground OPS - Delivery 28 (Fix Selfie Checks UI)
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  // بنستنى ثانية عشان الصفحة تحمل، وبعدين نظبط الشكل
  setInterval(function () {
    var root = document.getElementById('gops-sc-admin-root');
    if (!root) return; // لو الصفحة مش مفتوحة، اطلع

    var list = root.querySelector('#gops-sc-list');
    if (!list) return;

    // لو الجدول طالع فاضي أو بايظ، نصلحه
    if (list.innerHTML.includes('gops-sc-loading') || list.innerHTML.trim() === '' || list.innerHTML.includes('undefined')) {
       list.innerHTML = '<div style="padding: 40px; text-align: center; color: #666; font-size: 16px;">لا توجد فحوصات سيلفي اليوم أو جاري التحميل...</div>';
    }
    
    // نظبط شكل الجدول لو ظهر
    var table = list.querySelector('table');
    if (table) {
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      var ths = table.querySelectorAll('th');
      ths.forEach(function(th) {
         th.style.padding = '12px';
         th.style.background = '#f5f5f5';
         th.style.borderBottom = '2px solid #ddd';
         th.style.textAlign = 'left';
      });
      var tds = table.querySelectorAll('td');
      tds.forEach(function(td) {
         td.style.padding = '12px';
         td.style.borderBottom = '1px solid #eee';
      });
    }
  }, 2000); // كل ثانيتين

})();
