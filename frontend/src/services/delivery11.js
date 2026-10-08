/**
 * Ground OPS - Delivery 11
 * Intercept selfie fetches and redirect to Drive links.
 * Opens images in a new tab — instant, no base64, no waiting.
 * Admin pages only.
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /script\.google\.com|macros/.test(url);
    var parsed = null;
    try {
      if (isApi && init && typeof init.body === 'string') parsed = JSON.parse(init.body);
    } catch (e) {}

    if (parsed && parsed.action === 'getSelfie') {
      parsed.action = 'getSelfieLink';
      init = Object.assign({}, init, { body: JSON.stringify(parsed) });
    }
    if (parsed && parsed.action === 'getSelfieCheckImage') {
      parsed.action = 'getSelfieCheckLink';
      init = Object.assign({}, init, { body: JSON.stringify(parsed) });
    }

    return origFetch(input, init).then(function (res) {
      var cloned = res.clone();
      cloned.json().then(function (body) {
        if (!body || !body.success || !body.data || !body.data.url) return;
        try {
          window.open(body.data.url, '_blank', 'noopener');
          var modal = document.querySelector('#gops-sc-modal');
          if (modal) { modal.style.display = 'none'; modal.innerHTML = ''; }
          var sels = ['[role="dialog"]', '.modal'];
          for (var i = 0; i < sels.length; i++) {
            var nodes = document.querySelectorAll(sels[i]);
            for (var j = nodes.length - 1; j >= 0; j--) {
              var t = nodes[j].textContent || '';
              if (/selfie|check-out|check-in/i.test(t)) nodes[j].style.display = 'none';
            }
          }
        } catch (e) {}
      }).catch(function () {});
      return res;
    });
  };
})();
