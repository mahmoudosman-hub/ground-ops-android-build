/**
 * Ground OPS - Delivery 36 (d49) — فك زحمة تغيير الشيفتات
 * ------------------------------------------------------------
 * المشكلة: وقت تبديل الشيفتات كباتن كتير بيضغطوا check in/out في نفس
 * اللحظة، فالسيرفر بيرد "SERVER_BUSY" (مشغول) والتطبيق يبان عالق.
 *
 * الحل من جهة التطبيق:
 * 1) أي رد "مشغول" من السيرفر بيحاول تلقائيًا مرتين كمان (بهدوء
 *    ثانية ونص / تلات ثواني) مع شريط صغير بيوضح إن في محاولة —
 *    فالكابتن مش محتاج يدوس تاني، العملية بتكمل لوحدها.
 * 2) عمليات الحضور والبريك بياخد تأخير عشوائي صغير (0-500ms) قبل
 *    الإرسال — عشان الدوسات المتزامنة متوصلكش للسيرفر كلها مرة
 *    واحدة وتتصطف في طابور طويل. مش هتحس بيها، بس بتفرق كتير.
 */
(function () {
  'use strict';

  var origFetch = window.fetch.bind(window);
  var MAX_RETRIES = 2;
  var JITTER_ACTIONS = ['checkIn', 'checkOut', 'startBreak', 'endBreak'];
  var busyBanner = null;

  function showBanner(text) {
    try {
      if (!busyBanner) {
        busyBanner = document.createElement('div');
        busyBanner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#0a84ff;color:#fff;padding:8px 16px;border-radius:20px;font:600 13px system-ui,-apple-system,sans-serif;z-index:9999999;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90vw;text-align:center;';
        document.body.appendChild(busyBanner);
      }
      busyBanner.textContent = text;
    } catch (e) {}
  }
  function hideBanner() {
    try { if (busyBanner) { busyBanner.remove(); busyBanner = null; } } catch (e) {}
  }

  function isBusyBody(j) {
    return !!(j && j.success === false && (
      j.error_code === 'SERVER_BUSY' ||
      (j.details && j.details.retryable === true) ||
      /server is busy/i.test(String(j.message || ''))
    ));
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /script\.google\.com|macros/.test(url);
    if (!isApi || !init || init.method !== 'POST' || typeof init.body !== 'string') return origFetch(input, init);

    var parsed = null;
    try { parsed = JSON.parse(init.body); } catch (e) {}
    if (!parsed || !parsed.action) return origFetch(input, init);
    var action = parsed.action;

    function send() {
      function attempt(n) {
        return origFetch(input, init).then(function (res) {
          var ct = '';
          try { ct = (res.headers && res.headers.get && res.headers.get('content-type')) || ''; } catch (e) {}
          if (ct.indexOf('json') < 0) return res;
          return res.clone().json().then(function (j) {
            if (!isBusyBody(j) || n >= MAX_RETRIES) return res;
            showBanner('السيرفر فيه زحمة دلوقتي (وقت تغيير الشيفتات) — بنحاول تاني تلقائي (' + (n + 1) + '/' + MAX_RETRIES + ')...');
            return new Promise(function (resolve) {
              setTimeout(function () { resolve(attempt(n + 1)); }, 1500 * (n + 1));
            });
          }).catch(function () { return res; });
        });
      }
      return attempt(0).then(function (res) { hideBanner(); return res; }, function (err) { hideBanner(); throw err; });
    }

    if (JITTER_ACTIONS.indexOf(action) >= 0) {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(send()); }, Math.floor(Math.random() * 500));
      });
    }
    return send();
  };
})();
