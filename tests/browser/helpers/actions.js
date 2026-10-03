const { expect } = require('@playwright/test');

// Verify the user's actual spatial/keyboard model, including responsive CSS.
async function expectActionPair(page, dismiss, primary) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await expect(dismiss).toBeVisible();
  await expect(primary).toBeVisible();
  await dismiss.scrollIntoViewIfNeeded();
  await expect(dismiss).toBeInViewport({ ratio: 1 });
  await expect(primary).toBeInViewport({ ratio: 1 });
  const left = await dismiss.boundingBox();
  const right = await primary.boundingBox();
  expect(left.x + left.width + 7).toBeLessThanOrEqual(right.x);
  expect(Math.abs(left.y + left.height / 2 - right.y - right.height / 2)).toBeLessThan(2);
  expect(left.height).toBeGreaterThanOrEqual(48);
  expect(right.height).toBeGreaterThanOrEqual(48);
  for (const action of [dismiss, primary]) {
    if (await action.isDisabled()) continue;
    expect(
      await action.evaluate((button) => {
        const box = button.getBoundingClientRect();
        return [0.25, 0.75].every((fraction) =>
          button.contains(document.elementFromPoint(box.x + box.width * fraction, box.y + box.height / 2)),
        );
      }),
    ).toBe(true);
  }
  expect(
    await dismiss.evaluate(
      (button, action) => Boolean(button.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING),
      await primary.elementHandle(),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

module.exports = { expectActionPair };
