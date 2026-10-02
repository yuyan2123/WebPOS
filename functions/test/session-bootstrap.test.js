import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/firebase.js";
import { executeRpc } from "../src/index.js";

const shop = { shopId: "startup-shop", name: "測試店鋪", role: "owner" };
const request = (options = { shopId: shop.shopId, year: 2026, month: 10 }) => ({
  auth: { uid: "startup-user", token: { email_verified: true, email: "startup@example.test" } },
  data: {
    method: "initializeSession",
    args: [
      { deviceId: "startup-device-123456", userAgent: "startup-test" },
      ...(options ? [options] : []),
    ],
  },
});

function mockStartupStore(t, { membership = true } = {}) {
  for (const [key, value] of Object.entries({
    SECURITY_HASH_SALT: "startup-test-secret-with-more-than-32-characters",
    POS_ALLOWED_EMAILS: "",
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const deviceWrite = Promise.withResolvers();
  const capacityRead = Promise.withResolvers();
  const reads = [];
  t.after(() => deviceWrite.resolve());
  const documentPrototype = Object.getPrototypeOf(db.doc("system/systemAdmin"));
  const queryPrototype = Object.getPrototypeOf(db.collection("shops").orderBy("name"));
  t.mock.method(documentPrototype, "set", function () {
    assert.match(this.path, /^users\/startup-user\/securityDevices\//);
    return deviceWrite.promise;
  });
  t.mock.method(documentPrototype, "get", async function () {
    reads.push(this.path);
    if (this.path === "system/systemAdmin") return { exists: true, data: () => ({ uid: "another-admin" }) };
    if (this.path.endsWith("/members/startup-user")) return { exists: membership, data: () => ({ role: "owner" }) };
    if (this.path.endsWith("/settings/capacity")) return { exists: true, data: () => ({ weekday: {}, usageVersion: 1 }) };
    if (this.path.endsWith("/settings/productOrder")) return { exists: false, data: () => undefined };
    assert.fail(`Unexpected document read: ${this.path}`);
  });
  t.mock.method(queryPrototype, "get", async function () {
    const collection = this._queryOptions.collectionId;
    reads.push(collection);
    if (collection === "shops") return { docs: [{ id: shop.shopId, data: () => shop }] };
    if (collection === "capacityUsage") capacityRead.resolve();
    assert.ok(["products", "capacityOverrides", "capacityUsage"].includes(collection));
    return { docs: [] };
  });
  return { deviceWrite, capacityRead, reads };
}

test("session prepares shop bootstrap during the device write and waits for both before responding", { timeout: 2000 }, async (t) => {
  const { deviceWrite, capacityRead } = mockStartupStore(t);
  let completed = false;
  const pending = executeRpc(request()).then((result) => {
    completed = true;
    return result;
  });
  await capacityRead.promise;
  await new Promise(setImmediate);
  assert.equal(completed, false, "session must still wait for the device audit");
  deviceWrite.resolve();
  const result = await pending;
  assert.deepEqual(result.shops, [shop]);
  assert.deepEqual(result.selectedShop, shop);
  assert.deepEqual(result.bootstrap.products, []);
  assert.equal(result.bootstrap.capacityMonth.key, "2026-10");
  assert.equal(result.device.recorded, true);
});

test("a device write failure still rejects a session whose shop bootstrap is ready", { timeout: 2000 }, async (t) => {
  const { deviceWrite, capacityRead } = mockStartupStore(t);
  const pending = executeRpc(request());
  await capacityRead.promise;
  const rejected = assert.rejects(pending, /device audit unavailable/);
  deviceWrite.reject(new Error("device audit unavailable"));
  await rejected;
});

test("session still checks current shop membership before reading business data", async (t) => {
  const { deviceWrite, reads } = mockStartupStore(t, { membership: false });
  let completed = false;
  const pending = executeRpc(request()).finally(() => { completed = true; });
  const rejected = assert.rejects(pending, (error) => error.code === "not-found");
  await new Promise(setImmediate);
  assert.equal(completed, false, "failed shop data must still finish the device audit");
  deviceWrite.resolve();
  await rejected;
  assert.ok(reads.some((path) => path.endsWith("/members/startup-user")));
  assert.equal(reads.includes("products"), false);
  assert.equal(reads.includes("capacityUsage"), false);
});

test("session without bootstrap options keeps its shops and device response", async (t) => {
  const { deviceWrite, reads } = mockStartupStore(t);
  deviceWrite.resolve();
  const result = await executeRpc(request(null));
  assert.deepEqual(result.shops, [shop]);
  assert.equal(result.device.recorded, true);
  assert.equal(Object.hasOwn(result, "selectedShop"), false);
  assert.equal(Object.hasOwn(result, "bootstrap"), false);
  assert.equal(reads.includes("products"), false);
});
