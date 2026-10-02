const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;

const shops = [
  { shopId: 'onlyme', name: 'onlyme', role: 'owner', ownerUid: 'another-owner' },
  { shopId: 'test', name: 'test', role: 'owner', ownerUid: 'test-user' },
  { shopId: 'test-shop', name: '金家餅店', role: 'owner', ownerUid: 'another-owner' },
];
const members = [
  { uid: 'owner', email: 'owner@example.com', role: 'owner' },
  { uid: 'editor', email: 'store.staff@example.com', role: 'editor' },
  { uid: 'viewer', email: 'report.viewer@example.com', role: 'viewer' },
];

async function openManager(page, role = 'owner') {
  await page.goto('/');
  await page.evaluate(
    ({ role, shops }) => {
      document.getElementById('startupStatus').hidden = true;
      window.shopFixture = { shops, role };
    },
    { role, shops },
  );
  const source = readFileSync('public/js/rpc-bridge.js', 'utf8');
  // Exercise the real bridge UI with a controllable RPC, without Firebase credentials.
  await page.addScriptTag({
    content: source.replace(
      "document.addEventListener('DOMContentLoaded', function() {",
      `installAuthOverlay();
    installShopEventHandlers();
    activeUid = 'test-user';
    activeShop = { ...window.shopFixture.shops[2], role: window.shopFixture.role };
    availableShops = window.shopFixture.shops;
    document.body.dataset.shopId = activeShop.shopId;
    document.body.dataset.shopRole = activeShop.role;
    updateShopBadge();
    window.shopRpcCalls = [];
    firebaseStatePromise = Promise.resolve({
      auth: { currentUser: { uid: 'test-user', emailVerified: true } },
      functionsSdk: { httpsCallable: () => ({ method, args, shopId }) => new Promise((resolve, reject) => {
        window.shopRpcCalls.push({ method, args, shopId });
        window.pendingShopRpc = { method, resolve: data => resolve({ data }), reject };
        window.shopRpcCount = (window.shopRpcCount || 0) + 1;
      }) }
    });
    setAccountBadgeVisible(true);
    document.addEventListener('unused-test-event', function() {`,
    ),
  });
  await page.locator('#firebaseShopButton').click();
}

async function finishShopRefresh(page) {
  await page.evaluate(() =>
    window.pendingShopRpc.resolve(
      window.shopFixture.shops.map((shop) =>
        shop.shopId === 'test-shop' ? { ...shop, role: window.shopFixture.role } : shop,
      ),
    ),
  );
  await expect(page.locator('#firebaseShopLoading')).toBeHidden();
}

