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
      if (method === 'getShopBootstrap') return {products,capacityMonth:{key:'2026-9',data:{}},capacitySettings:{weekday:{'1':{dayOfWeek:1,maxQuantity:120,enabled:true}},dateOverrides:[{id:'2027-01-02',date:'2027-01-02',maxQuantity:45,enabled:true}]}};
      if (method === 'getProducts') return products;
      if (method === 'getOrderDetails') return window.__orderDetails;
      if (method === 'getMonthCapacityStatus') return {};
      if (method === 'getCapacitySettings') return {weekday:{},dateOverrides:[]};
      if (method === 'searchCustomers') return window.__customers || [];
      if (method === 'searchOrders') return {orders:window.__orders || [],pagination:{hasMore:false,nextCursor:null}};
      if (method === 'searchOverdueOrders') return window.__orders || [];
      if (method === 'generateDailyReport') return window.__report || {date:args[1] && args[1] !== args[0] ? args[0] + ' ~ ' + args[1] : args[0],totalRevenue:100,totalOrders:1,totalItems:2,productSales:[{productName:'<img src=x onerror=alert(1)>',quantity:2,amount:100}]};
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
  // Startup includes Wasm compilation, IndexedDB and paint; cold CI WebKit can
  // exceed the normal 5 s interaction assertion budget. Still fail immediately
  // on a reported startup error instead of waiting for an inert element forever.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const status = document.getElementById('startupStatus');
          if (status.getAttribute('role') === 'alert') return 'failed';
          return status.hidden ? 'ready' : 'loading';
        }),
      { timeout: 20_000, message: 'Application startup must finish or report an error' },
    )
    .not.toBe('loading');
  await expect(
    page.locator('#startupRetry'),
    await page.locator('#startupMessage').textContent(),
  ).toBeHidden();
  await expect(page.locator('#startupStatus')).toBeHidden();
  await expect(page.locator('#mainContent')).not.toHaveAttribute('inert', '');
  await expect
    .poll(() => page.evaluate(() => window.__calls.some((call) => call.method === 'getShopBootstrap')))
    .toBe(true);
  return errors;
}

async function openManagementPanel(page, panel) {
  const toggle = page.locator('#managementToggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator('#nav-' + panel).click();
}

async function mockPrinter(page) {
  await page.addInitScript(() => {
    window.__printerFrames = [];
    window.__printerConnections = 0;
    window.WebSocket = class {
      constructor() {
        window.__printerConnections++;
        this.total = 0;
        setTimeout(
          () => (window.__printerMode === 'handshake-error' ? this.onerror?.({}) : this.onopen?.({})),
          0,
        );
      }
      send(payload) {
        if (this.closed) throw new Error('closed');
        let response;
        if (typeof payload === 'string') {
          const command = JSON.parse(payload);
          window.__printerFrames.push({ type: command.type });
          if (command.type === 'auth')
            response =
              window.__printerMode === 'unauthorized'
                ? { event: 'error', code: 'unauthorized' }
                : {
                    event: 'ready',
                    maxChunk: 4096,
                    ...(window.__printerMode === 'legacy' ? {} : { maxJob: 8 * 1024 * 1024 }),
                  };
          if (command.type === 'status') response = { event: 'status', raw: 22, offline: false };
          if (command.type === 'begin')
            response =
              window.__printerMode === 'busy' ? { event: 'error', code: 'busy' } : { event: 'started' };
          if (command.type === 'end') response = { event: 'sent', bytes: this.total };
        } else {
          const bytes = Array.from(payload);
          this.total += bytes.length;
          window.__printerFrames.push({ bytes });
          if (window.__printerMode === 'disconnect') {
            setTimeout(() => this.close(), 0);
            return;
          }
          response = { event: 'chunk', bytes: bytes.length, total: this.total };
        }
        if (window.__printerMode === 'hold') return;
        setTimeout(() => {
          if (!this.closed) this.onmessage?.({ data: JSON.stringify(response) });
        }, 2);
      }
      close() {
        this.closed = true;
        this.onclose?.({ code: 1000 });
      }
    };
  });
}

test('iPad desktop user agent is identified and PWA handshake failures show diagnostic context', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
    Object.defineProperty(navigator, 'standalone', { value: true });
  });
  await mockPrinter(page);
  await openWorkspace(page);
  await openManagementPanel(page, 'device');
  await expect(page.locator('#deviceOs')).toHaveValue('iPadOS');
  await expect(page.locator('#layoutMode')).toHaveValue('行動裝置模式');
  await configurePrinter(page);
  await page.evaluate(() => {
    window.__printerMode = 'handshake-error';
    window.__printerFrames = [];
  });
  await page.locator('#printer-check').click();
  await expect(page.locator('#printer-status')).toContainText('建立 WSS 連線；PWA；xiao-printer.local');
  await expect(page.locator('#printer-status')).not.toContainText('test-secret');
  expect(await page.evaluate(() => window.__printerFrames.length)).toBe(0);
});

async function configurePrinter(page) {
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-enabled').check();
  await page.locator('#printer-token').fill('test-secret');
  await page.locator('#printer-title').fill('金佳餅店');
  await page.locator('#printer-check').click();
  await expect(page.locator('#printer-status')).toContainText('已連線');
}

