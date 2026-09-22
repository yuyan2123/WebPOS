import test from "node:test";
import assert from "node:assert/strict";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../src/firebase.js";
import {
  createOrder,
  updateOrder,
  updateOrderDeposit,
  updateOrderStatus,
  deleteOrder,
} from "../src/services/orders.js";
import { executeRpc } from "../src/index.js";

const order = () => ({
  clientRequestId: "regression-request",
  customer: { name: "測試", contactType: "line", contactValue: "LINE", deliveryType: "自取" },
  deliveryDate: "2026-09-06",
  shippingFee: 20,
  items: [{ productId: "P1", productName: "商品", quantity: 2, price: 50 }],
});

function transactionStore(t) {
  const records = new Map();
  const batches = [];
  t.mock.method(db, "runTransaction", async (callback) => {
    const next = new Map(records);
    const writes = [];
    const transaction = {
      get: async (reference) => ({ exists: next.has(reference.path), data: () => next.get(reference.path) }),
      create(reference, data) {
        assert.ok(!next.has(reference.path));
        next.set(reference.path, data);
        writes.push(["create", reference.path, data]);
      },
      update(reference, data) {
        assert.ok(next.has(reference.path));
        next.set(reference.path, { ...next.get(reference.path), ...data });
        writes.push(["update", reference.path, data]);
      },
      set(reference, data) {
        next.set(reference.path, { ...next.get(reference.path), ...data });
        writes.push(["set", reference.path, data]);
      },
      delete(reference) {
        next.delete(reference.path);
        writes.push(["delete", reference.path]);
      },
    };
    const result = await callback(transaction);
    records.clear();
    for (const [key, value] of next) records.set(key, value);
    batches.push(writes);
    return result;
  });
  return { records, batches };
}

test("orders accept either customer name or contact and reject both missing", async (t) => {
  const { records } = transactionStore(t);
  const shop = { shopId: "regression-shop", shopRef: db.doc("shops/regression-shop") };
  for (const customer of [{ name: "只有姓名" }, { phone: "0912345678" }]) {
    const data = { ...order(), clientRequestId: JSON.stringify(customer), customer };
    const result = await createOrder(shop, data);
    await updateOrder(shop, { ...data, orderId: result.orderId });
    const saved = records.get(`shops/regression-shop/orders/${result.orderId}`);
    assert.equal(saved.customerName, customer.name || "");
    assert.equal(saved.customerPhone, customer.phone || "");
    await assert.rejects(updateOrder(shop, { ...data, orderId: result.orderId, customer: {} }), /至少填寫一項/);
  }
  const customers = [...records.entries()].filter(([path]) => path.includes('/customers/')).map(([, value]) => value);
  assert.ok(customers.some((customer) => customer.name === "只有姓名" && customer.phone === ""));
  assert.ok(customers.some((customer) => customer.name === "" && customer.phone === "0912345678"));
  await assert.rejects(createOrder(shop, { ...order(), customer: { name: " ", phone: " " } }), /至少填寫一項/);
});

test("create/replay/payment/edit/cancel/delete preserve transaction and capacity behavior", async (t) => {
  const { records, batches } = transactionStore(t);
  const shop = { shopId: "regression-shop", shopRef: db.doc("shops/regression-shop") };
  const result = await createOrder(shop, order());
  const path = `shops/regression-shop/orders/${result.orderId}`;
  assert.equal(records.get(path).totalAmount, 120);
  assert.equal(records.get(path).orderUnitCount, 2);
  assert.ok(
    batches[0]
      .find((write) => write[1].endsWith("capacityUsage/2026-09-06"))[2]
      .quantity.isEqual(FieldValue.increment(2)),
  );
  assert.equal((await createOrder(shop, order())).idempotentReplay, true);
  assert.equal(batches.at(-1).length, 0);
  assert.equal((await updateOrderDeposit(shop, result.orderId, 120, "現金")).newStatus, "已付清");
  await assert.rejects(updateOrderDeposit(shop, result.orderId, 121, ""), /不能超過/);
  const changed = await updateOrder(shop, {
    ...order(),
    orderId: result.orderId,
    deliveryDate: "2026-09-07",
    items: [{ productId: "P1", productName: "商品", quantity: 3, price: 50 }],
  });
  assert.equal(changed.paymentChange.remainingAmount, 50);
  assert.equal(records.get(path).status, "已確認");
  assert.ok(
    batches
      .at(-1)
      .some(
        (write) =>
          write[1].endsWith("capacityUsage/2026-09-06") &&
          write[2].quantity.isEqual(FieldValue.increment(-2)),
      ),
  );
  assert.ok(
    batches
      .at(-1)
      .some(
        (write) =>
          write[1].endsWith("capacityUsage/2026-09-07") && write[2].quantity.isEqual(FieldValue.increment(3)),
      ),
  );
  await updateOrderStatus(shop, result.orderId, "取消");
  assert.ok(
    batches
      .at(-1)
      .some(
        (write) =>
          write[1].endsWith("capacityUsage/2026-09-07") &&
          write[2].quantity.isEqual(FieldValue.increment(-3)),
      ),
  );
  await deleteOrder(shop, result.orderId);
  assert.equal(records.has(path), false);
  assert.equal(batches.at(-1).length, 1);
});

test("editing paid order down preserves refund note, creation time and deposit", async (t) => {
  const { records } = transactionStore(t);
  const shop = { shopId: "regression-shop", shopRef: db.doc("shops/regression-shop") };
  const { orderId } = await createOrder(shop, order());
  await updateOrderDeposit(shop, orderId, 120, "");
  await updateOrder(shop, { ...order(), orderId, shippingFee: 0 });
  const saved = records.get(`shops/regression-shop/orders/${orderId}`);
  assert.equal(saved.depositAmount, 120);
  assert.equal(saved.remainingAmount, 0);
  assert.match(saved.paymentNotes, /應退款 NT\$ 20/);
  assert.ok(saved.createTime instanceof Timestamp);
});

test("RPC rejects inherited methods, invalid contracts and viewer mutations", async (t) => {
  const auth = { uid: "viewer-user", token: { email_verified: true, email: "viewer@example.test" } };
  for (const method of ["__proto__", "constructor", "toString"]) {
    await assert.rejects(
      executeRpc({ auth, data: { method, args: [] } }),
      (error) => error.code === "not-found",
    );
  }
  await assert.rejects(
    executeRpc({ auth, data: { method: "getProducts", args: "invalid" } }),
    (error) => error.code === "invalid-argument",
  );
  const prototype = Object.getPrototypeOf(db.doc("shops/test/members/viewer-user"));
  t.mock.method(prototype, "get", async () => ({ exists: true, data: () => ({ role: "viewer" }) }));
  await assert.rejects(
    executeRpc({ auth, data: { method: "deleteOrder", shopId: "test", args: ["order"] } }),
    (error) => error.code === "permission-denied",
  );
  await assert.rejects(
    executeRpc({ auth, data: { method: "renameShop", shopId: "test", args: ["Changed"] } }),
    (error) => error.code === "permission-denied",
  );
});
