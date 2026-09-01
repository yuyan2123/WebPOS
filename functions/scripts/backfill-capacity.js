import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { calculateOrderUnitCount } from "../src/lib/order-units.js";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const shopId = String(process.env.SHOP_ID || process.argv[2] || "").trim();
if (!shopId || shopId.includes("/")) {
  throw new Error("A shop ID is required: npm run backfill:capacity -- <SHOP_ID>");
}

const shop = db.collection("shops").doc(shopId);
if (!(await shop.get()).exists) throw new Error(`Shop ${shopId} does not exist`);

const orders = await shop.collection("orders")
  .select("deliveryDate", "status", "orderUnitCount", "items")
  .get();
const usageByDate = new Map();
orders.docs.forEach((document) => {
  const order = document.data();
  if (!order.deliveryDate || order.status === "取消") return;
  const units = Number.isFinite(Number(order.orderUnitCount))
    ? Number(order.orderUnitCount)
    : calculateOrderUnitCount(order.items || []);
  usageByDate.set(order.deliveryDate, (usageByDate.get(order.deliveryDate) || 0) + units);
});

const existing = await shop.collection("capacityUsage").get();
const writer = db.bulkWriter();
existing.docs.forEach((document) => {
  if (!usageByDate.has(document.id)) writer.delete(document.ref);
});
const now = Timestamp.now();
usageByDate.forEach((quantity, date) => {
  writer.set(shop.collection("capacityUsage").doc(date), { date, quantity, updateTime: now });
});
await writer.close();
await shop.collection("settings").doc("capacity").set({ usageVersion: 1, updateTime: now }, { merge: true });

console.log(`Backfilled ${usageByDate.size} capacity usage days from ${orders.size} orders for shop ${shopId}.`);
