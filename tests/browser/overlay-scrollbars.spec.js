const { test, expect } = require('@playwright/test');

async function fixture(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/certs/setup.html');
  await expect(page.locator('html')).toHaveClass(/overlay-scrollbars-ready/);
  await page.evaluate(() => {
    const target = document.createElement('div');
    target.id = 'scrollFixture';
    target.style.cssText =
      'position:fixed;z-index:100;left:24px;top:40px;width:240px;height:180px;border:3px solid black;overflow:auto;scrollbar-gutter:stable both-edges;background:white';
    target.innerHTML =
      '<div id="scrollContent" style="width:100px;height:100px;background:linear-gradient(#dbeafe,#fff)">可捲動內容</div>';
    document.body.append(target);
  });
  return errors;
}

test('overlay scrollbars drag both axes without reserving layout space', async ({ page }, testInfo) => {
  const errors = await fixture(page);
  const target = page.locator('#scrollFixture');
  const before = await target.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
  await page.locator('#scrollContent').evaluate((el) => {
    el.style.width = '1200px';
    el.style.height = '1400px';
  });
  await target.hover();
  const y = page.locator('.overlay-scrollbar-y[data-scroll-target="scrollFixture"]');
  const x = page.locator('.overlay-scrollbar-x[data-scroll-target="scrollFixture"]');
  await expect(y).toBeVisible();
  await expect(x).toBeVisible();
  expect(await target.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }))).toEqual(before);
  expect(await target.evaluate((el) => getComputedStyle(el, '::-webkit-scrollbar').display)).toBe('none');
  expect(await target.evaluate((el) => getComputedStyle(el).scrollbarGutter)).not.toContain('stable');
  for (const [track, axis] of [
    [y, 'y'],
    [x, 'x'],
  ]) {
    const thumb = await track.locator('.overlay-scrollbar-thumb').boundingBox();
    const bounds = await track.boundingBox();
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      axis === 'x' ? bounds.x + bounds.width - 3 : thumb.x + thumb.width / 2,
      axis === 'y' ? bounds.y + bounds.height - 3 : thumb.y + thumb.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect
      .poll(() => target.evaluate((el, axis) => (axis === 'x' ? el.scrollLeft : el.scrollTop), axis))
      .toBeGreaterThan(700);
  }
  await page.screenshot({ path: testInfo.outputPath('floating-scrollbars.png') });
  await page.locator('#scrollContent').evaluate((el) => {
    el.style.width = '100px';
    el.style.height = '100px';
  });
  await expect(y).toBeHidden();
  await expect(x).toBeHidden();
  expect(await target.evaluate((el) => el.clientWidth)).toBe(before.width);
  expect(errors).toEqual([]);
});

test('overlay scrollbars preserve wheel and keyboard scrolling and hide behind overlays', async ({
  page,
}) => {
  const errors = await fixture(page);
  const target = page.locator('#scrollFixture');
  await page.locator('#scrollContent').evaluate((el) => {
    el.style.height = '1400px';
  });
  await target.hover();
  const y = page.locator('.overlay-scrollbar-y[data-scroll-target="scrollFixture"]');
  await expect(y).toBeVisible();
  await page.mouse.wheel(0, 180);
  await expect.poll(() => target.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await target.evaluate((el) => {
    el.scrollTop = 0;
    el.focus();
  });
  await page.keyboard.press('PageDown');
  await expect.poll(() => target.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // A covered scroller must not float its controls over the new dialog.
  await page.evaluate(() => {
    const cover = document.createElement('div');
    cover.id = 'cover';
    cover.style.cssText = 'position:fixed;inset:0;z-index:1000;background:white';
    document.body.append(cover);
  });
  await expect(y).toBeHidden();
  await page.locator('#cover').evaluate((el) => el.remove());
  await expect(y).toBeVisible();
  await target.evaluate((el) => {
    el.inert = true;
  });
  await expect(y).toBeHidden();
  await target.evaluate((el) => el.remove());
  await expect(y).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('floating scrollbar dragging does not trigger outside-click handlers', async ({ page }) => {
  await fixture(page);
  await page.locator('#scrollContent').evaluate((el) => {
    el.style.height = '1400px';
  });
  await page.locator('#scrollFixture').hover();
  await page.evaluate(() => {
    window.outsideClicks = 0;
    document.addEventListener(
      'click',
      () => {
        window.outsideClicks++;
      },
      true,
    );
  });
  const track = page.locator('.overlay-scrollbar-y[data-scroll-target="scrollFixture"]');
  await expect(track).toBeVisible();
  const rect = await track.boundingBox();
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height - 10);
  await expect.poll(() => page.locator('#scrollFixture').evaluate((el) => el.scrollTop)).toBeGreaterThan(700);
  expect(await page.evaluate(() => window.outsideClicks)).toBe(0);
});

test('touch scrolling remains native with floating controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Real touch gesture via Chromium CDP');
  const errors = await fixture(page);
  await page.locator('#scrollContent').evaluate((el) => {
    el.style.height = '1400px';
  });
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 190 }] });
  for (let y = 170; y >= 70; y -= 20)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('#scrollFixture').evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
  await touch.detach();
  expect(errors).toEqual([]);
});
