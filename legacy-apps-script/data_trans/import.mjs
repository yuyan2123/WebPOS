import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { calculateOrderUnitCount } from "../../functions/src/lib/order-units.js";

// Reuse the application's pinned Admin SDK and Rust calculation, without a second dependency tree.
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};

function id(value) {
  ensure(
    typeof value === "string" &&
      value.trim() &&
      !value.includes("/") &&
      ![".", ".."].includes(value) &&
      Buffer.byteLength(value) <= 1500,
    "Invalid document ID",
  );
  return value;
}

function numeric(value, field) {
  ensure(
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER,
    `Invalid number: ${field}`,
  );
}

function date(value) {
  ensure(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid delivery/override date",
  );
  return value;
}

function time(value) {
  ensure(
    typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
    "Timestamp must have a valid explicit timezone",
  );
  return Timestamp.fromDate(new Date(value));
}

export function prepare(payload) {
  ensure(
    payload.format === "gin-jia-pos-xlsx" && payload.schemaVersion === 2,
    "Use convert.py to produce a version 2 gin-jia-pos-xlsx file",
  );
  ensure(/^[a-f0-9]{64}$/.test(payload.source?.sha256 || ""), "Missing source SHA-256");
  const entries = [],
    seen = new Set();
  const add = (collection, documentId, data) => {
    const path = `${collection}/${id(documentId)}`;
    ensure(!seen.has(path), `Duplicate output document: ${path}`);
    seen.add(path);
    ensure(Buffer.byteLength(JSON.stringify(data)) < 900000, `Document too large: ${path}`);
    const recordHash = hash(data);
    entries.push({ path, collection, data, recordHash });
  };
  for (const [key, collection, idKey] of [
    ["products", "products", "productId"],
    ["customers", "customers", "documentId"],
    ["orders", "orders", "orderId"],
    ["capacityOverrides", "capacityOverrides", "date"],
  ]) {
    ensure(Array.isArray(payload[key]), `Missing array: ${key}`);
    for (const record of payload[key]) {
      const { [idKey]: documentId, ...data } = record;
      // Never accept caller-provided import markers or server timestamps.
      delete data._legacyImport;
      delete data.updateTime;
      if (key === "products") {
        ensure(typeof data.productName === "string" && data.productName.trim(), "Missing product name");
        ensure(["啟用", "停用"].includes(data.status), "Invalid product status");
        for (const field of ["price", "specialPrice", "companyPrice"]) {
          if (field === "price" || data[field] !== "") numeric(data[field], field);
        }
      }
      if (key === "orders") {
        ensure(
          ["已確認", "已付訂金", "已付清", "已付款", "完成", "取消"].includes(data.status),
          "Invalid order status",
        );
        date(data.deliveryDate);
        for (const field of ["totalAmount", "depositAmount", "remainingAmount", "shippingFee"])
          numeric(data[field], field);
        ensure(Array.isArray(data.items) && data.items.length > 0, "Order has no items");
        for (const item of data.items) {
          for (const field of ["quantity", "unitPrice", "subtotal", "originalPrice"])
            numeric(item[field], field);
          ensure(Number.isSafeInteger(item.quantity) && item.quantity > 0, "Invalid item quantity");
          ensure(typeof item.isGiftBox === "boolean", "Invalid gift-box flag");
          if (item.isGiftBox) {
            ensure(
              item.giftBoxDetails &&
                typeof item.giftBoxDetails.products === "object" &&
                !Array.isArray(item.giftBoxDetails.products) &&
                item.giftBoxDetails.products !== null,
              "Missing gift-box composition",
            );
            ensure(
              Number.isSafeInteger(item.giftBoxDetails.size) && item.giftBoxDetails.size > 0,
              "Invalid gift-box size",
            );
            for (const quantity of Object.values(item.giftBoxDetails.products))
              ensure(Number.isSafeInteger(quantity) && quantity >= 0, "Invalid gift-box component count");
          }
        }
        data.orderUnitCount = calculateOrderUnitCount(data.items);
      }
      if (key === "customers" || key === "orders") {
        const prefix = key === "orders" ? "customerContact" : "contact";
        const type = data[prefix + "Type"];
        ensure(["phone", "line"].includes(type), "Missing contact type");
        ensure(
          typeof data[prefix + "Value"] === "string" && typeof data[prefix + "Normalized"] === "string",
          "Missing normalized contact fields",
        );
        data.schemaVersion = 2;
      }
      if (key === "capacityOverrides") {
        date(documentId);
        data.date = documentId;
        if (data.maxQuantity !== "") numeric(data.maxQuantity, "maxQuantity");
        ensure(typeof data.enabled === "boolean", "Invalid capacity enabled flag");
      } else {
        data.createTime = time(data.createTime);
        if (key === "customers") data.lastOrderDate = time(data.lastOrderDate);
      }
      add(collection, documentId, data);
    }
  }
  ensure(Array.isArray(payload.weekdayCapacity), "Missing weekdayCapacity");
  const weekday = {};
  for (const setting of payload.weekdayCapacity) {
    ensure(
      Number.isInteger(setting.dayOfWeek) && setting.dayOfWeek >= 0 && setting.dayOfWeek <= 6,
      "Invalid weekday",
    );
    ensure(!Object.hasOwn(weekday, setting.dayOfWeek), "Duplicate weekday");
    ensure(typeof setting.enabled === "boolean", "Invalid weekday enabled flag");
    if (setting.maxQuantity !== "") numeric(setting.maxQuantity, "maxQuantity");
    weekday[setting.dayOfWeek] = setting;
  }
  // An empty sheet does not clear the destination's weekday configuration.
  if (Object.keys(weekday).length) add("settings", "capacity", { weekday, usageVersion: 1 });
  return entries;
}

