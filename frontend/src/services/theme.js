// =====================================================================  
// theme.js — Dark Mode toggle (d70)  
// =====================================================================

export function initTheme() {  
  const saved = localStorage.getItem('gops-theme');  
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  // زرار Dark Mode في الهيدر  
  const btn = document.createElement('button');  
  btn.className = 'theme-toggle';  
  btn.setAttribute('aria-label', 'Toggle dark mode');  
  btn.textContent = isDark() ? '☀️' : '🌙';  
  btn.onclick = () => {  
    const next = isDark() ? 'light' : 'dark';  
    document.documentElement.setAttribute('data-theme', next);  
    localStorage.setItem('gops-theme', next);  
    btn.textContent = next === 'dark' ? '☀️' : '🌙';  
  };  
  return btn;  
}

function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  // Auto Dark: مفيش اختيار محفوظ → اتبع إعداد الموبايل نفسه
  return !!(globalThis.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
}
