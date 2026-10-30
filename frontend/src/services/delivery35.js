/**
 * Ground OPS - Delivery 35 v2 (Force Unlock Apply Button)
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  // دالة بتدور على الزرار اللي شايل لودينج وتفكه
  function unlockApplyButton() {
    var btns = document.querySelectorAll('button');
    btns.forEach(function (b) {
      var text = (b.innerText || "").trim();
      // لو الزرار ده شكله Apply أو بيحمل (...)
      if (text === 'Apply' || text === 'تطبيق' || text === '...') {
        // لو بيحمل، بنفكه
        if (b.disabled || b.innerHTML.includes('spinner') || b.innerHTML.includes('...')) {
            b.disabled = false;
            b.innerHTML = 'Apply';
            b.style.opacity = '1';
            b.style.pointerEvents = '';
            b.classList.remove('gops-loading');
            
            // لو الموقع بيخفي الزرار وبيعرض زرار تاني، بنرجع نظهره
            var parent = b.parentElement;
            if (parent && parent.querySelector('.spinner')) {
                var spinner = parent.querySelector('.spinner');
                if (spinner) spinner.style.display = 'none';
            }
        }
      }
    });
  }

  // بنراقب طلبات الـ fetch
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var action = null;
    try {
      if (init && typeof init.body === 'string') {
        action = JSON.parse(init.body).action;
      }
    } catch (e) {}

    var promise = origFetch(input, init);

    // لو الطلب ده هو "applyScheduleImport" (تطبيق الجدول)
    if (action === 'applyScheduleImport') {
      // بنبدأ نراقب الزرار كل ثانية
      var attempts = 0;
      var interval = setInterval(function() {
          unlockApplyButton();
          attempts++;
          // بنفضل نحاول لمدة 20 ثانية وبعدها نقف
          if (attempts > 20) clearInterval(interval);
      }, 1000);
    }
    
    return promise;
  };
})();
