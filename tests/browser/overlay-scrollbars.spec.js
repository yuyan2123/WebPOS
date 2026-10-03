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
  await target.evaluate((el) => (el.scrollTop = 1));
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
  await page.locator('#scrollFixture').evaluate((el) => (el.scrollTop = 1));
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

test('nested floating scrollbars follow parent scrolling and clipping', async ({ page }) => {
  const errors = await fixture(page);
  await page.locator('#scrollContent').evaluate((content) => {
    content.style.height = '1400px';
    const nested = document.createElement('div');
    nested.id = 'nestedScrollFixture';
    nested.style.cssText = 'position:relative;top:300px;width:160px;height:100px;overflow:auto';
    nested.innerHTML = '<div style="height:800px">內層捲動區</div>';
    content.append(nested);
  });
  const track = page.locator('.overlay-scrollbar-y[data-scroll-target="nestedScrollFixture"]');
  await expect(track).toHaveCount(1);
  await expect(track).toBeHidden();
  await page.locator('#scrollFixture').evaluate((target) => {
    target.scrollTop = 280;
  });
  await expect(track).toBeVisible();
  const position = await track.boundingBox();
  await page.locator('#scrollFixture').evaluate((target) => {
    target.scrollTop = 300;
  });
  await expect.poll(async () => (await track.boundingBox())?.y).toBeLessThan(position.y - 15);
  await page.locator('#scrollFixture').evaluate((target) => {
    target.scrollTop = 440;
  });
  await expect(track).toBeHidden();
  expect(errors).toEqual([]);
});

test('floating scrollbars follow moving scrollers throughout a page animation', async ({ page }) => {
  await fixture(page);
  const target = page.locator('#scrollFixture');
  await page.locator('#scrollContent').evaluate((content) => {
    content.style.height = '1400px';
  });
  const track = page.locator('.overlay-scrollbar-y[data-scroll-target="scrollFixture"]');
  await expect(track).toBeVisible();
  await page.addStyleTag({
    content:
      '@keyframes scrollbar-fixture-slide { from { transform: translateY(0); } to { transform: translateY(80px); } } #scrollFixture.moving { animation: scrollbar-fixture-slide 1s linear; }',
  });
  await target.evaluate((target) => {
    target.classList.add('moving');
    const animation = target.getAnimations()[0];
    animation.pause();
    animation.currentTime = 200;
  });
  const expected = await target.evaluate(
    (target) => target.getBoundingClientRect().top + target.clientTop + 4,
  );
  await expect.poll(async () => Math.abs((await track.boundingBox()).y - expected)).toBeLessThan(1);
  await target.evaluate((target) => {
    target.getAnimations()[0].currentTime = 600;
  });
  await expect.poll(async () => Math.abs((await track.boundingBox()).y - expected - 32)).toBeLessThan(1);
  await target.evaluate((target) => {
    target.classList.remove('moving');
  });
});

test('scrolling and pointer movement reuse geometry without rescanning unrelated content', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Measure the same Chromium desktop workload once.');
  await fixture(page);
  await page.locator('#scrollContent').evaluate((content) => {
    content.style.height = '1400px';
  });
  await expect(page.locator('.overlay-scrollbar-y[data-scroll-target="scrollFixture"]')).toBeVisible();
  await page.mouse.move(100, 100);
  // Allow discovery and ResizeObserver notifications to settle before measuring the hot path.
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__scrollReads = { styles: 0, bounds: 0, fullScans: 0 };
    const style = window.getComputedStyle;
    const bounds = Element.prototype.getBoundingClientRect;
    const query = Element.prototype.querySelectorAll;
    window.getComputedStyle = function (...args) {
      window.__scrollReads.styles++;
      return style.apply(this, args);
    };
    Element.prototype.getBoundingClientRect = function (...args) {
      window.__scrollReads.bounds++;
      return bounds.apply(this, args);
    };
    Element.prototype.querySelectorAll = function (selector) {
      if (this === document.body && selector === '*') window.__scrollReads.fullScans++;
      return query.call(this, selector);
    };
  });
  for (let step = 0; step < 24; step++) await page.mouse.move(100 + step * 2, 100);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const target = document.getElementById('scrollFixture');
        function frame() {
          target.scrollTop += 10;
          if (++frames === 24) resolve();
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }),
  );
  const reads = await page.evaluate(() => window.__scrollReads);
  expect(reads.fullScans).toBe(0);
  expect(reads.styles).toBeLessThanOrEqual(6);
  expect(reads.bounds).toBeLessThanOrEqual(8);
  await page.locator('#scrollContent').evaluate((content) => {
    content.classList.add('scroll-fixture-highlight');
  });
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__scrollReads.fullScans)).toBe(0);
});

test.describe('touch scrollbar visibility', () => {
  test.use({ hasTouch: true });

  test('fades after scrolling even with focus and hover, then quickly reappears', async ({ page }) => {
    await fixture(page);
    const target = page.locator('#scrollFixture');
    await page.locator('#scrollContent').evaluate((el) => {
      el.style.height = '1400px';
      el.style.width = '1200px';
    });
    await expect(target).toHaveAttribute('tabindex', '0');
    await target.hover();
    await target.focus();
    const tracks = page.locator('.overlay-scrollbar[data-scroll-target="scrollFixture"]');
    for (const track of await tracks.all()) await expect(track).toHaveCSS('opacity', '0');
    await target.evaluate((el) => el.scrollTo(100, 100));
    for (const track of await tracks.all()) {
      await expect(track).toHaveClass(/is-visible/);
      await expect(track).toHaveCSS('transition-duration', '0.08s');
      await expect(track).toHaveCSS('opacity', '1');
    }
    for (const track of await tracks.all()) {
      await expect(track).not.toHaveClass(/is-visible/);
      await expect(track).toHaveCSS('opacity', '0');
      await expect(track).toHaveCSS('pointer-events', 'none');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await target.evaluate((el) => el.scrollTo(200, 200));
    for (const track of await tracks.all()) {
      await expect(track).toHaveClass(/is-visible/);
      await expect(track).toHaveCSS('transition-duration', '0s');
    }
  });
});