test('printer diagnostics compare HTTPS and WSS without auth or changing saved settings', async ({
  page,
}) => {
  await mockPrinter(page);
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window);
    window.__diagnosticFetches = [];
    window.fetch = (input, options) => {
      const url = String(input);
      if (url === 'https://192.168.50.214/health' || url === 'https://xiao-printer.local/health') {
        window.__diagnosticFetches.push({ url, mode: options.mode, credentials: options.credentials });
        return Promise.resolve(new Response(''));
      }
      return fetchOriginal(input, options);
    };
  });
  await openWorkspace(page);
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-url').fill('wss://192.168.50.214/ws');
  await page.locator('#printer-token').fill('do-not-transmit');
  await page.locator('#printer-diagnose').click();
  const result = page.locator('#printer-diagnostic-result');
  await expect(result).toContainText('診斷完成');
  await expect(result).toContainText('HTTPS 192.168.50.214：收到 HTTP 回應');
  await expect(result).toContainText('WSS 192.168.50.214：握手成功');
  await expect(result).toContainText('WSS xiao-printer.local：握手成功');
  await expect(result).not.toContainText('do-not-transmit');
  expect(await page.evaluate(() => window.__printerFrames)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('ginJiaPos.printer.test-user:test-shop'))).toBeNull();
  expect(
    await page.evaluate(() =>
      window.__diagnosticFetches.every(
        (request) => request.mode === 'no-cors' && request.credentials === 'omit',
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    window.__printerMode = 'handshake-error';
  });
  await page.locator('#printer-diagnose').click();
  await expect(result).toContainText('診斷完成');
  await expect(result).toContainText('WSS 192.168.50.214：失敗');
  await expect(result).toContainText('WSS xiao-printer.local：失敗');
  await expect(page.locator('#printer-diagnose')).toBeEnabled();
});

test('printer settings, exact raster preview, chunk acknowledgements and no duplicate send', async ({
  page,
}, testInfo) => {
  await mockPrinter(page);
  const errors = await openWorkspace(page);
  await configurePrinter(page);
  await page.screenshot({
    path: testInfo.outputPath('printer-settings.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const storage = await page.evaluate(() => ({
    local: localStorage.getItem('ginJiaPos.printer.test-user:test-shop'),
    session: sessionStorage.getItem('ginJiaPos.printer.test-user:test-shop'),
  }));
  expect(storage.local).not.toContain('test-secret');
  expect(storage.session).toBe('test-secret');
  await page.locator('#printer-cut').check();
  await page.locator('#printer-test').click();
  await expect(page.locator('#printer-send')).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath('printer-preview.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('#printer-preview summary').click();
  await expect(page.locator('.receipt-text')).toContainText('剩餘金額：NT$ 70');
  await page.locator('#printer-send').evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.locator('#printer-result')).toContainText('已傳送');
  await expect(page.locator('#printer-send')).toBeDisabled();
  const result = await page.evaluate(() => {
    const frames = window.__printerFrames;
    const chunks = frames.filter((frame) => frame.bytes).map((frame) => frame.bytes);
    const bytes = chunks.flat();
    let offset = 5;
    let same = true;
    let ink = 0;
    for (const canvas of document.querySelectorAll('.receipt-preview canvas')) {
      const header = bytes.slice(offset, offset + 8);
      if (header.join() !== [29, 118, 48, 0, 64, 0, canvas.height & 255, canvas.height >> 8].join())
        same = false;
      offset += 8;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const printed = Boolean(bytes[offset + y * 64 + (x >> 3)] & (128 >> (x & 7)));
          const black = pixels[(y * canvas.width + x) * 4] === 0;
          if (printed !== black) same = false;
          if (printed) ink++;
        }
      offset += canvas.height * 64;
    }
    return {
      same,
      ink,
      start: bytes.slice(0, 5),
      tail: bytes.slice(offset),
      max: Math.max(...chunks.map((chunk) => chunk.length)),
      begins: frames.filter((frame) => frame.type === 'begin').length,
    };
  });
  expect(result.same).toBe(true);
  expect(result.ink).toBeGreaterThan(100);
  expect(result.start).toEqual([27, 64, 27, 97, 0]);
  expect(result.tail).toEqual([29, 86, 66, 16]);
  expect(result.max).toBeLessThanOrEqual(4096);
  expect(result.begins).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#printer-preview')).toHaveCount(0);
  await page.locator('#printer-test').click();
  await expect(page.locator('#printer-send')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('printer rejects bad auth, times out without retry, and remembers token only on request', async ({
  page,
}) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await configurePrinter(page);
  await page.locator('#printer-remember').check();
  await page.getByRole('button', { name: '儲存設定', exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ginJiaPos.printer.test-user:test-shop')).token,
    ),
  ).toBe('test-secret');
  await page.locator('#printer-remember').uncheck();
  await page.getByRole('button', { name: '儲存設定', exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ginJiaPos.printer.test-user:test-shop')).token,
    ),
  ).toBe('');
  await page.evaluate(() => {
    window.__printerMode = 'unauthorized';
  });
  await page.locator('#printer-check').click();
  await expect(page.locator('#printer-status')).toContainText('金鑰不正確');
  await page.clock.install();
  await page.evaluate(() => {
    window.__printerMode = 'hold';
    window.__printerFrames = [];
  });
  await page.locator('#printer-check').click();
  await expect(page.locator('#printer-status')).toContainText('正在查詢');
  await expect
    .poll(() => page.evaluate(() => window.__printerFrames.some((frame) => frame.type === 'auth')))
    .toBe(true);
  await page.clock.fastForward(16000);
  await expect(page.locator('#printer-status')).toContainText('逾時');
  await expect(page.locator('#printer-check')).toBeEnabled();
  expect(await page.evaluate(() => window.__printerFrames.filter((frame) => frame.bytes).length)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('pos:session-ending')));
  await expect(page.locator('#printer-token')).toHaveValue('');
  expect(
    await page.evaluate(() => sessionStorage.getItem('ginJiaPos.printer.test-user:test-shop')),
  ).toBeNull();
});

