import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../firebase.js";
import { COLLECTIONS, ORDER_STATUSES } from "../config.js";
import { assert, notFound } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
import { boolean, dateString, integer, number, taipeiToday, text } from "../lib/values.js";
import { customerMergeRecord, customerReference } from "./catalog.js";
import { tenantCollection } from "../lib/tenant.js";
import { calculateOrderUnitCount } from "../lib/order-units.js";

const OPEN_ORDER_STATUSES = ["已確認", "已付訂金", "已付清", "已付款"];

function usageReference(user, date) {
  return tenantCollection(user, COLLECTIONS.capacityUsage).doc(dateString(date));
}

function countedForCapacity(status) {
  return text(status) !== "取消";
}

function storedOrderUnits(order) {
  return integer(order.orderUnitCount, calculateOrderUnitCount(order.items || []));
}

function adjustCapacityUsage(writer, user, date, delta, now) {
  if (!delta) return;
  writer.set(usageReference(user, date), {
    date: dateString(date),
    quantity: FieldValue.increment(delta),
    updateTime: now,
  }, { merge: true });
}

function normalizeItem(item = {}) {
  const quantity = integer(item.quantity, 0);
  const unitPrice = number(item.price ?? item.unitPrice, -1);
  assert(quantity > 0, "商品數量必須大於 0");
  assert(unitPrice >= 0, "商品價格不可小於 0");

  const isGiftBox = item.type === "giftbox" || boolean(item.isGiftBox);
  const detailId = text(item.detailId) || newId("D");

  if (isGiftBox) {
    const incomingDetails = item.giftBoxDetails || {};
    const products = item.products || incomingDetails.products || {};
    const size = integer(item.size ?? incomingDetails.size, 0);
    assert(size > 0, "禮盒規格不正確");
    assert(Object.keys(products).length > 0, "禮盒內容不可為空");
    return {
      detailId,
      productId: text(item.id || item.productId) || newId("GB"),
      productName: text(item.name || item.productName, `${size}粒裝禮盒`),
      quantity,
      unitPrice,
      subtotal: unitPrice * quantity,
      isGiftBox: true,
      giftBoxDetails: {
        size,
        products: Object.fromEntries(
          Object.entries(products).map(([id, qty]) => [id, integer(qty)]),
        ),
        notes: text(item.notes ?? incomingDetails.notes),
      },
      originalPrice: number(item.originalPrice, unitPrice),
      isSpecialPrice: boolean(item.isSpecialPrice),
    };
  }

  const productId = text(item.productId);
  const productName = text(item.productName);
  assert(productId && productName, "商品資料不完整");
  return {
    detailId,
    productId,
    productName,
    quantity,
    unitPrice,
    subtotal: unitPrice * quantity,
    isGiftBox: false,
    giftBoxDetails: null,
    originalPrice: number(item.originalPrice, unitPrice),
    isSpecialPrice: boolean(item.isSpecialPrice),
  };
}

function normalizeOrderInput(orderData = {}) {
  const customer = orderData.customer || {};
  const items = Array.isArray(orderData.items) ? orderData.items.map(normalizeItem) : [];
  assert(items.length > 0, "購物車不可為空");

  const shippingFee = Math.max(0, number(orderData.shippingFee));
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0) + shippingFee;

  return {
    customerName: text(customer.name),
    customerPhone: text(customer.phone),
    customerAddress: text(customer.address),
    deliveryType: text(customer.deliveryType, "外送"),
    deliveryDate: dateString(orderData.deliveryDate, "交貨日期"),
    shippingFee,
    shippingNotes: text(orderData.shippingNotes),
    recipientName: text(customer.recipientName),
    recipientPhone: text(customer.recipientPhone),
    isCompanyCustomer: boolean(orderData.isCompanyCustomer),
    items,
    totalAmount,
  };
}

function orderResult(snapshot) {
  const data = snapshot.data();
  return {
    orderId: snapshot.id,
    id: snapshot.id,
    ...data,
    items: data.items || [],
  };
}

