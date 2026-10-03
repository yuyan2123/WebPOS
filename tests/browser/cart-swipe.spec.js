const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { writeFileSync } = require('node:fs');

async function openCart(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/js/rpc-bridge.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `document.body.dataset.userId = 'swipe-user';
      document.body.dataset.shopId = 'swipe-shop';
      document.body.dataset.shopRole = 'owner';
      const products = [
        {productId:'P1',productName:'原味餅',category:'伴手禮',price:50,status:'啟用',giftBoxEnabled:'是'},
        {productId:'P2',productName:'喜餅',category:'喜餅',price:100,status:'啟用',giftBoxEnabled:'是'}
      ];
      window.posApi = {call:async (method,args) => {
        if (method === 'getShopBootstrap') return {products,capacityMonth:{key:args[0]+'-'+args[1],data:{}},capacitySettings:{weekday:{},dateOverrides:[]}};
        if (method === 'getProducts') return products;
        if (method === 'getMonthCapacityStatus') return {};
        if (method === 'searchCustomers') return [];
        return {success:true};
      }};`,
    }),
  );
  await page.goto('/');
  await expect(page.locator('#startupStatus')).toBeHidden({ timeout: 20_000 });
  await page.locator('#nav-gift').click();
  for (const name of ['原味餅', '喜餅']) {
    await page.getByRole('button', { name: `加入 ${name} 到購物車`, exact: true }).click();
  }
  await page.locator('#workspaceCart').click();
  await settle(page);
  return errors;
}
async function settle(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
}
async function startDrag(page, row) {
  await settle(page);
  const box = await row.boundingBox();
  const start = { x: box.x + box.width - 24, y: box.y + 30, width: box.width };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  return start;
}

test('cart delete requires a second action and Escape returns to the same item', async ({
  page,
}, testInfo) => {
  const errors = await openCart(page);
  const row = page.locator('[data-cart-item-key]').first();
  const opener = row.locator('.cart-item-options');
  await expect(row.getByText('更多', { exact: true })).toHaveCount(0);
  await expect(row.locator('.cart-swipe-delete')).toBeHidden();
  await opener.click();
  await expect(row.locator('.cart-swipe-delete')).toBeFocused();
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await expect(page.locator('#cartTotalAmount')).toHaveText('150');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    await settle(page);
    const result = await new AxeBuilder({ page }).include('#cartModal').analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`cart-delete-${theme}.png`) });
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#cartModal')).toBeVisible();
  await expect(opener).toBeFocused();
  await opener.press('Enter');
  await row.locator('.cart-swipe-delete').press('Enter');
  await expect(page.locator('#workspaceQuantity')).toHaveText('1 件商品');
  await expect(page.locator('#cartTotalAmount')).toHaveText('100');
  await expect(page.locator('[data-cart-item-key] .cart-item-name')).toHaveText('喜餅');
  await expect(page.locator('[data-cart-item-key] .cart-item-options')).toBeFocused();
  await expect(page.locator('.cart-removal-ghost')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('cart short swipes reveal delete and continuous full swipes delete only on release', async ({
  page,
}) => {
  const errors = await openCart(page);
  let row = page.locator('[data-cart-item-key]').first();
  let start = await startDrag(page, row);
  await page.mouse.move(start.x - 80, start.y + 6, { steps: 8 });
  await page.mouse.up();
  await expect(row).toHaveClass(/is-swipe-open/);
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await page.keyboard.press('Escape');
  await expect(row).not.toHaveClass(/is-swipe-open/);
  start = await startDrag(page, row);
  await page.mouse.move(start.x - 88, start.y, { steps: 5 });
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await page.mouse.move(start.x - start.width * 0.82, start.y + 12, { steps: 8 });
  await expect(row).toHaveClass(/is-swipe-armed/);
  await expect(row.locator('.cart-swipe-delete span')).toHaveText('放開刪除');
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await page.mouse.up();
  await expect(page.locator('#workspaceQuantity')).toHaveText('1 件商品');
  row = page.locator('[data-cart-item-key]').first();
  start = await startDrag(page, row);
  await page.mouse.move(start.x - start.width * 0.82, start.y, { steps: 8 });
  await expect(row).toHaveClass(/is-swipe-armed/);
  await page.mouse.move(start.x - 12, start.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#workspaceQuantity')).toHaveText('1 件商品');
  await expect(row).not.toHaveClass(/is-swipe-open|is-swipe-armed/);
  expect(errors).toEqual([]);
});

test('cart deletion fades and slides, keeps rapid removals safe and respects reduced motion', async ({
  page,
}) => {
  const errors = await openCart(page);
  await page.locator('[data-cart-item-key] .cart-item-options').first().click();
  await page.evaluate(() => {
    document.querySelector('[data-cart-item-key] .cart-swipe-delete').click();
    const animation = document.querySelector('.cart-removal-ghost').getAnimations()[0];
    animation.pause();
    animation.currentTime = 80;
  });
  await expect(page.locator('#workspaceQuantity')).toHaveText('1 件商品');
  const middle = await page.locator('.cart-removal-ghost').evaluate((element) => ({
    opacity: +getComputedStyle(element).opacity,
    x: new DOMMatrix(getComputedStyle(element).transform).m41,
  }));
  expect(middle.opacity).toBeGreaterThan(0);
  expect(middle.opacity).toBeLessThan(1);
  expect(middle.x).toBeLessThan(0);
  await page.locator('[data-cart-item-key] .cart-item-options').click();
  await page.locator('[data-cart-item-key] .cart-swipe-delete').click();
  await expect(page.locator('#workspaceQuantity')).toHaveText('0 件商品');
  await page.evaluate(() =>
    document
      .querySelectorAll('.cart-removal-ghost')
      .forEach((element) => element.getAnimations().forEach((animation) => animation.finish())),
  );
  await expect(page.locator('.cart-removal-ghost')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '加入 原味餅 到購物車', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#workspaceCart').click();
  await page.locator('.cart-item-options').click();
  await page.locator('.cart-swipe-delete').click();
  await expect(page.locator('.cart-removal-ghost')).toHaveCount(0);
  await expect(page.locator('#cartModalBody')).toContainText('購物車是空的');
  expect(errors).toEqual([]);
});

test('cart swipes cancel on model changes, pointer cancellation and drawer dismissal', async ({ page }) => {
  const errors = await openCart(page);
  let row = page.locator('[data-cart-item-key]').first();
  let start = await startDrag(page, row);
  await page.mouse.move(start.x - start.width * 0.8, start.y, { steps: 6 });
  await expect(row).toHaveClass(/is-swipe-armed/);
  await row.evaluate((element) =>
    element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })),
  );
  await page.mouse.up();
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  row = page.locator('[data-cart-item-key]').first();
  start = await startDrag(page, row);
  await page.mouse.move(start.x - start.width * 0.8, start.y, { steps: 6 });
  await page.evaluate(() => window.updateCartItemQuantity(0, 1));
  await page.mouse.up();
  await expect(page.locator('#workspaceQuantity')).toHaveText('3 件商品');
  await page.locator('[data-cart-item-key] .cart-item-options').first().click();
  await page.locator('#cartModal .cart-close').click();
  await page.locator('#workspaceCart').click();
  await expect(page.locator('.is-swipe-open')).toHaveCount(0);
  await expect(page.locator('#workspaceQuantity')).toHaveText('3 件商品');
  expect(errors).toEqual([]);
});

