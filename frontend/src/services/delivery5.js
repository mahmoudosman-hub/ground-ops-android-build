/**
 * Ground OPS - Delivery 5
 * Redirects admin "View file" from base64 to Drive link.
 * No imports. Works on admin.html.
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var isOurCall = false;
    var apiUrl = (input && typeof input === 'string') ? input : (input && input.url);
    if (apiUrl && /script\.google\.com\/macros/.test(apiUrl)) isOurCall = true;

    try {
      if (init && init.method === 'POST' && typeof init.body === 'string') {
        var parsed = JSON.parse(init.body);
        if (parsed && parsed.action === 'getRequestFile') {
          parsed.action = 'getRequestFileLink';
          init = Object.assign({}, init, { body: JSON.stringify(parsed) });
        }
      }
    } catch (e) { /* leave body alone */ }

    return origFetch(input, init).then(function (res) {
      if (!isOurCall) return res;
      var cloned = res.clone();
      cloned.json().then(function (body) {
        if (body && body.success === true && body.data && body.data.url) {
          try {
            window.open(body.data.url, '_blank', 'noopener');
            var modal = document.querySelector('#gops-sc-modal, .modal, [role="dialog"]');
            if (modal && modal.querySelector && modal.querySelector('#gops-sc-img')) {
              modal.style.display = 'none';
              modal.innerHTML = '';
            }
          } catch (e) { /* popup blocked */ }
        }
      }).catch(function () { /* not JSON */ });
      return res;
    });
  };
})();
