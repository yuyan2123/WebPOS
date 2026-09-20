import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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
// Ordinary members must lose access immediately, while their membership and
// already-issued ID token still exist.
await auth.updateUser(viewer.uid, { disabled: true });
await assert.rejects(rpc(viewer, "getProducts", [], shopId), (error) => error.code === "UNAUTHENTICATED");
await assert.rejects(rpc(viewer, "updateProductSpecialPrice", [product.productId, 1], shopId), (error) => error.code === "UNAUTHENTICATED");
await auth.updateUser(viewer.uid, { disabled: false });
// Revocation timestamps use seconds. Wait only if login occurred this second.
const issuedAuthTime = JSON.parse(Buffer.from(viewer.token.split('.')[1], 'base64url').toString()).auth_time;
const untilNextSecond = (issuedAuthTime + 1) * 1000 - Date.now();
if (untilNextSecond > 0) await new Promise((resolve) => setTimeout(resolve, untilNextSecond + 50));
await auth.revokeRefreshTokens(viewer.uid);
await assert.rejects(rpc(viewer, "getProducts", [], shopId), (error) => error.code === "UNAUTHENTICATED");
await rpc(owner, "removeShopMember", [viewer.uid], shopId);
await assert.rejects(rpc(viewer, "getProducts", [], shopId), (error) => error.code === "UNAUTHENTICATED");
await rpc(owner, "deleteProduct", [product.productId], shopId);
const direct = await fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/shops/${shopId}`,
  { headers: { Authorization: `Bearer ${owner.token}` } },
);
assert.equal(direct.status, 403, "Direct browser-equivalent Firestore access must remain denied");
const db = getFirestore();
const limits = db.doc(`posSecurityLimits/${outsider.uid}`);
// Seed only the isolated emulator near the boundary to test racing requests
// without generating a large volume of traffic.
await limits.set({ buckets: { rpc: { start: Date.now(), count: 119 } } });
const racing = await Promise.allSettled([rpc(outsider, "listMyShops"), rpc(outsider, "listMyShops")]);
assert.equal(racing.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(racing.filter((result) => result.status === "rejected" && result.reason.code === "RESOURCE_EXHAUSTED").length, 1);
assert.equal((await limits.get()).data().buckets.rpc.count, 120);
await limits.set({ buckets: { createShop: { start: Date.now(), count: 5 } } });
await assert.rejects(rpc(outsider, "createShop", [{ name: "不應建立" }]), (error) => error.code === "RESOURCE_EXHAUSTED");
assert.equal((await db.collection('shops').where('ownerUid', '==', outsider.uid).get()).size, 0);
// Existing shops count without data migration; concurrent creation cannot
// exceed the lifetime ownership quota.
const quotaSeed = db.batch();
for (let index = 0; index < 19; index++) quotaSeed.set(db.doc(`shops/quota-${index}`), { ownerUid: outsider.uid, name: `Existing ${index}` });
await quotaSeed.commit();
await limits.set({ buckets: {} });
const shopRace = await Promise.allSettled([
  rpc(outsider, "createShop", [{ name: "最後店鋪一" }]),
  rpc(outsider, "createShop", [{ name: "最後店鋪二" }]),
]);
assert.equal(shopRace.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(shopRace.filter((result) => result.status === "rejected" && result.reason.code === "RESOURCE_EXHAUSTED").length, 1);
assert.equal((await db.collection('shops').where('ownerUid', '==', outsider.uid).get()).size, 20);
const devices = db.collection(`users/${outsider.uid}/securityDevices`);
const deviceSeed = db.batch();
for (let index = 0; index < 100; index++) deviceSeed.set(devices.doc(`old-${index}`), { lastSeenAt: Timestamp.fromMillis(index) });
await deviceSeed.commit();
const newDevice = await rpc(outsider, "registerDeviceSession", [{ deviceId: "new-device-0123456789" }]);
assert.deepEqual(Object.keys(newDevice).sort(), ['deviceReference', 'recorded']);
assert.equal((await devices.get()).size, 100);
assert.equal((await devices.doc('old-0').get()).exists, false);
const privateLimit = await fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/posSecurityLimits/${outsider.uid}`,
  { headers: { Authorization: `Bearer ${outsider.token}` } },
);
assert.equal(privateLimit.status, 403);
console.log(
  "PASS: authenticated workflows, immediate revocation, concurrent rate/shop limits, device retention, unchanged RPC/data contracts and deny-all rules",
);