test('cart touch swipes keep vertical movement safe and finish a continuous full swipe', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Real touch dispatch uses the Chromium phone project.');
  const errors = await openCart(page);
  const touch = await context.newCDPSession(page);
  await page.evaluate(() => {
    window.__touchEvents = [];
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'gotpointercapture',
      'lostpointercapture',
    ]) {
      document.addEventListener(
        type,
        (event) =>
          window.__touchEvents.push({
            type,
            x: event.clientX,
            y: event.clientY,
            id: event.pointerId,
            button: event.button,
            target: event.target.className,
          }),
        true,
      );
    }
  });
  const row = page.locator('[data-cart-item-key]').first();
  const box = await row.boundingBox();
  const x = box.x + box.width - 24,
    y = box.y + 30;
  async function send(type, dx = 0, dy = 0) {
    await touch.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: x + dx, y: y + dy, id: 1 }],
    });
  }
  await send('touchStart');
  await send('touchMove', -24, 3);
  await send('touchMove', -84, 8);
  await send('touchEnd');
  writeFileSync(
    testInfo.outputPath('touch-events.json'),
    JSON.stringify(await page.evaluate(() => window.__touchEvents), null, 2),
  );
  await expect(row).toHaveClass(/is-swipe-open/);
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await page.keyboard.press('Escape');
  await settle(page);
  await send('touchStart');
  await send('touchMove', -3, 30);
  await send('touchMove', -5, 90);
  await send('touchEnd');
  await expect(row).not.toHaveClass(/is-swipe-open|is-swipe-armed/);
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await send('touchStart');
  await send('touchMove', -24, 3);
  await send('touchMove', -88, 12);
  await send('touchMove', -box.width * 0.82, 28);
  await expect(row).toHaveClass(/is-swipe-armed/);
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await send('touchEnd');
  await expect(page.locator('#workspaceQuantity')).toHaveText('1 件商品');
  await touch.detach();
  expect(errors).toEqual([]);
});

