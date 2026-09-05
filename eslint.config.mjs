import js from "@eslint/js";
import globals from "globals";
export default [
  {
    ignores: [
      "node_modules/**",
      "functions/node_modules/**",
      "target/**",
      "public/js/app.js",
      "**/wasm/**",
      "public/vendor/**",
      "legacy-apps-script/**",
      "artifacts/**",
    ],
  },
  {
    files: [
      "src/**/*.js",
      "scripts/**/*.mjs",
      "tests/**/*.js",
      "functions/src/**/*.js",
      "functions/test/**/*.js",
      "public/js/*.js",
      "public/sw.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, AirDatepicker: "readonly", google: "readonly" },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "off",
    },
  },
];
