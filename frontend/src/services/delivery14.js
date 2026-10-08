/**
 * Ground OPS - Delivery 14
 * Aggressive cleanup after a selfie opens in a new tab:
 *   1. Remove any full-screen backdrop / overlay with high z-index.
 *   2. Restore body scroll and pointer events.
 *   3. Call invalidateSize() on every visible Leaflet map.
 * Admin pages only.
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  function isOurs(el) {
    var id = el.id || '';
    return id.indexOf('gops-') === 0;
  }

  function looksLikeBackdrop(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isOurs(el)) return false;
    if (el.tagName === 'BODY' || el.tagName === 'HTML') return false;
    var s = window.getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'absolute') return false;
    var z = parseInt(s.zIndex, 10);
    if (!(z > 500)) return false;
    var w = el.getBoundingClientRect();
    if (w.width < window.innerWidth * 0.85) return false;
    if (w.height < window.innerHeight * 0.85) return false;
    var bg = s.backgroundColor || '';
    // Dark or white overlay, semi-transparent or solid
    if (/rgba?\(/.test(bg)) return true;
    return false;
  }

  function findBackdrops() {
    var out = [];
    document.querySelectorAll('div, section, aside').forEach(function (el) {
      if (looksLikeBackdrop(el)) out.push(el);
    });
    return out;
  }

  function removeBackdrops() {
    var found = findBackdrops();
    if (!found.length) return 0;
    found.forEach(function (el) {
      // If it contains a dialog, try to remove just the backdrop by clicking outside or removing children first
      // Just remove the whole thing — safer than leaving a stuck layer.
      try { el.parentNode && el.parentNode.removeChild(el); } catch (e) { el.style.display = 'none'; }
    });
    return found.length;
  }

  function restoreBody() {
    if (!document.body) return;
    document.body.style.pointerEvents = '';
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.documentElement.style.pointerEvents = '';
    document.documentElement.style.overflow = '';
  }

  function fixMaps() {
    try {
      document.querySelectorAll('.leaflet-container').forEach(function (node) {
        // Each Leaflet map stores itself as _leaflet_map on the container? Not standard.
        // But every map is reachable via window.L if present.
      });
      // Approach: walk through L.Map instances. Leaflet attaches `_leaflet_id` to containers.
      // Simplest: trigger window resize once; Leaflet listens to that and invalidates.
      window.dispatchEvent(new Event('resize'));
      // Direct invalidation via reflection on any known API
      if (window.L && window.L.Map) {
        // Walk all containers that have _leaflet_map (internal)
        document.querySelectorAll('.leaflet-container').forEach(function (c) {
          try {
            if (c._leaflet_map && typeof c._leaflet_map.invalidateSize === 'function') c._leaflet_map.invalidateSize();
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  function cleanup() {
    var removed = removeBackdrops();
    restoreBody();
    if (removed > 0) fixMaps();
    return removed;
  }

  // Mark when a selfie link is opened
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/script\.google\.com|macros/.test(url)) return origFetch(input, init);
    return origFetch(input, init).then(function (res) {
      try {
        var c = res.clone();
        c.json().then(function (b) {
          if (b && b.success && b.data && b.data.url) {
            // Multiple cleanup passes — some modal libraries take time to finish their own animations.
            setTimeout(cleanup, 400);
            setTimeout(cleanup, 1200);
            setTimeout(cleanup, 2500);
          }
        }).catch(function () {});
      } catch (e) {}
      return res;
    });
  };

  // Periodic sweep: if any backdrop is on screen without a visible child dialog, remove it
  setInterval(function () {
    var found = findBackdrops();
    found.forEach(function (el) {
      var dialog = el.querySelector('[role="dialog"], .modal, .modal-content');
      if (dialog && dialog.offsetParent !== null) {
        // Has a visible dialog inside → leave it alone
        return;
      }
      try { el.parentNode && el.parentNode.removeChild(el); } catch (e) { el.style.display = 'none'; }
      restoreBody();
      fixMaps();
    });
  }, 1500);
})();
