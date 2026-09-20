const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

async function openManager(page) {
  await page.goto('/');
  await page.evaluate(() => {
    document.getElementById('startupStatus').hidden = true;
  });
  const source = readFileSync('public/js/rpc-bridge.js', 'utf8');
  // Exercise the real bridge UI with a controllable RPC, without Firebase credentials.
  await page.route('**/__test__/shop-manager.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: source.replace(
      "document.addEventListener('DOMContentLoaded', function() {",
      `installAuthOverlay();
    installShopEventHandlers();
    activeShop = { shopId: 'test-shop', name: '測試店鋪', role: 'owner' };
    availableShops = [activeShop];
    firebaseStatePromise = Promise.resolve({
      auth: { currentUser: { emailVerified: true } },
      functionsSdk: { httpsCallable: () => ({ method }) => new Promise((resolve, reject) => {
        window.pendingShopRpc = { method, resolve: data => resolve({ data }), reject };
        window.shopRpcCount = (window.shopRpcCount || 0) + 1;
      }) }
    });
    setAccountBadgeVisible(true);
    document.addEventListener('unused-test-event', function() {`,
    ),
  }));
  await page.addScriptTag({ url: '/__test__/shop-manager.js' });
  await page.locator('#firebaseShopButton').click();
}

test.beforeEach(async ({ page }) => {
  // Isolate the bridge: app startup awaits WASM, then makes its own RPCs.
  // Those calls can otherwise race with the manager's deferred RPC in WebKit.
  await page.route('**/js/{app,rpc-bridge}.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
});

test('shop manager opens before RPC completes and stays closed after dismissal', async ({ page }) => {
  await openManager(page);
  await expect(page.locator('#firebaseShopOverlay')).toHaveClass('active');
  await expect(page.locator('#firebaseShopLoading')).toBeVisible();
  await expect(page.locator('.firebase-loading-dots span')).toHaveCount(3);
  await page.evaluate(() => document.getElementById('firebaseShopButton').click());
  expect(await page.evaluate(() => window.shopRpcCount)).toBe(1);
  await page.evaluate(() =>
    window.pendingShopRpc.resolve([{ shopId: 'test-shop', name: '測試店鋪', role: 'owner' }]),
  );
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('listShopMembers');
  await expect(page.locator('#firebaseShopLoading')).toBeVisible();
  await page.locator('#firebaseShopClose').click();
  await page.evaluate(() => window.pendingShopRpc.resolve([]));
  await expect(page.locator('#firebaseShopLoading')).toBeHidden();
  await expect(page.locator('#firebaseShopOverlay')).not.toHaveClass('active');
});

test('failed shop refresh clears loading and can be retried', async ({ page }) => {
  await openManager(page);
  await page.evaluate(() => window.pendingShopRpc.reject(new Error('測試連線中斷')));
  await expect(page.locator('#firebaseShopMessage')).toHaveText('測試連線中斷');
  await expect(page.locator('#firebaseShopLoading')).toBeHidden();
  await expect(page.locator('#firebaseShopList')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#firebaseShopClose').click();
  await page.locator('#firebaseShopButton').click();
  await expect(page.locator('#firebaseShopLoading')).toBeVisible();
  await expect(page.locator('#firebaseShopMessage')).toBeEmpty();
  await page.evaluate(() => window.pendingShopRpc.resolve([]));
  await expect(page.locator('#firebaseShopLoading')).toBeHidden();
  await expect(page.locator('#firebaseShopList')).toContainText('尚未建立店鋪');
});
