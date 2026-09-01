import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { calculateOrderUnitCount } from "../src/lib/order-units.js";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const targetShopId = String(process.env.MIGRATION_SHOP_ID || process.argv[2] || "").trim();
if (!targetShopId || targetShopId.includes("/")) {
  throw new Error("A destination shop ID is required: npm run import:data -- <SHOP_ID> [json-file]");
}
const source = resolve(process.cwd(), process.argv[3] || "../migration/data.json");
const payload = JSON.parse(await readFile(source, "utf8"));

if (payload.schemaVersion !== 1) throw new Error("Unsupported migration schema version");

function timestamp(value) {
  if (!value) return Timestamp.now();
  const raw = String(value);
  const taipeiValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}+08:00`
    : raw;
  const parsed = new Date(taipeiValue);
  return Number.isNaN(parsed.getTime()) ? Timestamp.now() : Timestamp.fromDate(parsed);
}

function customerId(phone, fallback) {
  return String(phone || "").replace(/\D/g, "") || fallback;
}

const writer = db.bulkWriter();
const tenant = db.collection("shops").doc(targetShopId);
if (!(await tenant.get()).exists) {
  throw new Error(`Shop ${targetShopId} does not exist. Create it in the POS before importing.`);
}
writer.onWriteError((error) => {
  console.error(`Write failed for ${error.documentRef.path}:`, error.message);
  return error.failedAttempts < 3;
});

for (const product of payload.products || []) {
  const { productId, ...data } = product;
  writer.set(tenant.collection("products").doc(productId), {
    ...data,
    createTime: timestamp(data.createTime),
    updateTime: Timestamp.now(),
  });
}

for (const customer of payload.customers || []) {
  writer.set(tenant.collection("customers").doc(customerId(customer.phone, customer.customerId)), {
    ...customer,
    createTime: timestamp(customer.createTime),
    lastOrderDate: timestamp(customer.lastOrderDate),
    updateTime: Timestamp.now(),
  });
}

for (const order of payload.orders || []) {
  const { orderId, ...data } = order;
  writer.set(tenant.collection("orders").doc(orderId), {
    ...data,
    orderUnitCount: calculateOrderUnitCount(data.items || []),
    createTime: timestamp(data.createTime),
    updateTime: Timestamp.now(),
  });
}

const weekday = Object.fromEntries((payload.weekdayCapacity || []).map((setting) => [
  String(setting.dayOfWeek),
  {
    dayOfWeek: setting.dayOfWeek,
    maxQuantity: setting.maxQuantity,
    enabled: setting.enabled,
  },
]));
writer.set(tenant.collection("settings").doc("capacity"), {
  weekday,
  usageVersion: 1,
  updateTime: Timestamp.now(),
}, { merge: true });

const usageByDate = {};
for (const order of payload.orders || []) {
  if (order.status === "取消" || !order.deliveryDate) continue;
  usageByDate[order.deliveryDate] = (usageByDate[order.deliveryDate] || 0)
    + calculateOrderUnitCount(order.items || []);
}
for (const [date, quantity] of Object.entries(usageByDate)) {
  writer.set(tenant.collection("capacityUsage").doc(date), {
    date,
    quantity,
    updateTime: Timestamp.now(),
  });
}

for (const override of payload.capacityOverrides || []) {
  writer.set(tenant.collection("capacityOverrides").doc(override.date), {
    ...override,
    createTime: Timestamp.now(),
    updateTime: Timestamp.now(),
  });
}

await writer.close();
console.log(
  `Imported data for shop ${targetShopId}: ${payload.products?.length || 0} products, ${payload.customers?.length || 0} customers, ` +
  `${payload.orders?.length || 0} orders, and ${payload.capacityOverrides?.length || 0} capacity overrides.`,
);
