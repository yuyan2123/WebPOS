const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  retries: 0,
  workers: 3,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", serviceWorkers: "block" },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "tablet", use: { browserName: "chromium", viewport: { width: 820, height: 1180 } } },
    {
      name: "phone",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: "webkit", use: { browserName: "webkit", viewport: { width: 820, height: 1180 } } },
  ],
});