test('printer wraps long gift receipts and refuses oversize jobs before connecting', async ({ page }) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await configurePrinter(page);
  await page.locator('#printer-width').selectOption('384');
  await page.getByRole('button', { name: '儲存設定', exact: true }).click();
  await page.locator('#nav-search').click();
  await page.evaluate(() => {
    const item = {
      productName: '非常長的中文禮盒商品名稱'.repeat(3),
      quantity: 2,
      unitPrice: 100,
      subtotal: 200,
      isGiftBox: true,
      giftBoxDetails: { products: { P1: 3 }, notes: '不要花生' },
    };
    window.__orderDetails = {
      orderId: 'O-long',
      customerName: '客戶',
      deliveryType: '外送',
      customerAddress: '地址'.repeat(30),
      status: '已付訂金',
      totalAmount: 3000,
      depositAmount: 1000,
      remainingAmount: 2000,
      items: Array(15).fill(item),
    };
    window.viewOrderDetails('O-long');
  });
  await page.locator('[data-printer-order="O-long"]').click();
  await expect(page.locator('#printer-send')).toBeEnabled();
  await page.locator('#printer-preview summary').click();
  await expect(page.locator('.receipt-text')).toContainText('原味餅：每盒 3 個');
  await expect(page.locator('.receipt-text')).toContainText('不要花生');
  expect(await page.locator('.receipt-preview canvas').count()).toBe(4);
  await page.locator('.receipt-next').click();
  await expect(page.locator('.receipt-page-label')).toContainText('2 /');
  expect(await page.locator('.receipt-preview canvas').count()).toBeLessThanOrEqual(4);
  expect(
    await page
      .locator('.receipt-preview canvas')
      .evaluateAll((canvases) => canvases.every((canvas) => canvas.width === 384 && canvas.height <= 238)),
  ).toBe(true);
  await page.locator('#printer-preview .printer-close').click();
  await page.evaluate(() => {
    window.__orderDetails.items = Array(150).fill(window.__orderDetails.items[0]);
    window.__printerConnections = 0;
  });
  await page.locator('[data-printer-order="O-long"]').click();
  await expect(page.locator('#printer-send')).toBeEnabled();
  await page.evaluate(() => {
    window.__printerMode = 'legacy';
    window.__printerFrames = [];
  });
  await page.locator('#printer-send').click();
  await expect(page.locator('#printer-result')).toContainText('更新至 8 MiB');
  expect(await page.evaluate(() => window.__printerFrames.some((frame) => frame.type === 'begin'))).toBe(
    false,
  );
  await page.locator('#printer-preview .printer-close').click();
  await page.evaluate(() => {
    window.__printerMode = '';
    window.__printerFrames = [];
  });
  await page.locator('[data-printer-order="O-long"]').click();
  await expect(page.locator('#printer-send')).toBeEnabled();
  await page.locator('#printer-send').click();
  await expect(page.locator('#printer-result')).toContainText('已傳送', { timeout: 20000 });
  const sent = await page.evaluate(() =>
    window.__printerFrames.filter((frame) => frame.bytes).reduce((sum, frame) => sum + frame.bytes.length, 0),
  );
  expect(sent).toBeGreaterThan(1024 * 1024);
  expect(sent).toBeLessThan(8 * 1024 * 1024);
  expect(await page.locator('.receipt-preview canvas').count()).toBeLessThanOrEqual(4);
  await page.locator('#printer-preview .printer-close').click();
  await page.evaluate(() => {
    window.__orderDetails.items = Array(2000).fill(window.__orderDetails.items[0]);
    window.__printerConnections = 0;
  });
  await page.locator('[data-printer-order="O-long"]').click();
  await expect(page.locator('#printer-result')).toContainText('超過 8 MiB');
  await expect(page.locator('#printer-send')).toBeDisabled();
  expect(await page.evaluate(() => window.__printerConnections)).toBe(0);
});

test('printer failure never replays bytes and context switch aborts old work', async ({ page }) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await configurePrinter(page);
  for (const mode of ['busy', 'disconnect']) {
    await page.evaluate((mode) => {
      window.__printerMode = mode;
      window.__printerFrames = [];
    }, mode);
    await page.locator('#printer-test').click();
    await expect(page.locator('#printer-send')).toBeEnabled();
    await page.locator('#printer-send').click();
    await expect(page.locator('#printer-result')).toContainText(mode === 'busy' ? '忙碌' : '可能已部分列印');
    await expect(page.locator('#printer-send')).toBeDisabled();
    expect(await page.evaluate(() => window.__printerFrames.filter((frame) => frame.bytes).length)).toBe(
      mode === 'busy' ? 0 : 1,
    );
    await page.locator('#printer-preview .printer-close').click();
  }
  await page.evaluate(() => {
    window.__printerMode = 'hold';
    window.__printerFrames = [];
  });
  await page.locator('#printer-check').click();
  await expect(page.locator('#printer-check')).toBeDisabled();
  await page.evaluate(() => {
    document.body.dataset.shopId = 'other-shop';
  });
  await expect(page.locator('#printer-token')).toHaveValue('');
  await expect(page.locator('#printer-enabled')).not.toBeChecked();
  await expect(page.locator('#printer-check')).toBeEnabled();
  await expect(page.locator('#printer-status')).toHaveText('尚未檢查連線');
  expect(
    await page.evaluate(() => sessionStorage.getItem('ginJiaPos.printer.test-user:test-shop')),
  ).toBeNull();
  await page.evaluate(() => {
    delete document.body.dataset.userId;
  });
  await expect(page.locator('#printer-check')).toBeDisabled();
});

test('printer preview fetches saved order and viewer cannot print', async ({ page }) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await configurePrinter(page);
  await page.locator('#nav-search').click();
  await page.evaluate(() => {
    window.__orderDetails = {
      orderId: 'O-print',
      customerName: '已儲存客戶',
      deliveryType: '自取',
      status: '已付清',
      totalAmount: 100,
      depositAmount: 100,
      remainingAmount: 0,
      items: [{ productName: '中文商品', quantity: 2, unitPrice: 50, subtotal: 100 }],
    };
    window.viewOrderDetails('O-print');
  });
  await page.locator('[data-printer-order="O-print"]').click();
  await expect(page.locator('#printer-send')).toBeEnabled();
  expect(
    await page.evaluate(() => window.__calls.filter((call) => call.method === 'getOrderDetails').length),
  ).toBe(2);
  await page.locator('#printer-preview summary').click();
  await expect(page.locator('.receipt-text')).toContainText('剩餘金額：NT$ 0');
  await page.evaluate(() => {
    document.body.dataset.shopRole = 'viewer';
  });
  await expect(page.locator('#printer-preview')).toHaveCount(0);
  await expect(page.locator('[data-printer-order="O-print"]')).toBeDisabled();
  expect(
    await page.evaluate(() => window.__printerFrames.filter((frame) => frame.type === 'begin').length),
  ).toBe(0);
});