test('cart touch swipes tolerate diagonal starts and downward drift from names and the former more area', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Real touch dispatch uses the Chromium phone project.');
  const errors = await openCart(page);
  const touch = await context.newCDPSession(page);
  const row = page.locator('[data-cart-item-key]').first();
  const name = await row.locator('.cart-item-options').boundingBox();
  let origin = { x: name.x + name.width / 2, y: name.y + name.height / 2 };
  async function send(type, dx = 0, dy = 0) {
    await touch.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: origin.x + dx, y: origin.y + dy, id: 1 }],
    });
  }
  await send('touchStart');
  await send('touchMove', -16, 18);
  await send('touchMove', -44, 46);
  await send('touchMove', -84, 90);
  await send('touchEnd');
  await expect(row).toHaveClass(/is-swipe-open/);
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await page.keyboard.press('Escape');
  await settle(page);

  const controls = await row.locator('.cart-item-controls').boundingBox();
  origin = { x: controls.x + controls.width - 24, y: controls.y + controls.height / 2 };
  await send('touchStart');
  await send('touchMove', -16, 18);
  await send('touchMove', -84, 90);
  await send('touchEnd');
  await expect(row).toHaveClass(/is-swipe-open/);
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await page.keyboard.press('Escape');
  await settle(page);

  // Make the drawer scrollable to verify that predominantly vertical touch still scrolls natively.
  await page.locator('#cartModalBody').evaluate((body) => {
    const spacer = document.createElement('div');
    spacer.style.height = '800px';
    spacer.setAttribute('aria-hidden', 'true');
    body.append(spacer);
    body.scrollTop = 0;
  });
  const box = await row.boundingBox();
  origin = { x: box.x + box.width - 24, y: box.y + 60 };
  await send('touchStart');
  await send('touchMove', -3, -30);
  await send('touchMove', -5, -90);
  await send('touchEnd');
  await expect(row).not.toHaveClass(/is-swipe-open|is-swipe-armed/);
  await expect
    .poll(() => page.locator('#cartModalBody').evaluate((body) => body.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await touch.detach();
  expect(errors).toEqual([]);
});

test('gift box swipe deletion preserves other items, notes and immediate totals', async ({ page }) => {
  const errors = await openCart(page);
  await page.keyboard.press('Escape');
  await page.locator('#nav-giftbox').click();
  await page.locator('#giftboxStep1 button[onclick="selectGiftboxSize(6)"]').click();
  await page.locator('#giftboxProducts input').first().fill('6');
  await page.locator('#giftboxProducts input').first().dispatchEvent('change');
  await page.locator('#proceedStep3').click();
  await page.locator('#giftboxNotes').fill('保留完整禮盒內容與備註');
  await page.locator('#giftboxStep3 .btn-add-cart').click();
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartTotalAmount')).toHaveText('450');
  const row = page.locator('[data-cart-item-key]').last();
  await expect(row).toContainText('保留完整禮盒內容與備註');
  await expect(row.locator('.cart-giftbox-details')).toContainText('每盒 6 粒');
  await row.locator('.cart-item-options').click();
  await expect(page.locator('#cartTotalAmount')).toHaveText('450');
  await row.locator('.cart-swipe-delete').click();
  await expect(page.locator('#cartTotalAmount')).toHaveText('150');
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await expect(page.locator('[data-cart-item-key] .cart-item-name')).toHaveText(['原味餅', '喜餅']);
  expect(errors).toEqual([]);
});

test('cart drag stays composited with four times CPU slowdown', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Chromium performance counters are measured once.');
  await openCart(page);
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const row = page.locator('[data-cart-item-key]').first();
  await row.evaluate((element) => {
    window.__swipeMutations = 0;
    new MutationObserver((records) => {
      window.__swipeMutations += records.length;
    }).observe(element, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  });
  const metric = async () =>
    Object.fromEntries(
      (await session.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
    );
  const before = await metric();
  const start = await startDrag(page, row);
  for (let step = 1; step <= 48; step++) await page.mouse.move(start.x - (80 * step) / 48, start.y);
  await page.mouse.up();
  await settle(page);
  const after = await metric();
  const result = {
    pointerMoves: 48,
    cpuSlowdown: 4,
    layouts: after.LayoutCount - before.LayoutCount,
    layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    rowStyleAndClassMutations: await page.evaluate(() => window.__swipeMutations),
  };
  writeFileSync(testInfo.outputPath('cart-swipe-performance.json'), JSON.stringify(result, null, 2));
  expect(result.layouts).toBeLessThanOrEqual(8);
  expect(result.rowStyleAndClassMutations).toBeLessThanOrEqual(8);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await session.detach();
});
