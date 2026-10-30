/**
 * Ground OPS - Delivery 29 (Just hide old lang button + shrink FAB)
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  function hideOldLang() {
    var oldBtn = document.getElementById('gops-lang-btn');
    if (oldBtn) oldBtn.style.display = 'none';
  }

  function fixFab() {
    var fab = document.getElementById('gops-sc-fab');
    if (fab) {
      if (fab.innerHTML.trim() !== '📸') fab.innerHTML = '📸';
      fab.style.setProperty('width', '55px', 'important');
      fab.style.setProperty('height', '55px', 'important');
      fab.style.setProperty('border-radius', '50%', 'important');
      fab.style.setProperty('padding', '0', 'important');
      fab.style.setProperty('display', 'flex', 'important');
      fab.style.setProperty('align-items', 'center', 'important');
      fab.style.setProperty('justify-content', 'center', 'important');
      fab.style.setProperty('font-size', '26px', 'important');
      fab.style.setProperty('bottom', '20px', 'important');
      fab.style.setProperty('right', '20px', 'important');
    }
  }

  setInterval(function() {
    hideOldLang();
    fixFab();
  }, 1000);

  // قفل قائمة الإشعارات لوحدها
  document.addEventListener('click', function (e) {
    var text = (e.target.innerText || "").toLowerCase();
    if (text.includes('mark all') || text.includes('قراءة الكل')) {
      setTimeout(function () {
        var dropdowns = document.querySelectorAll('[class*="dropdown"], [class*="notification"]');
        dropdowns.forEach(function (d) { d.style.display = 'none'; });
      }, 500);
    }
  });

})();
