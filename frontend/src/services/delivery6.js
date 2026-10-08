/**
 * Ground OPS - Delivery 6
 * Force the "proof files" box in the Leave form to be visible ONLY when
 * the selected leave type is SICK. The original code uses the "hidden"
 * attribute, but a CSS rule with higher priority makes the box visible
 * all the time. This fixes it by setting display:none / display:block
 * directly on the element.
 */
(function () {
  'use strict';

  function fixLeaveBox() {
    var box = document.getElementById('proof-box');
    if (!box) return;
    var select = document.querySelector('select[name="leave_type"]');
    if (!select) return;

    var isSick = select.value === 'SICK';
    var wanted = isSick ? '' : 'none';
    if (box.style.display !== wanted) box.style.display = wanted;

    // Also keep the hidden attribute in sync (harmless)
    if (isSick) { if (box.hasAttribute('hidden')) box.removeAttribute('hidden'); }
    else { if (!box.hasAttribute('hidden')) box.setAttribute('hidden', ''); }
  }

  // Run every 500 ms - the leave modal is created dynamically
  setInterval(fixLeaveBox, 500);

  // Run right away too
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fixLeaveBox);
  else fixLeaveBox();
})();