function verifyOwner(shop, member, userShop, uid) {
  ensure(shop.exists && shop.data().ownerUid === uid, "Target shop is not owned by the specified user");
  ensure(
    member.exists && member.data().role === "owner" && userShop.exists && userShop.data().role === "owner",
    "Owner membership or user shop index is missing/inconsistent",
  );
}

function disposition(entry, snapshot, onExisting) {
  if (!snapshot.exists) return "create";
  const current = snapshot.data();
  if (current._legacyImport?.recordHash === entry.recordHash) return "alreadyImported";
  if (entry.collection === "settings") {
    if (!Object.keys(current.weekday || {}).length) return "configure";
    if (hash(current.weekday) === hash(entry.data.weekday)) return "unchanged";
  }
  return onExisting === "skip" ? "skip" : "conflict";
}

export async function importData({
  db,
  uid,
  shopId,
  payload,
  apply = false,
  onExisting = "error",
  onProgress = () => {},
}) {
  id(uid);
  id(shopId);
  ensure(["error", "skip"].includes(onExisting), "onExisting must be error or skip");
  const entries = prepare(payload);
  const shop = db.collection("shops").doc(shopId);
  const member = shop.collection("members").doc(uid);
  const userShop = db.collection("users").doc(uid).collection("shops").doc(shopId);
  const config = shop.collection("settings").doc("capacity");
  const [shopSnap, memberSnap, userShopSnap, configSnap, ordersSnap] = await Promise.all([
    shop.get(),
    member.get(),
    userShop.get(),
    config.get(),
    shop.collection("orders").limit(1).get(),
  ]);
  verifyOwner(shopSnap, memberSnap, userShopSnap, uid);
  ensure(
    configSnap.exists && configSnap.data().usageVersion === 1,
    "Destination must use current capacity counters; create the shop in POS or run backfill:capacity first",
  );
  const summary = {
    shopId,
    uid,
    shopName: shopSnap.data().name,
    mode: apply ? "apply" : "dry-run",
    destinationHasOrders: !ordersSnap.empty,
    source: payload.source,
    counts: {},
    conflicts: [],
    written: 0,
  };
  for (let offset = 0; offset < entries.length; offset += 100) {
    const chunk = entries.slice(offset, offset + 100);
    const snapshots = await db.getAll(...chunk.map((entry) => db.doc(`${shop.path}/${entry.path}`)));
    chunk.forEach((entry, i) => {
      const action = disposition(entry, snapshots[i], onExisting);
      summary.counts[action] = (summary.counts[action] || 0) + 1;
      if (action === "conflict") summary.conflicts.push(entry.path);
    });
  }
  if (!apply || summary.conflicts.length) return summary;
  // Small transactions support any workbook size and are resumable. An order and its
  // capacity increment commit together; concurrent POS orders cannot lose their counts.
  for (const entry of entries) {
    const reference = db.doc(`${shop.path}/${entry.path}`);
    try {
      const written = await db.runTransaction(async (tx) => {
        const [target, owner, membership, index, capacity] = await tx.getAll(
          reference,
          shop,
          member,
          userShop,
          config,
        );
        verifyOwner(owner, membership, index, uid);
        ensure(
          capacity.exists && capacity.data().usageVersion === 1,
          "Capacity configuration changed; stop and retry",
        );
        const action = disposition(entry, target, onExisting);
        ensure(action !== "conflict", `Destination changed during import: ${entry.path}`);
        if (!["create", "configure"].includes(action)) return false;
        const now = Timestamp.now();
        const data = {
          ...entry.data,
          updateTime: now,
          _legacyImport: {
            sourceHash: payload.source.sha256,
            recordHash: entry.recordHash,
            importedBy: uid,
            importedAt: now,
          },
        };
        if (action === "configure") tx.set(reference, data, { merge: true });
        else tx.create(reference, data);
        if (entry.collection === "orders" && data.status !== "取消" && data.orderUnitCount) {
          tx.set(
            shop.collection("capacityUsage").doc(data.deliveryDate),
            {
              date: data.deliveryDate,
              quantity: FieldValue.increment(data.orderUnitCount),
              updateTime: now,
            },
            { merge: true },
          );
        }
        return true;
      });
      if (written) summary.written++;
      onProgress(summary.written);
    } catch (error) {
      throw new Error(
        `Import stopped after ${summary.written} committed documents at ${entry.path}. ` +
          `Completed records are retained; rerun the same file to resume. ${error.message}`,
        { cause: error },
      );
    }
  }
  return summary;
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: "string" },
      database: { type: "string", default: "(default)" },
      uid: { type: "string" },
      email: { type: "string" },
      shop: { type: "string" },
      file: { type: "string" },
      apply: { type: "boolean", default: false },
      "list-shops": { type: "boolean", default: false },
      "on-existing": { type: "string", default: "error" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "node import.mjs --project PROJECT (--uid UID | --email EMAIL) --list-shops\n" +
        "node import.mjs --project PROJECT (--uid UID | --email EMAIL) --shop SHOP --file FILE.json " +
        '[--database "(default)"] [--on-existing error|skip] [--apply]\nWithout --apply, only validates and reports.',
    );
    return;
  }
  ensure(
    values.project && Boolean(values.uid) !== Boolean(values.email),
    "Explicit --project and exactly one of --uid/--email are required",
  );
  ensure(["error", "skip"].includes(values["on-existing"]), "Invalid --on-existing");
  ensure(!values.apply || !values["list-shops"], "--list-shops cannot be combined with --apply");
  let payload;
  if (!values["list-shops"]) {
    ensure(values.shop && values.file, "--shop and --file are required");
    id(values.shop);
    payload = JSON.parse(await readFile(values.file, "utf8"));
    prepare(payload); // Validate the entire local file before making any remote request.
  }
  const app = initializeApp({ projectId: values.project }, `legacy-import-${Date.now()}`);
  try {
    const db = getFirestore(app, values.database);
    const auth = getAuth(app);
    const account = values.uid ? await auth.getUser(values.uid) : await auth.getUserByEmail(values.email);
    ensure(!account.disabled, "Target user is disabled");
    if (values["list-shops"]) {
      const shops = await db.collection("users").doc(account.uid).collection("shops").get();
      console.log(
        JSON.stringify(
          {
            project: values.project,
            database: values.database,
            uid: account.uid,
            shops: shops.docs.map((doc) => ({
              shopId: doc.id,
              name: doc.data().name,
              role: doc.data().role,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    const result = await importData({
      db,
      uid: account.uid,
      shopId: values.shop,
      payload,
      apply: values.apply,
      onExisting: values["on-existing"],
    });
    console.log(JSON.stringify({ project: values.project, database: values.database, ...result }, null, 2));
    if (result.conflicts.length) process.exitCode = 2;
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
