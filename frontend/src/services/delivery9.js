/**
 * Ground OPS - Delivery 9
 * Fix "Can't reach the server" on slow Apps Script responses.
 * 1. Extends the abort timeout from 30s to 90s (delay AbortController.abort).
 * 2. Auto-retries fetch on real network errors (max 2 retries).
 * 3. Shows a small "Retrying..." banner so the user knows what's happening.
 * d75: نص البانر من i18n (t()).
 * d91: صفحة حماية جوجل بتترجم أحيانًا طلبات script.google.com لصفحة HTML بدل JSON
 *      (وده اللي كان بيعمل "Slow connection - retrying" المتكرر يوم 2026-11-05) —
 *      دلوقتي أي رد HTML على نداء الـ API بيتعامل كفشل مؤقت وبيتعيد المحاولت
 *      تلقائيًا (4 محاولات بدل 2، وفواصل أهدى) — وصفحة الحماية بتتخطى في
 *      محاولة منهم ويطلب المستخدم يكمل عادي من غير ما يحس بحاجة.
 */
import { t } from '../core/i18n.js'; // d75
(function () {
  'use strict';

  // --- Part 1: delay AbortController.abort by 60 more seconds ---
  if (window.AbortController) {
    var OriginalAC = window.AbortController;
    var patchedAC = function () {
      var ac = new OriginalAC();
      var originalAbort = ac.abort.bind(ac);
      var extended = false;
      ac.abort = function () {
        if (!extended) {
          extended = true;
          setTimeout(function () { try { originalAbort(); } catch (e) {} }, 60000);
        } else {
          try { originalAbort(); } catch (e) {}
        }
      };
      return ac;
    };
    patchedAC.prototype = OriginalAC.prototype;
    window.AbortController = patchedAC;
  }

  // --- Part 2: auto-retry on network errors ---
  var originalFetch = window.fetch.bind(window);
  // d91: 4 محاولات بدل 2 — صفحة الحماية بتيجي على شكل موجات، والاحتمال إنها تعدّي في 4 محاولات أعلى بكتير
  var MAX_RETRIES = 4;
  var RETRY_DELAY = 1000;

  function isRetriable(err) {
    if (!err) return false;
    if (err.name === 'ChallengeError') return true; // d91: رد HTML من جوجل بدل JSON
    if (err.name === 'AbortError') return true;
    var msg = String(err.message || err);
    return /network|failed to fetch|load failed|timeout|aborted/i.test(msg);
  }

  function showBanner(text) {
    try {
      var el = document.getElementById('gops-retry-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'gops-retry-banner';
        el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#f39c12;color:#fff;padding:8px 16px;border-radius:20px;font:600 13px system-ui,sans-serif;z-index:9999999;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90vw;text-align:center;';
        document.body.appendChild(el);
      }
      el.textContent = text;
    } catch (e) {}
  }
  function hideBanner() {
    try { var el = document.getElementById('gops-retry-banner'); if (el) el.remove(); } catch (e) {}
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApiCall = /script\.google\.com|macros/.test(url);
    if (!isApiCall) return originalFetch(input, init);

    // d91: attempt بياخد الـ init كوسيعة عشان إعادة المحاولة تستخدم نسخة من غير signal،
    // وبيرجع لنفسه بـ (n + 1) — قبل كده كان بيرجع ينده على window.fetch من الأول
    // (بلا عدّاد حقيقي) فأي فشل مستمر كان يخلي كل جهاز مفتوح يضرب السيرفر
    // نداء كل ثانية إلى ما لا نهاية — ده كان محرك موجات الطلبات اللي بتعمل
    // زحمة السيرفر وصفحات الحماية من جوجل!
    function attempt(n, useInit) {
      var cfg = useInit || init;
      return originalFetch(input, cfg).then(function (res) {
        // d91: رد HTML (صفحة حماية جوجل) بدل JSON = فشل مؤقت → إعادة محاولة.
        // الردود الحقيقية من Apps Script بتكون JSON بنوع text/plain أو application/json —
        // فأي content-type من نوع text/html على نداء API يعني صفحة الحماية.
        try {
          var ct = '';
          try { ct = (res.headers && res.headers.get('content-type')) || ''; } catch (e1) { ct = ''; }
          if (ct && /text\/html/i.test(ct)) {
            var chErr = new Error('google challenge page (html instead of json)');
            chErr.name = 'ChallengeError';
            throw chErr;
          }
        } catch (e2) {
          if (e2 && e2.name === 'ChallengeError') throw e2;
          /* فشل فحص الهيدر نفسه → رجّع الريسبونس عادي */
          return res;
        }
        return res;
      }).catch(function (err) {
        if (!isRetriable(err) || n >= MAX_RETRIES) throw err;
        showBanner(t('Slow connection - retrying ({a}/{b})...', { a: (n + 1), b: MAX_RETRIES }));
        var newInit = Object.assign({}, cfg);
        delete newInit.signal;
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            attempt(n + 1, newInit).then(resolve, reject);
          }, RETRY_DELAY * (n + 1));
        });
      });
    }

    return attempt(0).then(function (res) {
      hideBanner();
      return res;
    }).catch(function (err) {
      hideBanner();
      throw err;
    });
  };
})();
