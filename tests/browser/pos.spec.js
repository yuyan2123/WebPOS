const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const jsQR = require('jsqr');

async function openThemeControls(page) {
  if (!(await page.locator('#settingsSystem').isVisible())) await openManagementPanel(page, 'device');
  await page.locator('#themeToggle').scrollIntoViewIfNeeded();
}

async function deferOrderQueries(page) {
  await page.evaluate(() => {
    const original = window.posApi.call;
    window.__queries = [];
    window.posApi.call = (method, args) => {
      if (!['searchOrders', 'searchOverdueOrders'].includes(method)) return original(method, args);
      return new Promise((resolve, reject) => window.__queries.push({ method, args, resolve, reject }));
    };
  });
}

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`order disclosure supports keyboard, focus and accessible state with motion ${reducedMotion}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await openWorkspace(page);
    await page.locator('#nav-search').click();
    await page.evaluate(
      () =>
        (window.__orders = [
          {
            id: 'one',
            customerName: '同名客戶',
            totalAmount: 100,
            status: '已確認',
            items: [{ productName: '原味餅', quantity: 2, unitPrice: 50, subtotal: 100 }],
          },
          { id: 'two', customerName: '同名客戶', totalAmount: 0, status: '已確認', items: [] },
        ]),
    );
    await page.locator('#searchName').fill('同名');
    await page.locator('#searchName').press('Enter');
    const first = page.locator('.order-items-toggle[data-oid="one"]');
    const second = page.locator('.order-items-toggle[data-oid="two"]');
    await first.focus();
    await first.press('Enter');
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(first).toBeFocused();
    await expect(page.locator('#' + (await first.getAttribute('aria-controls')))).toContainText('原味餅');
    await expect(page.locator('.order-items-expand')).toHaveCSS('opacity', '1');
    await expect(page.locator('.order-items-table')).toBeVisible();
    await first.press('Space');
    await expect(page.locator('.order-items-row')).toHaveCount(0);
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(first).toBeFocused();
    await first.press('Enter');
    await second.focus();
    await second.press('Enter');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(second).toBeFocused();
    await expect(page.locator('.order-items-empty')).toHaveText('此訂單沒有商品明細');
    await expect(page.locator('.order-items-empty')).toBeVisible();
    await expect(page.locator('.order-items-expand')).toHaveCSS('opacity', '1');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await settleUI(page);
      const scan = await new AxeBuilder({ page }).include('#search').analyze();
      expect(scan.violations).toEqual([]);
      await second.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${theme}-disclosure.png`) });
    }
    await second.press('Space');
    await page.locator('#searchName').focus();
    await expect(page.locator('.order-items-row')).toHaveCount(0);
    await expect(page.locator('#searchName')).toBeFocused();
  });
}

test('clearing a collapsing order prevents its animation from restoring the old table', async ({ page }) => {
  await openWorkspace(page);
  await page.locator('#nav-search').click();
  await page.evaluate(
    () =>
      (window.__orders = [
        {
          id: 'animation-order',
          customerName: '舊訂單',
          totalAmount: 100,
          items: [{ productName: '商品', quantity: 1, unitPrice: 100, subtotal: 100 }],
        },
      ]),
  );
  await page.locator('#searchName').fill('舊訂單');
  await page.locator('#searchName').press('Enter');
  await expect(page.locator('#searchResults')).toContainText('舊訂單');
  await page.addStyleTag({ content: '.order-items-expand { animation-delay: 300ms !important; }' });
  await page.evaluate(() => {
    window.toggleOrderItems('animation-order');
    window.toggleOrderItems('animation-order');
    window.clearSearch();
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.locator('#searchResults')).toContainText('開始查詢');
  await expect(page.locator('#searchResults table')).toHaveCount(0);
});

test('order search ignores stale responses, clear cancels results and overdue retries its own query', async ({
  page,
}) => {
  await openWorkspace(page);
  await page.locator('#nav-search').click();
  await deferOrderQueries(page);
  const name = page.locator('#searchName');
  await name.fill('舊查詢');
  await name.press('Enter');
  await expect(page.locator('#searchResults')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#searchResults')).toContainText('正在查詢');
  await name.fill('新查詢');
  await name.press('Enter');
  await page.evaluate(() =>
    window.__queries[1].resolve({
      orders: [
        {
          id: 'new',
          customerName: '新的客戶',
          totalAmount: 12000,
          depositAmount: 12000,
          remainingAmount: 0,
          status: '已付清',
          deliveryDate: '2026-10-01',
        },
      ],
    }),
  );
  await expect(page.locator('#searchResults')).toContainText('新的客戶');
  await expect(page.locator('.td-amount')).toHaveText('NT$ 12,000');
  await expect(page.locator('.td-remaining')).toHaveText('NT$ 0');
  await expect(page.locator('.td-remaining')).toHaveClass(/clear/);
  await page.evaluate(() => window.__queries[0].reject(new Error('舊查詢失敗')));
  await expect(page.locator('#searchResults')).toContainText('新的客戶');
  await name.press('Enter');
  await page.locator('.btn-clear').click();
  await page.evaluate(() => window.__queries[2].resolve({ orders: [{ customerName: '已清除的回覆' }] }));
  await expect(page.locator('#searchResults')).toContainText('開始查詢');
  await expect(page.locator('#searchName')).toBeFocused();
  await expect(page.locator('.btn-search')).toBeEnabled();
  await page.locator('#overdueShortcut').click();
  await page.evaluate(() => window.__queries[3].reject(new Error('連線中斷')));
  await expect(page.locator('#searchResults')).toContainText('連線中斷');
  await page.getByRole('button', { name: '重新搜尋', exact: true }).click();
  await expect(page.locator('#searchResults')).toBeFocused();
  expect(await page.evaluate(() => window.__queries[4].method)).toBe('searchOverdueOrders');
  await page.evaluate(() => window.__queries[4].resolve([]));
  await expect(page.locator('#searchResults')).toContainText('目前沒有過期');
  await expect(page.locator('#searchResults')).not.toHaveAttribute('aria-busy');
});

test('pagination cannot append to a newer search and preserves keyboard focus on completion', async ({
  page,
}) => {
  await openWorkspace(page);
  await page.locator('#nav-search').click();
  await deferOrderQueries(page);
  await page.locator('#searchName').fill('客戶');
  await page.locator('#searchName').press('Enter');
  await page.evaluate(() =>
    window.__queries[0].resolve({
      orders: [{ id: 'first', customerName: '第一頁', totalAmount: 100 }],
      pagination: { nextCursor: 'next' },
    }),
  );
  await page.locator('#searchLoadMore').focus();
  await page.keyboard.press('Enter');
  await page.evaluate(() =>
    window.__queries[1].resolve({
      orders: [{ id: 'second', customerName: '第二頁', totalAmount: 200 }],
      pagination: {},
    }),
  );
  await expect(page.locator('#searchResults .result-title')).toBeFocused();
  await expect(page.locator('#searchAnnouncement')).toHaveText('搜尋結果，共 2 筆');
  await page.locator('#searchName').press('Enter');
  await page.evaluate(() =>
    window.__queries[2].resolve({
      orders: [{ id: 'third', customerName: '另一頁', totalAmount: 100 }],
      pagination: { nextCursor: 'next' },
    }),
  );
  await page.locator('#searchLoadMore').click();
  await page.locator('#overdueShortcut').click();
  await page.evaluate(() => window.__queries[4].resolve([]));
  await page.evaluate(() =>
    window.__queries[3].resolve({ orders: [{ id: 'late', customerName: '過期分頁' }] }),
  );
  await expect(page.locator('#searchResults')).toContainText('目前沒有過期');
  await expect(page.locator('#searchResults')).not.toContainText('過期分頁');
});

test('search empty, loading and error states remain readable in both themes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspace(page);
  await page.locator('#nav-search').click();
  await deferOrderQueries(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await page.locator('.btn-clear').click();
    await page.locator('#searchName').fill('範例');
    await page.locator('#searchName').press('Enter');
    await page.screenshot({ path: testInfo.outputPath(`${theme}-search-loading.png`) });
    await page.evaluate(() => window.__queries.at(-1).resolve({ orders: [] }));
    await expect(page.locator('#searchResults')).toContainText('減少搜尋條件');
    await page.screenshot({ path: testInfo.outputPath(`${theme}-search-empty.png`) });
    let scan = await new AxeBuilder({ page }).include('#search').analyze();
    expect(scan.violations).toEqual([]);
    await page.locator('#searchName').press('Enter');
    await page.evaluate(() => window.__queries.at(-1).reject(new Error('連線中斷，請稍後重試')));
    scan = await new AxeBuilder({ page }).include('#search').analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-search-error.png`) });
    await page.getByRole('button', { name: '重新搜尋', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '重新搜尋', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`${theme}-search-retry.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('history navigation moves keyboard focus to the restored page heading', async ({ page }) => {
  await openWorkspace(page);
  await page.locator('#nav-search').click();
  await page.locator('#searchName').focus();
  await page.goBack();
  await expect(page.locator('#customer')).toBeVisible();
  await expect(page.locator('#workspaceTitle')).toBeFocused();
  await page.goForward();
  await expect(page.locator('#search')).toBeVisible();
  await expect(page.locator('#workspaceTitle')).toBeFocused();
});

test('notifications pause while focused and dismiss without motion or losing keyboard context', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspace(page);
  await page.clock.install();
  await page.getByRole('button', { name: '儲存並下一步' }).click();
  const notification = page.locator('.alert-error');
  const close = notification.getByRole('button', { name: '關閉通知' });
  await close.focus();
  await page.clock.fastForward(10000);
  await expect(notification).toBeVisible();
  await close.press('Enter');
  await expect(notification).toHaveCount(0);
  await expect(page.locator('#workspaceTitle')).toBeFocused();
  await page.getByRole('button', { name: '儲存並下一步' }).click();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(7000);
  await expect(notification).toHaveCount(0);
});

test('customer identity errors stay beside the fields until corrected', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '儲存並下一步' }).click();
  await expect(page.locator('#customerIdentityError')).toBeVisible();
  await expect(page.locator('#customerName')).toBeFocused();
  await expect(page.locator('#customerName')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#customerIdentityHint')).toBeHidden();
  await settleUI(page);
  const errorColor = await page
    .locator('#customerIdentityError')
    .evaluate((el) => getComputedStyle(el).color);
  await expect(page.locator('#customerName')).toHaveCSS('border-color', errorColor);
  await expect(page.locator('#customerPhone')).toHaveCSS('border-color', errorColor);
  const scan = await new AxeBuilder({ page }).include('#customer').analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('customer-validation.png') });
  await page.locator('#customerPhone').fill('0912345678');
  await expect(page.locator('#customerIdentityError')).toBeHidden();
  await expect(page.locator('#customerIdentityHint')).toBeVisible();
  await expect(page.locator('#customerName')).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: '儲存並下一步' }).click();
  await expect(page.locator('#date')).toBeVisible();
});

