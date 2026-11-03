// =====================================================================
// lang-toggle.js — زرار تبديل اللغة عربي/إنجليزي في هيدر الكابتن (d72)
// =====================================================================
// بنفس آلية زرار اللغة في الأدمن (admin/app.js): setLang من نظام i18n
// المركزي (core/i18n.js) + علم gops.lang.user='1' عشان initLang يحترم
// الاختيار الصريح دايمًا، وبعدها reload عشان كل النصوص تترسم باللغة الجديدة.
// ملاحظة مهمة: المفتاح هنا gops.lang — نفس مفتاح النظام المركزي (مش gops-lang).
// الزرار بيستخدم class theme-toggle زي زرار الوضع الليلي — شكل موحد في الهيدر.
// =====================================================================

import { h } from '../core/dom.js';
import { getLang, setLang } from '../core/i18n.js';

export function createLangToggle() {
  const LANGS = { en: 'عربي', ar: 'English' }; // بنعرض اسم اللغة اللي هنتقل لها
  const btn = h('button', {
    class: 'theme-toggle',
    id: 'btn-lang',
    type: 'button',
    'aria-label': 'Language / اللغة',
    title: 'Language / اللغة',
    on: {
      click: () => {
        const next = getLang() === 'ar' ? 'en' : 'ar';
        setLang(next); // بيحفظ gops.lang وبيظبط lang/dir على <html>
        try { localStorage.setItem('gops.lang.user', '1'); } catch (e) { /* ignore */ }
        globalThis.location.reload(); // النصوص بتترسم وقت البناء — إعادة التحميل بتضمن صفحة نظيفة بالكامل
      }
    }
  });
  btn.textContent = LANGS[getLang()] || 'عربي';
  return btn;
}
