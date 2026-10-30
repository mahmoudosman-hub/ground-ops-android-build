/**
 * Ground OPS - Warm-up.
 * Pings the API as soon as any page loads, so the web-app instance is hot
 * by the time the user signs in. Repeats while the tab is open.
 * No dependencies, no imports.
 */
(function () {
  'use strict';

  var API_URL = null;

  function readConfig() {
    if (API_URL) return Promise.resolve(API_URL);
    try {
      if (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) { API_URL = window.GOPS_CONFIG.API_URL; return Promise.resolve(API_URL); }
      if (window.CONFIG && window.CONFIG.API_URL) { API_URL = window.CONFIG.API_URL; return Promise.resolve(API_URL); }
    } catch (e) {}
    return fetch('./config.js', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var m = txt.match(/API_URL\s*:\s*['"]([^'"]+)['"]/);
        API_URL = m ? m[1] : null;
        return API_URL;
      })
      .catch(function () { return null; });
  }

  function ping() {
    if (!API_URL) return;
    try {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'warmupPing', payload: {}, client: 'warmup' }),
        redirect: 'follow',
        credentials: 'omit',
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  function loop() {
    // Fire immediately
    ping();
    // Fire again at 5s, 10s, 20s - catches the moment the user is typing the password
    setTimeout(ping, 5000);
    setTimeout(ping, 10000);
    setTimeout(ping, 20000);
    // Keep the instance warm while the tab is open (every 4 minutes)
    setInterval(function () {
      if (document.hidden) return;
      ping();
    }, 240000);
  }

  readConfig().then(loop);
})();
