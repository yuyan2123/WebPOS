import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthCapacityStatus, calculateOrderUnitCount } from "../src/services/capacity.js";

test("counts normal products and expanded gift boxes", () => {
  const count = calculateOrderUnitCount([
    { productId: "P1", quantity: 3 },
    { type: "giftbox", quantity: 2, size: 6, products: { P1: 2, P2: 4 } },
  ]);
  assert.equal(count, 15);
});

test("uses gift-box size when composition is unavailable", () => {
  assert.equal(calculateOrderUnitCount([{ isGiftBox: true, quantity: 2, giftBoxDetails: { size: 8 } }]), 16);
});

test("builds monthly capacity from one usage total per date", () => {
  const settings = {
    weekday: Object.fromEntries(Array.from({ length: 7 }, (_, dayOfWeek) => [String(dayOfWeek), {
      dayOfWeek,
      maxQuantity: 20,
      enabled: true,
    }])),
    dateOverrides: [{ date: "2026-09-02", maxQuantity: 10, enabled: true }],
  };
  const result = buildMonthCapacityStatus(settings, [
    { date: "2026-09-01", quantity: 8 },
    { date: "2026-09-01", quantity: 4 },
    { date: "2026-09-02", quantity: 11 },
  ], 2026, 9);

  assert.equal(result["2026-09-01"].currentQuantity, 12);
  assert.equal(result["2026-09-01"].limit, 20);
  assert.equal(result["2026-09-02"].currentQuantity, 11);
  assert.equal(result["2026-09-02"].limit, 10);
  assert.equal(result["2026-09-02"].status, "exceeded");
});
