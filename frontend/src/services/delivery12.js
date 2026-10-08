/**
 * Ground OPS - Delivery 12 v2 (Comedy mode)
 * Full-screen animated loading overlay for the ADMIN dashboard.
 * Rotates through funny emojis + funny messages.
 * Admin pages only.
 */
(function () {
  'use strict';

  if (!/admin\.html/i.test(window.location.pathname)) return;

  (function injectCSS() {
    if (document.getElementById('gops-d12-styles')) return;
    var s = document.createElement('style');
    s.id = 'gops-d12-styles';
    s.textContent = [
      '#gops-d12-overlay {',
      '  position: fixed;inset: 0;background: rgba(255,255,255,.78);',
      '  backdrop-filter: blur(2px);-webkit-backdrop-filter: blur(2px);',
      '  z-index: 99998;display: none;align-items: center;justify-content: center;',
      '  flex-direction: column;gap: 16px;',
      '  font: 600 17px system-ui,-apple-system,sans-serif;color: #1a3a6c;',
      '  opacity: 0;transition: opacity .18s ease;text-align: center;padding: 20px;',
      '}',
      '#gops-d12-overlay.gops-visible { display: flex; opacity: 1; }',
      '#gops-d12-overlay .gops-emoji {',
      '  font-size: 96px;display: inline-block;',
      '  filter: drop-shadow(0 8px 16px rgba(26,58,108,.22));',
      '  transform-origin: center;',
      '}',
      '#gops-d12-overlay.gops-anim-bounce .gops-emoji { animation: gopsBounce 1.1s ease-in-out infinite; }',
      '#gops-d12-overlay.gops-anim-spin   .gops-emoji { animation: gopsSpin 2.4s linear infinite; }',
      '#gops-d12-overlay.gops-anim-wobble .gops-emoji { animation: gopsWobble 1.4s ease-in-out infinite; }',
      '#gops-d12-overlay.gops-anim-shake  .gops-emoji { animation: gopsShake 0.9s ease-in-out infinite; }',
      '#gops-d12-overlay.gops-anim-float  .gops-emoji { animation: gopsFloat 2s ease-in-out infinite; }',
      '@keyframes gopsBounce { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-24px) scale(1.08); } }',
      '@keyframes gopsSpin   { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.1); } 100% { transform: rotate(360deg) scale(1); } }',
      '@keyframes gopsWobble { 0%,100% { transform: rotate(-12deg) translateX(-6px); } 50% { transform: rotate(12deg) translateX(6px); } }',
      '@keyframes gopsShake  { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-10px) rotate(-6deg); } 40% { transform: translateX(10px) rotate(6deg); } 60% { transform: translateX(-6px) rotate(-3deg); } 80% { transform: translateX(6px) rotate(3deg); } }',
      '@keyframes gopsFloat  { 0%,100% { transform: translateY(0) rotate(0deg); } 25% { transform: translateY(-10px) rotate(-4deg); } 75% { transform: translateY(-4px) rotate(4deg); } }',
      '#gops-d12-overlay .gops-msg { font-size: 17px;letter-spacing: .3px;max-width: 420px;line-height: 1.45; }',
      '#gops-d12-overlay .gops-dots { display: inline-flex;gap: 8px; }',
      '#gops-d12-overlay .gops-dots span { width: 10px;height: 10px;background: #1a3a6c;border-radius: 50%;animation: gopsPulse 1.2s ease-in-out infinite; }',
      '#gops-d12-overlay .gops-dots span:nth-child(2) { animation-delay: .2s; }',
      '#gops-d12-overlay .gops-dots span:nth-child(3) { animation-delay: .4s; }',
      '@keyframes gopsPulse { 0%,80%,100% { opacity: .25; transform: scale(.7); } 40% { opacity: 1; transform: scale(1); } }'
    ].join('\n');
    document.head.appendChild(s);
  })();

  var FUNNY = [
    { e: '🦥', en: 'Sloth mode... taking it easy.',          ar: 'وضع الكسل... بنمشي على مهلم.',      anim: 'float'  },
    { e: '🐌', en: 'Snail speed... almost there!',           ar: 'سرعة الحلزون... قربنا نوصل!',        anim: 'wobble' },
    { e: '🐢', en: 'Turtle power... fetching.',              ar: 'قوة السلحفاة... بنجيب الداتا.',      anim: 'float'  },
    { e: '🤹', en: 'Juggling your requests...',              ar: 'بنلعب بالطلبات...',                  anim: 'bounce' },
    { e: '👨‍🍳', en: 'Cooking your data... almost ready.',    ar: 'بنطبخلك الداتا... جاهزة حالاً.',    anim: 'wobble' },
    { e: '🧙', en: 'Casting a spell on the server...',       ar: 'بنعمل سحر على السيرفر...',           anim: 'spin'   },
    { e: '🔮', en: 'Consulting the oracle...',               ar: 'بنسأل العرّاف...',                   anim: 'float'  },
    { e: '☕', en: 'Brewing coffee for the server...',       ar: 'بنعمل قهوة للسيرفر...',              anim: 'shake'  },
    { e: '🐝', en: 'Busy bee... buzzing around.',            ar: 'نحلة مجتهدة... بتلف حوالينا.',       anim: 'bounce' },
    { e: '🎣', en: 'Fishing for data...',                    ar: 'بنصطاد الداتا...',                   anim: 'wobble' },
    { e: '🛌', en: 'Server was asleep... waking it up.',     ar: 'السيرفر كان نايم... بنصحّيه.',       anim: 'shake'  },
    { e: '🍿', en: 'Popcorn ready... waiting for the show.', ar: 'الفشار جاهز... بنتفرج.',            anim: 'float'  },
    { e: '🏃', en: 'Running to fetch your data...',          ar: 'بنجري نجيب الداتا...',              anim: 'bounce' },
    { e: '🚀', en: 'Launching request into space...',        ar: 'بنطلق الطلب للفضاء...',              anim: 'spin'   },
    { e: '🧘', en: 'Deep breath... it will load soon.',      ar: 'خد نفس عميق... هتحمّل قريب.',       anim: 'float'  },
    { e: '🎩', en: 'Pulling data out of a hat...',           ar: 'بنطلع الداتا من الطربوش...',         anim: 'wobble' },
    { e: '🦦', en: 'Otter working hard for you...',          ar: 'القضاعة بتشتغل عشانك...',            anim: 'bounce' },
    { e: '🐙', en: 'Octopus multitasking...',                ar: 'الأخطبوط بيعمل كذا حاجة...',         anim: 'wobble' }
  ];
  var ANIMS = ['gops-anim-bounce', 'gops-anim-spin', 'gops-anim-wobble', 'gops-anim-shake', 'gops-anim-float'];
  var lastIdx = -1;

  function pickRandom() {
    var i;
    do { i = Math.floor(Math.random() * FUNNY.length); } while (FUNNY.length > 1 && i === lastIdx);
    lastIdx = i;
    return FUNNY[i];
  }

  function detectLang() {
    try {
      var l = localStorage.getItem('gops.lang');
      if (l === 'ar') return 'ar';
      if (l === 'en') return 'en';
    } catch (e) {}
    var html = document.documentElement.lang || '';
    return /^ar/i.test(html) ? 'ar' : 'en';
  }

  function createOverlay() {
    var el = document.createElement('div');
    el.id = 'gops-d12-overlay';
    el.innerHTML =
      '<span class="gops-emoji">🦥</span>' +
      '<span class="gops-msg">Fetching data...</span>' +
      '<span class="gops-dots"><span></span><span></span><span></span></span>';
    document.body.appendChild(el);
    return el;
  }
  function getOverlay() {
    var el = document.getElementById('gops-d12-overlay');
    if (!el) el = createOverlay();
    return el;
  }

  var showTimer = null, hideTimer = null;
  var pending = 0, shownAt = 0;
  var MIN_MS = 500, START_DELAY = 200;

  function setAnimClass(el, anim) {
    ANIMS.forEach(function (c) { el.classList.remove(c); });
    el.classList.add('gops-anim-' + anim);
  }

  function showOverlay() {
    var el = getOverlay();
    var pick = pickRandom();
    var lang = detectLang();
    el.querySelector('.gops-emoji').textContent = pick.e;
    el.querySelector('.gops-msg').textContent = (lang === 'ar' ? pick.ar : pick.en);
    setAnimClass(el, pick.anim);
    el.classList.add('gops-visible');
    shownAt = Date.now();
  }

  function hideOverlay() {
    var el = document.getElementById('gops-d12-overlay');
    if (!el) return;
    var wait = Math.max(0, MIN_MS - (Date.now() - shownAt));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { el.classList.remove('gops-visible'); }, wait);
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/script\.google\.com|macros/.test(url)) return origFetch(input, init);

    pending++;
    if (pending === 1) {
      clearTimeout(showTimer); clearTimeout(hideTimer);
      showTimer = setTimeout(showOverlay, START_DELAY);
    }
    function done() {
      pending--;
      if (pending <= 0) {
        pending = 0;
        clearTimeout(showTimer);
        hideOverlay();
      }
    }
    return origFetch(input, init).then(function (res) { done(); return res; }, function (err) { done(); throw err; });
  };
})();
