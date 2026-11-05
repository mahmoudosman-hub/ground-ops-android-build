/** d84: الرسائل الجاهزة — حفظ تيمبلتس وإرسالها للكباتن كإشعار داخلي + Push (سيرفر S29).
 *  d87: زرار «⚡ زقّة قوية» — إرسال ntfy موجه لأولوية Max لقناة الكابتن الخاصة (سيرفر S32). */
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { button, openModal, buildForm, toast, toastError, confirmDialog, spinner, errorBox } from '../../components/ui.js';

export async function messagesPage(ctx) {
  const l = await ctx.lookups.load();
  const box = h('div', {}, spinner());

  function editorModal(existing, reload) {
    const m = openModal({ title: existing ? t('Edit template') : t('New template'), body: null });
    const f = buildForm([
      { name: 'title', label: t('Template title'), type: 'text', required: true, maxlength: 120 },
      { name: 'body', label: t('Message body'), type: 'textarea', required: true, maxlength: 400 }
    ], existing ? { title: existing.title, body: existing.body } : {}, {
      submitLabel: t('Save'), cancel: () => m.close(),
      onSubmit: async (v) => {
        try {
          await ctx.api.call('saveMessageTemplate', { template_id: existing ? existing.template_id : undefined, title: v.title, body: v.body });
          m.close(); toast(t('Template saved'), 'ok'); reload();
        } catch (e) { toastError(e); }
      }
    });
    m.setBody(f.el);
  }

  // d87: مودال «زقّة قوية» — ntfy لقناة الكابتن الخاصة (أولوية Max افتراضيًا)
  async function zapModal(tpl, reload) {
    let targets = null;
    try {
      const ul = await ctx.api.call('ntfyUserList', {});
      targets = (ul.users || []).filter((u) => u.has_topic);
    } catch (e) {
      toastError(e); return;
    }
    if (!targets.length) { toast(t('No captain has a channel yet. Generate channels from the ntfy card in Settings.'), 'warn'); return; }
    const m = openModal({ title: t('⚡ Loud push') + (tpl ? ': ' + tpl.title : ''), body: null });
    const f = buildForm([
      { name: 'target', label: t('Send to:'), type: 'select', required: true, options: [
        { value: 'ALL', label: t('All captains with a channel') + ` (${targets.length})` },
        ...targets.map((u) => ({ value: u.employee_id, label: `${u.employee_id} ${u.employee_name}` }))
      ] },
      { name: 'title', label: t('Title'), type: 'text', required: true, maxlength: 120 },
      { name: 'message', label: t('Message'), type: 'textarea', required: true, maxlength: 900 },
      { name: 'priority', label: t('Priority'), type: 'select', required: true, options: [
        { value: 'max', label: t('Max (urgent)') },
        { value: 'high', label: t('High') },
        { value: 'default', label: t('Normal') }
      ] }
    ], {
      target: 'ALL',
      title: tpl ? tpl.title : '',
      message: tpl ? tpl.body : '',
      priority: 'max'
    }, {
      submitLabel: t('⚡ Loud push'), cancel: () => m.close(),
      onSubmit: async (v) => {
        if (!(await confirmDialog(t('Send this as a loud ntfy push (max priority)?')))) return;
        try {
          const r = await ctx.api.call('ntfyUserSend', {
            target_all: v.target === 'ALL' || undefined,
            employee_id: v.target === 'ALL' ? undefined : v.target,
            title: v.title, message: v.message, priority: v.priority
          });
          m.close();
          toast(t('Loud push sent: {a} ok / {b} failed', { a: r.sent, b: r.failed }), r.failed ? 'warn' : 'ok');
          if (reload) reload();
        } catch (e) { toastError(e); }
      }
    });
    m.setBody(h('div', {}, tpl ? h('p', { class: 'hint' }, tpl.body) : null, f.el));
  }

  function sendModal(tpl, reload) {
    const m = openModal({ title: t('Send') + ': ' + tpl.title, body: null });
    const f = buildForm([
      { name: 'target', label: t('Send to:'), type: 'select', required: true, options: [
        { value: 'ALL', label: t('All active captains') },
        ...l.employees.filter((e) => e.status === 'ACTIVE').map((e) => ({ value: e.employee_id, label: `${e.employee_id} ${e.employee_name}` }))
      ] }
    ], { target: 'ALL' }, {
      submitLabel: t('Send'), cancel: () => m.close(),
      onSubmit: async (v) => {
        if (!(await confirmDialog(t('Send "{t}" as a notification + push?', { t: tpl.title })))) return;
        try {
          const r = await ctx.api.call('sendTemplateMessage', { template_id: tpl.template_id, target_employee_id: v.target === 'ALL' ? undefined : v.target });
          m.close(); toast(t('Message sent to {n} captain(s)', { n: r.sent }), 'ok'); reload();
        } catch (e) { toastError(e); }
      }
    });
    m.setBody(h('div', {}, h('p', { class: 'hint' }, tpl.body), f.el));
  }

  async function load() {
    box.replaceChildren(spinner());
    try {
      const { items } = await ctx.api.call('getMessageTemplates', {});
      if (!items.length) {
        box.replaceChildren(h('p', { class: 'hint' }, t('No templates yet. Add your first one.')),
          button(t('New template'), { kind: 'primary', id: 'btn-new-template-empty', on: { click: () => editorModal(null, load) } }));
        return;
      }
      const cards = items.map((tpl) => h('div', { class: 'card', id: `tpl-${tpl.template_id}`, style: 'margin-bottom:12px' },
        h('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
          h('strong', { style: 'font-size:1.05rem' }, tpl.title),
          h('span', { style: 'flex:1' }),
          button(t('Send'), { kind: 'primary', small: true, on: { click: () => sendModal(tpl, load) } }),
          button(t('⚡ Loud push'), { kind: 'primary', small: true, on: { click: () => zapModal(tpl, load) } }),
          button(t('Edit'), { small: true, on: { click: () => editorModal(tpl, load) } }),
          button(t('Delete'), { small: true, kind: 'danger', on: { click: async () => {
            if (!(await confirmDialog(t('Delete template?'), { danger: true }))) return;
            try { await ctx.api.call('deleteMessageTemplate', { template_id: tpl.template_id }); toast(t('Template deleted'), 'ok'); load(); } catch (e) { toastError(e); }
          } } })
        ),
        h('p', { class: 'hint', style: 'margin:8px 0 0;white-space:pre-wrap' }, tpl.body)
      ));
      box.replaceChildren(
        h('div', { style: 'margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap' },
          button(t('New template'), { kind: 'primary', id: 'btn-new-template', on: { click: () => editorModal(null, load) } }),
          button(t('⚡ Loud push'), { id: 'btn-zap-free', on: { click: () => zapModal(null, load) } })
        ),
        ...cards
      );
    } catch (e) { box.replaceChildren(errorBox(e)); }
  }

  load();
  return {
    el: h('div', {},
      h('h1', {}, t('Ready Messages')),
      h('p', { class: 'hint' }, t('Save message templates and send them to captains as an in-app notification with an instant push.')),
      h('p', { class: 'hint' }, t('⚡ Loud push sends a max-priority ntfy notification to a captain\'s private channel — it rings even when their app is closed. Channels are managed from the ntfy card in Settings.')),
      box
    )
  };
}
