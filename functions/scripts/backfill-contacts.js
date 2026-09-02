import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { normalizeContactValue } from "../src/lib/ids.js";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const applyChanges = process.argv.includes("--apply");
const requestedShopId = String(process.env.SHOP_ID || "").trim();

const shops = requestedShopId
  ? [await db.collection("shops").doc(requestedShopId).get()]
  : (await db.collection("shops").get()).docs;
const existingShops = shops.filter((shop) => shop.exists);
if (existingShops.length === 0) throw new Error("No matching shops found.");

let customerCount = 0;
let orderCount = 0;
const writer = applyChanges ? db.bulkWriter() : null;
const now = Timestamp.now();

for (const shop of existingShops) {
  const [customers, orders] = await Promise.all([
    shop.ref.collection("customers").get(),
    shop.ref.collection("orders").get(),
  ]);
  for (const document of customers.docs) {
    const data = document.data();
    if (data.contactType && data.contactNormalized) continue;
    const contactType = data.lineId ? "line" : "phone";
    const contactValue = String(data.lineId || data.phone || "").trim();
    if (!contactValue) continue;
    customerCount += 1;
    writer?.set(document.ref, {
      contactType,
      contactValue,
      contactNormalized: normalizeContactValue(contactType, contactValue),
      phone: contactType === "phone" ? contactValue : "",
      lineId: contactType === "line" ? contactValue : "",
      schemaVersion: 2,
      updateTime: now,
    }, { merge: true });
  }
  for (const document of orders.docs) {
    const data = document.data();
    if (data.customerContactType && data.customerContactNormalized) continue;
    const contactType = data.customerLineId ? "line" : "phone";
    const contactValue = String(data.customerLineId || data.customerPhone || "").trim();
    if (!contactValue) continue;
    orderCount += 1;
    writer?.set(document.ref, {
      customerContactType: contactType,
      customerContactValue: contactValue,
      customerContactNormalized: normalizeContactValue(contactType, contactValue),
      customerPhone: contactType === "phone" ? contactValue : "",
      customerLineId: contactType === "line" ? contactValue : "",
      schemaVersion: 2,
      updateTime: now,
    }, { merge: true });
  }
}

if (writer) await writer.close();
console.log(`${applyChanges ? "Updated" : "Dry run:"} ${customerCount} customers and ${orderCount} orders across ${existingShops.length} shops.`);
if (!applyChanges) console.log("Run again with --apply after reviewing the counts.");
