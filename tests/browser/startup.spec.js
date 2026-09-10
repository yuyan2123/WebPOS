const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ginJiaPos.activeShop.startup-user', 'shop-one');
  });
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
          if (request.method === 'getShopBootstrap') return Promise.resolve({ data: {
            products: [{productId:'P1',productName:'測試商品',category:'伴手禮',price:50,status:'啟用'}],
            capacityMonth: {key:request.args[0] + '-' + request.args[1],data:{}}
          } });
          return new Promise((resolve, reject) => {
            window.completeStartup = () => resolve({ data: {
              shops: [{shopId:'shop-one',name:'測試店鋪',role:'owner'},
                ...(window.startupSingleShop ? [] : [{shopId:'shop-two',name:'第二家店鋪',role:'viewer'}])],
              selectedShop: request.args[1].shopId === 'shop-one' || window.startupSingleShop ? {shopId:'shop-one',name:'測試店鋪',role:'owner'} : null,
              bootstrap: request.args[1].shopId === 'shop-one' || window.startupSingleShop ? { products: [{productId:'P1',productName:'測試商品',category:'伴手禮',price:50,status:'啟用'}],
                capacityMonth: {key:request.args[1].year + '-' + request.args[1].month,data:{}} } : null
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

for (const savedShop of [null, 'unavailable-shop']) {
  test(`automatically loads the only shop when saved shop is ${savedShop}`, async ({ page }) => {
    await page.addInitScript((saved) => {
      window.startupSingleShop = true;
      const key = 'ginJiaPos.activeShop.startup-user';
      if (saved) localStorage.setItem(key, saved);
      else localStorage.removeItem(key);
    }, savedShop);
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => typeof window.completeStartup)).toBe('function');
    await page.evaluate(() => window.completeStartup());
    await expect(page.locator('#startupStatus')).toBeHidden();
    await expect(page.locator('#firebaseShopOverlay')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-shop-id', 'shop-one');
    expect(await page.evaluate(() => localStorage.getItem('ginJiaPos.activeShop.startup-user'))).toBe(
      'shop-one',
    );
    expect(await page.evaluate(() => window.startupCalls.map((call) => call.method))).toEqual([
      'initializeSession',
    ]);
  });

  test(`requires explicit shop selection when saved shop is ${savedShop}`, async ({ page }) => {
    await page.addInitScript((saved) => {
      const key = 'ginJiaPos.activeShop.startup-user';
      if (saved) localStorage.setItem(key, saved);
      else localStorage.removeItem(key);
    }, savedShop);
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => typeof window.completeStartup)).toBe('function');
    await page.evaluate(() => window.completeStartup());
    await expect(page.locator('#firebaseShopOverlay')).toBeVisible();
    await expect(page.locator('#firebaseShopClose')).toBeDisabled();
    await expect(page.locator('#mainContent')).toHaveAttribute('inert', '');
    expect(await page.evaluate(() => window.startupCalls.map((call) => call.method))).toEqual([
      'initializeSession',
    ]);
    await page.locator('.firebase-shop-option[data-shop-id="shop-one"]').click();
    await expect(page.locator('#startupStatus')).toBeHidden();
    await expect(page.locator('#firebaseShopOverlay')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('ginJiaPos.activeShop.startup-user'))).toBe(
      'shop-one',
    );
    expect(await page.evaluate(() => window.startupCalls.map((call) => call.method))).toEqual([
      'initializeSession',
      'getShopBootstrap',
    ]);
  });
}

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

test('update reload message is consumed once and normal reload restores loading text', async ({ page }) => {
  await page.addInitScript(() => {
    const serviceWorker = new EventTarget();
    const registration = new EventTarget();
    serviceWorker.controller = {};
    registration.waiting = {
      postMessage: () => serviceWorker.dispatchEvent(new Event('controllerchange')),
    };
    serviceWorker.register = async () => registration;
    Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker });
  });
  await page.goto('/');
  await expect(page.locator('#startupMessage')).toHaveText('取得資料中...');
  await expect.poll(() => page.evaluate(() => typeof window.completeStartup)).toBe('function');
  await page.evaluate(() => window.completeStartup());
  await expect(page.locator('#startupStatus')).toBeHidden();
  await page.locator('#pwaUpdate').click();
  await expect(page.locator('#startupStatus')).toBeVisible();
  await expect(page.locator('#startupMessage')).toHaveText('更新中...');
  expect(await page.evaluate(() => sessionStorage.getItem('ginJiaPos.updateReload'))).toBeNull();
  await page.reload();
  await expect(page.locator('#startupMessage')).toHaveText('取得資料中...');
});
