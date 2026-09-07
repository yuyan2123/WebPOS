const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

test.beforeEach(async ({ page }) => {
  const bridge = readFileSync('public/js/rpc-bridge.js', 'utf8');
  await page.route('**/js/rpc-bridge.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: bridge.replace(
        "document.addEventListener('DOMContentLoaded', function() {",
        `
      installAuthOverlay();
      installShopEventHandlers();
      activeUid = 'startup-user';
      document.body.dataset.userId = activeUid;
      window.startupCalls = [];
      firebaseStatePromise = Promise.resolve({
        auth: { currentUser: { uid: activeUid, emailVerified: true } },
        functionsSdk: { httpsCallable: () => (request) => {
          window.startupCalls.push(request);
          return new Promise((resolve, reject) => {
            window.completeStartup = () => resolve({ data: {
              shops: [{shopId:'shop-one',name:'測試店鋪',role:'owner'}],
              selectedShop: {shopId:'shop-one',name:'測試店鋪',role:'owner'},
              bootstrap: { products: [{productId:'P1',productName:'測試商品',category:'伴手禮',price:50,status:'啟用'}],
                capacityMonth: {key:request.args[1].year + '-' + request.args[1].month,data:{}} }
            } });
            window.failStartup = () => reject(new Error('測試連線中斷'));
          });
        } }
      });
      document.addEventListener('DOMContentLoaded', function() {`,
      ),
    }),
  );
});

test('one session request keeps real progress pending until data and draft restoration finish', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#startupProgress')).toHaveJSProperty('value', 1);
  await expect.poll(() => page.evaluate(() => window.startupCalls.length)).toBe(1);
  await expect(page.locator('#mainContent')).toHaveAttribute('inert', '');
  await expect(page.locator('.app-navigation')).toHaveAttribute('inert', '');
  await page.screenshot({ path: testInfo.outputPath('startup.png') });
  await page.evaluate(() => window.completeStartup());
  await expect(page.locator('#startupStatus')).toBeHidden();
  await expect(page.locator('#startupProgress')).toHaveJSProperty('value', 4);
  await page.locator('#customerName').fill('草稿客戶');
  await page.evaluate(() => window.saveOrderDraftNow());
  await page.reload();
  await expect.poll(() => page.evaluate(() => typeof window.completeStartup)).toBe('function');
  let acceptDraft;
  const draftDialog = new Promise((resolve) => {
    acceptDraft = resolve;
  });
  page.once('dialog', (dialog) => acceptDraft(dialog));
  await page.evaluate(() => window.completeStartup());
  const dialog = await draftDialog;
  expect(dialog.message()).toContain('未完成的訂單草稿');
  await dialog.accept();
  await expect(page.locator('#startupStatus')).toBeHidden();
  await expect(page.locator('#customerName')).toHaveValue('草稿客戶');
  expect(await page.evaluate(() => window.startupCalls.map((call) => call.method))).toEqual([
    'initializeSession',
  ]);
  await page.locator('#nav-date').click();
  await expect(page.locator('.calendar-day').first()).toBeVisible();
  expect(await page.evaluate(() => window.startupCalls.length)).toBe(1);
});

test('initial request failure stays below complete and offers retry without split fallback requests', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => typeof window.failStartup)).toBe('function');
  await page.evaluate(() => window.failStartup());
  await expect(page.locator('#startupRetry')).toBeVisible();
  await expect(page.locator('#startupMessage')).toContainText('測試連線中斷');
  await expect(page.locator('#startupProgress')).toHaveJSProperty('value', 1);
  await expect(page.locator('#mainContent')).toHaveAttribute('inert', '');
  expect(await page.evaluate(() => window.startupCalls.map((call) => call.method))).toEqual([
    'initializeSession',
  ]);
  await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#startupRetry').click()]);
  await expect.poll(() => page.evaluate(() => typeof window.completeStartup)).toBe('function');
  await page.evaluate(() => window.completeStartup());
  await expect(page.locator('#startupStatus')).toBeHidden();
});
