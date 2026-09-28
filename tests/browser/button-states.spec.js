const { test, expect } = require('@playwright/test');
const { buildSync } = require('esbuild');
const { readFileSync } = require('node:fs');

const feedback = buildSync({
  entryPoints: ['src/app/feedback.js'],
  bundle: true,
  write: false,
  format: 'esm',
  footer: { js: 'window.buttonFeedback = { setButtonLoading };' },
}).outputFiles[0].text;

test('account and printer icons stay circular in the account badge', async ({ page }, testInfo) => {
  const bridge = readFileSync('public/js/rpc-bridge.js', 'utf8');
  const markup = bridge.match(/badge.innerHTML = `([\s\S]*?)`;/)[1];
  await page.setContent(
    `<meta name="viewport" content="width=device-width, initial-scale=1"><body class="gj-ui"><main></main><div id="firebaseAccountBadge" class="active">${markup}</div></body>`,
  );
  await page.addStyleTag({ content: readFileSync('public/css/app.css', 'utf8') });
  await page.addStyleTag({ content: bridge.match(/style.textContent = `([\s\S]*?)`;/)[1] });
  await page.locator('#firebaseShopButton').evaluate((el) => {
    el.textContent = '金家餅店';
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const showPrinter of [false, true]) {
      await page.locator('#firebasePrinterStatus').evaluate((el, show) => {
        el.hidden = !show;
      }, showPrinter);
      for (const id of showPrinter
        ? ['firebaseAccountToggle', 'firebasePrinterStatus']
        : ['firebaseAccountToggle']) {
        const button = page.locator('#' + id);
        const box = await button.boundingBox();
        expect(box.width).toBeCloseTo(48, 2);
        expect(box.height).toBeCloseTo(48, 2);
        await expect(button).toHaveCSS('border-radius', '50%');
      }
    }
    await page.screenshot({ path: testInfo.outputPath(`account-${theme}.png`) });
  }
});

test('pressed and loading labels retain each action palette in both themes', async ({ page }) => {
  await page.route('**/button-states.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><link rel="stylesheet" href="/css/app.css"></head><body class="gj-ui"><main></main></body></html>',
    }),
  );
  await page.goto('/button-states.html');
  await page.addScriptTag({ content: feedback, type: 'module' });
  for (const theme of ['light', 'dark']) {
    for (const variant of ['primary', 'danger', 'tonal', 'quiet']) {
      await page.evaluate(
        ({ theme, variant }) => {
          document.documentElement.dataset.theme = theme;
          document.querySelector('main').innerHTML =
            `<button class="gj-btn gj-btn--${variant}"><span>Save</span></button>`;
        },
        { theme, variant },
      );
      const button = page.locator('main button');
      const ink = await button.evaluate((el) => getComputedStyle(el).color);
      await button.hover();
      await page.mouse.down();
      await expect(button).toHaveCSS('color', ink);
      await page.mouse.up();
      await button.evaluate((el) => window.buttonFeedback.setButtonLoading(el, true, 'Saving…'));
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('aria-busy', 'true');
      const loading = await button.evaluate((el) => {
        const label = getComputedStyle(el, '::after');
        return {
          color: label.color,
          background: label.backgroundColor,
          opacity: label.opacity,
          content: label.content,
        };
      });
      expect(loading.color).toBe(ink);
      expect(loading.color).not.toBe(loading.background);
      expect(loading.opacity).toBe('1');
      expect(loading.content).toBe('"Saving…"');
      await expect(button).toHaveCSS('opacity', '1');
      await button.evaluate((el) => window.buttonFeedback.setButtonLoading(el, false));
      await expect(button).toBeEnabled();
      await expect(button).toHaveText('Save');
      await expect(button).toHaveCSS('color', ink);
    }
  }
});
