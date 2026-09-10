import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../config.js";
import { assert } from "../lib/errors.js";
import { customerDocumentId, newId, normalizeContactType, normalizeContactValue } from "../lib/ids.js";
import { boolean, number, text } from "../lib/values.js";
import { tenantCollection } from "../lib/tenant.js";

function productFromSnapshot(snapshot) {
  return { productId: snapshot.id, ...snapshot.data() };
}

function optionalPrice(value) {
  return value === "" || value === null || value === undefined ? "" : number(value);
}

export async function getProducts(user) {
  const snapshot = await tenantCollection(user, COLLECTIONS.products).orderBy("productName").get();
  return snapshot.docs.map(productFromSnapshot);
}

export async function saveProduct(user, productData = {}) {
  const suppliedProductId = text(productData.productId);
  const productId = suppliedProductId || newId("P");
  const productName = text(productData.productName);
  const price = number(productData.price, -1);
  assert(productName, "請輸入商品名稱");
  assert(price >= 0, "商品價格不可小於 0");
  assert(productName.length <= 200, "商品名稱過長");
  assert(price <= 10000000, "商品價格超過允許範圍");
  assert(text(productData.category).length <= 60, "商品分類過長");
  assert(text(productData.description).length <= 2000, "商品描述過長");
  assert(["啟用", "停用"].includes(text(productData.status, "啟用")), "商品狀態不正確");

  const reference = tenantCollection(user, COLLECTIONS.products).doc(productId);
  const now = Timestamp.now();
  const data = {
    productName,
    category: text(productData.category),
    price,
    status: text(productData.status, "啟用"),
    description: text(productData.description),
    giftBoxEnabled: boolean(productData.giftBoxEnabled) ? "是" : "否",
    specialPrice: optionalPrice(productData.specialPrice),
    companyPrice: optionalPrice(productData.companyPrice),
    updateTime: now,
  };
  if (suppliedProductId) {
    await reference.update(data);
  } else {
    data.createTime = now;
    await reference.create(data);
  }
  return { success: true, productId, product: { productId, ...data } };
}

export async function deleteProduct(user, productId) {
  const reference = tenantCollection(user, COLLECTIONS.products).doc(text(productId));
  await reference.delete();
  return { success: true };
}

export async function updateProductSpecialPrice(user, productId, specialPrice) {
  const reference = tenantCollection(user, COLLECTIONS.products).doc(text(productId));
  await reference.update({
    specialPrice: optionalPrice(specialPrice),
    updateTime: FieldValue.serverTimestamp(),
  });
  return { success: true };
}

function customerFromSnapshot(snapshot) {
  const data = snapshot.data();
  const contactType = normalizeContactType(data.contactType || (data.lineId ? "line" : "phone"));
  const contactValue = text(data.contactValue || (contactType === "line" ? data.lineId : data.phone));
  return {
    customerId: data.customerId || snapshot.id,
    name: data.name || "",
    phone: data.phone || "",
    lineId: data.lineId || "",
    contactType,
    contactValue,
    address: data.address || "",
    createTime: data.createTime,
    lastOrderDate: data.lastOrderDate,
  };
}

export async function searchCustomers(user, keyword) {
  const input = keyword && typeof keyword === "object" ? keyword : { keyword };
  const normalized = text(input.keyword);
  if (normalized.length < 2) return [];
  assert(normalized.length <= 128, "搜尋條件過長");
  const customers = tenantCollection(user, COLLECTIONS.customers);
  const mode = input.mode === "contact" ? "contact" : input.mode === "name" ? "name" : (/\d/.test(normalized) ? "contact" : "name");
  const contactType = normalizeContactType(input.contactType);
  const searchValue = mode === "contact" ? normalizeContactValue(contactType, normalized) : normalized;
  const field = mode === "contact" ? "contactNormalized" : "name";
  let snapshot = await customers.where(field, ">=", searchValue).where(field, "<=", `${searchValue}\uf8ff`).limit(8).get();
  // Phone-only legacy documents are supported until the backfill has run.
  if (snapshot.empty && mode === "contact" && contactType === "phone") {
    snapshot = await customers.where("phone", ">=", searchValue).where("phone", "<=", `${searchValue}\uf8ff`).limit(8).get();
  }
  return snapshot.docs
    .map(customerFromSnapshot)
    .map(({ name, phone, lineId, contactType: type, contactValue, address }) => ({ name, phone, lineId, contactType: type, contactValue, address }));
}

export async function getProductsByIds(user, productIds = []) {
  const ids = [...new Set(productIds.map((id) => text(id)).filter(Boolean))];
  if (ids.length === 0) return [];
  const references = ids.map((id) => tenantCollection(user, COLLECTIONS.products).doc(id));
  const snapshots = await tenantCollection(user, COLLECTIONS.products).firestore.getAll(...references);
  return snapshots.filter((snapshot) => snapshot.exists).map(productFromSnapshot);
}

export function customerReference(user, customerOrPhone) {
  const customer = customerOrPhone && typeof customerOrPhone === "object" ? customerOrPhone : { phone: customerOrPhone };
  const contactType = normalizeContactType(customer.contactType ?? customer.customerContactType ?? (customer.lineId || customer.customerLineId ? "line" : "phone"));
  const contactValue = text(customer.contactValue ?? customer.customerContactValue ?? (contactType === "line" ? (customer.lineId ?? customer.customerLineId) : (customer.phone ?? customer.customerPhone)));
  // LINE is an opt-out from entering a phone number, not a shared customer ID.
  // Include the customer name so separate LINE customers do not overwrite one another.
  const referenceValue = contactType === "line" && normalizeContactValue(contactType, contactValue) === "line"
    ? `${contactValue}:${text(customer.name || customer.customerName)}`
    : contactValue;
  return tenantCollection(user, COLLECTIONS.customers).doc(customerDocumentId(contactType, referenceValue));
}

export function customerRecord(customer, timestamp = Timestamp.now(), existing = null) {
  const contactType = normalizeContactType(customer?.contactType ?? customer?.customerContactType ?? (customer?.lineId || customer?.customerLineId ? "line" : "phone"));
  const contactValue = text(customer?.contactValue ?? customer?.customerContactValue ?? (contactType === "line" ? (customer?.lineId ?? customer?.customerLineId) : (customer?.phone ?? customer?.customerPhone)));
  const contactNormalized = normalizeContactValue(contactType, contactValue);
  const name = text(customer?.name ?? customer?.customerName);
  assert(name || contactNormalized, "客戶姓名或聯絡方式請至少填寫一項");
  assert(name.length <= 100 && contactValue.length <= 128, "客戶資料過長");
  assert(text(customer?.address ?? customer?.customerAddress).length <= 500, "客戶地址過長");

  return {
    customerId: existing?.customerId || newId("C"),
    name,
    contactType,
    contactValue,
    contactNormalized,
    phone: contactType === "phone" ? contactValue : "",
    lineId: contactType === "line" ? contactValue : "",
    address: text(customer?.address ?? customer?.customerAddress),
    createTime: existing?.createTime || timestamp,
    lastOrderDate: timestamp,
    updateTime: timestamp,
  };
}

export function customerMergeRecord(customer, timestamp = Timestamp.now()) {
  const record = customerRecord(customer, timestamp);
  delete record.customerId;
  delete record.createTime;
  return record;
}
