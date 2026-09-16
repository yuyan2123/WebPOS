const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

test('certificate and installation page are public without Firebase or login', async ({ page, request }) => {
  const response = await request.get('/certs/printer-root-ca.cer');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/x-x509-ca-cert');
  expect(await response.body()).toEqual(readFileSync('public/certs/printer-root-ca.cer'));
  await page.goto('/certs/setup.html');
  await expect(page.getByRole('heading', { name: '出單機憑證', exact: true })).toBeVisible();
  expect(await page.locator('script[src*="firebase"], script[src*="rpc-bridge"]').count()).toBe(0);
});

for (const standalone of [false, true]) {
  test(`certificate link routes outside app scope in standalone=${standalone}`, async ({ page }) => {
    await page.addInitScript((standalone) => {
      Object.defineProperty(navigator, 'standalone', { value: standalone });
    }, standalone);
    await page.goto('/certs/setup.html');
    // Inspect the final navigation target without installing a profile on the test machine.
    await page.evaluate(() => document.addEventListener('click', (event) => event.preventDefault()));
    const link = page.locator('[data-printer-certificate]');
    await link.click();
    await expect(link).toHaveAttribute(
      'href',
      standalone
        ? 'https://webpos-14776.firebaseapp.com/certs/printer-root-ca.cer'
        : '/certs/printer-root-ca.cer',
    );
    await expect(link).toHaveAttribute('target', '_blank');
  });
}

test('login screen exposes certificate download before authentication', async ({ page }) => {
  await page.route('**/js/{app,rpc-bridge}.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await page.goto('/');
  await page.evaluate(() => {
    document.getElementById('startupStatus').hidden = true;
  });
  const source = readFileSync('public/js/rpc-bridge.js', 'utf8');
  await page.addScriptTag({
    content: source.replace(
      "document.addEventListener('DOMContentLoaded', function() {",
      "installAuthOverlay(); showAuthOverlay(); document.addEventListener('unused-test-event', function() {",
    ),
  });
  await expect(page.locator('#firebaseAuthOverlay [data-printer-certificate]')).toBeVisible();
  await expect(page.locator('#firebaseAuthOverlay [data-printer-certificate]')).toHaveAttribute(
    'href',
    '/certs/printer-root-ca.cer',
  );
});
