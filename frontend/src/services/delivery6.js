/**
 * Ground OPS - Delivery 6
 * Force "proof files" box to show ONLY when leave type is SICK.
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
    if (isSick) { if (box.hasAttribute('hidden')) box.removeAttribute('hidden'); }
    else { if (!box.hasAttribute('hidden')) box.setAttribute('hidden', ''); }
  }

  setInterval(fixLeaveBox, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fixLeaveBox);
  else fixLeaveBox();
})();
