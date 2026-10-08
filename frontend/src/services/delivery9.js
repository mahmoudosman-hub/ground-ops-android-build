/**
 * Ground OPS - Delivery 9
 * Fix "Can't reach the server" on slow Apps Script responses.
 * 1. Extends the abort timeout from 30s to 90s (delay AbortController.abort).
 * 2. Auto-retries fetch on real network errors (max 2 retries).
 * 3. Shows a small "Retrying..." banner so the user knows what's happening.
 */
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
  var MAX_RETRIES = 2;
  var RETRY_DELAY = 900;

  function isRetriable(err) {
    if (!err) return false;
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

    function attempt(n) {
      return originalFetch(input, init).catch(function (err) {
        if (!isRetriable(err) || n >= MAX_RETRIES) throw err;
        showBanner('الاتصال بطيء - إعادة المحاولة (' + (n + 1) + '/' + MAX_RETRIES + ')...');
        var newInit = Object.assign({}, init);
        delete newInit.signal;
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            window.fetch.call(null, input, newInit).then(resolve, reject);
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
