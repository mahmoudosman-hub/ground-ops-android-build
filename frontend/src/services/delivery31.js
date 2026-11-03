/**
 * Ground OPS - Delivery 31 v3 (Fixed Employee List)
 * d75: كل نصوص اللوحة من i18n (t()) — كانت عربي هاردكود بيظهر في النسخة الإنجليزية.
 */
import { t } from '../core/i18n.js'; // d75
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
    a.textContent = t('📢 Send notification');
    a.style.cssText = 'display:block;padding:10px 14px;color:inherit;text-decoration:none;cursor:pointer;font-weight:bold;margin-top:10px;border-top:1px solid #eee;';
    a.onclick = function(ev) { ev.preventDefault(); openNotifModal(); };
    nav.appendChild(a);
  }

  function openNotifModal() {
    var old = document.getElementById('gops-notif-modal');
    if (old) old.remove();

    var sess = getSession();
    if (!sess) { alert(t('Session ended, please sign in again.')); return; }
    
    var token = sess.token;
    var apiUrl = window.API_URL || window.GOPS_CONFIG?.API_URL || window.CONFIG?.API_URL;

    // شاشة تحميل مؤقتة لحد ما نلاقي الموظفين
    var modal = document.createElement('div');
    modal.id = 'gops-notif-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = '<div style="color:#fff;font:16px system-ui;">' + t('Loading the list...') + '</div>';
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
      
      var empOpts = '<option value="">' + t('-- Select captain --') + '</option>' + emps.map(function(e) { return '<option value="' + e.employee_id + '">' + e.employee_name + ' (' + e.employee_id + ')</option>'; }).join('');
      var branchOpts = '<option value="">' + t('-- Select branch --') + '</option>' + branches.map(function(b) { return '<option value="' + b.branch_id + '">' + b.branch_name + '</option>'; }).join('');

      modal.innerHTML = 
        '<div style="background:#fff;border-radius:12px;max-width:500px;width:100%;padding:20px;font:15px/1.5 system-ui,sans-serif;color:#111;">' +
          '<h2 style="margin:0 0 15px;">' + t('📢 Send custom notification') + '</h2>' +
          
          '<label style="display:block;margin-bottom:10px;font-weight:600;">' + t('Recipient:') + '</label>' +
          '<select id="gops-notif-target" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;">' +
            '<option value="ALL">' + t('👥 All captains') + '</option>' +
            '<option value="BRANCH">' + t('🏢 Specific branch') + '</option>' +
            '<option value="EMPLOYEE">' + t('👤 Specific captain') + '</option>' +
          '</select>' +

          '<div id="gops-notif-branch-wrap" style="display:none; margin-bottom:15px;">' +
            '<label style="display:block;margin-bottom:10px;font-weight:600;">' + t('Choose branch:') + '</label>' +
            '<select id="gops-notif-branch" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">' + branchOpts + '</select>' +
          '</div>' +

          '<div id="gops-notif-emp-wrap" style="display:none; margin-bottom:15px;">' +
            '<label style="display:block;margin-bottom:10px;font-weight:600;">' + t('Choose captain:') + '</label>' +
            '<select id="gops-notif-emp" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">' + empOpts + '</select>' +
          '</div>' +

          '<label style="display:block;margin-bottom:10px;font-weight:600;">' + t('Notification type (template):') + '</label>' +
          '<select id="gops-notif-type" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;">' +
            '<option value="update">' + t('App update (link)') + '</option>' +
            '<option value="missed_selfie">' + t('Missed selfie check') + '</option>' +
            '<option value="long_break">' + t('Long break') + '</option>' +
            '<option value="custom">' + t('Custom message') + '</option>' +
          '</select>' +

          '<label style="display:block;margin-bottom:10px;font-weight:600;">' + t('Message title:') + '</label>' +
          '<input type="text" id="gops-notif-title" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;" placeholder="' + t('Write the title here...') + '">' +
          
          '<label style="display:block;margin-bottom:10px;font-weight:600;">' + t('Message body:') + '</label>' +
          '<textarea id="gops-notif-body" rows="3" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;" placeholder="' + t('Write the message body here...') + '"></textarea>' +
          
          '<label style="display:block;margin-bottom:10px;font-weight:600;">' + t('Link (optional - for the update):') + '</label>' +
          '<input type="text" id="gops-notif-url" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:8px;" placeholder="https://...">' +
          
          '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button id="gops-notif-cancel" style="padding:10px 20px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;">' + t('Cancel') + '</button>' +
            '<button id="gops-notif-send" style="padding:10px 20px;border:0;border-radius:8px;background:#0a84ff;color:#fff;font-weight:bold;cursor:pointer;">' + t('Send notification') + '</button>' +
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
        if (v === 'update') { titleIn.value = t('New app update'); bodyIn.value = t('Please update the app now to get the latest features.'); urlIn.value = 'https://mahmoudosman-hub.github.io/ground-ops-frontend/index.html'; }
        else if (v === 'missed_selfie') { titleIn.value = t('📸 You missed a selfie check'); bodyIn.value = t('Please open the app and take a selfie now.'); urlIn.value = ''; }
        else if (v === 'long_break') { titleIn.value = t('☕ Long break'); bodyIn.value = t('You exceeded the allowed break time. Please return to work.'); urlIn.value = ''; }
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

        if (!payload.title || !payload.body) { errDiv.textContent = t('Please write a title and a message body.'); return; }

        sendBtn.disabled = true;
        sendBtn.textContent = t('Sending...');
        errDiv.textContent = '';

        fetch(apiUrl, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'sendAdminNotification', token: token, payload: payload, client: 'admin-notif' })
        }).then(function(r) { return r.json(); }).then(function(res) {
          if (res.success) {
            errDiv.style.color = '#1e8e3e'; 
            errDiv.textContent = t('✅ Sent successfully to {n} devices!', { n: res.data.sent }); 
            setTimeout(function() { modal.remove(); }, 2000);
          } else {
            errDiv.style.color = '#c00'; 
            errDiv.textContent = res.message; 
            sendBtn.disabled = false;
            sendBtn.textContent = t('Send notification');
          }
        }).catch(function() {
          errDiv.style.color = '#c00'; 
          errDiv.textContent = t('Server connection error.'); 
          sendBtn.disabled = false;
          sendBtn.textContent = t('Send notification');
        });
      };
    }).catch(function(e) {
      modal.innerHTML = '<div style="background:#fff;padding:20px;border-radius:12px;text-align:center;">' +
        '<div style="color:#c00;font-weight:bold;margin-bottom:10px;">' + t('Failed to load the list') + '</div>' +
        '<div style="font-size:13px;color:#666;margin-bottom:15px;">' + e.message + '</div>' +
        '<button id="gops-notif-err-close" style="padding:10px 20px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer;">' + t('Close') + '</button>' +
        '</div>';
      document.getElementById('gops-notif-err-close').onclick = function() { modal.remove(); };
    });
  }

  setInterval(injectSidebarButton, 3000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectSidebarButton);
  else injectSidebarButton();

})();
