import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { domain } from "../src/lib/domain.js";
import { normalizeItem } from "../src/lib/order-item.js";
import { normalizeReportOrders } from "../src/services/reports.js";
import { boolean, integer, number, text, dateString } from "../src/lib/values.js";
import { assert as validate } from "../src/lib/errors.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-baseline.txt`, import.meta.url), "utf8");
const legacyItem = new Function(
  "boolean",
  "integer",
  "number",
  "text",
  "assert",
  "newId",
  fixture("normalizeItem") + ";return normalizeItem;",
)(boolean, integer, number, text, validate, (prefix) => prefix + "generated");
let seed = 1701;
function random(max) {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed % max;
}

test("Rust item records match original normal and gift-box normalization for 500 inputs", () => {
  for (let i = 0; i < 500; i++) {
    const item = {
      detailId: "D-fixed",
      productId: "P-fixed",
      productName: i % 2 ? "商品" : "🧁",
      price: random(100000) / 10,
      quantity: random(10000) + 1,
      originalPrice: i % 3 ? undefined : random(1000),
      isSpecialPrice: i % 5 === 0,
    };
    if (i % 2)
      Object.assign(item, {
        type: "giftbox",
        size: 6,
        products: { P1: random(4) + 1, P2: 2 },
        notes: "備註",
      });
    assert.deepEqual(normalizeItem(item), legacyItem(item));
  }
});

test("Rust item validation rejects original invalid inputs and preserves UTF-16 limits", () => {
  for (const item of [
    { quantity: 0, price: 1 },
    { quantity: 1, price: -1 },
    { quantity: 10001, price: 1 },
    { quantity: 1, price: 1e8 },
    { quantity: 1, price: 1, productName: "🧁".repeat(101) },
    { quantity: 1, price: 1, type: "giftbox", size: 0 },
    { quantity: 1, price: 1, type: "giftbox", size: 6, products: { P1: 0 } },
  ]) {
    const input = { productId: "P1", productName: "商品", ...item };
    let originalError;
    try {
      legacyItem(input);
    } catch (error) {
      originalError = error;
    }
    assert.ok(originalError);
    assert.throws(
      () => normalizeItem(input),
      (error) => error.message === originalError.message,
    );
  }
});

test("Rust report and demand outputs match baseline for mixed, missing and duplicate product data", async () => {
  const source = fixture("reports")
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("export async function", "async function");
  for (let iteration = 0; iteration < 100; iteration++) {
    const products = [
      { productId: "P1", productName: "商品", price: 50 },
      { productId: "P2", productName: "商品", price: 60 },
      { productId: "P3", productName: "其他", price: 20 },
    ];
    const orders = Array.from({ length: random(12) }, () => ({
      totalAmount: random(1000),
      items: Array.from({ length: random(8) }, () => {
        const item = {
          productName: random(2) ? "商品" : "其他",
          quantity: random(20),
          unitPrice: 50,
          subtotal: random(400),
        };
        if (random(2))
          Object.assign(item, {
            isGiftBox: true,
            giftBoxDetails: random(5)
              ? { size: random(3) * 2 + 6, products: { P1: 2, P3: 4, missing: 1 } }
              : { size: 6 },
          });
        return item;
      }),
    }));
    const legacy = new Function(
      "ordersInDateRange",
      "getProductsByIds",
      "dateString",
      "number",
      source + ";return {generateDailyReport,getDemandStats};",
    )(
      async () => orders,
      async () => products,
      dateString,
      number,
    );
    const productMap = Object.fromEntries(products.map((product) => [product.productId, product]));
    assert.deepEqual(
      domain("report", { date: "2026-09-06", orders: normalizeReportOrders(orders, productMap, true) }),
      await legacy.generateDailyReport({}, "2026-09-06"),
    );
    assert.deepEqual(
      domain("demand", { orders: normalizeReportOrders(orders, productMap) }),
      await legacy.getDemandStats({}, "2026-09-01", "2026-09-06"),
    );
  }
});
