/**
 * Ground OPS - Delivery 21 v6
 * Full Arabic translation for admin + Arabic hints on settings.
 * FIX: Targets <small> tags and input[name] instead of data-key/div.
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  var LANG_KEY = 'gops.admin.lang';
  var HINTS_ENABLED_KEY = 'gops.admin.hints';

  function getLang() { try { return localStorage.getItem(LANG_KEY) || localStorage.getItem('gops.lang') || 'en'; } catch (e) { return 'en'; } } // d47: بيرث اللغة من نظام الترجمة الجديد عشان الاتنين متضربوش في بعض
  function setLang(v) { try { localStorage.setItem(LANG_KEY, v); } catch (e) {} }
  function hintsEnabled() { try { return localStorage.getItem(HINTS_ENABLED_KEY) !== 'false'; } catch (e) { return true; } }
  function setHints(v) { try { localStorage.setItem(HINTS_ENABLED_KEY, v ? 'true' : 'false'); } catch (e) {} }

  function ensureDict(cb) {
    if (window.GOPS_ADMIN_I18N) return cb();
    var s = document.createElement('script');
    s.src = './src/services/admin-translations.js';
    s.onload = cb;
    s.onerror = function () { cb(); };
    document.head.appendChild(s);
  }

  function translateTextNodes(lang, root) {
    if (!root) root = document.body;
    var dict = (window.GOPS_ADMIN_I18N || {}).ui || {};
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = walker.nextNode())) {
      var parent = n.parentNode;
      if (!parent) continue;
      var tag = parent.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      if (parent.id && parent.id.indexOf('gops-') === 0) continue;
      if (n.__gops_orig === undefined) { try { n.__gops_orig = n.nodeValue; } catch (e) { continue; } }
      var orig = n.__gops_orig;
      if (!orig) continue;
      var trimmed = orig.trim();
      if (!trimmed || trimmed.length > 120) continue;
      if (lang === 'ar' && dict[trimmed]) n.nodeValue = orig.replace(trimmed, dict[trimmed]);
      else if (n.nodeValue !== orig) n.nodeValue = orig;
    }
  }

  function translateAttributes(lang, root) {
    if (!root) root = document.body;
    var dict = (window.GOPS_ADMIN_I18N || {}).ui || {};
    var attrs = ['placeholder', 'aria-label', 'title'];
    var els = root.querySelectorAll('input, select, textarea, button, a');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.id && el.id.indexOf('gops-') === 0) continue;
      for (var a = 0; a < attrs.length; a++) {
        var attr = attrs[a];
        var v = el.getAttribute(attr);
        if (!v) continue;
        var cacheKey = '__gops_attr_' + attr;
        if (el[cacheKey] === undefined) el[cacheKey] = v;
        var orig = el[cacheKey];
        if (lang === 'ar' && dict[orig]) el.setAttribute(attr, dict[orig]);
        else if (el.getAttribute(attr) !== orig) el.setAttribute(attr, orig);
      }
    }
  }

  // =====================================================================
  // FIX: Translate setting descriptions inside <small> tags using input[name]
  // =====================================================================
  function translateSettingDescriptions() {
    if (getLang() !== 'ar' || !hintsEnabled()) return;
    var hints = (window.GOPS_ADMIN_I18N || {}).hints || {};

    // Find all inputs that have a 'name' attribute (like name="default_geofence_radius_meters")
    var inputs = document.querySelectorAll('input[name]');
    
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var key = input.getAttribute('name');
      if (!key || !hints[key]) continue;

      // The container is usually the .field div
      var container = input.closest('.field') || input.parentElement;
      if (!container) continue;

      // Find the <small> tag inside this container
      var small = container.querySelector('small');
      if (small) {
        if (!small.dataset.gopsOrigDesc) {
          small.dataset.gopsOrigDesc = small.textContent;
        }
        small.textContent = hints[key];
        small.style.color = '#0a84ff'; // Highlight in blue to prove it worked
        small.style.fontWeight = '600';
      }
    }
  }

  function restoreSettingDescriptions(root) {
    if (!root) root = document.body;
    root.querySelectorAll('small[data-gops-orig-desc]').forEach(function (el) {
      el.textContent = el.dataset.gopsOrigDesc;
      el.style.color = '';
      el.style.fontWeight = '';
      delete el.dataset.gopsOrigDesc;
    });
  }

  function fixSelfieFab() {
    // d61: الزرار العائم اتشال خالص — بيتمسح لو موجود من جلسة قديمة
    var fab = document.getElementById('gops-sc-fab');
    if (fab) fab.remove();
  }

    function hideOldLangButton() {
    // 1. نضيف قاعدة CSS بتخفي الزرار نهائياً ومهما حصل
    if (!document.getElementById('gops-hide-old-lang-style')) {
      var style = document.createElement('style');
      style.id = 'gops-hide-old-lang-style';
      style.innerHTML = '#gops-lang-btn { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }';
      document.head.appendChild(style);
    }
    
    // 2. نتأكد إن الزرار لو موجود متخفي فوراً
    var old = document.getElementById('gops-lang-btn');
    if (old) {
      old.style.setProperty('display', 'none', 'important');
      old.style.setProperty('visibility', 'hidden', 'important');
    }
  }

  function attachHints(root) {
    if (!hintsEnabled()) return;
    var hints = (window.GOPS_ADMIN_I18N || {}).hints || {};
    if (!root) root = document.body;
    
    // FIX: Look for input[name] instead of [data-key]
    root.querySelectorAll('input[name]:not([data-gops-hint])').forEach(function (el) {
      var key = el.getAttribute('name');
      if (!key || !hints[key]) return;
      el.setAttribute('data-gops-hint', '1');
      el.setAttribute('title', hints[key]);
    });
  }

  function installLanguageButton(sidebar) {
    if (document.getElementById('gops-admin-lang-btn')) return;
    var wrap = document.createElement('div');
    wrap.id = 'gops-admin-lang-btn';
    wrap.style.cssText = 'padding:12px 16px;border-top:1px solid rgba(0,0,0,.08);margin-top:8px;';
    wrap.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<div style="font-weight:600;font-size:13px;color:inherit">🌐 Language</div>' +
        '<button id="gops-admin-lang-toggle" style="padding:6px 12px;border:0;border-radius:6px;background:#0a84ff;color:#fff;font-weight:700;cursor:pointer;font-size:12px">ع</button>' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<div style="font-weight:600;font-size:12px;color:inherit;opacity:.8">💡 Hints (AR)</div>' +
        '<input type="checkbox" id="gops-admin-hints-toggle" style="width:18px;height:18px;cursor:pointer">' +
      '</div>';
    sidebar.appendChild(wrap);
    var btn = wrap.querySelector('#gops-admin-lang-toggle');
    var hintsBox = wrap.querySelector('#gops-admin-hints-toggle');
    function render() {
      var l = getLang();
      btn.textContent = l === 'ar' ? 'EN' : 'ع';
      btn.title = l === 'ar' ? 'Switch to English' : 'التبديل إلى العربية';
      hintsBox.checked = hintsEnabled();
    }
    btn.onclick = function () {
      var next = getLang() === 'ar' ? 'en' : 'ar';
      setLang(next);
      try { localStorage.setItem('gops.lang', next); localStorage.setItem('gops.lang.user', '1'); } catch (e) {} // d47: وحدة اللغة مع النظام الجديد
      location.reload();
    };
    hintsBox.onchange = function () { setHints(hintsBox.checked); applyAll(); };
    render();
  }

  function findSidebar() {
    var sels = ['.sidebar', 'nav.sidebar', 'aside.sidebar', '#sidebar', '.sidenav', '.side-nav', 'aside', 'nav[role="navigation"]'];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && el.querySelectorAll('a, button, li').length >= 3) return el;
    }
    return null;
  }

  function applyAll() {
    var lang = getLang();
    translateTextNodes(lang);
    translateAttributes(lang);
    attachHints();
    if (lang === 'ar') translateSettingDescriptions();
    else restoreSettingDescriptions();
    fixSelfieFab();
    hideOldLangButton();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }

  function boot() {
    var sidebar = findSidebar();
    if (sidebar) installLanguageButton(sidebar);
    applyAll();

    var pending = false;
    var obs = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        var s = findSidebar();
        if (s) installLanguageButton(s);
        fixSelfieFab();
        hideOldLangButton();
        if (getLang() === 'ar') {
          translateTextNodes('ar');
          translateAttributes('ar');
          translateSettingDescriptions();
        }
        attachHints();
      }, 500);
    });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });

    setTimeout(applyAll, 1000);
    setTimeout(applyAll, 2500);
  }

  ensureDict(function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  });
})();