test('customer suggestions support keyboard selection and announce the active option', async ({ page }) => {
  await openWorkspace(page);
  await page.evaluate(() => {
    window.__customers = [
      { name: '測試甲', phone: '0911111111', address: '第一筆地址' },
      { name: '測試乙', phone: '0922222222', address: '第二筆地址' },
    ];
  });
  const input = page.locator('#customerName');
  await input.fill('測試');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.press('ArrowUp');
  await expect(input).toHaveAttribute('aria-activedescendant', 'customerAcList-option-1');
  await expect(page.locator('#customerAcList-option-1')).toHaveAttribute('aria-selected', 'true');
  const scan = await new AxeBuilder({ page }).include('#customer').analyze();
  expect(scan.violations).toEqual([]);
  await input.press('Enter');
  await expect(input).toHaveValue('測試乙');
  await expect(page.locator('#customerAddress')).toHaveValue('第二筆地址');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toBeFocused();
});

test('late customer suggestions cannot replace a newer query or reopen after Escape', async ({ page }) => {
  await openWorkspace(page);
  await page.evaluate(() => {
    const original = window.posApi.call;
    window.__customerReplies = {};
    window.posApi.call = (method, args) =>
      method === 'searchCustomers'
        ? new Promise((resolve) => {
            window.__customerReplies[args[0].keyword] = resolve;
          })
        : original(method, args);
  });
  const input = page.locator('#customerName');
  await input.fill('舊查詢');
  await expect.poll(() => page.evaluate(() => Boolean(window.__customerReplies['舊查詢']))).toBe(true);
  await input.fill('新查詢');
  await expect.poll(() => page.evaluate(() => Boolean(window.__customerReplies['新查詢']))).toBe(true);
  await page.evaluate(() => window.__customerReplies['新查詢']([{ name: '新的客戶' }]));
  await expect(page.locator('#customerAcList')).toContainText('新的客戶');
  await page.evaluate(() => window.__customerReplies['舊查詢']([{ name: '過期客戶' }]));
  await expect(page.locator('#customerAcList')).not.toContainText('過期客戶');
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.fill('待回覆');
  await expect.poll(() => page.evaluate(() => Boolean(window.__customerReplies['待回覆']))).toBe(true);
  await page.locator('#customerAddress').focus();
  await page.evaluate(() => window.__customerReplies['待回覆']([{ name: '離開後回覆' }]));
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#customerAcList')).toBeHidden();
  await input.fill('取消查詢');
  await expect.poll(() => page.evaluate(() => Boolean(window.__customerReplies['取消查詢']))).toBe(true);
  await input.press('Escape');
  await page.evaluate(() => window.__customerReplies['取消查詢']([{ name: '取消後回覆' }]));
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.fill('切換欄位');
  await expect.poll(() => page.evaluate(() => Boolean(window.__customerReplies['切換欄位']))).toBe(true);
  await page.locator('#customerPhone').focus();
  await page.evaluate(() => window.__customerReplies['切換欄位']([{ name: '原欄位回覆' }]));
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#customerAcList')).toBeHidden();
});

test('mobile date pickers remain inside the viewport above navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspace(page);
  for (const [panel, input] of [
    ['search', 'searchDate'],
    ['reports', 'reportDatePicker'],
    ['demand', 'demandDatePicker'],
    ['capacity', 'overrideDate'],
  ]) {
    if (panel === 'search') await page.locator('#nav-search').click();
    else await openManagementPanel(page, panel);
    for (const size of [
      { width: 375, height: 740 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(size);
      await page.locator('#' + input).click();
      const calendar = page.locator('.air-datepicker.-active-');
      await expect(calendar).toHaveClass(/-is-mobile-/);
      await expect(page.locator('.air-datepicker-overlay')).toHaveClass(/-active-/);
      await expect
        .poll(async () => {
          const box = await calendar.boundingBox();
          return (
            box &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= size.width &&
            box.y + box.height <= size.height
          );
        })
        .toBe(true);
      if (panel === 'search' && size.width === 375) {
        await page.screenshot({ path: testInfo.outputPath('mobile-calendar.png') });
        await calendar
          .locator('.air-datepicker-cell.-day-:not(.-other-month-)')
          .filter({ hasText: /^15$/ })
          .click();
        await expect(page.locator('#searchDate')).toHaveValue(/\d{4}-\d{2}-15/);
      } else {
        await calendar.getByRole('button', { name: '關閉', exact: true }).click();
      }
      await expect(page.locator('.air-datepicker.-active-')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 375, height: 740 });
  }
});

test('theme toggle defaults to auto, follows the device and persists manual choices', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const errors = await openWorkspace(page);
  await openThemeControls(page);
  const root = page.locator('html');
  const toggle = page.locator('#themeToggle');
  await expect(root).toHaveAttribute('data-theme-preference', 'auto');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAccessibleName('切換至淺色模式');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-theme-preference', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Space');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAccessibleName('切換至跟隨系統');
  await expect(toggle).toBeFocused();
  await page.reload();
  await expect(root).toHaveAttribute('data-theme-preference', 'dark');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#startupStatus')).toBeHidden();
  await openThemeControls(page);
  await expect(toggle).toHaveAccessibleName('切換至跟隨系統');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await openThemeControls(page);
  await toggle.click();
  await expect(root).toHaveAttribute('data-theme-preference', 'auto');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme-preference', 'auto');
  await expect(page.locator('#startupStatus')).toBeHidden();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(root).toHaveAttribute('data-theme', scheme);
    await expect(toggle).toHaveCSS('color', scheme === 'dark' ? 'rgb(210, 229, 245)' : 'rgb(34, 79, 85)');
    for (const size of [
      { width: 375, height: 812 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(size);
      await openThemeControls(page);
      await expect(toggle).toBeInViewport();
      const box = await toggle.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
      await page.screenshot({ path: testInfo.outputPath(`theme-${scheme}-${size.width}.png`) });
    }
    const scan = await new AxeBuilder({ page }).include('.theme-settings').analyze();
    expect(scan.violations).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('theme toggle still works when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    for (const name of ['getItem', 'setItem']) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (key, ...args) {
        if (key === 'ginJiaPos.theme') throw new DOMException('Storage blocked', 'SecurityError');
        return original.call(this, key, ...args);
      };
    }
  });
  const errors = await openWorkspace(page);
  await openThemeControls(page);
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('closing nested print preview restores both levels of dialog focus', async ({ page }) => {
  await openWorkspace(page);
  await page.locator('#nav-search').click();
  await page.locator('#nav-search').focus();
  await page.evaluate(() => {
    window.__orderDetails = {
      orderId: 'O-focus',
      customerName: '測試客戶',
      status: '未付款',
      totalAmount: 100,
      depositAmount: 0,
      items: [],
    };
    window.viewOrderDetails('O-focus');
  });
  const detail = page.locator('.order-detail-modal');
  const print = detail.getByRole('button', { name: '列印訂單', exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await print.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#printer-preview')).toBeVisible();
    await expect(detail).toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('#printer-preview')).toHaveCount(0);
    await expect(print).toBeFocused();
  }
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(page.locator('#nav-search')).toBeFocused();
});

test('closing replacement order dialogs restores focus to the original trigger', async ({ page }) => {
  await openWorkspace(page);
  await page.locator('#nav-search').click();
  for (const action of ['設定訂金', '標記完成']) {
    await page.locator('#nav-search').focus();
    await page.evaluate(() => {
      window.__orderDetails = {
        orderId: 'O-focus',
        customerName: '測試客戶',
        status: '未付款',
        totalAmount: 100,
        depositAmount: 0,
        items: [],
      };
      window.viewOrderDetails('O-focus');
    });
    const detail = page.locator('.order-detail-modal');
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: action, exact: true }).click();
    await expect(detail).toHaveCount(0);
    const replacement = page.locator(action === '設定訂金' ? '#depositModal' : '#statusConfirmModal');
    await expect(replacement).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(replacement).not.toHaveClass(/active/);
    await expect(page.locator('#nav-search')).toBeFocused();
  }
});

