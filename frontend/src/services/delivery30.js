/**
 * Ground OPS - Delivery 30 (Checkout Warning + Cache Fix)
 */
(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  // 1. تحذير قبل الـ Check-out
  var origConfirm = window.confirm;
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var text = (btn.innerText || "").toLowerCase();
    
    // لو داس على Check Out
    if (text.includes('check out')) {
      var now = new Date();
      var hours = now.getHours();
      var mins = now.getMinutes();
      var timeVal = hours + (mins / 60);
      
      // لو الوقت قبل 6 مساءً (18:00) مثلاً، نعتبره انصراف مبكر
      if (timeVal < 18) {
        if (!origConfirm('أنت على وشك تسجيل الانصراف قبل نهاية الشيفت. هل أنت متأكد؟')) {
           e.preventDefault();
           e.stopPropagation();
           return false;
        }
      }
    }
  }, true);

  // 2. تصليح كاش الطلبات والجدول
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      if (init && init.method === 'POST' && typeof init.body === 'string') {
        var parsed = JSON.parse(init.body);
        var action = parsed.action;
        if (action === 'getMySchedule' || action === 'getMyRequests') {
          // لو البيانات موجودة في الكاش، رجعها فوراً
          var cacheKey = 'gops.fastcache.' + action;
          var cached = localStorage.getItem(cacheKey);
          if (cached) {
             var data = JSON.parse(cached);
             // بنحدث في الخلفية
             origFetch(input, init).then(function(res) {
                var cloned = res.clone();
                cloned.json().then(function(d) {
                   if (d.success) localStorage.setItem(cacheKey, JSON.stringify(d));
                }).catch(function(){});
             }).catch(function(){});
             // بنرجع الرد السريع
             return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: {'Content-Type': 'application/json'} }));
          } else {
             // أول مرة، بنجيب من السيرفر ونخزن
             return origFetch(input, init).then(function(res) {
                var cloned = res.clone();
                cloned.json().then(function(d) {
                   if (d.success) localStorage.setItem(cacheKey, JSON.stringify(d));
                }).catch(function(){});
                return res;
             });
          }
        }
      }
    } catch(e) {}
    return origFetch(input, init);
  };
})();
