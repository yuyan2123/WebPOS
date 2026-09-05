const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function openWorkspace(page, role = 'owner') {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/js/rpc-bridge.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
    window.__calls = [];
    document.body.dataset.userId = 'test-user';
    document.body.dataset.shopId = 'test-shop';
    document.body.dataset.shopRole = '${role}';
    const products = [
      {productId:'P1',productName:'原味餅',category:'伴手禮',price:50,companyPrice:40,status:'啟用',giftBoxEnabled:'是'},
      {productId:'P2',productName:'喜餅',category:'喜餅',price:100,status:'啟用',giftBoxEnabled:'是'}
    ];
    window.posApi = {call:async (method,args) => {
      window.__calls.push({method,args});
      if (window.__fail === method) throw new Error('測試連線中斷');
      if (method === 'getShopBootstrap') return {products,capacityMonth:{key:'2026-9',data:{}}};
      if (method === 'getProducts') return products;
      if (method === 'getMonthCapacityStatus') return {};
      if (method === 'getCapacitySettings') return {weekday:{},dateOverrides:[]};
      if (method === 'searchCustomers') return window.__customers || [];
      if (method === 'searchOrders') return {orders:[],pagination:{hasMore:false,nextCursor:null}};
      if (method === 'searchOverdueOrders') return [];
      if (method === 'generateDailyReport') return {date:args[0],totalRevenue:100,totalOrders:1,totalItems:2,productSales:[{productName:'<img src=x onerror=alert(1)>',quantity:2,amount:100}]};
      if (method === 'getDemandStats') return {orderCount:1,productStats:[{name:'原味餅',loose:2,inbox:0,total:2}],giftboxStats:[]};
      if (method === 'submitOrder') return window.__capacity && !args[1].confirmed ? {needConfirm:true,capacityStatus:{date:args[0].deliveryDate,limit:1,currentQuantity:1,newOrderQuantity:2,projectedQuantity:3,exceededQuantity:2}} : {success:true,orderId:'O-test'};
      if (method === 'updateOrderDeposit') return {success:true,orderId:args[0],depositAmount:args[1],remainingAmount:100-args[1],newStatus:args[1]===100?'已付清':'已付訂金'};
      if (method === 'updateOrderStatus') return {success:true,orderId:args[0],newStatus:args[1]};
      if (method === 'saveProduct') return {success:true,productId:args[0].productId || 'P-new',product:{...args[0],productId:args[0].productId || 'P-new'}};
      return {success:true};
    }};
  `,
    }),
  );
  await page.goto('/');
  await expect(page.locator('#mainContent')).not.toHaveAttribute('inert', '');
  await expect
    .poll(() => page.evaluate(() => window.__calls.some((call) => call.method === 'getShopBootstrap')))
    .toBe(true);
  return errors;
}

test('all sections remain reachable, route history works, no horizontal overflow', async ({ page }) => {
  const errors = await openWorkspace(page);
  for (const section of ['date', 'gift', 'cake', 'giftbox', 'search', 'settings', 'customer']) {
    await page.locator('#nav-' + section).click();
    await expect(page.locator('#' + section)).toHaveClass(/active/);
    await expect(page.locator('#nav-' + section)).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goBack();
  await expect(page.locator('#settings')).toHaveClass(/active/);
  const missing = await page.evaluate(() => {
    const names = new Set();
    for (const element of document.querySelectorAll('*'))
      for (const attribute of element.getAttributeNames().filter((name) => /^on/.test(name))) {
        for (const match of element.getAttribute(attribute).matchAll(/(?<![.\w])([A-Za-z_$][\w$]*)\s*\(/g)) {
          if (!['if', 'function'].includes(match[1]) && typeof window[match[1]] !== 'function')
            names.add(match[1]);
        }
      }
    return [...names];
  });
  expect(missing).toEqual([]);
  expect(errors).toEqual([]);
});

test('customer, date, cart, gift-box, keyboard dialog and scoped draft', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.locator('#customerName').fill('測試客戶');
  await page.locator('#contactMethodLine').click();
  await page.getByRole('button', { name: '儲存並下一步' }).click();
  await expect(page.locator('#date')).toHaveClass(/active/);
  await page.locator('.calendar-day:not(:disabled)').first().click();
  await page.locator('#btn-confirm-date').click();
  await expect(page.locator('#gift')).toHaveClass(/active/);
  await page.locator('#giftProducts button').last().click();
  await expect(page.locator('#workspaceQuantity')).toHaveText('1 件商品');
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartModal')).toHaveAttribute('role', 'dialog');
  await page.keyboard.press('Escape');
  await expect(page.locator('#cartModal')).not.toHaveClass(/active/);
  await page.locator('#nav-giftbox').click();
  await page.getByRole('button', { name: '6入', exact: true }).click();
  await expect(page.locator('#giftboxStep2')).toBeVisible();
  await page.evaluate(() => window.saveOrderDraftNow());
  expect(
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = indexedDB.open('ginJiaPosLocal', 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('drafts');
            const query = tx.objectStore('drafts').getAllKeys();
            query.onsuccess = () => resolve(query.result);
          };
        }),
    ),
  ).toContain('order:test-user:test-shop');
  expect(errors).toEqual([]);
});

test('search failure is recoverable and enter submits filters', async ({ page }) => {
  await openWorkspace(page);
  await page.locator('#nav-search').click();
  await page.locator('#searchName').fill('測試');
  await page.evaluate(() => (window.__fail = 'searchOrders'));
  await page.locator('#searchName').press('Enter');
  await expect(page.locator('#searchResults')).toContainText('測試連線中斷');
  await page.evaluate(() => (window.__fail = null));
  await page.locator('#searchName').press('Enter');
  await expect(page.locator('#searchResults')).toContainText('未找到');
});

test('accessibility checks across customer, search and calendar', async ({ page }, testInfo) => {
  await openWorkspace(page);
  for (const section of ['customer', 'date', 'search']) {
    await page.locator('#nav-' + section).click();
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await page.screenshot({ path: testInfo.outputPath(section + '.png') });
    if (result.violations.length)
      console.log(
        JSON.stringify(
          result.violations.map((item) => ({
            id: item.id,
            nodes: item.nodes.map((node) => ({ html: node.html, summary: node.failureSummary })),
          })),
        ),
      );
    expect(
      result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
    ).toEqual([]);
  }
});

test('Rust load failure offers retry without allowing uninitialized operations', async ({ page }) => {
  await page.route('**/js/rpc-bridge.js', (route) => route.fulfill({ body: '' }));
  await page.route('**/*.wasm', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#startupStatus')).toContainText('重新載入');
  await expect(page.locator('main')).toHaveAttribute('inert', '');
});

async function prepareOrder(page) {
  await page.locator('#customerName').fill('測試客戶');
  await page.locator('#contactMethodLine').click();
  await page.getByRole('button', { name: '儲存並下一步' }).click();
  await page.locator('.calendar-day:not(:disabled)').first().click();
  await page.locator('#btn-confirm-date').click();
  await page.locator('#giftProducts button').last().click();
}

test('capacity cancel releases submit lock and confirmed submission keeps request identity', async ({
  page,
}) => {
  const errors = await openWorkspace(page);
  await prepareOrder(page);
  await page.evaluate(() => (window.__capacity = true));
  await page.locator('#workspaceCart').click();
  await page.locator('#checkoutBtn').click();
  await expect(page.locator('#capacityWarningModal')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#orderSubmitOverlay')).not.toHaveClass(/active/);
  await page.locator('#workspaceCart').click();
  await page.locator('#checkoutBtn').click();
  await page.locator('#btnCapacityConfirm').click();
  await expect(page.locator('#alertContainer')).toContainText('成功');
  const calls = await page.evaluate(() => window.__calls.filter((call) => call.method === 'submitOrder'));
  expect(calls).toHaveLength(3);
  expect(new Set(calls.map((call) => call.args[0].clientRequestId)).size).toBe(1);
  expect(calls[2].args[1].confirmed).toBe(true);
  expect(errors).toEqual([]);
});

test('payment preview uses shared Rust rules and confirmation supports keyboard', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => window.showDepositModal('O-test', 100, 0));
  await page.locator('#depositAmountInput').fill('40');
  await expect(page.locator('#remainingAmountText')).toHaveText('NT$ 60');
  await expect(page.locator('#newStatusText')).toHaveText('已付訂金');
  await page.locator('#depositAmountInput').fill('100');
  await expect(page.locator('#remainingAmountText')).toHaveText('NT$ 0');
  await page.locator('#confirmDepositBtn').click();
  await expect(page.locator('#depositModal')).not.toHaveClass(/active/);
  await page.evaluate(() => window.showStatusConfirm('O-test', '完成'));
  await page.locator('#statusSliderThumb').press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__calls.some((call) => call.method === 'updateOrderStatus')))
    .toBe(true);
  await page.evaluate(() => window.showDeleteConfirm('O-test', '測試'));
  await page.locator('#deleteSliderThumb').press('Space');
  await expect
    .poll(() => page.evaluate(() => window.__calls.some((call) => call.method === 'deleteOrder')))
    .toBe(true);
  expect(errors).toEqual([]);
});

test('catalog CRUD form, reports and demand remain accessible through management', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.locator('#nav-settings').click();
  await page.locator('.settings-nav-btn').filter({ hasText: '商品管理' }).click();
  await page.locator('.btn-add-product').click();
  await page.locator('#productName').fill('新商品');
  await page.locator('#productPrice').fill('88');
  await page.locator('#productEditModal button[onclick="saveProduct()"]').click();
  await expect(page.locator('#productsCardGrid')).toContainText('新商品');
  await page.evaluate(() => window.showSettingsSection('reports'));
  await page.locator('#reportDatePicker').evaluate((element) => {
    element.value = '2026-09-06';
  });
  await page.locator('#btnReport').click();
  await expect(page.locator('#reportResults')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#reportResults img')).toHaveCount(0);
  await page.evaluate(() => window.showSettingsSection('demand'));
  await page.locator('#demandDatePicker').evaluate((element) => {
    element.value = '2026-09-06';
  });
  await page.locator('#btnDemandStats').click();
  await expect(page.locator('#demandResults')).toContainText('原味餅');
  expect(errors).toEqual([]);
});

test('viewer retains read access and cannot operate catalog or capacity mutation controls', async ({
  page,
}) => {
  await openWorkspace(page, 'viewer');
  await page.locator('#nav-settings').click();
  await expect(page.locator('.btn-add-product')).toBeHidden();
  await expect(page.locator('.btn-card-edit').first()).toBeHidden();
  await page.evaluate(() => window.showSettingsSection('capacity'));
  await expect(page.locator('#overrideMaxQty')).toBeDisabled();
  await page.locator('#nav-search').click();
  await expect(page.locator('#searchName')).toBeEnabled();
});

test('offline changes keep draft and block submission', async ({ page, context }) => {
  await openWorkspace(page);
  await prepareOrder(page);
  await context.setOffline(true);
  await expect(page.locator('#connectionBanner')).toContainText('離線');
  await page.locator('#workspaceCart').click();
  await page.locator('#checkoutBtn').click();
  await expect(page.locator('#alertContainer')).toContainText('離線');
  expect(await page.evaluate(() => window.__calls.some((call) => call.method === 'submitOrder'))).toBe(false);
});

test('customer autocomplete and product filtering preserve selection and recovery', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(
    () =>
      (window.__customers = [
        { name: '測試先生', contactType: 'line', contactValue: 'LINE', address: '測試地址' },
      ]),
  );
  await page.locator('#customerName').fill('測試');
  await page.locator('#customerAcList .customer-ac-item').click();
  await expect(page.locator('#customerName')).toHaveValue('測試');
  await expect(page.locator('#customerAddress')).toHaveValue('測試地址');
  await expect(page.locator('#contactMethodLine')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#nav-gift').click();
  await page.locator('#giftProductSearch').fill('不存在');
  await expect(page.locator('#giftProducts')).toContainText('找不到符合的商品');
  await page.locator('#giftProductSearch').fill('原味');
  await expect(page.locator('#giftProducts')).toContainText('原味餅');
  expect(errors).toEqual([]);
});

test('gift-box composition, custom price, notes and quantity survive checkout', async ({ page }) => {
  const errors = await openWorkspace(page);
  await prepareOrder(page);
  await page.locator('#nav-giftbox').click();
  await page.getByRole('button', { name: '6入', exact: true }).click();
  await page.locator('#display_P1').fill('6');
  await page.locator('#display_P1').press('Tab');
  await page.locator('#proceedStep3').click();
  await expect(page.locator('#giftboxSummary')).toContainText('300');
  await page.locator('#giftboxQuantity').fill('2');
  await page.locator('#giftboxNotes').fill('分開包裝');
  await page.locator('#giftboxSpecialPriceInput').fill('280');
  await expect(page.locator('#giftboxTotalAmount')).toContainText('560');
  await page.locator('.btn-add-cart').click();
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartModalBody')).toContainText('分開包裝');
  await page.locator('#checkoutBtn').click();
  await expect
    .poll(() => page.evaluate(() => window.__calls.some((call) => call.method === 'submitOrder')))
    .toBe(true);
  const box = await page.evaluate(() =>
    window.__calls
      .find((call) => call.method === 'submitOrder')
      .args[0].items.find((item) => item.type === 'giftbox'),
  );
  expect(box).toMatchObject({ size: 6, quantity: 2, price: 280, products: { P1: 6 }, notes: '分開包裝' });
  expect(errors).toEqual([]);
});