test('M3 screens and dialogs stay readable in both themes at narrow and wide sizes', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await openWorkspace(page);
  const dismiss = page.locator('#pwaDismiss');
  if (await dismiss.isVisible()) await dismiss.click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const panel of [
      'customer',
      'date',
      'gift',
      'giftbox',
      'search',
      'products',
      'capacity',
      'demand',
      'reports',
      'printer',
      'device',
    ]) {
      if (['customer', 'date', 'gift', 'giftbox', 'search'].includes(panel))
        await page.locator('#nav-' + panel).click();
      else await openManagementPanel(page, panel);
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .disableRules(['meta-viewport'])
        .analyze();
      expect(
        result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
        `${theme}: ${panel}`,
      ).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${panel}.png`) });
    }
    await openManagementPanel(page, 'products');
    await page.getByRole('button', { name: '新增商品', exact: true }).click();
    await settleUI(page);
    const editor = await new AxeBuilder({ page })
      .include('#productEditModal')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      editor.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
      `${theme}: product editor`,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-product-editor.png`) });
    await page.keyboard.press('Escape');
    await page.locator('#nav-gift').click();
    await page.locator('#giftProducts button').first().click();
    await settleUI(page);
    const product = await new AxeBuilder({ page })
      .include('#productModal')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      product.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
      `${theme}: product detail`,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-product-detail.png`) });
    await page.keyboard.press('Escape');
  }
});

async function settleUI(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
}

test('UI Kit keeps outlined fields, editable steppers and readable checkout states', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('#customerName')).toHaveCSS('min-height', '56px');
  await expect(page.locator('#customerName')).toHaveCSS('border-radius', '8px');
  await page.locator('#nav-gift').click();
  // Decorative selection marks must not change the existing accessible names.
  await expect(page.getByRole('button', { name: '全部類別 (2)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#giftProducts button').first().click();
  await expect(page.locator('#modalQuantity')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('#modalQuantity')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.locator('#modalQuantity').fill('3');
  await page.locator('#modalQuantity').press('Tab');
  await expect(page.locator('#modalQuantity')).toHaveValue('3');
  await settleUI(page);
  const plus = page.locator('.product-quantity-control button').last();
  expect((await plus.boundingBox()).width).toBeGreaterThanOrEqual(47.99);
  expect((await plus.boundingBox()).height).toBeGreaterThanOrEqual(47.99);
  await page.keyboard.press('Escape');
  await page.locator('#giftProducts button').last().click();
  await page.locator('#workspaceCart').click();
  await settleUI(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const results = await new AxeBuilder({ page })
      .include('#cartModal')
      .withRules(['color-contrast'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});

function decodePrintedQr(bytes) {
  const rows = [];
  let offset = 5;
  let width = 0;
  while (bytes[offset] === 29 && bytes[offset + 1] === 118) {
    const rowBytes = bytes[offset + 4] + bytes[offset + 5] * 256;
    const height = bytes[offset + 6] + bytes[offset + 7] * 256;
    width = rowBytes * 8;
    offset += 8;
    rows.push(...bytes.slice(offset, offset + rowBytes * height));
    offset += rowBytes * height;
  }
  const pixels = new Uint8ClampedArray(rows.length * 8 * 4);
  rows.forEach((byte, index) => {
    for (let bit = 0; bit < 8; bit++) {
      const pixel = (index * 8 + bit) * 4;
      pixels.fill(byte & (128 >> bit) ? 0 : 255, pixel, pixel + 3);
      pixels[pixel + 3] = 255;
    }
  });
  return jsQR(pixels, width, (rows.length * 8) / width);
}

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
    const products = JSON.parse(sessionStorage.getItem('test-product-order') || 'null') || [
      {productId:'P1',productName:'原味餅',category:'伴手禮',price:50,companyPrice:40,status:'啟用',giftBoxEnabled:'是'},
      {productId:'P2',productName:'喜餅',category:'喜餅',price:100,status:'啟用',giftBoxEnabled:'是'}
    ];
    window.posApi = {call:async (method,args) => {
      window.__calls.push({method,args});
      if (window.__fail === method) throw new Error('測試連線中斷');
      if (method === 'getShopBootstrap') return {products,capacityMonth:{key:args[0] + '-' + args[1],data:{}},capacitySettings:{weekday:{'1':{dayOfWeek:1,maxQuantity:120,enabled:true}},dateOverrides:[{id:'2027-01-02',date:'2027-01-02',maxQuantity:45,enabled:true}]}};
      if (method === 'getProducts') return products;
      if (method === 'saveProductOrder') {
        if (window.__orderConflict) throw new Error('商品清單或順序已被其他人修改，請重新載入後再調整。');
        const reordered = args[0].productIds.map(id => products.find(p => p.productId === id));
        products.splice(0, products.length, ...reordered);
        sessionStorage.setItem('test-product-order', JSON.stringify(products));
        return {success:true,products};
      }
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
  if (panel === 'printer') await page.locator('#printer-tab-device').click();
}

for (const month of [9, 11]) {
  test(`pickup capacity preloads three months from month ${month}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, month - 1, 15, 12));
    const errors = await openWorkspace(page);
    const upcoming = [1, 2].map((offset) => {
      const date = new Date(2026, month - 1 + offset, 1);
      return [date.getFullYear(), date.getMonth() + 1];
    });
    await page.evaluate(() => {
      const original = window.posApi.call;
      window.posApi.call = async (method, args) => {
        if (method !== 'getMonthCapacityStatus') return original(method, args);
        window.__calls.push({ method, args });
        const date = `${args[0]}-${String(args[1]).padStart(2, '0')}-01`;
        return { [date]: { hasLimit: true, currentQuantity: 25, limit: 100, usageRate: 25 } };
      };
      window.showSection('date');
    });
    const requests = () =>
      page.evaluate(() =>
        window.__calls.filter((call) => call.method === 'getMonthCapacityStatus').map((call) => call.args),
      );
    // The current month comes from bootstrap; both upcoming months load on opening.
    await expect.poll(requests).toEqual(upcoming);
    for (const [year, nextMonth] of upcoming) {
      await page.evaluate(() => window.changeMonth(1));
      const date = `${year}-${String(nextMonth).padStart(2, '0')}-01`;
      await expect(page.locator(`[data-date="${date}"] .cap-indicator`)).toHaveText('25/100');
    }
    await page.evaluate(() => {
      window.changeMonth(-1);
      window.changeMonth(-1);
    });
    const calls = await requests();
    for (const args of upcoming) {
      expect(calls.filter((call) => call[0] === args[0] && call[1] === args[1])).toHaveLength(1);
    }
    expect(errors).toEqual([]);
  });
}

