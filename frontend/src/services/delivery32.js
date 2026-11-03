/**
 * delivery32.js — تاب «📊 إحصائياتي» (d73)
 * تاب رابع في شريط تابات تطبيق الكابتن بيفتح صفحة كاملة (مش modal) فيها:
 * - KPI Score للشهر الحالي (getMyKpi) — لو الباك إند لسه مفيهوش getMyKpi القسم بيتخفي بهدوء
 * - إحصائيات الشهر (getMyStats): أيام الحضور / التأخير / البريك / رصيد الإجازات
 * - زرار تحديث في الأسفل
 * الهوية: Talabat brand عبر متغيرات app.css (--brand #FF5900 / --ok / --warn / --bad)
 * النصوص بت مرّة t() من core/i18n — بتتبع زرار عربي/English (d72)
 *
 * تغييرات d73 عن نسخة المودال القديمة:
 * - مودال ثابت فوق الشاشة → تاب في شريط التابات + panel جنب view-home
 * - إضافة KPI Score بلون حسب النسبة + تفاصيل كل معيار فوق الإحصائيات
 * - مفتاح الجلسة الصحيح gops.session.employee (زي النسخة القديمة)
 * - polling دائم خفيف: بعد أي logout/login التابات بتتبني من جديد والتاب بيرجع لوحده
 */
import { t } from '../core/i18n.js';

