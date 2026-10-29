/**
 * Ground OPS - Delivery 32 (Employee My Stats UI)
 */
(function () {
  'use strict';
  if (/admin\.html/i.test(window.location.pathname)) return;

  function getSession() {
    try {
      var raw = localStorage.getItem('gops.session.employee') || sessionStorage.getItem('gops.session.employee');
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && v.token) ? v : null;
    } catch (e) { return null; }
  }

  // إضافة الزرار في الشاشة
  function injectStatsButton() {
    if (document.getElementById('gops-stats-btn')) return;
    var sess = getSession();
    if (!sess) return; // لو مش مسجل دخول، متظهرش

    var btn = document.createElement('button');
    btn.id = 'gops-stats-btn';
    btn.innerHTML = '📊';
    btn.title = 'إحصائياتي';
    btn.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:99998;width:55px;height:55px;border-radius:50%;background:#6c5ce7;color:#fff;font-size:24px;border:none;box-shadow:0 4px 10px rgba(108,92,231,0.4);cursor:pointer;display:flex;align-items:center;justify-content:center;';
    btn.onclick = openStatsModal;
    document.body.appendChild(btn);
  }

  function openStatsModal() {
    var sess = getSession();
    var apiUrl = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL;
    
    // شاشة تحميل مؤقتة
    var old = document.getElementById('gops-stats-modal');
    if (old) old.remove();
    
    var modal = document.createElement('div');
    modal.id = 'gops-stats-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = '<div style="color:#fff;font:16px system-ui;">جاري تحميل الإحصائيات...</div>';
    document.body.appendChild(modal);

    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getMyStats', token: sess.token, payload: {}, client: 'delivery32/1.0' })
    }).then(function(r) { return r.json(); }).then(function(res) {
      if (!res.success) throw new Error(res.message);
      var d = res.data;

      modal.innerHTML = 
        '<div style="background:#f7f7f8;border-radius:16px;max-width:450px;width:100%;padding:20px;font:15px/1.5 system-ui,sans-serif;color:#111;max-height:90vh;overflow:auto;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
            '<h2 style="margin:0;font-size:20px;">📊 إحصائياتي</h2>' +
            '<button id="gops-stats-close" style="background:transparent;border:0;font-size:24px;cursor:pointer;color:#666;">×</button>' +
          '</div>' +
          
          '<div style="text-align:center;margin-bottom:20px;">' +
            '<div style="font-size:16px;font-weight:bold;color:#333;">' + (d.employee_name || 'الكابتن') + '</div>' +
            '<div style="font-size:13px;color:#666;margin-top:4px;">شهر: ' + d.month + '</div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            
            // كارت الحضور
            '<div style="background:#fff;padding:16px;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">' +
              '<div style="font-size:30px;margin-bottom:8px;">📅</div>' +
              '<div style="font-size:24px;font-weight:bold;color:#1e8e3e;">' + d.attendance_days + '</div>' +
              '<div style="font-size:12px;color:#666;margin-top:4px;">أيام الحضور</div>' +
            '</div>' +

            // كارت التأخير
            '<div style="background:#fff;padding:16px;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">' +
              '<div style="font-size:30px;margin-bottom:8px;">⏰</div>' +
              '<div style="font-size:24px;font-weight:bold;color:#d33;">' + d.late_days + '</div>' +
              '<div style="font-size:12px;color:#666;margin-top:4px;">مرات التأخير (' + d.total_late_minutes + ' دقيقة)</div>' +
            '</div>' +

            // كارت البريك
            '<div style="background:#fff;padding:16px;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">' +
              '<div style="font-size:30px;margin-bottom:8px;">☕</div>' +
              '<div style="font-size:24px;font-weight:bold;color:#f39c12;">' + d.total_break_minutes + '</div>' +
              '<div style="font-size:12px;color:#666;margin-top:4px;">دقائق البريك</div>' +
            '</div>' +

            // كارت الإجازات
            '<div style="background:#fff;padding:16px;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">' +
              '<div style="font-size:30px;margin-bottom:8px;">🏖️</div>' +
              '<div style="font-size:24px;font-weight:bold;color:#0a84ff;">' + d.leave_balance + '</div>' +
              '<div style="font-size:12px;color:#666;margin-top:4px;">رصيد الإجازات</div>' +
            '</div>' +

          '</div>' +

          '<button id="gops-stats-btn-close" style="width:100%;margin-top:20px;padding:12px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:bold;font-size:15px;cursor:pointer;">إغلاق</button>' +
        '</div>';

      var close = function() { modal.remove(); };
      document.getElementById('gops-stats-close').onclick = close;
      document.getElementById('gops-stats-btn-close').onclick = close;

    }).catch(function(e) {
      modal.innerHTML = '<div style="background:#fff;padding:20px;border-radius:12px;text-align:center;">' +
        '<div style="color:#c00;font-weight:bold;margin-bottom:10px;">حدث خطأ</div>' +
        '<div style="font-size:13px;color:#666;margin-bottom:15px;">' + e.message + '</div>' +
        '<button id="gops-stats-err-close" style="padding:10px 20px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer;">إغلاق</button>' +
        '</div>';
      document.getElementById('gops-stats-err-close').onclick = function() { modal.remove(); };
    });
  }

  // تشغيل الزرار لما التطبيق يحمل
  setInterval(injectStatsButton, 3000);

})();