test('order details reflow, disclose gift contents and keep actions accessible', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = await openWorkspace(page);
  await page.locator('#nav-search').click();
  await page.evaluate(() => {
    window.__orderDetails = {
      orderId: 'O0123456789abcdef0123456789abcdef',
      customerName: '王小明',
      customerContactType: 'line',
      customerLineId: 'wang_bakery',
      isCompanyCustomer: true,
      recipientName: '陳小姐',
      recipientPhone: '0912345678',
      customerAddress: '新北市板橋區文化路二段 123 號 10 樓',
      shippingNotes: '請先電話聯絡\n交給一樓管理室',
      deliveryDate: '2026-10-02',
      deliveryType: '外送',
      status: '已付訂金',
      totalAmount: 13600,
      depositAmount: 10000,
      remainingAmount: 3600,
      shippingFee: 100,
      items: [
        {
          productName: '經典綜合禮盒',
          quantity: 2,
          unitPrice: 500,
          originalPrice: 600,
          isSpecialPrice: true,
          subtotal: 1000,
          isGiftBox: true,
          giftBoxDetails: { products: { P1: 3, P2: 2 }, notes: '不要花生 <img src=x onerror=alert(1)>' },
        },
        { productName: '原味餅', quantity: 100, unitPrice: 50, subtotal: 5000 },
        { productName: '手工喜餅禮盒・婚禮限定款（附提袋）', quantity: 25, unitPrice: 300, subtotal: 7500 },
      ],
    };
  });
  const originalSize = page.viewportSize();
  for (const size of [originalSize, { width: 375, height: 812 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(size);
    for (const theme of ['light', 'dark']) {
      await page.locator('#nav-search').focus();
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        window.viewOrderDetails(window.__orderDetails.orderId);
      }, theme);
      const modal = page.getByRole('dialog', { name: /^訂單詳情 / });
      await expect(modal).toBeVisible();
      await settleUI(page);
      await expect(modal.locator('.order-detail-overview')).toContainText('NT$ 3,600');
      await expect(modal.locator('.order-detail-facts').first()).toContainText('wang_bakery');
      await expect(modal.locator('.order-detail-note').last()).toContainText('交給一樓管理室');
      await expect(modal.locator('.order-detail-table tbody > tr')).toHaveCount(3);
      const gift = modal.locator('.order-detail-gift');
      await expect(gift).not.toHaveAttribute('open');
      await gift.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(gift).toHaveAttribute('open', '');
      await expect(gift).toContainText('共 6 個');
      await expect(gift).toContainText('共 4 個');
      await expect(gift).toContainText('<img src=x onerror=alert(1)>');
      await expect(gift.locator('img')).toHaveCount(0);
      await page.keyboard.press('Enter');
      await modal.locator('.modal-body').evaluate((body) => {
        body.scrollTop = 0;
      });
      const scan = await new AxeBuilder({ page })
        .include('.order-detail-modal')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        scan.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
        `${theme}, ${size.width}px`,
      ).toEqual([]);
      expect(
        await modal.evaluate((element) =>
          [...element.querySelectorAll('.modal-content, .modal-body, .order-detail-table')].every(
            (node) => node.scrollWidth <= node.clientWidth + 1,
          ),
        ),
      ).toBe(true);
      for (const button of await modal.locator('.modal-footer button').all()) {
        const bounds = await button.boundingBox();
        expect(bounds.height).toBeGreaterThanOrEqual(48);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height);
      }
      await page.screenshot({
        path: testInfo.outputPath(`order-detail-${theme}-${size.width}.png`),
        animations: 'disabled',
      });
      await modal.getByRole('button', { name: '標記完成', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(modal.getByRole('button', { name: '關閉訂單詳情', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await expect(page.locator('#nav-search')).toBeFocused();
    }
  }
  await page.setViewportSize(originalSize);
  await page.evaluate(() => window.viewOrderDetails(window.__orderDetails.orderId));
  let modal = page.getByRole('dialog', { name: /^訂單詳情 / });
  await modal.getByRole('button', { name: '設定訂金', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('#depositModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.viewOrderDetails(window.__orderDetails.orderId));
  await modal.getByRole('button', { name: '標記完成', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('#statusConfirmModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.viewOrderDetails(window.__orderDetails.orderId));
  await modal.getByRole('button', { name: '編輯訂單', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('#customerName')).toHaveValue('王小明');
  await expect(page.locator('#deliveryDate')).toHaveValue('2026-10-02');
  await expect(page.locator('#shippingFee')).toHaveValue('100');
  await page.locator('#nav-search').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.__orderDetails.items = Array(30).fill(window.__orderDetails.items[0]);
    window.viewOrderDetails(window.__orderDetails.orderId);
  });
  await expect(modal).toBeVisible();
  const footerTop = (await modal.locator('.modal-footer').boundingBox()).y;
  await modal.locator('.modal-body').evaluate((body) => {
    body.scrollTop = body.scrollHeight;
  });
  expect(await modal.locator('.modal-body').evaluate((body) => body.scrollTop)).toBeGreaterThan(0);
  expect((await modal.locator('.modal-footer').boundingBox()).y).toBe(footerTop);
  await modal.getByRole('button', { name: '關閉', exact: true }).click();
  await page.evaluate(() => {
    document.body.dataset.shopRole = 'viewer';
    window.__orderDetails.status = '完成';
    window.__orderDetails.remainingAmount = 0;
    window.__orderDetails.deliveryType = '自取';
    window.viewOrderDetails(window.__orderDetails.orderId);
  });
  modal = page.getByRole('dialog', { name: /^訂單詳情 / });
  await expect(modal.locator('.order-detail-overview')).toContainText('NT$ 0');
  await expect(modal.getByRole('button', { name: /編輯訂單|標記完成|設定訂金|列印訂單/ })).toHaveCount(0);
  await expect(modal.locator('.order-detail-facts').first()).not.toContainText('收件人');
  await modal.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.evaluate(() => {
    window.__orderDetails.items = [];
    window.viewOrderDetails(window.__orderDetails.orderId);
  });
  await expect(modal).toContainText('此訂單沒有商品明細');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('standalone shell stays within the viewport across tablet rotations', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
  });
  await page.setViewportSize({ width: 1180, height: 820 });
  await openWorkspace(page);
  await expect(page.locator('html')).toHaveClass(/standalone-app/);
  // Long content must scroll inside main without making the root scrollable.
  await page.locator('main').evaluate((main) => {
    const content = document.createElement('div');
    content.style.cssText = 'min-height: 2400px; flex-shrink: 0';
    main.append(content);
  });
  for (const size of [
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const bounds = document.body.getBoundingClientRect();
          return Math.abs(bounds.top) < 1 && Math.abs(bounds.bottom - innerHeight) < 1;
        }),
      )
      .toBe(true);
    const result = await page.evaluate(() => {
      window.scrollTo(0, 300);
      const main = document.querySelector('main');
      main.scrollTop = 300;
      return {
        rootScroll: window.scrollY,
        contentScroll: main.scrollTop,
        rootFits: document.documentElement.scrollHeight <= innerHeight + 1,
      };
    });
    expect(result).toEqual({ rootScroll: 0, contentScroll: 300, rootFits: true });
  }
});

async function mockPrinter(page) {
  await page.addInitScript(() => {
    window.__printerFrames = [];
    window.__printerConnections = 0;
    window.__bridgeConfig = {
      event: 'config',
      firmware: '1.1.0',
      bridgeHost: 'xprinter.local',
      bridgeIp: '192.168.50.214',
      printerIp: '192.168.50.153',
      printerPort: 9100,
      revision: 1,
      wifiSsid: 'Shop Wi-Fi',
      wifiState: 'idle',
      wifiRevision: 1,
    };
    window.__printerUrls = [];
    window.WebSocket = class {
      constructor(url) {
        window.__printerUrls.push(url);
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
                    ...(window.__printerMode === 'legacy-config' ? {} : { configVersion: 1 }),
                  };
          if (command.type === 'get_config') response = { ...window.__bridgeConfig };
          if (command.type === 'set_config') {
            response =
              command.revision !== window.__bridgeConfig.revision
                ? { event: 'error', code: 'config_conflict' }
                : window.__printerMode === 'busy'
                  ? { event: 'error', code: 'busy' }
                  : (window.__bridgeConfig = {
                      ...window.__bridgeConfig,
                      printerIp: command.printerIp,
                      printerPort: command.printerPort,
                      revision: command.revision + 1,
                    });
          }
          if (command.type === 'set_wifi') {
            window.__bridgeConfig = {
              ...window.__bridgeConfig,
              wifiSsid: command.ssid,
              wifiRevision: command.wifiRevision + 1,
              wifiState: 'saved',
            };
            response = { event: 'wifi_pending', timeoutSeconds: 30 };
          }
          if (window.__printerMode === 'lost-config-ack' && command.type === 'set_config') {
            setTimeout(() => this.close(), 0);
            return;
          }
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

test('bridge settings persist on the device, detect conflicts and never retry a lost write', async ({
  page,
}) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-token').fill('test-secret');
  await expect(page.locator('#printer-device-save')).toBeDisabled();
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-target-ip')).toHaveValue('192.168.50.153');
  await expect(page.locator('#printer-device-info')).toContainText('192.168.50.214');
  // Device configuration does not require enabling printing or saving a local token.
  await expect(page.locator('#printer-enabled')).not.toBeChecked();
  await page.locator('#printer-target-ip').fill('192.168.50.200');
  await page.locator('#printer-target-port').fill('9101');
  await page.locator('#printer-device-save').click();
  await expect(page.locator('#printer-device-status')).toContainText('已儲存網路設定');
  expect(await page.evaluate(() => window.__bridgeConfig.printerIp)).toBe('192.168.50.200');
  expect(await page.evaluate(() => window.__bridgeConfig.printerPort)).toBe(9101);
  expect(
    await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('ginJiaPos.printer.'))),
  ).toBe(false);
  await page.evaluate(() => window.__bridgeConfig.revision++);
  await page.locator('#printer-device-save').click();
  await expect(page.locator('#printer-device-status')).toContainText('其他操作變更');
  await expect(page.locator('#printer-device-save')).toBeDisabled();
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-device-save')).toBeEnabled();
  await page.evaluate(() => {
    window.__printerMode = 'lost-config-ack';
    window.__printerFrames = [];
  });
  await page.locator('#printer-target-ip').fill('192.168.50.201');
  await page.locator('#printer-device-save').click();
  await expect(page.locator('#printer-device-status')).toContainText('不會自動重送');
  await expect(page.locator('#printer-device-save')).toBeDisabled();
  expect(
    await page.evaluate(() => window.__printerFrames.filter((frame) => frame.type === 'set_config').length),
  ).toBe(1);
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-target-ip')).toHaveValue('192.168.50.201');
  expect(
    await page.evaluate(() => window.__printerFrames.some((frame) => frame.type === 'begin' || frame.bytes)),
  ).toBe(false);
});

test('saved legacy printer hostname loads as xprinter and preserves credentials', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'ginJiaPos.printer.test-user:test-shop',
      JSON.stringify({
        url: 'wss://xiao-printer.local/ws',
        enabled: true,
        remember: true,
        token: 'test-secret',
      }),
    );
  });
  await mockPrinter(page);
  await openWorkspace(page);
  await openManagementPanel(page, 'printer');
  await expect(page.locator('#printer-url')).toHaveValue('wss://xprinter.local/ws');
  await expect(page.locator('#printer-token')).toHaveValue('test-secret');
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-device-status')).toContainText('已讀取裝置設定');
  expect(await page.evaluate(() => window.__printerUrls)).toEqual(['wss://xprinter.local/ws']);
});

test('bridge uses stable hostname, handles old firmware and validates target before opening a socket', async ({
  page,
}) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-token').fill('test-secret');
  await page.locator('#printer-url').fill('wss://192.168.50.214/ws');
  await page.locator('#printer-use-name').click();
  await expect(page.locator('#printer-url')).toHaveValue('wss://xprinter.local/ws');
  await page.evaluate(() => {
    window.__printerMode = 'legacy-config';
  });
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-device-status')).toContainText('請先更新橋接韌體');
  await expect(page.locator('#printer-device-save')).toBeDisabled();
  expect(await page.evaluate(() => window.__printerFrames.some((frame) => frame.type === 'get_config'))).toBe(
    false,
  );
  await page.evaluate(() => {
    window.__printerMode = '';
    window.__bridgeConfig.bridgeIp = '192.168.50.220';
  });
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-device-info')).toContainText('192.168.50.220');
  expect(
    await page.evaluate(() => window.__printerUrls.every((url) => url === 'wss://xprinter.local/ws')),
  ).toBe(true);
  const count = await page.evaluate(() => window.__printerConnections);
  await page.locator('#printer-target-ip').fill('999.1.2.3');
  await page.locator('#printer-device-save').click();
  await expect(page.locator('#printer-device-status')).toContainText('有效的印表機 IPv4');
  expect(await page.evaluate(() => window.__printerConnections)).toBe(count);
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-device-save')).toBeEnabled();
  await page.locator('#printer-url').fill('wss://other-bridge.local/ws');
  await expect(page.locator('#printer-device-save')).toBeDisabled();
  await expect(page.locator('#printer-device-info')).toBeEmpty();
});

test('Wi-Fi changes require reread, clear passwords and report rollback; viewers cannot configure', async ({
  page,
}) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-token').fill('test-secret');
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-device-save')).toBeEnabled();
  await page.locator('.printer-bridge summary').click();
  await page.locator('#printer-wifi-ssid').fill('New Shop Wi-Fi');
  await page.locator('#printer-wifi-password').fill('test-wifi-password');
  await page.locator('#printer-wifi-save').click();
  await expect(page.locator('#printer-device-status')).toContainText('尚未確認成功');
  await expect(page.locator('#printer-wifi-password')).toHaveValue('');
  await expect(page.locator('#printer-wifi-save')).toBeDisabled();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }).includes('test-wifi-password'),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() => window.__printerFrames.filter((frame) => frame.type === 'set_wifi').length),
  ).toBe(1);
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-device-status')).toContainText('新 Wi-Fi 已連線並保存');
  await expect(page.locator('#printer-wifi-ssid')).toHaveValue('New Shop Wi-Fi');
  await page.evaluate(() => {
    window.__bridgeConfig.wifiState = 'rolled_back';
    window.__bridgeConfig.wifiSsid = 'Shop Wi-Fi';
  });
  await page.locator('#printer-device-read').click();
  await expect(page.locator('#printer-device-status')).toContainText('已退回原設定');
  await page.locator('#printer-wifi-password').fill('unsaved-secret');
  await page.evaluate(() => {
    document.body.dataset.shopRole = 'viewer';
  });
  await expect(page.locator('#printer-device-read')).toBeDisabled();
  await expect(page.locator('#printer-wifi-save')).toBeDisabled();
  await expect(page.locator('#printer-wifi-password')).toHaveValue('');
  await expect(page.locator('#printer-target-ip')).toHaveValue('');
});

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
  await page.locator('#printer-tab-device').click();
  await page.locator('#printer-check').click();
  await expect(page.locator('#printer-status')).toContainText('建立 WSS 連線；PWA；xprinter.local');
  await expect(page.locator('#printer-status')).not.toContainText('test-secret');
  expect(await page.evaluate(() => window.__printerFrames.length)).toBe(0);
});

async function configurePrinter(page) {
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-token').fill('test-secret');
  await page.locator('#printer-tab-print').click();
  await page.locator('#printer-enabled').check();
  await page.locator('#printer-title').fill('金佳餅店');
  await page.locator('#printer-tab-device').click();
  await page.locator('#printer-tab-device').click();
  await page.locator('#printer-check').click();
  await expect(page.locator('#printer-status')).toContainText('已連線');
  await page.locator('#printer-tab-print').click();
}

for (const enabled of [true, false]) {
  test(`startup checks printer status only when enabled (${enabled})`, async ({ page }) => {
    await mockPrinter(page);
    const bridge = require('node:fs').readFileSync('public/js/rpc-bridge.js', 'utf8');
    const markup = bridge.match(/badge.innerHTML = `([\s\S]*?)`;/)[1];
    await page.addInitScript(
      ({ enabled, markup }) => {
        localStorage.setItem(
          'ginJiaPos.printer.test-user:test-shop',
          JSON.stringify({
            enabled,
            remember: true,
            token: 'test-secret',
            url: 'wss://xprinter.local/ws',
          }),
        );
        document.addEventListener('DOMContentLoaded', () => {
          const badge = document.createElement('div');
          badge.id = 'firebaseAccountBadge';
          badge.className = 'active';
          badge.innerHTML = markup;
          document.body.append(badge);
        });
      },
      { enabled, markup },
    );
    await openWorkspace(page);
    const indicator = page.locator('#firebasePrinterStatus');
    if (enabled) {
      await expect(indicator).toHaveAttribute('data-state', 'online');
      expect(await page.evaluate(() => window.__printerConnections)).toBe(1);
      expect(
        await page.evaluate(() =>
          window.__printerFrames.some((frame) => frame.type === 'begin' || frame.bytes),
        ),
      ).toBe(false);
    } else {
      await expect(indicator).toBeHidden();
      expect(await page.evaluate(() => window.__printerConnections)).toBe(0);
    }
  });
}

