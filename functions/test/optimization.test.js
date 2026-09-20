import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(relativePath) {
  return readFile(resolve(import.meta.dirname, relativePath), "utf8");
}

test("startup uses one shop bootstrap and does not preload customer or future-month collections", async () => {
  const app = await source("../../src/app/catalog.js");
  const startup = await source("../../src/app/startup.js");
  assert.match(startup, /loadInitialShopData\(\)/);
  assert.doesNotMatch(startup, /loadCustomersCache|preloadCapacityData|ensureCapacityBuffer/);
  assert.doesNotMatch(app, /\.getAllCustomers\s*\(/);
});

test("public RPC does not expose unbounded customer reads or two-step order submission", async () => {
  const index = await source("../src/index.js");
  assert.doesNotMatch(index, /getAllCustomers/);
  assert.doesNotMatch(index, /createOrderService|updateOrderService|checkCapacityBeforeOrderService/);
  assert.match(index, /submitOrder: submitOrderService/);
  assert.match(index, /getShopBootstrap: getShopBootstrapService/);
  assert.match(index, /method === "initializeSession"/);
  assert.match(index, /Promise\.all\(\[/);
});

test("capacity uses daily counters", async () => {
  const capacity = await source("../src/services/capacity.js");
  const orders = await source("../src/services/orders.js");
  assert.match(capacity, /COLLECTIONS\.capacityUsage/);
  assert.match(orders, /FieldValue\.increment\(delta\)/);
});
