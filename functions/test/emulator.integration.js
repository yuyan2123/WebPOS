import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = "demo-ginjia-pos";
assert.equal(process.env.GCLOUD_PROJECT, projectId, "Integration tests require the isolated demo project");
for (const variable of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"])
  assert.match(process.env[variable] || "", /^(127\.0\.0\.1|localhost):\d+$/, "Refuse non-emulator access");
initializeApp({ projectId });
const auth = getAuth();
const password = "emulator-only-pass-12345";
async function account(name, creationTime, verified = true) {
  const email = `${name}@example.test`;
  // Admin SDK creationTime has second precision. Import explicit timestamps so
  // fast CI runs cannot tie the earliest accounts and block admin initialization.
  const imported = await auth.importUsers([
    { uid: name, email, emailVerified: verified, metadata: { creationTime } },
  ]);
  assert.equal(imported.failureCount, 0, JSON.stringify(imported.errors));
  const user = await auth.updateUser(name, { password });
  assert.equal(Date.parse(user.metadata.creationTime), Date.parse(creationTime));
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const result = await response.json();
  assert.ok(result.idToken);
  return { ...user, token: result.idToken };
}
async function rpc(user, method, args = [], shopId) {
  const response = await fetch(`http://127.0.0.1:15101/${projectId}/asia-east1/posRpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    body: JSON.stringify({ data: { method, args, ...(shopId ? { shopId } : {}) } }),
  });
  const data = await response.json();
  if (data.error) throw Object.assign(new Error(data.error.message), { code: data.error.status });
  assert.ok(response.ok);
  return data.result;
}

const owner = await account("owner", "2026-01-01T00:00:00.000Z"),
  viewer = await account("viewer", "2026-01-01T00:00:01.000Z"),
  outsider = await account("outsider", "2026-01-01T00:00:02.000Z"),
  unverified = await account("unverified", "2026-01-01T00:00:03.000Z", false);
await assert.rejects(rpc(null, "listMyShops"), (error) => error.code === "UNAUTHENTICATED");
await assert.rejects(rpc(unverified, "listMyShops"), (error) => error.code === "FAILED_PRECONDITION");
const session = await rpc(owner, "initializeSession", [
  { deviceId: "emulator-browser-01234567890123456789" },
]);
assert.deepEqual(session.shops, []);
const { shop } = await rpc(owner, "createShop", [{ name: "整合測試店" }]);
const shopId = shop.shopId;
assert.equal((await rpc(owner, "listMyShops"))[0].shopId, shopId);
await rpc(owner, "addShopMember", [{ email: viewer.email, role: "viewer" }], shopId);
await assert.rejects(
  rpc(viewer, "saveProduct", [{ productName: "不能新增", price: 1 }], shopId),
  (error) => error.code === "PERMISSION_DENIED",
);
await assert.rejects(rpc(outsider, "getProducts", [], shopId), (error) => error.code === "NOT_FOUND");
const product = await rpc(
  owner,
  "saveProduct",
  [{ productName: "原味餅", category: "伴手禮", price: 50, status: "啟用", giftBoxEnabled: "是" }],
  shopId,
);
assert.equal((await rpc(viewer, "getProducts", [], shopId)).length, 1);
assert.equal((await rpc(owner, "getShopBootstrap", [2026, 9], shopId)).products.length, 1);
// Product ordering uses the same authenticated, shop-scoped RPC as catalog edits.
const secondProduct = await rpc(owner, "saveProduct", [{ productName: "AAA 排序測試", category: "測試", price: 10, status: "停用" }], shopId);
const originalIds = [product.productId, secondProduct.productId];
const reversedIds = [...originalIds].reverse();
const productIds = async () => (await rpc(viewer, "getProducts", [], shopId)).map((p) => p.productId);
assert.deepEqual(await productIds(), originalIds, "New products append regardless of name");
const sorting = { productIds: reversedIds, expectedProductIds: originalIds };
await assert.rejects(rpc(viewer, "saveProductOrder", [sorting], shopId), (error) => error.code === "PERMISSION_DENIED");
await assert.rejects(rpc(outsider, "saveProductOrder", [sorting], shopId), (error) => error.code === "NOT_FOUND");
await assert.rejects(rpc(owner, "saveProductOrder", [{ ...sorting, productIds: [product.productId, product.productId] }], shopId), (error) => error.code === "INVALID_ARGUMENT");
await assert.rejects(rpc(owner, "saveProductOrder", [{ ...sorting, productIds: [product.productId, "foreign-product"] }], shopId), (error) => error.code === "INVALID_ARGUMENT");
await rpc(owner, "saveProductOrder", [sorting], shopId);
assert.deepEqual(await productIds(), reversedIds);
assert.deepEqual((await rpc(owner, "getShopBootstrap", [2026, 9], shopId)).products.map((p) => p.productId), reversedIds);
await assert.rejects(rpc(owner, "saveProductOrder", [sorting], shopId), (error) => error.code === "FAILED_PRECONDITION");
await rpc(owner, "saveProduct", [{ productId: secondProduct.productId, productName: "ZZZ 改名", price: 20, status: "啟用" }], shopId);
assert.deepEqual(await productIds(), reversedIds, "Editing does not change order");
const thirdProduct = await rpc(owner, "saveProduct", [{ productName: "000 新商品", price: 30 }], shopId);
const threeIds = [...reversedIds, thirdProduct.productId];
assert.deepEqual(await productIds(), threeIds);
await assert.rejects(rpc(owner, "saveProductOrder", [{ productIds: originalIds, expectedProductIds: reversedIds }], shopId), (error) => error.code === "FAILED_PRECONDITION");
const attempts = await Promise.allSettled([
  rpc(owner, "saveProductOrder", [{ productIds: [...threeIds].reverse(), expectedProductIds: threeIds }], shopId),
  rpc(owner, "saveProductOrder", [{ productIds: [threeIds[1], threeIds[0], threeIds[2]], expectedProductIds: threeIds }], shopId),
]);
assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1, "Concurrent stale reorder must not overwrite the winner");
assert.equal(attempts.find((result) => result.status === "rejected").reason.code, "FAILED_PRECONDITION");
await rpc(owner, "deleteProduct", [secondProduct.productId], shopId);
await rpc(owner, "deleteProduct", [thirdProduct.productId], shopId);
assert.deepEqual(await productIds(), [product.productId]);
await rpc(
  owner,
  "saveWeekdayCapacity",
  [Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, enabled: true, maxQuantity: 1 }))],
  shopId,
);
const order = {
  clientRequestId: "emulator-idempotency",
  customer: { name: "測試客戶", contactType: "line", contactValue: "LINE", deliveryType: "自取" },
  deliveryDate: "2026-09-07",
  items: [{ productId: product.productId, productName: "原味餅", quantity: 2, price: 50 }],
};
assert.equal((await rpc(owner, "submitOrder", [order, {}], shopId)).needConfirm, true);
const submitted = await rpc(owner, "submitOrder", [order, { confirmed: true }], shopId);
assert.equal((await rpc(owner, "submitOrder", [order, { confirmed: true }], shopId)).idempotentReplay, true);
const orderId = submitted.orderId;
assert.equal((await rpc(owner, "getOrderDetails", [orderId], shopId)).totalAmount, 100);
assert.equal(
  (await rpc(owner, "getMonthCapacityStatus", [2026, 9], shopId))["2026-09-07"].currentQuantity,
  2,
);
assert.equal((await rpc(owner, "updateOrderDeposit", [orderId, 100, "現金"], shopId)).newStatus, "已付清");
assert.equal(
  (await rpc(owner, "searchOrders", [{ name: "測試", paginated: true }], shopId)).orders.length,
  1,
);
assert.equal((await rpc(owner, "searchCustomers", [{ keyword: "測試", mode: "name" }], shopId)).length, 1);
assert.equal((await rpc(owner, "generateDailyReport", ["2026-09-07"], shopId)).totalRevenue, 100);
assert.equal(
  (await rpc(owner, "getDemandStats", ["2026-09-07", "2026-09-07"], shopId)).productStats[0].total,
  2,
);
await rpc(owner, "updateOrderStatus", [orderId, "取消"], shopId);
assert.equal(
  (await rpc(owner, "getMonthCapacityStatus", [2026, 9], shopId))["2026-09-07"].currentQuantity,
  0,
);
await rpc(owner, "deleteOrder", [orderId], shopId);
assert.deepEqual(await rpc(owner, "searchOrderById", [orderId], shopId), []);
await rpc(
  owner,
  "saveDateOverrideCapacityBatch",
  [
    [
      { date: "2026-09-07", maxQuantity: 10, enabled: true },
      { date: "2026-09-08", maxQuantity: 20, enabled: true },
    ],
  ],
  shopId,
);
assert.equal((await rpc(owner, "getCapacitySettings", [], shopId)).dateOverrides.length, 2);
await rpc(owner, "deleteDateOverrideCapacity", ["2026-09-07"], shopId);
await rpc(owner, "renameShop", ["重新命名測試店"], shopId);
await rpc(owner, "updateShopMemberRole", [{ uid: viewer.uid, role: "editor" }], shopId);
await rpc(viewer, "updateProductSpecialPrice", [product.productId, 40], shopId);
await rpc(owner, "removeShopMember", [viewer.uid], shopId);
await assert.rejects(rpc(viewer, "getProducts", [], shopId), (error) => error.code === "NOT_FOUND");
await rpc(owner, "deleteProduct", [product.productId], shopId);
const direct = await fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/shops/${shopId}`,
  { headers: { Authorization: `Bearer ${owner.token}` } },
);
assert.equal(direct.status, 403, "Direct browser-equivalent Firestore access must remain denied");
console.log(
  "PASS: authenticated emulator workflows, roles/isolation, idempotency, capacity, payments, reports, catalog, membership and deny-all rules",
);
