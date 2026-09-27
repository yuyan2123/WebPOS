"use strict";
(() => {
  // src/ui/theme.js
  var themeKey = "ginJiaPos.theme";
  var systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  var modes = ["auto", "light", "dark"];
  var labels = { auto: "\u8DDF\u96A8\u7CFB\u7D71", light: "\u6DFA\u8272\u6A21\u5F0F", dark: "\u6DF1\u8272\u6A21\u5F0F" };
  var preference = "auto";
  var themeTransitionTimer;
  try {
    const saved = localStorage.getItem(themeKey);
    if (modes.includes(saved)) preference = saved;
  } catch {
  }
  function applyTheme() {
    const mode = preference === "auto" ? systemTheme.matches ? "dark" : "light" : preference;
    const root = document.documentElement;
    if (root.dataset.theme && root.dataset.theme !== mode) {
      clearTimeout(themeTransitionTimer);
      root.classList.add("theme-transitioning");
      themeTransitionTimer = setTimeout(() => root.classList.remove("theme-transitioning"), 300);
    }
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.themePreference = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#14110f" : "#006973");
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
      const next = modes[(modes.indexOf(preference) + 1) % modes.length];
      toggle.setAttribute("aria-label", `\u5207\u63DB\u81F3${labels[next]}`);
      toggle.title = `\u76EE\u524D\uFF1A${labels[preference]}\uFF1B\u5207\u63DB\u81F3${labels[next]}`;
      document.getElementById("themeToggleStatus").textContent = `\u76EE\u524D\uFF1A${labels[preference]}`;
    }
  }
  applyTheme();
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    document.getElementById("themeToggle")?.addEventListener("click", () => {
      preference = modes[(modes.indexOf(preference) + 1) % modes.length];
      try {
        localStorage.setItem(themeKey, preference);
      } catch {
      }
      applyTheme();
    });
  });
  systemTheme.addEventListener("change", () => {
    if (preference === "auto") applyTheme();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== themeKey && event.key !== null) return;
    preference = modes.includes(event.newValue) ? event.newValue : "auto";
    applyTheme();
  });
})();