test('account badge shows printer connectivity without clipping on narrow phones', async ({ page }) => {
  await page.clock.install();
  await mockPrinter(page);
  await openWorkspace(page);
  // The RPC bridge is mocked for offline tests; use its actual badge markup.
  const bridge = require('node:fs').readFileSync('public/js/rpc-bridge.js', 'utf8');
  const markup = bridge.match(/badge.innerHTML = `([\s\S]*?)`;/)[1];
  await page.evaluate((html) => {
    const badge = document.createElement('div');
    badge.id = 'firebaseAccountBadge';
    badge.className = 'active';
    badge.style.cssText = 'position:fixed; display:flex; align-items:center; gap:8px; padding:7px 9px;';
    badge.innerHTML = html;
    badge.querySelector('#firebaseShopButton').textContent = '非常非常長的測試店鋪名稱金佳餅店分店';
    document.body.append(badge);
  }, markup);
  const indicator = page.locator('#firebasePrinterStatus');
  await expect(indicator).toBeHidden();
  await configurePrinter(page);
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveAttribute('data-state', 'online');
  const connections = await page.evaluate(() => window.__printerConnections);
  await page.clock.fastForward(31000);
  expect(await page.evaluate(() => window.__printerConnections)).toBe(connections);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        indicator.evaluate((icon) => {
          const rect = icon.getBoundingClientRect();
          const badge = icon.parentElement.getBoundingClientRect();
          return (
            rect.width === 48 &&
            rect.height === 48 &&
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            badge.left >= 0 &&
            badge.right <= innerWidth &&
            icon === icon.parentElement.firstElementChild
          );
        }),
      )
      .toBe(true);
  }
  await page.evaluate(() => {
    window.__printerMode = 'handshake-error';
  });
  await indicator.click();
  await expect(indicator).toHaveAttribute('data-state', 'offline');
  expect(
    await indicator
      .locator('.printer-connection-mark')
      .evaluate((mark) => getComputedStyle(mark, '::before').content),
  ).toContain('×');
  await page.evaluate(() => {
    window.__printerMode = 'hold';
    window.dispatchEvent(new Event('online'));
  });
  await expect(indicator).toHaveAttribute('data-state', 'offline');
  await indicator.click();
  await expect(indicator).toHaveAttribute('data-state', 'checking');
  await expect(indicator).toBeDisabled();
  await expect(indicator.locator('.printer-connection-mark')).toHaveCSS(
    'animation-name',
    'printer-status-spin',
  );
  await page.clock.fastForward(16000);
  await expect(indicator).toHaveAttribute('data-state', 'offline');
  await page.evaluate(() => {
    window.__printerMode = '';
  });
  await indicator.focus();
  await page.keyboard.press('Enter');
  await expect(indicator).toHaveAttribute('data-state', 'online');
  await page.locator('#printer-tab-print').click();
  await page.locator('#printer-enabled').uncheck();
  await page.locator('#printer-settings').evaluate((form) => form.requestSubmit());
  await expect(indicator).toBeHidden();
});

test('printer diagnostics compare HTTPS and WSS without auth or changing saved settings', async ({
  page,
}) => {
  await mockPrinter(page);
  await page.route(/^https:\/\/(192\.168\.50\.214|xprinter\.local)\/health$/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'healthy' }),
  );
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window);
    window.__diagnosticFetches = [];
    window.fetch = (input, options) => {
      const url = String(input);
      if (url === 'https://192.168.50.214/health' || url === 'https://xprinter.local/health') {
        window.__diagnosticFetches.push({ url, mode: options.mode, credentials: options.credentials });
      }
      return fetchOriginal(input, options);
    };
  });
  await openWorkspace(page);
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-url').fill('wss://192.168.50.214/ws');
  await page.locator('#printer-token').fill('do-not-transmit');
  await page.locator('.printer-help').evaluate((el) => {
    el.open = true;
  });
  await page.locator('#printer-diagnose').click();
  const result = page.locator('#printer-diagnostic-result');
  await expect(result).toContainText('診斷完成');
  await expect(result).toContainText('HTTPS 192.168.50.214：收到 HTTP 回應');
  await expect(result).toContainText('WSS 192.168.50.214：握手成功');
  await expect(result).toContainText('WSS xprinter.local：握手成功');
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
  await page.locator('.printer-help').evaluate((el) => {
    el.open = true;
  });
  await page.locator('#printer-diagnose').click();
  await expect(result).toContainText('診斷完成');
  await expect(result).toContainText('WSS 192.168.50.214：失敗');
  await expect(result).toContainText('WSS xprinter.local：失敗');
  await expect(page.locator('#printer-diagnose')).toBeEnabled();
});

test('printer settings, exact raster preview, chunk acknowledgements and no duplicate send', async ({
  page,
}, testInfo) => {
  await mockPrinter(page);
  const errors = await openWorkspace(page);
  await configurePrinter(page);
  await page.locator('#printer-width').selectOption('512');
  await page.locator('#printer-fontSize').selectOption('24');
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
      bytes,
      start: bytes.slice(0, 5),
      tail: bytes.slice(offset),
      max: Math.max(...chunks.map((chunk) => chunk.length)),
      begins: frames.filter((frame) => frame.type === 'begin').length,
    };
  });
  expect(result.same).toBe(true);
  expect(decodePrintedQr(result.bytes)?.data).toBe('中文測試');
  expect(result.ink).toBeGreaterThan(100);
  expect(result.start).toEqual([27, 64, 27, 97, 0]);
  expect(result.tail).toEqual([29, 86, 66, 33]);
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
  await page.locator('#printer-tab-device').click();
  await page.locator('#printer-remember').check();
  await page.locator('#printer-tab-print').click();
  await page.getByRole('button', { name: '儲存列印設定', exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ginJiaPos.printer.test-user:test-shop')).token,
    ),
  ).toBe('test-secret');
  await page.locator('#printer-tab-device').click();
  await page.locator('#printer-remember').uncheck();
  await page.locator('#printer-tab-print').click();
  await page.getByRole('button', { name: '儲存列印設定', exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ginJiaPos.printer.test-user:test-shop')).token,
    ),
  ).toBe('');
  await page.evaluate(() => {
    window.__printerMode = 'unauthorized';
  });
  await page.locator('#printer-tab-device').click();
  await page.locator('#printer-check').click();
  await expect(page.locator('#printer-status')).toContainText('金鑰不正確');
  await page.clock.install();
  await page.evaluate(() => {
    window.__printerMode = 'hold';
    window.__printerFrames = [];
  });
  await page.locator('#printer-tab-device').click();
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
  await page.locator('#printer-tab-print').click();
  await page.getByRole('button', { name: '儲存列印設定', exact: true }).click();
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
  await page.locator('#printer-tab-device').click();
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
    // Product requirement: lock scaling to prevent iOS input-focus zoom from
    // trapping the POS at an enlarged scale. This is a known zoom-accessibility
    // exception; continue checking every other WCAG rule.
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
    );
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .disableRules(['meta-viewport'])
      .analyze();
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
        animation.currentTime = Number(animation.effect.getComputedTiming().duration) / 2;
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

test('catalog quantity feedback retains its accessible name and layout across repeated clicks', async ({
  page,
}) => {
  const errors = await openWorkspace(page);
  await page.locator('#nav-gift').click();
  await page.clock.install();
  const button = page.locator('#giftProducts .catalog-add-btn').first();
  const originalClass = await button.getAttribute('class');
  const originalBounds = await button.boundingBox();
  await button.click();
  await expect(button).toHaveAccessibleName('加入 原味餅 到購物車');
  await expect(button.locator('i')).toHaveClass(/fa-check/);
  await expect(button).toHaveAttribute('class', originalClass);
  await button.click();
  await button.click();
  await expect(page.locator('#workspaceQuantity')).toHaveText('3 件商品');
  await expect(button).toHaveAccessibleName('加入 原味餅 到購物車');
  await page.clock.fastForward(601);
  await expect(button.locator('i')).toHaveClass(/fa-plus/);
  await expect(button.locator('i')).toHaveAttribute('aria-hidden', 'true');
  await expect(button).toHaveAccessibleName('加入 原味餅 到購物車');
  await expect(button).toHaveAttribute('class', originalClass);
  const bounds = await button.boundingBox();
  expect(bounds.width).toBe(originalBounds.width);
  expect(bounds.height).toBe(originalBounds.height);
  await button.focus();
  await page.keyboard.press('Enter');
  await page.clock.fastForward(601);
  await expect(button).toHaveAccessibleName('加入 原味餅 到購物車');
  await expect(page.locator('#workspaceQuantity')).toHaveText('4 件商品');
  expect(errors).toEqual([]);
});

test('catalog uses gift-box cards with details and quantities synchronized to the cart', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.locator('#nav-gift').click();
  const card = page.locator('[data-catalog-product="P1"]');
  const quantity = card.getByRole('spinbutton', { name: '原味餅 購物車數量', exact: true });
  const minus = card.getByRole('button', { name: '減少 原味餅 數量', exact: true });
  const plus = card.getByRole('button', { name: '加入 原味餅 到購物車', exact: true });
  await expect(card).toHaveClass(/giftbox-product-card gj-pos-card/);
  await expect(card.locator('.giftbox-product-quantity > button')).toHaveText('詳情');
  await expect(quantity).toHaveValue('0');
  await expect(minus).toBeDisabled();
  await quantity.fill('3');
  await quantity.press('Tab');
  await expect(page.locator('#workspaceQuantity')).toHaveText('3 件商品');
  await expect(card.locator('.giftbox-product-selection')).toContainText('已加入 3 件');
  const filters = page.locator('#catalogFilterTabs');
  await filters.getByRole('button', { name: '喜餅 (1)', exact: true }).click();
  await filters.getByRole('button', { name: '全部類別 (2)', exact: true }).click();
  await expect(quantity).toHaveValue('3');
  await card.getByRole('button', { name: '原味餅 商品詳情', exact: true }).click();
  await page.locator('#modalQuantity').fill('2');
  await page.getByText('使用自訂單價', { exact: true }).click();
  await page.locator('#specialPriceInput').fill('25');
  await page.locator('#productModal').getByRole('button', { name: '加入購物車', exact: true }).click();
  await expect(quantity).toHaveValue('5');
  await plus.click();
  await expect(quantity).toHaveValue('6');
  await minus.click();
  await expect(quantity).toHaveValue('5');
  await quantity.fill('2');
  await quantity.press('Tab');
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartModalBody .cart-item-price')).toContainText(/特價\s*NT\$ 25/);
  await expect(page.locator('#cartModalBody .cart-qty-value')).toHaveText('2');
  await expect(page.locator('#cartTotalAmount')).toHaveText('50');
  await page.locator('#cartModalBody .cart-qty-btn').last().click();
  await expect(quantity).toHaveValue('3');
  await page.locator('#cartModalBody .cart-delete-btn').click();
  await expect(quantity).toHaveValue('0');
  await expect(minus).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(card.locator('.giftbox-product-selection')).toBeHidden();
  await plus.click();
  await quantity.fill('0');
  await quantity.press('Tab');
  await expect(page.locator('#workspaceQuantity')).toHaveText('0 件商品');
  expect(errors).toEqual([]);
});

