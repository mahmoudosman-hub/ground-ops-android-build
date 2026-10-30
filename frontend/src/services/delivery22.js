/**
 * Ground OPS - Delivery 22
 * Auto-hide the "Loading...Close" modal when viewing selfie images.
 * The direct "Open image" link (from delivery11) already shows.
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  function hideLoadingModal() {
    // Selfie Checks modal
    var sc = document.getElementById('gops-sc-modal');
    if (sc) {
      var disp = sc.style.display;
      if (disp && disp !== 'none') {
        var img = sc.querySelector('#gops-sc-img');
        var txt = (sc.textContent || '');
        // Hide if the modal is in "Loading" state or just has a Close button
        if ((img && /Loading/i.test(img.textContent)) || /^Close\s*Loading\.\.\.\s*$/.test(txt.trim())) {
          sc.style.display = 'none';
          sc.innerHTML = '';
        }
      }
    }

    // Also check any other modal that only shows a spinner or "Close" without image
    var modals = document.querySelectorAll('[role="dialog"], .modal');
    for (var i = 0; i < modals.length; i++) {
      var m = modals[i];
      if (m.offsetParent === null) continue;
      if (m.id === 'gops-clean-dialog') continue; // don't touch our own clean dialog
      var txt = (m.textContent || '').trim();
      if (txt === 'Close' || /^Close\s*Loading/.test(txt) || /^Loading\.\.\.\s*Close/.test(txt)) {
        m.style.display = 'none';
        m.innerHTML = '';
      }
    }
  }

  setInterval(hideLoadingModal, 200);

  var obs = new MutationObserver(hideLoadingModal);
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
})();