test('all sections remain reachable, route history works, no horizontal overflow', async ({ page }) => {
  const errors = await openWorkspace(page);
  for (const section of ['date', 'gift', 'giftbox', 'search', 'customer']) {
    await page.locator('#nav-' + section).click();
    await expect(page.locator('#' + section)).toHaveClass(/active/);
    await expect(page.locator('#nav-' + section)).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await openManagementPanel(page, 'products');
  await page.locator('#nav-customer').click();
  await page.goBack();
  await expect(page.locator('#settingsProducts')).toBeVisible();
  await expect(page.locator('#nav-products')).toHaveAttribute('aria-current', 'page');
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
  await expect(page.locator('#searchStatus')).toBeDisabled();
  await expect(
    page.locator('.search-form-group').filter({ has: page.locator('#searchStatus') }),
  ).toBeHidden();
  await page.locator('#searchName').fill('測試');
  await page.evaluate(() => (window.__fail = 'searchOrders'));
  await page.locator('#searchName').press('Enter');
  await expect(page.locator('#searchResults')).toContainText('測試連線中斷');
  await page.evaluate(() => (window.__fail = null));
  await page.locator('#searchName').press('Enter');
  await expect(page.locator('#searchResults')).toContainText('未找到');
  const criteria = await page.evaluate(
    () => window.__calls.filter((call) => call.method === 'searchOrders').at(-1).args[0],
  );
  expect(criteria).not.toHaveProperty('status');
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

test('slow Wasm startup stays blocked and becomes usable after more than five seconds', async ({ page }) => {
  let releaseWasm;
  const gate = new Promise((resolve) => {
    releaseWasm = resolve;
  });
  await page.route('**/*.wasm', async (route) => {
    await gate;
    await route.continue();
  });
  const opening = openWorkspace(page);
  // Attach a rejection handler while the controlled response is held.
  opening.catch(() => {});
  try {
    await expect(page.locator('#startupStatus')).toBeVisible();
    // Deliberately cross the former startup deadline; this is the condition
    // under test, not an arbitrary wait used to synchronize a normal action.
    await page.waitForTimeout(6_000);
    await expect(page.locator('#mainContent')).toHaveAttribute('inert', '');
    await expect(page.locator('#startupProgress')).toHaveJSProperty('value', 0);
  } finally {
    releaseWasm();
  }
  expect(await opening).toEqual([]);
  await page.locator('#customerName').fill('慢速啟動');
  await expect(page.locator('#customerName')).toHaveValue('慢速啟動');
});

test('Rust load failure offers retry without allowing uninitialized operations', async ({ page }) => {
  await page.route('**/js/rpc-bridge.js', (route) => route.fulfill({ body: '' }));
  await page.route('**/*.wasm', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#startupStatus')).toContainText('重新載入');
  await expect(page.locator('main')).toHaveAttribute('inert', '');
});

for (const field of ['customerName', 'customerPhone']) {
  test(`customer requires only one identity field: ${field}`, async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.getByRole('button', { name: '儲存並下一步' }).click();
    await expect(page.locator('#alertContainer')).toContainText('至少填寫一項');
    await expect(page.locator('#customer')).toBeVisible();
    const value = field === 'customerName' ? '只有姓名' : '0912345678';
    await page.locator('#' + field).fill(value);
    await page.getByRole('button', { name: '儲存並下一步' }).click();
    await expect(page.locator('#workspaceCustomer')).toHaveText(value);
    await page.locator('.calendar-day:not(:disabled)').first().click();
    await page.locator('#btn-confirm-date').click();
    await page.locator('#giftProducts button').last().click();
    await page.locator('#workspaceCart').click();
    await expect(page.locator('#checkoutBtn')).not.toHaveClass(/checkout-not-ready/);
    await page.locator('#checkoutBtn').click();
    await expect
      .poll(() => page.evaluate(() => window.__calls.some((call) => call.method === 'submitOrder')))
      .toBe(true);
    await expect(page.locator('#printer-last-order')).toContainText('訂單 O-test 已建立');
    await expect(page.locator('#printer-last-order [data-printer-order]')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

async function prepareOrder(page) {
  await page.locator('#customerName').fill('測試客戶');
  await page.locator('#contactMethodLine').click();
  await page.getByRole('button', { name: '儲存並下一步' }).click();
  await page.locator('.calendar-day:not(:disabled)').first().click();
  await page.locator('#btn-confirm-date').click();
  await page.locator('#giftProducts button').last().click();
}

test('cart slides out and backdrop fades before hiding, including quick reopen', async ({ page }) => {
  await openWorkspace(page);
  const cart = page.locator('#cartModal');
  const overlay = page.locator('#cartOverlay');
  await page.locator('#workspaceCart').click();
  await cart.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  // Pause actual CSS exit transitions halfway to inspect the closing frame deterministically.
  const closing = await page.evaluate(() => {
    const cart = document.getElementById('cartModal');
    const overlay = document.getElementById('cartOverlay');
    cart.querySelector('button').click();
    for (const element of [cart, overlay]) {
      for (const animation of element.getAnimations()) {
        animation.pause();
        animation.currentTime = 150;
      }
    }
    return {
      visibility: getComputedStyle(cart).visibility,
      offset: new DOMMatrixReadOnly(getComputedStyle(cart).transform).m41,
      width: cart.getBoundingClientRect().width,
      opacity: Number(getComputedStyle(overlay).opacity),
    };
  });
  expect(closing.visibility).toBe('visible');
  expect(closing.offset).toBeGreaterThan(0);
  expect(closing.offset).toBeLessThan(closing.width);
  expect(closing.opacity).toBeGreaterThan(0);
  expect(closing.opacity).toBeLessThan(1);
  await expect(cart).toHaveAttribute('inert', '');
  await expect(page.locator('#mainContent')).not.toHaveAttribute('inert', '');
  await page.locator('#workspaceCart').click();
  await expect(cart).toHaveClass(/active/);
  await expect(cart).not.toHaveAttribute('inert', '');
  await cart.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await page.keyboard.press('Escape');
  await expect(cart).toBeHidden();
  await expect(overlay).toBeHidden();
  await expect(page.locator('#mainContent')).not.toHaveAttribute('inert', '');
});

test('cart closes without a delayed exit when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspace(page);
  await page.locator('#workspaceCart').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cartModal')).toBeHidden();
  await expect(page.locator('#cartOverlay')).toBeHidden();
  for (const selector of ['#cartModal', '#cartOverlay']) {
    const delays = await page
      .locator(selector)
      .evaluate((element) => getComputedStyle(element).transitionDelay);
    expect(delays.split(',').every((delay) => parseFloat(delay) === 0)).toBe(true);
  }
});

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

test('confirmation sliders keep diagonal touch drags until release', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Uses Chromium native touch input on mobile');
  const errors = await openWorkspace(page);
  const touch = await page.context().newCDPSession(page);
  for (const [kind, method] of [
    ['status', 'updateOrderStatus'],
    ['delete', 'deleteOrder'],
  ]) {
    await page.evaluate((kind) => {
      if (kind === 'status') window.showStatusConfirm('O-test', '完成');
      else window.showDeleteConfirm('O-test', '測試');
    }, kind);
    const thumb = page.locator(`#${kind}SliderThumb`);
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveCSS('touch-action', 'none');
    await thumb.evaluate((element) => {
      window.__sliderCancels = 0;
      element.addEventListener('pointercancel', () => window.__sliderCancels++);
    });
    // A short diagonal drag must reset; a full one confirms only after release.
    for (const complete of [false, true]) {
      const box = await thumb.boundingBox();
      const track = await thumb.locator('..').boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const distance = complete ? track.width - box.width - 4 : 30;
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 8; step++) {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + (distance * step) / 8, y: y - step * 7 }],
        });
      }
      expect(await page.evaluate(() => window.__sliderCancels)).toBe(0);
      expect(
        await page.evaluate((method) => window.__calls.some((call) => call.method === method), method),
      ).toBe(false);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (complete) {
        await expect
          .poll(() =>
            page.evaluate((method) => window.__calls.filter((call) => call.method === method).length, method),
          )
          .toBe(1);
      } else {
        await expect(thumb).toHaveCSS('left', '2px');
      }
    }
  }
  await touch.detach();
  expect(errors).toEqual([]);
});

