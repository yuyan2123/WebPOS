import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { db } from "../src/firebase.js";
import { getShopBootstrap } from "../src/services/bootstrap.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function snapshot(records) {
  return { docs: records.map(({ id, ...data }) => ({ id, data: () => data })) };
}

test("bootstrap starts capacity usage after settings while the product query is still pending", async (t) => {
  const productsReady = deferred();
  const settingsReady = deferred();
  const usageReady = deferred();
  const reads = [];
  const queries = [];
  const products = [
    { id: "P1", productName: "商品一", price: 50, status: "啟用" },
    { id: "P2", productName: "商品二", price: 100, status: "停用" },
  ];
  const dateOverrides = [
    { id: "2026-08-31", date: "2026-08-31", maxQuantity: 30, enabled: true },
    { id: "2026-09-02", date: "2026-09-02", maxQuantity: 10, enabled: true },
    { id: "2026-10-01", date: "2026-10-01", maxQuantity: 30, enabled: true },
  ];
  const weekday = Object.fromEntries(Array.from({ length: 7 }, (_, dayOfWeek) => [String(dayOfWeek), {
    dayOfWeek, maxQuantity: 20, enabled: true,
  }]));

  t.mock.method(db, "collection", (path) => {
    const operations = [];
    const query = {
      orderBy(...args) { operations.push(["orderBy", ...args]); return query; },
      where(...args) { operations.push(["where", ...args]); return query; },
      select(...args) { operations.push(["select", ...args]); return query; },
      doc(id) {
        assert.equal(path, "shops/bootstrap-shop/settings");
        assert.equal(id, "productOrder");
        return { get: async () => ({ data: () => ({ productIds: ["P2", "P1"] }) }) };
      },
      async get() {
        reads.push(path);
        queries.push({ path, operations });
        if (path.endsWith("/products")) {
          await productsReady.promise;
          return snapshot(products);
        }
        if (path.endsWith("/capacityOverrides")) return snapshot(dateOverrides);
        assert.equal(path, "shops/bootstrap-shop/capacityUsage");
        await usageReady.promise;
        return snapshot([{ id: "2026-09-02", date: "2026-09-02", quantity: 11 }]);
      },
    };
    return query;
  });
  const shop = {
    shopId: "bootstrap-shop",
    shopRef: {
      collection(name) {
        assert.equal(name, "settings");
        return {
          doc(id) {
            assert.equal(id, "capacity");
            return {
              async get() {
                reads.push("capacity-settings");
                await settingsReady.promise;
                return { exists: true, data: () => ({ weekday, usageVersion: 1 }) };
              },
            };
          },
        };
      },
    },
  };

  let settled = false;
  const loading = getShopBootstrap(shop, 2026, 9);
  loading.then(() => { settled = true; }, () => { settled = true; });
  try {
    await setImmediate();
    assert.ok(reads.includes("shops/bootstrap-shop/products"));
    assert.ok(reads.includes("capacity-settings"));
    assert.ok(!reads.includes("shops/bootstrap-shop/capacityUsage"));

    settingsReady.resolve();
    await setImmediate();
    assert.ok(reads.includes("shops/bootstrap-shop/capacityUsage"), "capacity usage must not wait for products");
    assert.equal(settled, false);

    usageReady.resolve();
    await setImmediate();
    assert.equal(settled, false, "bootstrap must still wait for the complete product list");
    productsReady.resolve();
    const result = await loading;
    assert.deepEqual(result.products, products.toReversed().map(({ id, ...data }) => ({ productId: id, ...data })));
    assert.deepEqual(result.capacitySettings.dateOverrides, dateOverrides);
    assert.equal(result.capacitySettings.usageVersion, 1);
    assert.equal(result.capacityMonth.key, "2026-9");
    assert.equal(Object.keys(result.capacityMonth.data).length, 30);
    assert.equal(result.capacityMonth.data["2026-09-02"].currentQuantity, 11);
    assert.equal(result.capacityMonth.data["2026-09-02"].limit, 10);
    assert.equal(result.capacityMonth.data["2026-09-02"].status, "exceeded");
    assert.deepEqual(queries.find(({ path }) => path.endsWith("/capacityOverrides")).operations, [["orderBy", "date"]]);
    assert.deepEqual(queries.find(({ path }) => path.endsWith("/capacityUsage")).operations, [
      ["where", "date", ">=", "2026-09-01"],
      ["where", "date", "<=", "2026-09-30"],
      ["select", "date", "quantity"],
    ]);
  } finally {
    settingsReady.resolve();
    usageReady.resolve();
    productsReady.resolve();
    await loading.catch(() => {});
  }
});
