import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { importData, prepare } from "./import.mjs";

assert.match(
  process.env.FIRESTORE_EMULATOR_HOST || "",
  /^(127\.0\.0\.1|localhost):\d+$/,
  "This test must only run in a local Firestore emulator",
);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const app = initializeApp({ projectId: "demo-ginjia-migration" });
const db = getFirestore(app);
const uid = "migration-owner";
const shopId = "migration-shop";
const now = "2025-09-01T12:00:00+08:00";
const payload = {
  format: "gin-jia-pos-xlsx",
  schemaVersion: 2,
  source: { file: "fixture.xlsx", sha256: "a".repeat(64) },
  products: [
    {
      productId: "P1",
      productName: "測試餅",
      status: "啟用",
      price: 50,
      specialPrice: "",
      companyPrice: "",
      createTime: now,
    },
  ],
  customers: [
    {
      documentId: "0912345678",
      customerId: "C1",
      name: "測試",
      phone: "0912345678",
      contactType: "phone",
      contactValue: "0912345678",
      contactNormalized: "0912345678",
      createTime: now,
      lastOrderDate: now,
    },
  ],
  orders: [
    {
      orderId: "O1",
      customerName: "測試",
      customerContactType: "phone",
      customerContactValue: "0912345678",
      customerContactNormalized: "0912345678",
      status: "已確認",
      deliveryDate: "2025-09-12",
      createTime: now,
      totalAmount: 300,
      depositAmount: 300,
      remainingAmount: 0,
      shippingFee: 0,
      items: [
        {
          productId: "P1",
          productName: "禮盒",
          quantity: 2,
          unitPrice: 150,
          subtotal: 300,
          originalPrice: 150,
          isGiftBox: true,
          giftBoxDetails: { size: 6, products: { P1: 6 }, notes: "" },
        },
      ],
    },
  ],
  weekdayCapacity: [{ dayOfWeek: 1, maxQuantity: 300, enabled: true }],
  capacityOverrides: [],
};
const options = { db, uid, shopId, payload };
const shop = db.collection("shops").doc(shopId);
const usage = shop.collection("capacityUsage").doc("2025-09-12");
let assertions = 0;
const check = (label) => {
  assertions++;
  console.log(`OK ${label}`);
};
const tmp = await mkdtemp(join(tmpdir(), "pos-migration-test-"));
try {
  await getAuth(app).createUser({ uid, email: "migration@example.test", emailVerified: true });
  await shop.set({ ownerUid: uid, name: "移轉測試店" });
  await shop.collection("members").doc(uid).set({ role: "owner" });
  await db.doc(`users/${uid}/shops/${shopId}`).set({ role: "owner", name: "移轉測試店" });
  await shop.collection("settings").doc("capacity").set({ weekday: {}, usageVersion: 1 });
  await shop.collection("orders").doc("existing-pos-order").set({ status: "已確認" });
  await usage.set({ date: "2025-09-12", quantity: 7 });
  const plan = await importData(options);
  assert.equal(plan.counts.create, 3);
  assert.equal((await shop.collection("products").get()).size, 0);
  check("dry run makes no writes");
  await assert.rejects(importData({ ...options, uid: "outsider", apply: true }), /not owned/);
  check("wrong user rejected before writes");
  const bad = structuredClone(payload);
  bad.orders[0].orderId = "../other-shop";
  assert.throws(() => prepare(bad), /Invalid document ID/);
  bad.orders[0].orderId = "O1";
  bad.orders[0].items[0].quantity = -1;
  assert.throws(() => prepare(bad), /Invalid number/);
  check("paths and malformed values rejected");
  const applied = await importData({ ...options, apply: true });
  assert.equal(applied.written, 4);
  assert.equal((await usage.get()).data().quantity, 19);
  const order = (await shop.collection("orders").doc("O1").get()).data();
  assert.equal(order.remainingAmount, 0);
  assert.ok(order.createTime instanceof Timestamp);
  assert.equal(order.createTime.toDate().toISOString(), "2025-09-01T04:00:00.000Z");
  check("typed import preserves balance, timestamp and existing capacity");
  const repeated = await importData({ ...options, apply: true });
  assert.equal(repeated.written, 0);
  assert.equal((await usage.get()).data().quantity, 19);
  check("same import is idempotent");
  const changed = structuredClone(payload);
  changed.products[0].price = 999;
  const conflict = await importData({ ...options, payload: changed, apply: true });
  assert.deepEqual(conflict.conflicts, ["products/P1"]);
  assert.equal(conflict.written, 0);
  const skipped = await importData({ ...options, payload: changed, apply: true, onExisting: "skip" });
  assert.equal(skipped.written, 0);
  assert.equal((await shop.collection("products").doc("P1").get()).data().price, 50);
  check("conflicts block before writing; explicit skip preserves destination");
  const more = structuredClone(payload);
  more.products.push({ ...more.products[0], productId: "P2" });
  more.orders.push({ ...more.orders[0], orderId: "O2" });
  await assert.rejects(
    importData({
      ...options,
      payload: more,
      apply: true,
      onProgress: (count) => {
        if (count === 1) throw new Error("simulated interruption");
      },
    }),
    /committed documents/,
  );
  const resumed = await importData({ ...options, payload: more, apply: true });
  assert.equal(resumed.written, 1);
  assert.equal((await usage.get()).data().quantity, 31);
  check("interrupted import resumes without duplicate capacity");
  const concurrent = structuredClone(payload);
  concurrent.orders = [{ ...concurrent.orders[0], orderId: "O3" }];
  await Promise.all([
    importData({ ...options, payload: concurrent, apply: true }),
    importData({ ...options, payload: concurrent, apply: true }),
    usage.update({ quantity: FieldValue.increment(5) }),
  ]);
  assert.equal((await usage.get()).data().quantity, 48);
  check("concurrent imports and POS increment do not double count or lose capacity");
  const cancelled = structuredClone(payload);
  cancelled.orders = [{ ...cancelled.orders[0], orderId: "O4", status: "取消" }];
  await importData({ ...options, payload: cancelled, apply: true });
  assert.equal((await usage.get()).data().quantity, 48);
  check("cancelled orders do not count toward capacity");
  const input = join(tmp, "payload.json");
  await writeFile(input, JSON.stringify(payload));
  const cli = (...args) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL("./import.mjs", import.meta.url)), ...args],
        { windowsHide: true },
      );
      let output = "",
        errors = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        errors += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, output, errors }));
    });
  const result = await cli(
    "--project",
    "demo-ginjia-migration",
    "--email",
    "migration@example.test",
    "--shop",
    shopId,
    "--file",
    input,
  );
  assert.equal(result.code, 0, result.errors);
  assert.equal(JSON.parse(result.output).mode, "dry-run");
  const listing = await cli("--project", "demo-ginjia-migration", "--uid", uid, "--list-shops");
  assert.equal(JSON.parse(listing.output).shops[0].shopId, shopId);
  check("CLI resolves email/UID and lists the user shop");
  assert.equal((await db.collection("users").doc(uid).collection("orders").get()).size, 0);
  assert.equal((await db.collection("orders").get()).size, 0);
  check("business records stay exclusively under shops/{shopId}");
  console.log(`${assertions} integration checks passed`);
} finally {
  const resolved = await realpath(tmp);
  assert.equal(dirname(resolved), await realpath(tmpdir()));
  assert.ok(basename(resolved).startsWith("pos-migration-test-"));
  await rm(resolved, { recursive: true, force: true });
  await deleteApp(app);
}
