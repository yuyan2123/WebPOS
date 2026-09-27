// Built separately and loaded before styles so the saved theme is applied before paint.
const themeKey = 'ginJiaPos.theme';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const modes = ['auto', 'light', 'dark'];
const labels = { auto: '跟隨系統', light: '淺色模式', dark: '深色模式' };
let preference = 'auto';
let themeTransitionTimer;
try {
  const saved = localStorage.getItem(themeKey);
  if (modes.includes(saved)) preference = saved;
} catch {
  // Theme switching remains available when storage is blocked.
}

function applyTheme() {
  const mode = preference === 'auto' ? (systemTheme.matches ? 'dark' : 'light') : preference;
  const root = document.documentElement;
  if (root.dataset.theme && root.dataset.theme !== mode) {
    clearTimeout(themeTransitionTimer);
    root.classList.add('theme-transitioning');
    themeTransitionTimer = setTimeout(() => root.classList.remove('theme-transitioning'), 300);
  }
  document.documentElement.dataset.theme = mode;
  document.documentElement.dataset.themePreference = preference;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'dark' ? '#14110f' : '#006973');
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    const next = modes[(modes.indexOf(preference) + 1) % modes.length];
    toggle.setAttribute('aria-label', `切換至${labels[next]}`);
    toggle.title = `目前：${labels[preference]}；切換至${labels[next]}`;
    document.getElementById('themeToggleStatus').textContent = `目前：${labels[preference]}`;
  }
}

applyTheme();
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    preference = modes[(modes.indexOf(preference) + 1) % modes.length];
    try {
      localStorage.setItem(themeKey, preference);
    } catch {
      /* Session-only preference. */
    }
    applyTheme();
  });
});
systemTheme.addEventListener('change', () => {
  if (preference === 'auto') applyTheme();
});
window.addEventListener('storage', (event) => {
  if (event.key !== themeKey && event.key !== null) return;
  preference = modes.includes(event.newValue) ? event.newValue : 'auto';
  applyTheme();
});