export async function createOrder(user, orderData) {
  const input = normalizeOrderInput(orderData);
  assert(input.customerName, "請輸入客戶姓名");
  assert(input.customerPhone, "請輸入客戶電話");

  const orderId = newId("O");
  const orderRef = tenantCollection(user, COLLECTIONS.orders).doc(orderId);
  const customerRef = customerReference(user, input.customerPhone);
  const now = Timestamp.now();

  const batch = db.batch();
  batch.create(orderRef, {
    ...input,
    status: "已確認",
    orderUnitCount: calculateOrderUnitCount(input.items),
    createTime: now,
    updateTime: now,
    depositAmount: 0,
    remainingAmount: input.totalAmount,
    paymentNotes: "",
    notes: "",
  });
  batch.set(customerRef, customerMergeRecord(input, now), { merge: true });
  adjustCapacityUsage(batch, user, input.deliveryDate, calculateOrderUnitCount(input.items), now);
  await batch.commit();

  return { success: true, orderId };
}

export async function getOrderDetails(user, orderId) {
  const snapshot = await tenantCollection(user, COLLECTIONS.orders).doc(text(orderId)).get();
  if (!snapshot.exists) notFound("找不到訂單");
  return orderResult(snapshot);
}

export async function searchOrders(user, criteria = {}) {
  const name = text(criteria.name).toLowerCase();
  const phone = text(criteria.phone);
  const date = criteria.date ? dateString(criteria.date) : "";
  assert(name || phone || date, "請至少提供一個搜尋條件");
  let query = tenantCollection(user, COLLECTIONS.orders);
  if (date) {
    query = query.where("deliveryDate", "==", date).limit(200);
  } else if (phone) {
    query = query.where("customerPhone", ">=", phone).where("customerPhone", "<=", `${phone}\uf8ff`).limit(100);
  } else {
    query = query.where("customerName", ">=", text(criteria.name)).where("customerName", "<=", `${text(criteria.name)}\uf8ff`).limit(100);
  }
  const snapshot = await query.get();
  return snapshot.docs
    .map(orderResult)
    .filter((order) => !name || text(order.customerName).toLowerCase().includes(name))
    .filter((order) => !phone || text(order.customerPhone).includes(phone))
    .sort((a, b) => String(b.createTime?.toDate?.() || b.createTime).localeCompare(String(a.createTime?.toDate?.() || a.createTime)));
}

export async function searchOrderById(user, orderId) {
  const snapshot = await tenantCollection(user, COLLECTIONS.orders).doc(text(orderId)).get();
  if (!snapshot.exists) return [];
  return [orderResult(snapshot)];
}

export async function updateOrderStatus(user, orderId, newStatus) {
  const status = text(newStatus);
  assert(ORDER_STATUSES.has(status), "不支援的訂單狀態");
  const reference = tenantCollection(user, COLLECTIONS.orders).doc(text(orderId));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) notFound("找不到訂單");
    const order = snapshot.data();
    const wasCounted = countedForCapacity(order.status);
    const willCount = countedForCapacity(status);
    const now = Timestamp.now();
    transaction.update(reference, { status, updateTime: now });
    if (wasCounted !== willCount) {
      adjustCapacityUsage(transaction, user, order.deliveryDate, willCount ? storedOrderUnits(order) : -storedOrderUnits(order), now);
    }
    return { success: true, orderId: text(orderId), newStatus: status };
  });
}

export async function updateOrderDeposit(user, orderId, depositAmount, paymentNotes) {
  const reference = tenantCollection(user, COLLECTIONS.orders).doc(text(orderId));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) notFound("找不到訂單");
    const order = snapshot.data();
    const totalAmount = number(order.totalAmount);
    const paid = number(depositAmount, -1);
    assert(paid >= 0, "訂金不可小於 0");
    assert(paid <= totalAmount, "訂金不能超過總金額");
    const remainingAmount = totalAmount - paid;
    const newStatus = paid === 0 ? "已確認" : paid < totalAmount ? "已付訂金" : "已付清";
    const now = Timestamp.now();
    transaction.update(reference, {
      depositAmount: paid,
      remainingAmount,
      paymentNotes: text(paymentNotes),
      status: newStatus,
      updateTime: now,
    });
    if (countedForCapacity(order.status) !== countedForCapacity(newStatus)) {
      adjustCapacityUsage(
        transaction,
        user,
        order.deliveryDate,
        countedForCapacity(newStatus) ? storedOrderUnits(order) : -storedOrderUnits(order),
        now,
      );
    }
    return { success: true, orderId: text(orderId), depositAmount: paid, remainingAmount, newStatus };
  });
}