test('catalog CRUD form, reports and demand remain accessible through management', async ({ page }) => {
  const errors = await openWorkspace(page);
  await openManagementPanel(page, 'products');
  await page.locator('.btn-add-product').click();
  await page.locator('#productName').fill('新商品');
  await page.locator('#productCategory').fill('手工點心');
  await page.locator('#productPrice').fill('88');
  await page.locator('#productEditModal button[onclick="saveProduct()"]').click();
  await expect(page.locator('#productsCardGrid')).toContainText('新商品');
  await openManagementPanel(page, 'reports');
  await page.locator('#reportDatePicker').evaluate((element) => {
    element.value = '2026-09-06';
  });
  await page.locator('#btnReport').click();
  await expect(page.locator('#reportResults')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#reportResults img')).toHaveCount(0);
  await openManagementPanel(page, 'demand');
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
  await openManagementPanel(page, 'products');
  await expect(page.locator('.btn-add-product')).toBeHidden();
  await expect(page.locator('.btn-card-edit').first()).toBeHidden();
  await openManagementPanel(page, 'capacity');
  await expect(page.locator('#overrideMaxQty')).toBeDisabled();
  await expect(page.locator('#capDayEnabled0')).toBeDisabled();
  await page.locator('#nav-search').click();
  await expect(page.locator('#searchName')).toBeEnabled();
});

// Observe the actual animation timeline and geometry before the app removes
// the row. Native animationend delivery is not a cross-browser completion clock.
async function observeCollapseCompletion(page) {
  await page.evaluate(() => {
    window.__collapseResult = null;
    const observer = new MutationObserver(() => {
      const element = document.querySelector('.is-collapsing .order-items-expand');
      if (!element) return;
      const effect = element
        .getAnimations()
        .find((animation) => animation.animationName === 'order-items-collapse');
      if (!effect) return;
      observer.disconnect();
      effect.finished.then(
        () => {
          window.__collapseResult = {
            state: effect.playState,
            connected: element.isConnected,
            height: element.closest('.order-items-row').getBoundingClientRect().height,
          };
        },
        () => {
          window.__collapseResult = 'cancelled';
        },
      );
    });
    observer.observe(document.getElementById('searchResults'), { childList: true, subtree: true });
  });
}

for (const width of [1366, 1180, 1024, 820, 530, 390]) {
  test(`order table keeps actions visible and collapses smoothly at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.skip(
      !['desktop', 'webkit'].includes(testInfo.project.name),
      'Checks all sizes in Chromium and WebKit',
    );
    const errors = await openWorkspace(page);
    await page.locator('#nav-search').click();
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      () =>
        (window.__orders = [
          {
            orderId: 'O-layout',
            customerName: '余彥亨先生與很長的客戶姓名',
            customerPhone: '0912345678',
            deliveryDate: '2026-09-30',
            totalAmount: 1234567,
            depositAmount: 1000,
            remainingAmount: 1233567,
            shippingFee: 0,
            deliveryType: '自取',
            status: '已確認',
            items: [{ productName: '測試商品', quantity: 1, unitPrice: 1234567, subtotal: 1234567 }],
          },
        ]),
    );
    await page.locator('#searchName').fill('余');
    await page.locator('.btn-search').click();
    await expect(page.locator('#searchResults .btn-table-view')).toBeVisible();
    if (width <= 1100) {
      const summary = await page.locator('#searchResults .order-summary-row').boundingBox();
      expect(summary.height).toBeLessThanOrEqual(width <= 600 ? 160 : 100);
    }
    const wrapper = page.locator('#searchResults > .table-responsive');
    expect(await wrapper.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    for (const action of ['詳情', '刪除']) {
      const button = page.getByRole('button', { name: action, exact: true });
      await button.scrollIntoViewIfNeeded();
      const bounds = await button.boundingBox();
      const tableBounds = await wrapper.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(tableBounds.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(tableBounds.x + tableBounds.width);
      await expect(button).toBeInViewport();
    }
    const summaryRow = page.locator('#searchResults .order-summary-row');
    if ((await summaryRow.getAttribute('class')).includes('is-expanded')) {
      await page.locator('#searchResults td[data-label="姓名"]').click();
      await expect(page.locator('.order-items-row')).toHaveCount(0);
    }
    const collapsedHeight = (await summaryRow.boundingBox()).height;
    await page.locator('#searchResults td[data-label="姓名"]').click();
    await expect(page.locator('.order-items-expand')).toHaveCSS('opacity', '1');
    expect((await summaryRow.boundingBox()).height).toBeCloseTo(collapsedHeight, 1);
    await expect(page.locator('.order-items-table thead')).toBeVisible();
    await expect(page.locator('.order-items-table tbody tr')).toHaveCSS('display', 'table-row');
    await observeCollapseCompletion(page);
    await page.locator('#searchResults td[data-label="姓名"]').click();
    await expect(page.locator('.order-items-row')).toHaveCount(0);
    expect(await page.evaluate(() => window.__collapseResult)).toEqual({
      state: 'finished',
      connected: true,
      height: 0,
    });
    expect((await summaryRow.boundingBox()).height).toBeCloseTo(collapsedHeight, 1);
    await page.locator('#searchResults td[data-label="姓名"]').click();
    await expect(page.locator('.order-items-expand')).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: '詳情', exact: true }).click();
    await expect(page.locator('.modal.active[role="dialog"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '刪除', exact: true }).click();
    await expect(page.locator('#deleteConfirmModal')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    if (width === 1180 || width === 390) {
      await expect(page.locator('.order-items-expand')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: `artifacts/order-table-${testInfo.project.name}-${width}.png` });
    }
    await page.locator('.btn-overdue').click();
    await expect(page.locator('#searchResults td[data-label="逾期天數"]')).toBeVisible();
    expect(await wrapper.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.getByRole('button', { name: '刪除', exact: true }).click();
    await expect(page.locator('#deleteConfirmModal')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}

for (const suppressEvents of [false, true]) {
  test(`collapse waits for delayed animation with native events ${suppressEvents ? 'suppressed' : 'enabled'}`, async ({
    page,
  }) => {
    const errors = await openWorkspace(page);
    if (suppressEvents)
      await page.evaluate(() => {
        document.addEventListener('animationend', (event) => event.stopImmediatePropagation(), true);
      });
    await page.addStyleTag({
      content: '.order-items-row.is-collapsing .order-items-expand { animation-delay: 1s; }',
    });
    await page.locator('#nav-search').click();
    await page.evaluate(() => {
      window.__orders = [
        {
          orderId: 'O-delayed',
          customerName: '延遲動畫',
          deliveryDate: '2026-09-30',
          totalAmount: 50,
          status: '已確認',
          items: [{ productName: '測試商品', quantity: 1, unitPrice: 50, subtotal: 50 }],
        },
      ];
    });
    await page.locator('#searchName').fill('延遲');
    await page.locator('.btn-search').click();
    const name = page.locator('#searchResults td[data-label="姓名"]');
    await name.click();
    await expect(page.locator('.order-items-expand')).toHaveCSS('opacity', '1');
    await observeCollapseCompletion(page);
    await name.click();
    await expect(page.locator('.order-items-row')).toHaveCount(0);
    expect(await page.evaluate(() => window.__collapseResult)).toEqual({
      state: 'finished',
      connected: true,
      height: 0,
    });
    await name.click();
    await expect(page.locator('.order-items-expand')).toHaveCSS('opacity', '1');
    expect(errors).toEqual([]);
  });
}

test('startup renders capacity settings and opening the panel reuses them', async ({ page }) => {
  const errors = await openWorkspace(page);
  // Already rendered while the settings panel is still hidden.
  await expect(page.locator('#capDay1')).toHaveValue('120');
  await expect(page.locator('#capDayEnabled1')).toBeChecked();
  await expect(page.locator('#overrideTableBody')).toContainText('2027-01-02');
  await expect(page.locator('#overrideTableBody')).toContainText('45');
  await openManagementPanel(page, 'capacity');
  await expect(page.locator('#capDay1')).toBeVisible();
  await expect(page.locator('#capDay1')).toHaveValue('120');
  await openManagementPanel(page, 'products');
  await openManagementPanel(page, 'capacity');
  expect(
    await page.evaluate(() => window.__calls.filter((call) => call.method === 'getCapacitySettings')),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

for (const role of ['owner', 'editor']) {
  test(`${role} can toggle weekday capacity with the slider and keyboard`, async ({ page }) => {
    const errors = await openWorkspace(page, role);
    await openManagementPanel(page, 'capacity');
    const checkbox = page.locator('#capDayEnabled0');
    const column = page.locator('.capacity-day-col').first();
    await column.locator('.slider').click();
    await expect(checkbox).toBeChecked();
    await expect(column).toHaveClass(/active/);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__calls.filter((call) => call.method === 'saveWeekdayCapacity').at(-1)?.args[0][0].enabled,
        ),
      )
      .toBe(true);
    await expect(page.locator('#weekdayAutoSaveStatus')).toHaveText('已自動儲存');
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).not.toBeChecked();
    await expect(column).not.toHaveClass(/active/);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__calls.filter((call) => call.method === 'saveWeekdayCapacity').at(-1)?.args[0][0].enabled,
        ),
      )
      .toBe(false);
    await openManagementPanel(page, 'products');
    await openManagementPanel(page, 'capacity');
    await page.locator('.capacity-day-col').first().locator('.slider').click();
    await expect(checkbox).toBeChecked();
    expect(errors).toEqual([]);
  });
}

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
  await page.locator('#catalogFilterTabs').getByRole('button', { name: '喜餅 (1)', exact: true }).click();
  await expect(page.locator('#giftProducts')).not.toContainText('原味餅');
  await page.locator('#catalogFilterTabs').getByRole('button', { name: '伴手禮 (1)', exact: true }).click();
  await expect(page.locator('#giftProducts')).toContainText('原味餅');
  await expect(
    page.locator('#catalogFilterTabs').getByRole('button', { name: '伴手禮 (1)', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#catalogFilterTabs').getByRole('button', { name: '全部類別 (2)', exact: true }).click();
  await expect(page.locator('#giftProducts')).toContainText('喜餅');
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

for (const result of ['current', 'available', 'failed']) {
  test(`system information checks updates: ${result}`, async ({ page }) => {
    await page.addInitScript((updateResult) => {
      const serviceWorker = new EventTarget();
      const registration = new EventTarget();
      serviceWorker.controller = {};
      registration.waiting = null;
      registration.update = async () => {
        if (updateResult === 'failed') throw new Error('network failure');
        if (updateResult === 'available') {
          const worker = new EventTarget();
          worker.state = 'installing';
          worker.postMessage = (message) => {
            window.__updateMessage = message;
          };
          registration.installing = worker;
          registration.dispatchEvent(new Event('updatefound'));
          setTimeout(() => {
            worker.state = 'installed';
            registration.installing = null;
            registration.waiting = worker;
            worker.dispatchEvent(new Event('statechange'));
          }, 100);
        }
      };
      serviceWorker.register = async () => registration;
      Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker });
    }, result);
    const errors = await openWorkspace(page);
    await openManagementPanel(page, 'device');
    await expect(page.locator('#settingsSystem')).toBeVisible();
    const releaseVersion = await page.locator('meta[name="app-version"]').getAttribute('content');
    expect(releaseVersion).toMatch(/^\d+\.\d+\.\d+\+[a-f0-9]{12}$/);
    await expect(page.locator('#systemVersion')).toHaveValue(`v${releaseVersion}`);
    await expect(page.locator('#systemUpdatedAt')).not.toHaveValue('未知');
    const systemBox = await page.locator('#settingsSystem').boundingBox();
    const deviceBox = await page.locator('#settingsDevice').boundingBox();
    expect(systemBox.y + systemBox.height).toBeLessThanOrEqual(deviceBox.y);
    await page.locator('#systemCheckUpdate').click();
    await expect(page.locator('#systemUpdateStatus')).toHaveText(
      {
        current: '目前已是最新版本。',
        available: '有新版本可更新。',
        failed: '檢查更新失敗，請稍後重試。',
      }[result],
    );
    if (result === 'available') {
      await expect(page.locator('#systemCheckUpdate')).toHaveText('更新');
      await page.evaluate(() => {
        document.body.dataset.draftDirty = 'true';
      });
      await page.locator('#systemCheckUpdate').click();
      await expect(page.locator('#systemUpdateStatus')).toContainText('仍有訂單草稿');
      expect(await page.evaluate(() => window.__updateMessage)).toBeUndefined();
      await page.evaluate(() => {
        document.body.dataset.draftDirty = 'false';
      });
      await page.locator('#systemCheckUpdate').click();
      expect(await page.evaluate(() => window.__updateMessage)).toEqual({ type: 'SKIP_WAITING' });
    }
    await openManagementPanel(page, 'products');
    await expect(page.locator('#settingsSystem')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('management navigation has one entry per panel and restores direct routes', async ({
  page,
}, testInfo) => {
  const errors = await openWorkspace(page);
  await expect(page.locator('.settings-container, .settings-nav, .settings-back-btn')).toHaveCount(0);
  for (const [panel, title] of Object.entries({
    products: '商品管理',
    capacity: '供應量設定',
    demand: '需求統計',
    reports: '營業報表',
    device: '裝置資訊',
  })) {
    await expect(page.locator('[data-panel="' + panel + '"]')).toHaveCount(1);
    await openManagementPanel(page, panel);
    await expect(page).toHaveURL(new RegExp('#settings/' + panel + '$'));
    await expect(page.locator('#workspaceTitle')).toHaveText(title);
    await expect(page.locator('#workspaceTitle')).toBeFocused();
    await expect(page.locator('.settings-section:visible')).toHaveCount(1);
    await expect(page.locator('#nav-' + panel)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.app-navigation [aria-current="page"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goBack();
  await expect(page.locator('#workspaceTitle')).toHaveText('營業報表');
  await expect(page.locator('#settingsReports')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#settingsDevice')).toBeVisible();
  await page.reload();
  await expect(page.locator('#settingsDevice')).toBeVisible();
  await expect(page.locator('#nav-device')).toHaveAttribute('aria-current', 'page');
  const toggle = page.locator('#managementToggle');
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator('#nav-device')).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('management-menu.png') });
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(page.locator('#managementLinks')).toBeHidden();
    await toggle.click();
    await page.locator('#workspaceTitle').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  await openManagementPanel(page, 'products');
  await page.screenshot({ path: testInfo.outputPath('management-products.png') });
  await page.goto('/#settings');
  await expect(page.locator('#settingsProducts')).toBeVisible();
  await expect(page.locator('#nav-products')).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test.describe('product category picker touch support', () => {
  test.use({ hasTouch: true });

  test('custom category menu supports touch selection and keyboard dismissal', async ({ page }, testInfo) => {
    const errors = await openWorkspace(page);
    await openManagementPanel(page, 'products');
    await page.locator('.btn-add-product').click();
    const toggle = page.getByRole('button', { name: '選擇商品類別', exact: true });
    const options = page.locator('#productCategoryOptions');
    await page.locator('#productEditModal .modal-content').evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const priceBefore = await page.locator('#productPrice').boundingBox();
    await toggle.tap();
    await expect(options).toBeVisible();
    const priceAfter = await page.locator('#productPrice').boundingBox();
    expect(Math.abs(priceAfter.y - priceBefore.y)).toBeLessThan(1);
    expect(await options.evaluate((element) => element.parentElement.id)).toBe('productEditModal');
    await page.screenshot({ path: testInfo.outputPath('category-popup.png') });
    await options.getByRole('button', { name: '伴手禮', exact: true }).tap();
    await expect(page.locator('#productCategory')).toHaveValue('伴手禮');
    await expect(options).toBeHidden();
    await toggle.tap();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(options).toBeHidden();
    await toggle.tap();
    await page.keyboard.press('Escape');
    await expect(options).toBeHidden();
    await expect(page.locator('#productEditModal')).toBeVisible();
    await toggle.tap();
    await page.locator('#productName').tap();
    await expect(options).toBeHidden();
    await page.locator('#productCategory').fill('新類別');
    await expect(options).toContainText('可直接輸入新類別');
    await page.locator('#productEditModal button[onclick="closeProductEditModal()"]').first().click();
    await page.locator('.btn-card-edit').first().click();
    await expect(page.locator('#productCategory')).toHaveValue('伴手禮');
    await expect(options).toBeHidden();
    await toggle.tap();
    await options.getByRole('button', { name: '喜餅', exact: true }).tap();
    await page.locator('#productEditModal button[onclick="saveProduct()"]').click();
    await expect(page.locator('#productEditModal')).toBeHidden();
    expect(
      await page.evaluate(
        () => window.__calls.find((call) => call.method === 'saveProduct').args[0].category,
      ),
    ).toBe('喜餅');
    expect(errors).toEqual([]);
  });
});

test('custom categories support unified catalog, cart and order editing', async ({ page }) => {
  const errors = await openWorkspace(page);
  await expect(page.locator('#nav-gift')).toHaveText('商品');
  await expect(page.locator('#nav-cake')).toHaveCount(0);
  await openManagementPanel(page, 'products');
  await page.locator('.btn-add-product').click();
  await expect(page.locator('#productCategory')).toHaveValue('');
  await page.locator('#productName').fill('烏龍茶');
  await page.locator('#productCategory').fill(' 茶飲 ');
  await page.locator('#productPrice').fill('80');
  await page.locator('#productEditModal button[onclick="saveProduct()"]').click();
  await expect(page.locator('#productsCardGrid')).toContainText('茶飲');
  await expect(page.locator('#productCategoryOptions button').filter({ hasText: '茶飲' })).toHaveCount(1);
  await page.locator('#nav-gift').click();
  await expect(page.locator('#giftProducts')).toContainText('原味餅');
  await expect(page.locator('#giftProducts')).toContainText('喜餅');
  await expect(page.locator('#giftProducts')).toContainText('烏龍茶');
  await page.locator('#catalogFilterTabs').getByRole('button', { name: '茶飲 (1)', exact: true }).click();
  await expect(page.locator('#giftProducts')).not.toContainText('原味餅');
  await page.locator('#giftProducts button').last().click();
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartModalBody')).toContainText('烏龍茶');
  await page.locator('#cartModalBody .cart-qty-btn').last().click();
  await expect(page.locator('#workspaceQuantity')).toHaveText('2 件商品');
  await page.locator('#cartModalBody .cart-delete-btn').click();
  await expect(page.locator('#workspaceQuantity')).toHaveText('0 件商品');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.__orderDetails = {
      orderId: 'custom-order',
      customerName: '測試',
      items: [{ productId: 'P-new', productName: '烏龍茶', unitPrice: 80, quantity: 3 }],
    };
    window.editOrder('custom-order');
  });
  await expect(page.locator('#workspaceQuantity')).toHaveText('3 件商品');
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartModalBody')).toContainText('烏龍茶');
  expect(errors).toEqual([]);
});

test('numeric fields restrict text and preserve phone zeros and decimal amounts', async ({ page }) => {
  await openWorkspace(page);
  const phone = page.locator('#customerPhone');
  await expect(phone).toHaveAttribute('inputmode', 'numeric');
  await phone.fill('0912345678');
  await phone.pressSequentially('abc');
  await expect(phone).toHaveValue('0912345678');
  await phone.evaluate((input) => {
    input.value = '09中文12-34';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(phone).toHaveValue('091234');
  await page.locator('#contactMethodLine').click();
  await expect(phone).toHaveValue('LINE');
  await page.locator('#contactMethodPhone').click();
  await expect(phone).toHaveAttribute('inputmode', 'numeric');
  const result = await page.evaluate(() => {
    const amount = document.getElementById('shippingFee');
    amount.value = '12.5';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    const quantity = document.getElementById('modalQuantity');
    return {
      amount: amount.value,
      amountMode: amount.inputMode,
      quantityMode: quantity.inputMode,
      rejectsText: !quantity.dispatchEvent(
        new InputEvent('beforeinput', {
          data: '中文',
          inputType: 'insertText',
          bubbles: true,
          cancelable: true,
        }),
      ),
      rejectsExponent: !quantity.dispatchEvent(
        new InputEvent('beforeinput', {
          data: 'e',
          inputType: 'insertText',
          bubbles: true,
          cancelable: true,
        }),
      ),
    };
  });
  expect(result).toEqual({
    amount: '12.5',
    amountMode: 'decimal',
    quantityMode: 'numeric',
    rejectsText: true,
    rejectsExponent: true,
  });
});