test('reopening an unchanged cart preserves its items and quantity changes stay current', async ({
  page,
}) => {
  await openWorkspace(page);
  await page.locator('#nav-gift').click();
  await page.locator('#giftProducts button').last().click();
  await page.locator('#workspaceCart').click();
  await settleUI(page);
  await page.locator('#cartModalBody .cart-item-card').evaluate((card) => {
    window.__cartCard = card;
  });
  await page.keyboard.press('Escape');
  await page.locator('#workspaceCart').click();
  await settleUI(page);
  expect(
    await page.locator('#cartModalBody .cart-item-card').evaluate((card) => card === window.__cartCard),
  ).toBe(true);
  await page.locator('#cartModalBody .cart-qty-btn').last().click();
  await expect(page.locator('#cartModalBody .cart-qty-value')).toHaveText('2');
  await page.keyboard.press('Escape');
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartModalBody .cart-qty-value')).toHaveText('2');
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
  await page.getByRole('button', { name: '新增商品', exact: true }).click();
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
  await expect(page.locator('button[onclick="showAddProduct()"]')).toBeHidden();
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
    if (width === 390) {
      // Wider fallback glyphs reproduce the Linux WebKit deposit-label wrap
      // even on Windows. Keep the original row-height contract unchanged.
      const widerFont = await page.addStyleTag({ content: '.gj-ui { --gj-font: monospace; }' });
      const row = page.locator('#searchResults .order-summary-row');
      expect((await row.boundingBox()).height).toBeLessThanOrEqual(160);
      for (const field of ['.td-fee', '.td-deposit']) {
        expect(await row.locator(field).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
      await widerFont.evaluate((el) => el.remove());
    }
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

test('related product screens reflow long content and retain pricing and actions', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const longName = '手工限定喜餅「烏龍茶與黑芝麻」・獨立包裝・完整長品名';
  await page.addInitScript((name) => {
    sessionStorage.setItem(
      'test-product-order',
      JSON.stringify([
        {
          productId: 'P1',
          productName: name,
          category: '季節限定伴手禮',
          price: 1250,
          companyPrice: 1000,
          specialPrice: 900,
          description: '使用台灣茶葉，請於開封後儘速食用。\n'.repeat(12),
          status: '啟用',
          giftBoxEnabled: '是',
        },
        {
          productId: 'P2',
          productName: '喜餅',
          category: '喜餅',
          price: 100,
          status: '啟用',
          giftBoxEnabled: '是',
        },
      ]),
    );
  }, longName);
  const errors = await openWorkspace(page);
  const originalSize = page.viewportSize();
  async function review(selector, label, footerSelector) {
    for (const close of await page.locator('.alert-close').all()) await close.click();
    for (const size of [originalSize, { width: 375, height: 812 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(size);
      for (const theme of ['light', 'dark']) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await settleUI(page);
        const scan = await new AxeBuilder({ page })
          .include(selector)
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(
          scan.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
          `${label}, ${theme}, ${size.width}px`,
        ).toEqual([]);
        expect(
          await page
            .locator(selector)
            .evaluate((element) =>
              [
                element,
                ...element.querySelectorAll(
                  '.cart-item-card, .product-card, .giftbox-summary-product, .catalog-product-card',
                ),
              ].every((node) => node.scrollWidth <= node.clientWidth + 1),
            ),
          label,
        ).toBe(true);
        if (footerSelector) {
          const footer = await page.locator(footerSelector).boundingBox();
          expect(footer.y).toBeGreaterThanOrEqual(0);
          expect(footer.y + footer.height).toBeLessThanOrEqual(size.height + 1);
        }
        await page.screenshot({
          path: testInfo.outputPath(`${label}-${theme}-${size.width}.png`),
          animations: 'disabled',
        });
      }
    }
    await page.setViewportSize(originalSize);
  }
  await page.locator('#customerCompany').click();
  await page.locator('#nav-gift').click();
  await expect(page.locator('#giftProducts h3').first()).toHaveText(longName);
  await review('#giftProducts', 'catalog');
  await page.getByRole('button', { name: `${longName} 商品詳情`, exact: true }).click();
  await expect(page.locator('#modalProductPrice')).toContainText('NT$ 1,000');
  await expect(page.locator('#specialPriceSection')).toBeHidden();
  await page.locator('#modalQuantity').fill('3');
  await page.locator('#modalQuantity').press('Tab');
  await expect(page.locator('#modalProductTotal')).toHaveText('合計 NT$ 3,000');
  await page.getByText('使用自訂單價', { exact: true }).click();
  await page.locator('#specialPriceInput').fill('800');
  await expect(page.locator('#modalProductTotal')).toHaveText('合計 NT$ 2,400');
  await page.getByText('使用自訂單價', { exact: true }).click();
  await expect(page.locator('#modalProductPrice')).toContainText('NT$ 1,000');
  await expect(page.locator('#specialPriceSection')).toBeHidden();
  await page.getByText('使用自訂單價', { exact: true }).click();
  await review('#productModal', 'product-detail', '#productModal .product-detail-footer');
  await page.locator('#productModal').getByRole('button', { name: '加入購物車', exact: true }).click();
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartModalBody .cart-item-name')).toHaveText(longName);
  await expect(page.locator('#cartModalBody .cart-item-subtotal')).toContainText('NT$ 2,400');
  await page.locator('#cartModalBody .cart-qty-btn').last().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#cartModalBody .cart-qty-value')).toHaveText('4');
  await expect(page.locator('#cartModalBody .cart-qty-btn').last()).toBeFocused();
  await expect(page.locator('#cartModalBody .cart-item-subtotal')).toContainText('NT$ 3,200');
  await page.keyboard.press('Escape');
  await page.locator('#nav-giftbox').click();
  await page.getByRole('button', { name: '6入', exact: true }).click();
  await page.locator('#display_P1').fill('2');
  await page.locator('#display_P1').press('Tab');
  await page.locator('#display_P2').fill('4');
  await page.locator('#display_P2').press('Tab');
  await page.locator('#proceedStep3').click();
  await expect(page.locator('#giftboxSummary')).toContainText('2 粒 · 單價 NT$ 1,000');
  await review('#giftboxStep3', 'giftbox-confirmation');
  await page.locator('#giftboxNotes').fill('請分開包裝');
  await page.locator('.btn-add-cart').click();
  await page.locator('#workspaceCart').click();
  await expect(page.locator('#cartModalBody .cart-giftbox-details li')).toHaveCount(2);
  await expect(page.locator('#cartModalBody')).toContainText('請分開包裝');
  await review('#cartModal', 'cart', '#cartModal > div:last-child');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.showDepositModal('O0123456789abcdef0123456789abcdef', 10000, 4000));
  await review('#depositModal', 'deposit', '#depositModal .deposit-dialog-footer');
  await page.keyboard.press('Escape');
  await openManagementPanel(page, 'products');
  await expect(page.locator('#productsCardGrid .product-name').first()).toHaveText(longName);
  await expect(page.locator('#productsCardGrid .price-none').first()).toHaveText('未設定');
  await review('#productsCardGrid', 'product-management');
  expect(errors).toEqual([]);
});

test('gift-box product cards keep readable prices, named controls and stable selection', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'test-product-order',
      JSON.stringify([
        {
          productId: 'P1',
          productName: '原味餅',
          category: '伴手禮',
          price: 50,
          companyPrice: 40,
          status: '啟用',
          giftBoxEnabled: '是',
        },
        {
          productId: 'P2',
          productName: '手工喜餅・婚禮限定款（附獨立包裝）',
          category: '喜餅',
          price: 1099.5,
          status: '啟用',
          giftBoxEnabled: '是',
        },
        {
          productId: 'P3',
          productName: '季節限定綜合口味・低糖配方・無添加人工色素・長品名完整顯示',
          category: '季節限定',
          price: 90,
          status: '啟用',
          giftBoxEnabled: '是',
        },
      ]),
    );
  });
  const errors = await openWorkspace(page);
  await page.locator('#customerCompany').click();
  await page.locator('#nav-giftbox').click();
  await page.getByRole('button', { name: '6入', exact: true }).click();
  const card = page.locator('#card_P1');
  const minus = card.getByRole('button', { name: '減少 原味餅 數量', exact: true });
  const plus = card.getByRole('button', { name: '增加 原味餅 數量', exact: true });
  await expect(card.getByRole('heading', { name: '原味餅', exact: true })).toBeVisible();
  await expect(card.locator('.price')).toHaveText('NT$ 40');
  await expect(card.locator('.company-original-price')).toHaveText('原價 NT$ 50');
  await expect(card.locator('.company-price-tag')).toBeVisible();
  await expect(page.locator('#card_P2 .price')).toHaveText('NT$ 1,099.5');
  await expect(page.locator('#giftboxProducts .giftbox-product-icon')).toHaveCount(0);
  await expect(minus).toBeDisabled();
  const originalHeight = (await card.boundingBox()).height;
  await plus.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('spinbutton', { name: '原味餅 數量（粒）', exact: true })).toHaveValue('1');
  await expect(card.locator('.giftbox-product-selection')).toContainText('已選 1 粒');
  expect((await card.boundingBox()).height).toBe(originalHeight);
  await expect(minus).toBeEnabled();
  await minus.click();
  await expect(minus).toBeDisabled();
  await expect(card.locator('.giftbox-product-selection')).toBeHidden();
  await page.locator('#display_P1').fill('2');
  await page.locator('#display_P1').press('Tab');
  await page.locator('#display_P2').fill('99');
  await page.locator('#display_P2').press('Tab');
  await expect(page.locator('#display_P2')).toHaveValue('4');
  await expect(page.locator('#selectedCount')).toHaveText('6');
  await expect(page.locator('#card_P2 .giftbox-product-selection')).toContainText('已選 4 粒');
  await plus.click();
  await expect(page.locator('#display_P1')).toHaveValue('2');
  await expect(page.locator('.giftbox-progress')).toHaveAttribute('aria-atomic', 'true');
  await expect(page.locator('.giftbox-progress')).toHaveAttribute('role', 'status');
  // Clear the deliberately triggered limit warnings before visual review.
  for (const close of await page.locator('.alert-close').all()) await close.click();
  const originalSize = page.viewportSize();
  for (const size of [originalSize, { width: 375, height: 812 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(size);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await settleUI(page);
      const scan = await new AxeBuilder({ page })
        .include('#giftboxProducts')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        scan.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
        `${theme}, ${size.width}px`,
      ).toEqual([]);
      expect(
        await page
          .locator('#giftboxProducts')
          .evaluate((element) =>
            [
              ...element.querySelectorAll(
                '.giftbox-product-card, .giftbox-product-info, .giftbox-quantity-control',
              ),
            ].every((node) => node.scrollWidth <= node.clientWidth + 1),
          ),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const button of await card.getByRole('button').all()) {
        const bounds = await button.boundingBox();
        expect(bounds.width).toBeGreaterThanOrEqual(48);
        expect(bounds.height).toBeGreaterThanOrEqual(48);
      }
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`giftbox-cards-${theme}-${size.width}.png`),
        animations: 'disabled',
      });
    }
  }
  await page.setViewportSize(originalSize);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#proceedStep3').click();
  await expect(page.locator('#giftboxSummary')).toContainText('原味餅');
  await page.locator('.btn-add-cart').click();
  await page.evaluate(() => window.editGiftboxItem(0));
  await expect(page.locator('#display_P1')).toHaveValue('2');
  await expect(card.locator('.giftbox-product-selection')).toContainText('已選 2 粒');
  await expect(minus).toBeEnabled();
  await expect(page.locator('#card_P3 .giftbox-product-selection')).toBeHidden();
  await expect(page.locator('#card_P3 .giftbox-qty-btn').first()).toBeDisabled();
  expect(errors).toEqual([]);
});