export async function updateOrder(user, orderData) {
  const orderId = text(orderData?.orderId);
  assert(orderId, "缺少訂單編號");
  const input = normalizeOrderInput(orderData);
  const reference = tenantCollection(user, COLLECTIONS.orders).doc(orderId);
  const customerRef = customerReference(user, input.customerPhone);

  const paymentChange = await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(reference);
    if (!orderSnapshot.exists) notFound("找不到要更新的訂單");
    const original = orderSnapshot.data();
    const originalTotal = number(original.totalAmount);
    const originalDeposit = number(original.depositAmount);
    let status = original.status;
    let depositAmount = originalDeposit;
    let remainingAmount = Math.max(0, input.totalAmount - originalDeposit);
    let paymentNotes = text(original.paymentNotes);

    if (["完成", "已付款", "已付清"].includes(status) && originalTotal !== input.totalAmount) {
      const difference = input.totalAmount - originalTotal;
      if (difference > 0) {
        status = "已確認";
        depositAmount = Math.min(originalDeposit || originalTotal, input.totalAmount);
        remainingAmount = input.totalAmount - depositAmount;
        paymentNotes += `${paymentNotes ? "; " : ""}編輯訂單後需補差額 NT$ ${remainingAmount}`;
      } else {
        remainingAmount = 0;
        paymentNotes += `${paymentNotes ? "; " : ""}編輯訂單後應退款 NT$ ${Math.abs(difference)}`;
      }
    }

    const now = Timestamp.now();
    transaction.update(reference, {
      ...input,
      status,
      orderUnitCount: calculateOrderUnitCount(input.items),
      depositAmount,
      remainingAmount,
      paymentNotes,
      notes: text(original.notes),
      createTime: original.createTime,
      updateTime: now,
    });
    transaction.set(customerRef, customerMergeRecord(input, now), { merge: true });
    const originalUnits = countedForCapacity(original.status) ? storedOrderUnits(original) : 0;
    const updatedUnits = countedForCapacity(status) ? calculateOrderUnitCount(input.items) : 0;
    if (original.deliveryDate === input.deliveryDate) {
      adjustCapacityUsage(transaction, user, input.deliveryDate, updatedUnits - originalUnits, now);
    } else {
      adjustCapacityUsage(transaction, user, original.deliveryDate, -originalUnits, now);
      adjustCapacityUsage(transaction, user, input.deliveryDate, updatedUnits, now);
    }

    return originalTotal === input.totalAmount ? null : {
      originalTotal,
      newTotal: input.totalAmount,
      originalStatus: original.status,
      newStatus: status,
      paymentNotes,
      remainingAmount,
    };
  });

  return { success: true, orderId, paymentChange };
}

export async function deleteOrder(user, orderId) {
  const reference = tenantCollection(user, COLLECTIONS.orders).doc(text(orderId));
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) notFound("找不到要刪除的訂單");
    const order = snapshot.data();
    transaction.delete(reference);
    if (countedForCapacity(order.status)) {
      adjustCapacityUsage(transaction, user, order.deliveryDate, -storedOrderUnits(order), Timestamp.now());
    }
  });
  return { success: true, message: `已成功刪除訂單 ${text(orderId)}` };
}

export async function searchOverdueOrders(user) {
  const snapshot = await tenantCollection(user, COLLECTIONS.orders)
    .where("deliveryDate", "<=", taipeiToday())
    .where("status", "in", OPEN_ORDER_STATUSES)
    .limit(250)
    .get();
  return snapshot.docs
    .map(orderResult)
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))
    .map((order) => ({
      id: order.orderId,
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryDate: order.deliveryDate,
      totalAmount: order.totalAmount,
      status: order.status,
    }));
}

export async function ordersInDateRange(user, startDate, endDate) {
  const snapshot = await tenantCollection(user, COLLECTIONS.orders)
    .where("deliveryDate", ">=", dateString(startDate))
    .where("deliveryDate", "<=", dateString(endDate))
    .limit(5000)
    .get();
  return snapshot.docs.map(orderResult).filter((order) => order.status !== "取消");
}

export async function capacityOrdersInDateRange(user, startDate, endDate) {
  const snapshot = await tenantCollection(user, COLLECTIONS.orders)
    .where("deliveryDate", ">=", dateString(startDate))
    .where("deliveryDate", "<=", dateString(endDate))
    .limit(5000)
    .select("deliveryDate", "orderUnitCount", "items", "status")
    .get();
  return snapshot.docs
    .map(orderResult)
    .filter((order) => order.status !== "取消");
}
