module.exports = {
  content: ["./public/index.html", "./src/**/*.{js,ts}", "./public/js/rpc-bridge.js", "./public/js/pwa.js"],
  theme: {
    extend: {
      // The UI kit owns the palette. Utilities resolve these roles in either theme.
      colors: {
        md: Object.fromEntries(
          [
            "primary",
            "on-primary",
            "primary-container",
            "on-primary-container",
            "secondary",
            "on-secondary",
            "secondary-container",
            "on-secondary-container",
            "tertiary",
            "tertiary-container",
            "on-tertiary-container",
            "surface",
            "surface-container-lowest",
            "surface-container-low",
            "surface-container",
            "surface-container-high",
            "surface-container-highest",
            "on-surface",
            "on-surface-variant",
            "outline",
            "outline-variant",
            "error",
            "on-error",
            "error-container",
            "on-error-container",
            "inverse-surface",
            "inverse-on-surface",
          ]
            .map((role) => [role, `var(--md-sys-color-${role})`])
            .concat([
              ["content", "var(--gj-surface)"],
              ["success", "var(--gj-success)"],
              ["success-container", "var(--gj-success-soft)"],
              ["warning", "var(--gj-warning)"],
              ["warning-container", "var(--gj-warning-soft)"],
            ]),
        ),
        "md-primary-hover": "var(--gj-primary-hover)",
        "md-error-hover": "var(--gj-danger-hover)",
      },
      fontFamily: { sans: ["Roboto", "Noto Sans TC", "Segoe UI", "Microsoft JhengHei", "sans-serif"] },
    },
  },
  corePlugins: { preflight: false },
};
