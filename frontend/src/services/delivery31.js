/**
 * Ground OPS - Delivery 31 v3 (Fixed Employee List)
 */
(function () {
  'use strict';
  if (!/admin\.html/i.test(window.location.pathname)) return;

  // دالة بتجيب التوكن من أي مكان
  function getSession() {
    try {
      var raw = localStorage.getItem('gops.session.admin') || sessionStorage.getItem('gops.session.admin');
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && v.token) ? v : null;
    } catch (e) { return null; }
  }

  function injectSidebarButton() {
    var nav = document.querySelector('.sidebar, nav.sidebar, aside.sidebar, #sidebar');
    if (!nav || document.getElementById('gops-admin-notif-btn')) return;

    var a = document.createElement('a');
    a.id = 'gops-admin-notif-btn';
    a.href = '#';
    a.textContent = '📢 إرسال إشعار';
    a.style.cssText = 'display:block;padding:10px 14px;color:inherit;text-decoration:none;cursor:pointer;font-weight:bold;margin-top:10px;border-top:1px solid #eee;';
    a.onclick = function(ev) { ev.preventDefault(); openNotifModal(); };
    nav.appendChild(a);
  }

  function openNotifModal() {
    var old = document.getElementById('gops-notif-modal');
    if (old) old.remove();

    var sess = getSession();
    if (!sess) { alert('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى.'); return; }
    
    var token = sess.token;
    var apiUrl = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL;

    // شاشة تحميل مؤقتة لحد ما نلاقي الموظفين
    var modal = document.createElement('div');
    modal.id = 'gops-notif-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = '<div style="color:#fff;font:16px system-ui;">جاري جلب القائمة...</div>';
    document.body.appendChild(modal);

    // جلب الموظفين والفروع
    var p1 = fetch(apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getEmployees', token: token, payload: { page_size: 500 }, client: 'admin-notif' })
    }).then(function(r) { return r.json(); });

    var p2 = fetch(apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getBranches', token: token, payload: {}, client: 'admin-notif' })
    }).then(function(r) { return r.json(); });

    Promise.all([p1, p2]).then(function(results) {
      var emps = [];
      var branches = [];

      // لو السيرفر رجع أسماء
      if (results[0] && results[0].success && results[0].data && results[0].data.items) {
        emps = results[0].data.items;
      }
      if (results[1] && results[1].success && results[1].data && results[1].data.branches) {
        branches = results[1].data.branches;
      }
      
      var empOpts = '<option value="">-- اختر الكابتن --</option>' + emps.map(function(e) { return '<option value="' + e.employee_id + '">' + e.employee_name + ' (' + e.employee_id + ')</option>'; }).join('');
      var branchOpts = '<option value="">-- اختر الفرع --</option>' + branches.map(function(b) { return '<option value="' + b.branch_id + '">' + b.branch_name + '</option>'; }).join('');

      modal.innerHTML = 
        '<div style="background:#fff;border-radius:12px;max-width:500px;width:100%;padding:20px;font:15px/1.5 system-ui,sans-serif;color:#111;">' +
          '<h2 style="margin:0 0 15px;">📢 إرسال إشعار مخصص</h2>' +
          
          '<label style="display:block;margin-bottom:10px;font-weight:600;">المرسل إليه:</label>' +
          '<select id="gops-notif-target" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;">' +
            '<option value="ALL">👥 كل الكباتن</option>' +
            '<option value="BRANCH">🏢 فرع معين</option>' +
            '<option value="EMPLOYEE">👤 كابتن معين</option>' +
          '</select>' +

          '<div id="gops-notif-branch-wrap" style="display:none; margin-bottom:15px;">' +
            '<label style="display:block;margin-bottom:10px;font-weight:600;">اختر الفرع:</label>' +
            '<select id="gops-notif-branch" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">' + branchOpts + '</select>' +
          '</div>' +

          '<div id="gops-notif-emp-wrap" style="display:none; margin-bottom:15px;">' +
            '<label style="display:block;margin-bottom:10px;font-weight:600;">اختر الكابتن:</label>' +
            '<select id="gops-notif-emp" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">' + empOpts + '</select>' +
          '</div>' +

          '<label style="display:block;margin-bottom:10px;font-weight:600;">نوع الإشعار (Template):</label>' +
          '<select id="gops-notif-type" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;">' +
            '<option value="update">تحديث التطبيق (رابط)</option>' +
            '<option value="missed_selfie">فاتك سيلفي تشيك</option>' +
            '<option value="long_break">بريك طويل</option>' +
            '<option value="custom">رسالة مخصصة</option>' +
          '</select>' +

          '<label style="display:block;margin-bottom:10px;font-weight:600;">عنوان الرسالة:</label>' +
          '<input type="text" id="gops-notif-title" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;" placeholder="اكتب العنوان هنا...">' +
          
          '<label style="display:block;margin-bottom:10px;font-weight:600;">نص الرسالة:</label>' +
          '<textarea id="gops-notif-body" rows="3" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;" placeholder="اكتب نص الرسالة هنا..."></textarea>' +
          
          '<label style="display:block;margin-bottom:10px;font-weight:600;">رابط (اختياري - للتحديث):</label>' +
          '<input type="text" id="gops-notif-url" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;" placeholder="https://...">' +
          
          '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button id="gops-notif-cancel" style="padding:10px 20px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;">إلغاء</button>' +
            '<button id="gops-notif-send" style="padding:10px 20px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:bold;cursor:pointer;">إرسال الإشعار</button>' +
          '</div>' +
          '<div id="gops-notif-err" style="color:#c00;margin-top:10px;text-align:center;"></div>' +
        '</div>';
      
      var targetSel = document.getElementById('gops-notif-target');
      var branchWrap = document.getElementById('gops-notif-branch-wrap');
      var empWrap = document.getElementById('gops-notif-emp-wrap');
      var typeSel = document.getElementById('gops-notif-type');
      var titleIn = document.getElementById('gops-notif-title');
      var bodyIn = document.getElementById('gops-notif-body');
      var urlIn = document.getElementById('gops-notif-url');
      var errDiv = document.getElementById('gops-notif-err');
      var sendBtn = document.getElementById('gops-notif-send');

      targetSel.onchange = function() {
        branchWrap.style.display = (targetSel.value === 'BRANCH') ? 'block' : 'none';
        empWrap.style.display = (targetSel.value === 'EMPLOYEE') ? 'block' : 'none';
      };

      typeSel.onchange = function() {
        var v = typeSel.value;
        if (v === 'update') { titleIn.value = 'تحديث جديد للتطبيق'; bodyIn.value = 'يرجى تحديث التطبيق الآن للحصول على آخر الميزات.'; urlIn.value = 'https://mahmoudosman-hub.github.io/ground-ops-frontend/index.html'; }
        else if (v === 'missed_selfie') { titleIn.value = '📸 لقد فاتك سيلفي تشيك'; bodyIn.value = 'يرجى فتح التطبيق والتقاط صورة سيلفي الآن.'; urlIn.value = ''; }
        else if (v === 'long_break') { titleIn.value = '☕ بريك طويل'; bodyIn.value = 'لقد تجاوزت مدة البريك المسموح بها. يرجى العودة للعمل.'; urlIn.value = ''; }
        else { titleIn.value = ''; bodyIn.value = ''; urlIn.value = ''; }
      };
      typeSel.dispatchEvent(new Event('change'));

      document.getElementById('gops-notif-cancel').onclick = function() { modal.remove(); };
      
      sendBtn.onclick = function() {
        var targetType = targetSel.value;
        var payload = {
          target_type: targetType,
          title: titleIn.value,
          body: bodyIn.value,
          url: urlIn.value
        };

        if (targetType === 'BRANCH') payload.branch_id = document.getElementById('gops-notif-branch').value;
        if (targetType === 'EMPLOYEE') payload.employee_id = document.getElementById('gops-notif-emp').value;

        if (!payload.title || !payload.body) { errDiv.textContent = 'يرجى كتابة عنوان ونص الرسالة.'; return; }

        sendBtn.disabled = true;
        sendBtn.textContent = 'جاري الإرسال...';
        errDiv.textContent = '';

        fetch(apiUrl, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'sendAdminNotification', token: token, payload: payload, client: 'admin-notif' })
        }).then(function(r) { return r.json(); }).then(function(res) {
          if (res.success) {
            errDiv.style.color = '#1e8e3e'; 
            errDiv.textContent = '✅ تم الإرسال بنجاح لـ ' + res.data.sent + ' جهاز!'; 
            setTimeout(function() { modal.remove(); }, 2000);
          } else {
            errDiv.style.color = '#c00'; 
            errDiv.textContent = res.message; 
            sendBtn.disabled = false;
            sendBtn.textContent = 'إرسال الإشعار';
          }
        }).catch(function() {
          errDiv.style.color = '#c00'; 
          errDiv.textContent = 'خطأ في الاتصال بالسيرفر.'; 
          sendBtn.disabled = false;
          sendBtn.textContent = 'إرسال الإشعار';
        });
      };
    }).catch(function(e) {
      modal.innerHTML = '<div style="background:#fff;padding:20px;border-radius:12px;text-align:center;">' +
        '<div style="color:#c00;font-weight:bold;margin-bottom:10px;">فشل جلب القائمة</div>' +
        '<div style="font-size:13px;color:#666;margin-bottom:15px;">' + e.message + '</div>' +
        '<button id="gops-notif-err-close" style="padding:10px 20px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer;">إغلاق</button>' +
        '</div>';
      document.getElementById('gops-notif-err-close').onclick = function() { modal.remove(); };
    });
  }

  setInterval(injectSidebarButton, 3000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectSidebarButton);
  else injectSidebarButton();

})();