async function openMembers(page, data = members) {
  await page.locator('#firebaseOpenShopSettings').click();
  await page.locator('#firebaseShopMembersTab').click();
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('listShopMembers');
  await page.evaluate((data) => window.pendingShopRpc.resolve(data), data);
  await expect(page.locator('#firebaseMembersLoading')).toBeHidden();
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
  await finishShopRefresh(page);
  expect(await page.evaluate(() => window.shopRpcCount)).toBe(1);
  await page.locator('#firebaseOpenShopSettings').click();
  await page.locator('#firebaseShopMembersTab').click();
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('listShopMembers');
  await expect(page.locator('#firebaseMembersLoading')).toBeVisible();
  await page.locator('#firebaseShopClose').click();
  await page.evaluate(() => window.pendingShopRpc.resolve([]));
  await expect(page.locator('#firebaseMembersLoading')).toBeHidden();
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

test('shop selection is compact and separates creation from management in both themes', async ({
  page,
}, testInfo) => {
  await openManager(page);
  await finishShopRefresh(page);
  const viewports =
    testInfo.project.name === 'phone'
      ? [
          { width: 375, height: 812 },
          { width: 320, height: 640 },
          { width: 844, height: 390 },
        ]
      : [page.viewportSize()];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await expect(page.locator('#firebaseShopTitle')).toHaveText('切換店鋪');
      await expect(page.locator('#firebaseShopList .firebase-shop-option')).toHaveCount(3);
      await expect(page.locator('.firebase-shop-option[data-shop-id="test-shop"]')).toContainText('目前使用');
      await expect(page.locator('.firebase-shop-option[data-shop-id="test-shop"]')).toContainText('管理員');
      await expect(page.locator('#firebaseNewShopName')).toBeHidden();
      await expect(page.locator('#firebaseRenameShopName')).toBeHidden();
      await expect(page.locator('#firebaseMemberEmail')).toBeHidden();
      const card = await page.locator('.firebase-shop-card').boundingBox();
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.y + card.height).toBeLessThanOrEqual(viewport.height + 1);
      const bounds = await page.locator('.firebase-shop-body').evaluate((body) => ({
        height: body.clientHeight,
        scroll: body.scrollHeight,
        width: body.clientWidth,
        scrollWidth: body.scrollWidth,
      }));
      expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
      if (viewport.height >= 640) expect(bounds.scroll).toBeLessThanOrEqual(bounds.height + 1);
      for (const id of ['firebaseShopClose', 'firebaseOpenCreateShop', 'firebaseOpenShopSettings']) {
        const box = await page.locator('#' + id).boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      }
      const scan = await new AxeBuilder({ page }).include('#firebaseShopOverlay').analyze();
      expect(scan.violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.width}-shop-switcher.png`) });
    }
  }
  expect(await page.evaluate(() => window.shopRpcCalls.map((call) => call.method))).toEqual(['listMyShops']);
  await page.locator('#firebaseOpenCreateShop').click();
  await expect(page.locator('#firebaseShopTitle')).toHaveText('建立店鋪');
  await expect(page.locator('#firebaseShopList')).toBeHidden();
  await page.locator('#firebaseCreateShop').click();
  await expect(page.locator('#firebaseNewShopName')).not.toBeFocused();
  await expect(page.locator('#firebaseShopMessage')).toContainText('2 至 60');
  expect(await page.evaluate(() => window.shopRpcCount)).toBe(1);
  await page.locator('#firebaseNewShopName').fill('新店鋪');
  await expect(page.locator('#firebaseShopMessage')).toBeHidden();
  await page.locator('#firebaseShopBack').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#firebaseShopOverlay')).toBeHidden();
  await expect(page.locator('#firebaseShopButton')).toBeFocused();
});

test('shop name saves separately and failed changes preserve input for retry', async ({ page }) => {
  await openManager(page);
  await finishShopRefresh(page);
  await page.locator('#firebaseOpenShopSettings').click();
  await expect(page.locator('#firebaseShopList')).toBeHidden();
  await expect(page.locator('#firebaseRenameShopName')).toHaveValue('金家餅店');
  await page.locator('#firebaseRenameShopName').fill('金家餅店 新店');
  await page.locator('#firebaseRenameShopName').press('Enter');
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('renameShop');
  await expect(page.locator('#firebaseRenameShop')).toBeDisabled();
  expect(await page.evaluate(() => window.shopRpcCalls.at(-1))).toEqual({
    method: 'renameShop',
    args: ['金家餅店 新店'],
    shopId: 'test-shop',
  });
  await page.evaluate(() => window.pendingShopRpc.reject(new Error('連線中斷，請重試')));
  await expect(page.locator('#firebaseShopMessage')).toHaveText('連線中斷，請重試');
  await expect(page.locator('#firebaseRenameShopName')).toHaveValue('金家餅店 新店');
  await page.locator('#firebaseRenameShop').click();
  await page.evaluate(() => window.pendingShopRpc.resolve({ success: true }));
  await expect(page.locator('#firebaseShopMessage')).toHaveText('店鋪名稱已更新');
  await expect(page.locator('#firebaseShopSubtitle')).toHaveText('金家餅店 新店');
  await page.locator('#firebaseShopBack').click();
  await expect(page.locator('.firebase-shop-option[data-shop-id="test-shop"]')).toContainText(
    '金家餅店 新店',
  );
});

test('members use readable rows and a separate editor with owner protection', async ({ page }, testInfo) => {
  await openManager(page);
  await finishShopRefresh(page);
  await openMembers(page);
  await expect(page.locator('#firebaseMemberCount')).toHaveText('3 位成員');
  await expect(page.locator('[data-member-uid="owner"] button')).toHaveCount(0);
  await expect(page.locator('#firebaseMemberList select')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const scan = await new AxeBuilder({ page }).include('#firebaseShopOverlay').analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-shop-members.png`) });
  }
  await page.locator('[data-member-uid="editor"] button').click();
  await expect(page.locator('#firebaseShopTitle')).toHaveText('成員設定');
  await page.locator('#firebaseSelectedMemberRole').selectOption('viewer');
  await page.locator('#firebaseSaveMember').click();
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('updateShopMemberRole');
  expect(await page.evaluate(() => window.shopRpcCalls.at(-1))).toEqual({
    method: 'updateShopMemberRole',
    args: [{ uid: 'editor', role: 'viewer' }],
    shopId: 'test-shop',
  });
  await page.evaluate(() => window.pendingShopRpc.resolve({ success: true }));
  await expect(page.locator('#firebaseMemberList')).toBeVisible();
  await expect(page.locator('[data-member-uid="editor"]')).toContainText('僅檢視');
  await page.locator('[data-member-uid="editor"] button').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#firebaseRemoveMember').click();
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('removeShopMember');
  await page.evaluate(() => window.pendingShopRpc.resolve({ success: true }));
  await expect(page.locator('[data-member-uid="editor"]')).toHaveCount(0);
  await expect(page.locator('#firebaseMemberCount')).toHaveText('2 位成員');
});