(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  var BRAND = 'var(--brand, #FF5900)';
  var OK    = 'var(--ok, #2E7D32)';
  var BAD   = 'var(--bad, #C62828)';
  var WARN  = 'var(--warn, #E65100)';
  var INFO  = 'var(--info, #1565C0)';

  // ── الحالة ───────────────────────────────────────────────────────
  var tabEl = null, panelEl = null, loaded = false;

  // ── الجلسة + الـ API ─────────────────────────────────────────────
  function getSession() {
    try {
      var raw = localStorage.getItem('gops.session.employee') || sessionStorage.getItem('gops.session.employee');
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && v.token) ? v : null;
    } catch (e) { return null; }
  }

  function apiUrl() {
    return (window.GOPS_CONFIG && window.GOPS_CONFIG.API_URL) || '';
  }

  function apiCall(action, payload, token) {
    return fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: token, payload: payload || {}, client: 'delivery32/2.0' })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || res.success !== true) throw new Error((res && res.message) || 'Error');
      return res.data;
    });
  }

  function currentMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // ── الحقن في شريط التابات ────────────────────────────────────────
  function tryInject() {
    if (document.getElementById('tab-stats')) return; // التاب موجود بالفعل
    if (!getSession()) return;                        // مش مسجل دخول — مفيش تاب
    var tabs = document.getElementById('tabs');
    var homeView = document.getElementById('view-home');
    if (!tabs || !homeView) return;                   // شريط التابات مش مبني لسه
    inject(tabs, homeView.parentNode);
  }

  function inject(tabs, main) {
    loaded = false; // بعد إعادة بناء الشريط نجيب البيانات من جديد

    tabEl = document.createElement('button');
    tabEl.id = 'tab-stats';
    tabEl.type = 'button';
    tabEl.className = 'btn btn-small';
    tabEl.textContent = '📊 ' + t('My Stats');
    tabEl.style.cssText = 'white-space:nowrap';
    tabEl.setAttribute('aria-current', 'false');
    tabEl.onclick = showPanel;
    tabs.appendChild(tabEl);

    panelEl = document.createElement('div');
    panelEl.id = 'view-stats';
    panelEl.hidden = true;
    main.appendChild(panelEl);

    // أي تاب تاني يتضغط → الـ panel يتخفي
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
      if (b !== tabEl) b.addEventListener('click', hidePanel);
    });
  }

  function showPanel() {
    if (!panelEl || !panelEl.isConnected) {
      panelEl = null; loaded = false;
      tryInject();
      if (!panelEl) return;
    }
    ['view-home', 'view-schedule', 'view-requests'].forEach(function (id) {
      var v = document.getElementById(id); if (v) v.hidden = true;
    });
    panelEl.hidden = false;
    tabEl.classList.add('active');
    tabEl.setAttribute('aria-current', 'page');
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button:not(#tab-stats)'), function (b) {
      b.classList.remove('active'); b.setAttribute('aria-current', 'false');
    });
    if (!loaded) { loaded = true; loadStats(); }
  }

  function hidePanel() {
    if (panelEl) panelEl.hidden = true;
    if (tabEl) { tabEl.classList.remove('active'); tabEl.setAttribute('aria-current', 'false'); }
  }

  // ── جلب البيانات ─────────────────────────────────────────────────
  function loadStats() {
    if (!panelEl) return;
    panelEl.innerHTML = '';
    panelEl.appendChild(spinnerNode());

    var sess = getSession();
    var token = sess && sess.token;
    var month = currentMonth();

    if (!token) { showError(t('Not signed in')); return; }

    Promise.all([
      // KPI اختياري: لو الباك إند لسه مفيهوش getMyKpi القسم بيتخفي بهدوء ومفيش كسر
      apiCall('getMyKpi', { month: month }, token).catch(function () { return null; }),
      // getMyStats بـ payload فاضي — نفس نداء النسخة القديمة المجرَّبة في الإنتاج
      apiCall('getMyStats', {}, token)
    ]).then(function (results) {
      render(results[0], results[1], month);
    }).catch(function (e) {
      showError((e && e.message) ? e.message : String(e));
    });
  }

  // ── العرض ────────────────────────────────────────────────────────
  function render(kpi, stats, month) {
    if (!panelEl) return;
    panelEl.innerHTML = '';
    var wrap = div('padding:16px');

    // ── KPI Score ──
    if (kpi && kpi.kpi_score != null) {
      var score = kpi.kpi_score;
      var scoreColor = score >= 90 ? OK : score >= 70 ? WARN : BAD;
      var scoreLabel = score >= 90 ? t('Excellent') : score >= 70 ? t('Good') : t('Needs improvement');

      var kpiCard = div('background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:12px;padding:16px;margin-bottom:12px;border-top:4px solid ' + BRAND);
      kpiCard.appendChild(el('h3', 'margin:0 0 12px;font-size:1rem;color:var(--text,#411517)', '📊 ' + t('My KPI') + ' — ' + (kpi.month_label || month)));

      var scoreRow = div('display:flex;align-items:center;gap:14px;margin-bottom:14px');
      scoreRow.appendChild(el('span', 'font-size:2.4rem;font-weight:700;color:' + scoreColor, score + '%'));
      var scoreInfo = div('');
      scoreInfo.appendChild(el('p', 'margin:0;font-weight:600;color:' + scoreColor, scoreLabel));
      scoreInfo.appendChild(el('p', 'margin:0;font-size:.82rem;color:var(--muted,#666)', t('{n} days this month', { n: kpi.days_in_period || 0 })));
      scoreRow.appendChild(scoreInfo);
      kpiCard.appendChild(scoreRow);

      // تفاصيل كل معيار (القيمة أكبر من صفر = خصم = أحمر، الصفر = ✓ أخضر)
      var metrics = Array.isArray(kpi.metrics) ? kpi.metrics : [];
      metrics.forEach(function (m) {
        var val = m.value || 0;
        var row = div('display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line,#eee);font-size:.88rem');
        row.appendChild(el('span', 'color:var(--muted,#666)', m.label));
        row.appendChild(el('span', 'font-weight:600;color:' + (val > 0 ? BAD : OK), val > 0 ? val + ' ' + (m.unit || '') : '✓'));
        kpiCard.appendChild(row);
      });

      wrap.appendChild(kpiCard);
    } else if (kpi) {
      wrap.appendChild(el('p', 'text-align:center;color:var(--muted,#666);padding:8px 0', t('No KPI data yet this month.')));
    }

    // ── إحصائيات الشهر ──
    if (stats) {
      var lateMin = stats.total_late_minutes;
      var items = [
        { icon: '📅', label: t('Attendance days'), val: String(stats.attendance_days || 0), color: OK },
        { icon: '⏰', label: t('Late arrivals'), val: String(stats.late_days || 0) + (lateMin != null ? ' (' + lateMin + ' ' + t('min') + ')' : ''), color: (stats.late_days > 0) ? BAD : OK },
        { icon: '☕', label: t('Break minutes'), val: String(stats.total_break_minutes || 0), color: WARN },
        { icon: '🏖️', label: t('Leave balance'), val: stats.leave_balance != null ? stats.leave_balance + ' ' + t('days') : '-', color: INFO }
      ];

      wrap.appendChild(el('h3', 'margin:0 0 10px;font-size:.95rem;color:var(--muted,#666)', t('Stats — {m}', { m: month })));
      var grid = div('display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px');
      items.forEach(function (item) {
        var card = div('background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:12px;padding:14px;text-align:center');
        card.appendChild(el('div', 'font-size:28px;margin-bottom:6px', item.icon));
        card.appendChild(el('div', 'font-size:1.4rem;font-weight:700;color:' + item.color, item.val));
        card.appendChild(el('div', 'font-size:.78rem;color:var(--muted,#666);margin-top:4px', item.label));
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    }

    if (!kpi && !stats) {
      wrap.appendChild(el('p', 'text-align:center;color:var(--muted,#666);padding:20px', t('No data available right now.')));
    }

    // ── زرار تحديث ──
    var refreshBtn = el('button', 'width:100%;padding:10px;border:0;border-radius:10px;background:' + BRAND + ';color:#fff;font-weight:600;font-size:.9rem;cursor:pointer;margin-top:4px', '🔄 ' + t('Refresh'));
    refreshBtn.onclick = function () { loadStats(); };
    wrap.appendChild(refreshBtn);

    panelEl.innerHTML = '';
    panelEl.appendChild(wrap);
  }

  function showError(msg) {
    if (!panelEl) return;
    panelEl.innerHTML = '';
    var wrap = div('padding:16px;text-align:center');
    wrap.appendChild(el('p', 'color:' + BAD + ';font-weight:600;margin-bottom:8px', t('Something went wrong')));
    wrap.appendChild(el('p', 'font-size:.85rem;color:var(--muted,#666);margin-bottom:14px', msg));
    var retry = el('button', 'padding:8px 20px;border:0;border-radius:8px;background:' + BRAND + ';color:#fff;cursor:pointer', t('Try again'));
    retry.onclick = function () { loadStats(); };
    wrap.appendChild(retry);
    panelEl.appendChild(wrap);
  }

  // ── helpers ──────────────────────────────────────────────────────
  function div(style) { var d = document.createElement('div'); if (style) d.style.cssText = style; return d; }
  function el(tag, style, text) { var e = document.createElement(tag); if (style) e.style.cssText = style; if (text != null) e.textContent = text; return e; }
  // بنستخدم كلاسات الـ spinner الجاهزة في app.css (نفس شكل باقي التطبيق) بدل keyframes خاصة
  function spinnerNode() {
    var s = document.createElement('div');
    s.className = 'spinner';
    s.setAttribute('role', 'status');
    var sp = document.createElement('span');
    sp.className = 'spin';
    sp.setAttribute('aria-hidden', 'true');
    s.appendChild(sp);
    s.appendChild(document.createTextNode(t('Loading...')));
    return s;
  }

  // ── polling دائم خفيف ────────────────────────────────────────────
  // view() في app.js بتعيد بناء شريط التابات بعد logout/login — الفحص ده بيرجّع التاب لوحده
  setInterval(tryInject, 1500);
  tryInject();

})();
