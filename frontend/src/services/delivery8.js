/**
 * Ground OPS - Delivery 8
 * Fix "already have a request" when the server received the request but the client lost the response.
 * If createRequest fails with REQUEST_CONFLICT, look up the existing DRAFT and resume with it.
 */
(function () {
  'use strict';

  var origFetch = window.fetch.bind(window);
  var API_URL = null;

  function findApiUrl() {
    if (API_URL) return API_URL;
    try {
      if (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) { API_URL = window.GOPS_CONFIG.API_URL; return API_URL; }
      if (window.CONFIG && window.CONFIG.API_URL) { API_URL = window.CONFIG.API_URL; return API_URL; }
    } catch (e) {}
    return null;
  }

  function showToast(msg, bg) {
    try {
      var el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;z-index:999999;left:50%;transform:translateX(-50%);top:24px;background:' + bg + ';color:#fff;padding:14px 24px;border-radius:12px;font:600 15px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:90vw;text-align:center;';
      document.body.appendChild(el);
      setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 4000);
      setTimeout(function () { try { el.remove(); } catch (e) {} }, 4500);
    } catch (e) {}
  }

  function fetchMyRequests(parsed, apiUrl) {
    var targetUrl = apiUrl || findApiUrl();
    if (!targetUrl) return Promise.resolve(null);
    return origFetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'getMyRequests',
        token: parsed.token,
        payload: {},
        client: 'recovery'
      }),
      redirect: 'follow',
      credentials: 'omit'
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  function findMatchingRequest(data, payload) {
    if (!data || !data.success) return null;
    var all = ((data.data && data.data.mine) || []).concat((data.data && data.data.incoming) || []);
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      if (r.type !== payload.type) continue;
      if (payload.date_from && r.date_from !== payload.date_from) continue;
      if (payload.leave_type && r.leave_type !== payload.leave_type) continue;
      if (['DRAFT', 'PENDING_ADMIN', 'PENDING_PARTNER'].indexOf(r.status) >= 0) return r;
    }
    return null;
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    var body = init && init.body;
    var parsed = null;
    try { parsed = body && typeof body === 'string' ? JSON.parse(body) : null; } catch (e) {}

    if (!parsed || parsed.action !== 'createRequest') return origFetch(input, init);

    return origFetch(input, init).then(function (res) {
      var cloned = res.clone();
      return cloned.json().then(function (data) {
        if (!data || data.success !== false) return res;
        if (data.error_code !== 'REQUEST_CONFLICT' && data.error_code !== 'ALREADY_EXISTS') return res;

        return fetchMyRequests(parsed, url).then(function (myReqs) {
          var existing = findMatchingRequest(myReqs, parsed.payload || {});
          if (!existing) return res;

          if (existing.status === 'DRAFT') {
            showToast('Resuming your existing request...', '#0a84ff');
            var fake = {
              success: true,
              data: { request: existing, _recovered: true },
              server_time: new Date().toISOString()
            };
            return new Response(JSON.stringify(fake), {
              status: 200,
              statusText: 'OK',
              headers: { 'Content-Type': 'application/json' }
            });
          } else {
            showToast('Your request was already received. Check the list below.', '#1e8e3e');
            return res;
          }
        });
      }).catch(function () { return res; });
    });
  };
})();