test('member invitation has full width fields and returns to the refreshed list', async ({
  page,
}, testInfo) => {
  await openManager(page);
  await finishShopRefresh(page);
  await openMembers(page);
  await page.locator('#firebaseOpenAddMember').click();
  await expect(page.locator('#firebaseMemberList')).toBeHidden();
  await page.locator('#firebaseMemberEmail').fill('invalid');
  await page.locator('#firebaseAddMember').click();
  await expect(page.locator('#firebaseMemberEmail')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#firebaseMemberEmail').fill('new.staff@example.com');
  await page.locator('#firebaseMemberRole').selectOption('viewer');
  const email = await page.locator('#firebaseMemberEmail').boundingBox();
  const role = await page.locator('#firebaseMemberRole').boundingBox();
  expect(role.y).toBeGreaterThan(email.y + email.height);
  expect(email.width).toBeGreaterThan(230);
  await page.screenshot({ path: testInfo.outputPath('shop-invite.png') });
  await page.locator('#firebaseAddMember').click();
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('addShopMember');
  expect(await page.evaluate(() => window.shopRpcCalls.at(-1))).toEqual({
    method: 'addShopMember',
    args: [{ email: 'new.staff@example.com', role: 'viewer' }],
    shopId: 'test-shop',
  });
  await page.evaluate(() => window.pendingShopRpc.resolve({ success: true }));
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('listShopMembers');
  await page.evaluate(
    (members) =>
      window.pendingShopRpc.resolve([
        ...members,
        { uid: 'new-member', email: 'new.staff@example.com', role: 'viewer' },
      ]),
    members,
  );
  await expect(page.locator('#firebaseMemberList')).toBeVisible();
  await expect(page.locator('#firebaseMemberList')).toContainText('new.staff@example.com');
  await expect(page.locator('#firebaseShopMessage')).toHaveText('成員已加入店鋪');
});

test('long member lists scroll within the frame while navigation and actions stay visible', async ({
  page,
}) => {
  await openManager(page);
  await finishShopRefresh(page);
  await page.setViewportSize({ width: 375, height: 480 });
  const manyMembers = Array.from({ length: 25 }, (_, index) => ({
    uid: `member-${index}`,
    email: `long.member.account.${index}@example.com`,
    role: 'editor',
  }));
  await openMembers(page, [members[0], ...manyMembers]);
  const body = page.locator('.firebase-shop-body');
  const dimensions = await body.evaluate((element) => ({
    height: element.clientHeight,
    scroll: element.scrollHeight,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scroll).toBeGreaterThan(dimensions.height);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  for (const id of ['firebaseShopClose', 'firebaseShopBack', 'firebaseOpenAddMember']) {
    const box = await page.locator('#' + id).boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(480);
  }
  await page.locator('#firebaseOpenAddMember').click();
  await expect(page.locator('#firebaseShopTitle')).toHaveText('新增成員');
  const action = await page.locator('#firebaseAddMember').boundingBox();
  expect(action.y + action.height).toBeLessThanOrEqual(480);
});

test('creating a shop saves the current draft before switching to the new shop', async ({ page }) => {
  await openManager(page);
  await finishShopRefresh(page);
  await page.evaluate(() => {
    window.saveOrderDraftNow = async () => sessionStorage.setItem('test-shop-draft-saved', 'yes');
  });
  await page.locator('#firebaseOpenCreateShop').click();
  await page.locator('#firebaseNewShopName').fill('新店鋪');
  await page.locator('#firebaseCreateShop').click();
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('createShop');
  expect(await page.evaluate(() => window.shopRpcCalls.at(-1))).toEqual({
    method: 'createShop',
    args: [{ name: '新店鋪' }],
    shopId: null,
  });
  const reloaded = page.waitForEvent('load');
  await page.evaluate(() =>
    window.pendingShopRpc.resolve({ shop: { shopId: 'new-shop', name: '新店鋪', role: 'owner' } }),
  );
  await reloaded;
  expect(await page.evaluate(() => localStorage.getItem('ginJiaPos.activeShop.test-user'))).toBe('new-shop');
  expect(await page.evaluate(() => sessionStorage.getItem('test-shop-draft-saved'))).toBe('yes');
});

test('a pending creation does not switch shops after returning to the list', async ({ page }) => {
  await openManager(page);
  await finishShopRefresh(page);
  await page.locator('#firebaseOpenCreateShop').click();
  await page.locator('#firebaseNewShopName').fill('稍後使用的店鋪');
  await page.locator('#firebaseCreateShop').click();
  await expect.poll(() => page.evaluate(() => window.pendingShopRpc.method)).toBe('createShop');
  await page.locator('#firebaseShopBack').click();
  await page.evaluate(() =>
    window.pendingShopRpc.resolve({ shop: { shopId: 'new-shop', name: '稍後使用的店鋪', role: 'owner' } }),
  );
  await expect(page.locator('.firebase-shop-option[data-shop-id="new-shop"]')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-shop-id', 'test-shop');
  await expect(page.locator('#firebaseShopOverlay')).toBeVisible();
});

for (const role of ['editor', 'viewer']) {
  test(`${role} can switch shops and create without seeing management`, async ({ page }) => {
    await openManager(page, role);
    await finishShopRefresh(page);
    await expect(page.locator('#firebaseOpenShopSettings')).toBeHidden();
    await expect(page.locator('#firebaseOpenCreateShop')).toBeVisible();
    await page.locator('.firebase-shop-option[data-shop-id="test-shop"]').click();
    await expect(page.locator('#firebaseShopOverlay')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-shop-role', role);
  });
}
