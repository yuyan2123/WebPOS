import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../config.js";
import { assert } from "../lib/errors.js";
import { customerDocumentId, newId } from "../lib/ids.js";
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
  return {
    customerId: data.customerId || snapshot.id,
    name: data.name || "",
    phone: data.phone || "",
    address: data.address || "",
    createTime: data.createTime,
    lastOrderDate: data.lastOrderDate,
  };
}

export async function searchCustomers(user, keyword) {
  const normalized = text(keyword);
  if (normalized.length < 2) return [];
  const customers = tenantCollection(user, COLLECTIONS.customers);
  const end = `${normalized}\uf8ff`;
  const field = /\d/.test(normalized) ? "phone" : "name";
  const snapshot = await customers
    .where(field, ">=", normalized)
    .where(field, "<=", end)
    .limit(8)
    .get();
  return snapshot.docs
    .map(customerFromSnapshot)
    .map(({ name, phone, address }) => ({ name, phone, address }));
}

export async function getProductsByIds(user, productIds = []) {
  const ids = [...new Set(productIds.map((id) => text(id)).filter(Boolean))];
  if (ids.length === 0) return [];
  const references = ids.map((id) => tenantCollection(user, COLLECTIONS.products).doc(id));
  const snapshots = await tenantCollection(user, COLLECTIONS.products).firestore.getAll(...references);
  return snapshots.filter((snapshot) => snapshot.exists).map(productFromSnapshot);
}

export function customerReference(user, phone) {
  return tenantCollection(user, COLLECTIONS.customers).doc(customerDocumentId(phone));
}

export function customerRecord(customer, timestamp = Timestamp.now(), existing = null) {
  const phone = text(customer?.phone ?? customer?.customerPhone);
  assert(phone, "請輸入客戶電話");
  const name = text(customer?.name ?? customer?.customerName);
  assert(name, "請輸入客戶姓名");

  return {
    customerId: existing?.customerId || newId("C"),
    name,
    phone,
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