test('gift-box categories preserve quantities across filters and editing', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'test-product-order',
      JSON.stringify([
        {
          productId: 'P1',
          productName: '原味餅',
          category: '伴手禮',
          price: 50,
          status: '啟用',
          giftBoxEnabled: '是',
        },
        {
          productId: 'P2',
          productName: '喜餅',
          category: '喜餅',
          price: 100,
          status: '啟用',
          giftBoxEnabled: '是',
        },
        {
          productId: 'P3',
          productName: '單售商品',
          category: '單售',
          price: 30,
          status: '啟用',
          giftBoxEnabled: '否',
        },
        {
          productId: 'P4',
          productName: '停用商品',
          category: '停用',
          price: 30,
          status: '停用',
          giftBoxEnabled: '是',
        },
      ]),
    );
  });
  await openWorkspace(page);
  await page.locator('#nav-giftbox').click();
  await page.getByRole('button', { name: '6入', exact: true }).click();
  const tabs = page.locator('#giftboxFilterTabs');
  await expect(tabs.getByRole('button')).toHaveText(['全部類別 (2)', '伴手禮 (1)', '喜餅 (1)']);
  await tabs.getByRole('button', { name: '伴手禮 (1)', exact: true }).click();
  await expect(page.locator('#card_P2')).toBeHidden();
  await page.locator('#display_P1').fill('2');
  await page.locator('#display_P1').press('Tab');
  await tabs.getByRole('button', { name: '喜餅 (1)', exact: true }).click();
  await expect(page.locator('#card_P1')).toBeHidden();
  await page.locator('#display_P2').fill('4');
  await page.locator('#display_P2').press('Tab');
  await expect(page.locator('#selectedCount')).toHaveText('6');
  await tabs.getByRole('button', { name: '全部類別 (2)', exact: true }).click();
  await expect(page.locator('#display_P1')).toHaveValue('2');
  await expect(page.locator('#display_P2')).toHaveValue('4');
  await expect(tabs.getByRole('button', { name: '全部類別 (2)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#proceedStep3').click();
  await expect(page.locator('#giftboxSummary')).toContainText('500');
  await page.locator('.btn-add-cart').click();
  await page.evaluate(() => window.editGiftboxItem(0));
  await tabs.getByRole('button', { name: '喜餅 (1)', exact: true }).click();
  await expect(page.locator('#card_P1')).toBeHidden();
  await expect(page.locator('#display_P2')).toHaveValue('4');
  await expect(page.locator('#selectedCount')).toHaveText('6');
  await tabs.getByRole('button', { name: '伴手禮 (1)', exact: true }).click();
  await expect(page.locator('#display_P1')).toHaveValue('2');
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
    const appearanceBox = await page.locator('#settingsAppearance').boundingBox();
    const deviceBox = await page.locator('#settingsDeviceInfo').boundingBox();
    expect(systemBox.y + systemBox.height).toBeLessThanOrEqual(appearanceBox.y);
    expect(appearanceBox.y + appearanceBox.height).toBeLessThanOrEqual(deviceBox.y);
    await expect(page.locator('#settingsAppearance #themeToggle')).toBeVisible();
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
    await expect(page.locator('#settingsAppearance')).toBeHidden();
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
    await page.locator('button[onclick="showAddProduct()"]').click();
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
  await page.locator('button[onclick="showAddProduct()"]').click();
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

test('printer page defaults to print settings with accessible switching and compact device setup', async ({
  page,
}, testInfo) => {
  await openWorkspace(page);
  const toggle = page.locator('#managementToggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator('#nav-printer').click();
  await expect(page.locator('#workspaceTitle')).toHaveText('出單機');
  await expect(page.locator('#printer-page-print')).toBeVisible();
  await expect(page.locator('#printer-width')).toHaveValue('576');
  await expect(page.locator('#printer-fontSize')).toHaveValue('28');
  await expect(page.locator('#printer-page-device')).toBeHidden();
  await expect(page.locator('#printer-tab-print')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#printer-title').fill('金佳餅店');
  await page.screenshot({ path: testInfo.outputPath('print-settings-layout.png'), fullPage: true });
  await page.locator('#printer-tab-device').click();
  await expect(page.locator('#printer-page-print')).toBeHidden();
  await expect(page.locator('#printer-tab-device')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.printer-setup')).not.toHaveAttribute('open');
  await page.screenshot({ path: testInfo.outputPath('device-settings-layout.png'), fullPage: true });
  await page.locator('#printer-tab-print').click();
  await expect(page.locator('#printer-title')).toHaveValue('金佳餅店');
  const results = await new AxeBuilder({ page }).include('#settingsPrinter').analyze();
  expect(results.violations).toEqual([]);
});

test('printer enablement and automatic printing are independent saved choices', async ({ page }) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await configurePrinter(page);
  const automatic = page.locator('#printer-autoPrint');
  await expect(automatic).not.toBeChecked();
  await expect(automatic).toBeEnabled();
  await automatic.check();
  await page.locator('#printer-enabled').uncheck();
  await expect(automatic).toBeDisabled();
  await expect(automatic).toBeChecked();
  await page.locator('#printer-settings').evaluate((form) => form.requestSubmit());
  await page.reload();
  await expect(page.locator('#startupStatus')).toBeHidden({ timeout: 20000 });
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-tab-print').click();
  await expect(page.locator('#printer-enabled')).not.toBeChecked();
  await expect(automatic).toBeChecked();
  await expect(automatic).toBeDisabled();
  await page.locator('#printer-enabled').check();
  await expect(automatic).toBeEnabled();
  await automatic.uncheck();
  await page.locator('#printer-tab-device').click();
  await page.locator('#printer-token').fill('test-secret');
  await page.locator('#printer-tab-print').click();
  await page.locator('#printer-test').click();
  await expect(page.locator('#printer-send')).toBeEnabled();
  await page.locator('#printer-send').click();
  await expect(page.locator('#printer-result')).toContainText('已傳送');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('ginJiaPos.printer.test-user:test-shop'))),
  ).toMatchObject({ enabled: true, autoPrint: false });
});

for (const mode of ['enabled', 'disabled', 'disconnect', 'manual', 'disabled-auto']) {
  test(`new order automatic printing: ${mode}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      localStorage.setItem(
        'ginJiaPos.printer.test-user:test-shop',
        JSON.stringify({
          enabled: !mode.startsWith('disabled'),
          ...(mode === 'manual' ? { autoPrint: false } : mode === 'disabled-auto' ? { autoPrint: true } : {}),
          token: 'test-secret',
          remember: true,
        }),
      );
    }, mode);
    await mockPrinter(page);
    await openWorkspace(page);
    await page.evaluate((mode) => {
      window.__printerMode = mode === 'disconnect' ? mode : '';
      window.__orderDetails = {
        orderId: 'O-test',
        customerName: '測試客戶',
        items: [{ productName: '原味餅', quantity: 1, unitPrice: 50, subtotal: 50 }],
        totalAmount: 50,
        depositAmount: 0,
        remainingAmount: 50,
      };
    }, mode);
    await prepareOrder(page);
    await page.locator('#workspaceCart').click();
    await page.locator('#checkoutBtn').click();
    await expect(page.locator('#printer-last-order')).toContainText('訂單 O-test 已建立');
    if (mode === 'enabled' || mode === 'disconnect') {
      await expect(page.locator('#printer-last-order')).toContainText(
        mode === 'disconnect' ? '可能已部分列印' : '已傳送',
      );
      expect(await page.evaluate(() => window.__printerFrames.filter((f) => f.type === 'begin').length)).toBe(
        1,
      );
    } else {
      expect(await page.evaluate(() => window.__printerFrames)).toEqual([]);
    }
    await expect(page.locator('#printer-preview')).toHaveCount(0);
    expect(await page.evaluate(() => window.__calls.filter((c) => c.method === 'submitOrder').length)).toBe(
      1,
    );
  });
}

for (const width of [384, 512, 576]) {
  test(`receipt separators remain single graphical lines at ${width} dots with wide fallback glyphs`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.measureText;
      CanvasRenderingContext2D.prototype.measureText = function (text) {
        if (String(text).includes('─')) return { width: String(text).length * 40 };
        return original.call(this, text);
      };
    });
    await mockPrinter(page);
    await openWorkspace(page);
    await configurePrinter(page);
    await page.locator('#printer-width').selectOption(String(width));
    await page.locator('#printer-fontSize').selectOption('24');
    await page.locator('#printer-test').click();
    await expect(page.locator('#printer-send')).toBeEnabled();
    const rules = await page.locator('.receipt-preview canvas').evaluateAll((canvases) => {
      const result = [];
      for (const [index, canvas] of canvases.entries()) {
        const ctx = canvas.getContext('2d');
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let row = index === 0 ? -4 : 0; row < canvas.height; row += 34) {
          const counts = [];
          for (let y = Math.max(0, row); y < Math.min(canvas.height, row + 34); y++) {
            let count = 0;
            for (let x = 0; x < canvas.width; x++) if (pixels[(y * canvas.width + x) * 4] === 0) count++;
            counts.push(count);
          }
          if (counts.some((n) => n === canvas.width - 32)) result.push(counts);
        }
      }
      return result;
    });
    expect(rules).toHaveLength(2);
    for (const counts of rules) {
      expect(counts.filter((n) => n > 0)).toEqual([width - 32, width - 32]);
    }
    await expect(page.locator('.receipt-text')).toContainText('原味餅');
  });
}

test('receipt font size persists and adjusts raster bands and wrapping', async ({ page }, testInfo) => {
  await mockPrinter(page);
  await openWorkspace(page);
  await configurePrinter(page);
  for (const size of [24, 28, 32, 40]) {
    await page.locator('#printer-fontSize').selectOption(String(size));
    await page.locator('#printer-test').click();
    await expect(page.locator('#printer-send')).toBeEnabled();
    await expect(page.locator('#printer-result')).toContainText(`字體 ${size} 點`);
    const stats = await page
      .locator('.receipt-preview canvas')
      .evaluateAll((canvases) => canvases.map((c) => ({ height: c.height, font: c.getContext('2d').font })));
    const lineHeight = Math.ceil(size * 1.4);
    for (const [index, band] of stats.entries()) {
      expect(band.height).toBeLessThanOrEqual(238);
      expect((band.height + (index === 0 ? 4 : 0)) % lineHeight).toBe(0);
      expect(band.font).toContain(`${size}px`);
    }
    await expect(page.locator('.receipt-text')).toContainText('此單為訂單明細，非統一發票');
    if (size === 32)
      await page.screenshot({ path: testInfo.outputPath('receipt-font-32.png'), animations: 'disabled' });
    await page.locator('#printer-preview .printer-close').click();
  }
  await page.reload();
  await openManagementPanel(page, 'printer');
  await page.locator('#printer-tab-print').click();
  await expect(page.locator('#printer-fontSize')).toHaveValue('40');
});

for (const width of [384, 512, 576]) {
  test(`receipt QR scans the saved order number and aligns at ${width} dots`, async ({ page }, testInfo) => {
    await mockPrinter(page);
    await openWorkspace(page);
    await configurePrinter(page);
    await page.locator('#printer-width').selectOption(String(width));
    await page.locator('#printer-title').fill(width === 384 ? '' : '金家餅店');
    await page.getByRole('button', { name: '儲存列印設定', exact: true }).click();
    await page.locator('#nav-search').click();
    const orderId = 'O0123456789abcdef0123456789abcdef';
    await page.evaluate((orderId) => {
      window.__orderDetails = {
        orderId,
        customerName: '測試很長的客戶名稱避免覆蓋 QR code',
        customerPhone: '0912345678',
        deliveryDate: '2026-09-18',
        deliveryType: '自取',
        status: '已付清',
        totalAmount: 100,
        items: [{ productName: '原味餅', quantity: 2, unitPrice: 50, subtotal: 100 }],
      };
      window.viewOrderDetails(orderId);
    }, orderId);
    await page.locator(`[data-printer-order="${orderId}"]`).click();
    await expect(page.locator('#printer-send')).toBeEnabled();
    if (width === 576)
      await page.screenshot({ path: testInfo.outputPath('receipt-qr-28.png'), animations: 'disabled' });
    const orderLine = (await page.locator('.receipt-text').textContent())
      .split('\n')
      .findIndex((line) => line.startsWith('訂單：'));
    await page.locator('#printer-send').click();
    await expect(page.locator('#printer-result')).toContainText('已傳送');
    const bytes = await page.evaluate(() => window.__printerFrames.flatMap((frame) => frame.bytes || []));
    const qr = decodePrintedQr(bytes);
    expect(qr?.data).toBe(orderId);
    const moduleSize = (qr.location.topRightCorner.x - qr.location.topLeftCorner.x) / (17 + qr.version * 4);
    expect(qr.location.topRightCorner.x + 4 * moduleSize).toBeCloseTo(width - 16, 0);
    expect(qr.location.topLeftCorner.y - 4 * moduleSize).toBeCloseTo(orderLine * 40, 0);
  });
}

test('product order saves across management, POS and reload; cancel preserves order', async ({ page }) => {
  const errors = await openWorkspace(page);
  await openManagementPanel(page, 'products');
  const names = page.locator('#productsCardGrid .product-name');
  await page.getByRole('button', { name: '調整順序', exact: true }).click();
  const modal = page.locator('#productOrderModal');
  await modal.getByRole('button', { name: '下移 原味餅', exact: true }).click();
  await expect(modal.locator('li strong')).toHaveText(['喜餅', '原味餅']);
  await modal.getByRole('button', { name: '取消', exact: true }).click();
  await expect(names).toHaveText(['原味餅', '喜餅']);
  await page.getByRole('button', { name: '調整順序', exact: true }).click();
  await modal.getByRole('button', { name: /拖曳排序 原味餅/ }).focus();
  await page.keyboard.press('ArrowDown');
  await modal.getByRole('button', { name: '儲存順序', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(names).toHaveText(['喜餅', '原味餅']);
  await expect(page.locator('#giftProducts h3')).toHaveText(['喜餅', '原味餅']);
  await page.reload();
  await expect(page.locator('#giftProducts h3')).toHaveText(['喜餅', '原味餅']);
  await openManagementPanel(page, 'products');
  await expect(names).toHaveText(['喜餅', '原味餅']);
  await page.locator('#productsFilterTabs').getByRole('button', { name: '伴手禮 (1)', exact: true }).click();
  await page.getByRole('button', { name: '調整順序', exact: true }).click();
  await expect(modal.locator('li')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('product order retains draft on errors and reload resolves conflicts', async ({ page }) => {
  const errors = await openWorkspace(page);
  await openManagementPanel(page, 'products');
  await page.getByRole('button', { name: '調整順序', exact: true }).click();
  const modal = page.locator('#productOrderModal');
  await modal.getByRole('button', { name: '下移 原味餅', exact: true }).click();
  await page.evaluate(() => {
    window.__fail = 'saveProductOrder';
  });
  await modal.getByRole('button', { name: '儲存順序', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('測試連線中斷');
  await expect(modal.locator('li strong')).toHaveText(['喜餅', '原味餅']);
  await expect(page.locator('#productsCardGrid .product-name')).toHaveText(['原味餅', '喜餅']);
  await page.evaluate(() => {
    window.__fail = '';
    window.__orderConflict = true;
  });
  await modal.getByRole('button', { name: '儲存順序', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('已被其他人修改');
  await modal.getByRole('button', { name: '重新載入（捨棄調整）', exact: true }).click();
  await expect(modal.locator('li strong')).toHaveText(['原味餅', '喜餅']);
  await expect(modal.getByRole('button', { name: '儲存順序', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('product order supports pointer dragging and accessible layout', async ({ page }, testInfo) => {
  const errors = await openWorkspace(page);
  await openManagementPanel(page, 'products');
  // Exercise a slow entrance so fast local runs also cover the CI timing race.
  await page.addStyleTag({ content: '.product-order-content { animation-duration: 1s; }' });
  await page.getByRole('button', { name: '調整順序', exact: true }).click();
  const modal = page.locator('#productOrderModal');
  // Raw mouse/touch coordinates do not get Playwright's locator stability wait.
  // Read both endpoints only after the dialog's translateY animation finishes.
  await modal
    .locator('.product-order-content')
    .evaluate((content) => Promise.all(content.getAnimations().map((animation) => animation.finished)));
  const first = await modal.locator('.product-order-handle').first().boundingBox();
  const second = await modal.locator('li').nth(1).boundingBox();
  const x = first.x + first.width / 2;
  const startY = first.y + first.height / 2;
  const endY = second.y + second.height - 5;
  if (testInfo.project.name === 'phone') {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
    await expect(modal.locator('.is-dragging')).toHaveCount(1);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: endY }] });
    await expect(modal.locator('li strong')).toHaveText(['喜餅', '原味餅']);
    await expect(modal.locator('.product-order-floating')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('product-order-dragging.png') });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await expect(modal.locator('.is-dragging')).toHaveCount(1);
    await page.mouse.move(x, endY, { steps: 10 });
    await expect(modal.locator('li strong')).toHaveText(['喜餅', '原味餅']);
    await expect(modal.locator('.product-order-floating')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('product-order-dragging.png') });
    await page.mouse.up();
  }
  await expect(modal.locator('.is-dragging')).toHaveCount(0);
  const violations = (await new AxeBuilder({ page }).include('#productOrderModal').analyze()).violations;
  expect(violations).toEqual([]);
  await expect(modal.getByRole('button', { name: '儲存順序', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('product-order.png') });
  expect(errors).toEqual([]);
});

test('product order is unavailable to viewers', async ({ page }) => {
  await openWorkspace(page, 'viewer');
  await openManagementPanel(page, 'products');
  await expect(page.getByRole('button', { name: '調整順序', exact: true })).toBeHidden();
  await page.evaluate(() => window.showProductOrder());
  await expect(page.locator('#productOrderModal')).toHaveCount(0);
});

for (const reduced of [false, true]) {
  test(`product order motion visibly exchanges rows; reduced motion=${reduced}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const errors = await openWorkspace(page);
    await openManagementPanel(page, 'products');
    await page.getByRole('button', { name: '調整順序', exact: true }).click();
    const result = await page.locator('#productOrderModal').evaluate((modal) => {
      const rows = [...modal.querySelectorAll('li')];
      const before = rows.map((row) => row.getBoundingClientRect().top);
      modal.querySelector('[data-down]').click();
      const animations = rows.flatMap((row) => row.getAnimations());
      animations.forEach((animation) => {
        animation.pause();
        animation.currentTime = 100;
      });
      const middle = rows.map((row) => row.getBoundingClientRect().top);
      animations.forEach((animation) => animation.finish());
      const after = rows.map((row) => row.getBoundingClientRect().top);
      return { before, middle, after, count: animations.length };
    });
    if (reduced) {
      expect(result.count).toBe(0);
    } else {
      expect(result.count).toBe(2);
      expect(result.middle[0]).toBeGreaterThan(result.before[0]);
      expect(result.middle[0]).toBeLessThan(result.after[0]);
      expect(result.middle[1]).toBeLessThan(result.before[1]);
      expect(result.middle[1]).toBeGreaterThan(result.after[1]);
    }
    await page.locator('#productOrderModal').evaluate((modal) => {
      for (let i = 0; i < 5; i++) modal.querySelector('li [data-down]').click();
    });
    await expect(page.locator('#productOrderModal li strong')).toHaveText(['原味餅', '喜餅']);
    await page.keyboard.press('Escape');
    await expect(page.locator('.product-order-floating')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
