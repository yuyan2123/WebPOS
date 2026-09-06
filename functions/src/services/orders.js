import { normalizeItem } from "../lib/order-item.js";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../firebase.js";
import { COLLECTIONS, ORDER_STATUSES } from "../config.js";
import { assert, notFound } from "../lib/errors.js";
import { orderDocumentId } from "../lib/ids.js";
import { boolean, dateString, integer, number, taipeiToday, text } from "../lib/values.js";
import { customerMergeRecord, customerReference } from "./catalog.js";
import { tenantCollection } from "../lib/tenant.js";
import { calculateOrderUnitCount } from "../lib/order-units.js";
import { normalizeContactType, normalizeContactValue } from "../lib/ids.js";
import { domain } from "../lib/domain.js";

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
  writer.set(
    usageReference(user, date),
    {
      date: dateString(date),
      quantity: FieldValue.increment(delta),
      updateTime: now,
    },
    { merge: true },
  );
}

function normalizeOrderInput(orderData = {}) {
  const customer = orderData.customer || {};
  const customerContactType = normalizeContactType(
    customer.contactType || (customer.lineId ? "line" : "phone"),
  );
  const customerContactValue = text(
    customer.contactValue || (customerContactType === "line" ? customer.lineId : customer.phone),
  );
  const customerContactNormalized = normalizeContactValue(customerContactType, customerContactValue);
  const items = Array.isArray(orderData.items) ? orderData.items.map(normalizeItem) : [];
  assert(items.length > 0 && items.length <= 200, "購物車品項數量不正確");

  const shippingFee = Math.max(0, number(orderData.shippingFee));
  assert(shippingFee <= 10000000, "運費超過允許範圍");
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0) + shippingFee;

  const result = {
    clientRequestId: text(orderData.clientRequestId),
    customerName: text(customer.name),
    customerContactType,
    customerContactValue,
    customerContactNormalized,
    customerPhone: customerContactType === "phone" ? customerContactValue : "",
    customerLineId: customerContactType === "line" ? customerContactValue : "",
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
  assert(result.customerName.length <= 100, "客戶姓名過長");
  assert(result.customerContactValue.length <= 128, "客戶聯絡資料過長");
  assert(result.customerAddress.length <= 500, "客戶地址過長");
  assert(result.recipientName.length <= 100 && result.recipientPhone.length <= 50, "收件人資料過長");
  assert(result.shippingNotes.length <= 1000, "運送備註過長");
  assert(result.clientRequestId.length <= 128 && !result.clientRequestId.includes("/"), "訂單請求編號不正確");
  return result;
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
  assert(
    input.customerContactNormalized,
    input.customerContactType === "line" ? "請輸入 LINE ID" : "請輸入客戶電話",
  );

  const orderId = orderDocumentId(input.clientRequestId);
  const orderRef = tenantCollection(user, COLLECTIONS.orders).doc(orderId);
  const customerRef = customerReference(user, input);
  const now = Timestamp.now();

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(orderRef);
    if (existing.exists) return { success: true, orderId, idempotentReplay: true };
    transaction.create(orderRef, {
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
    transaction.set(customerRef, customerMergeRecord(input, now), { merge: true });
    adjustCapacityUsage(transaction, user, input.deliveryDate, calculateOrderUnitCount(input.items), now);
    return { success: true, orderId, idempotentReplay: false };
  });
}

export async function getOrderDetails(user, orderId) {
  const snapshot = await tenantCollection(user, COLLECTIONS.orders).doc(text(orderId)).get();
  if (!snapshot.exists) notFound("找不到訂單");
  return orderResult(snapshot);
}

export async function searchOrders(user, criteria = {}) {
  const name = text(criteria.name).toLowerCase();
  const contactType = normalizeContactType(criteria.contactType);
  const contact = normalizeContactValue(contactType, criteria.contact || criteria.phone);
  const date = criteria.date ? dateString(criteria.date) : "";
  const status = text(criteria.status);
  const pageSize = Math.min(50, Math.max(10, integer(criteria.pageSize, 30)));
  const cursor = criteria.cursor && typeof criteria.cursor === "object" ? criteria.cursor : null;
  assert(name || contact || date || status, "請至少提供一個搜尋條件");
  assert(name.length <= 100 && contact.length <= 128, "搜尋條件過長");
  let query = tenantCollection(user, COLLECTIONS.orders);
  if (status) {
    assert(ORDER_STATUSES.has(status), "訂單狀態不正確");
    query = query.where("status", "==", status);
  }
  let orderField;
  let orderDirection = "asc";
  let orderValue;
  if (contact) {
    orderField = cursor?.field === "customerPhone" ? "customerPhone" : "customerContactNormalized";
    orderValue = contact;
    query = query.where(orderField, ">=", contact).where(orderField, "<=", `${contact}\uf8ff`);
  } else if (name) {
    orderField = "customerName";
    orderValue = text(criteria.name);
    query = query.where(orderField, ">=", orderValue).where(orderField, "<=", `${orderValue}\uf8ff`);
  } else if (date) {
    orderField = "createTime";
    orderDirection = "desc";
    query = query.where("deliveryDate", "==", date);
  } else {
    orderField = "createTime";
    orderDirection = "desc";
  }
  query = query.orderBy(orderField, orderDirection).orderBy(FieldPath.documentId(), orderDirection);
  if (cursor?.value !== undefined && cursor?.id) {
    const cursorValue =
      orderField === "createTime" && typeof cursor.value === "string"
        ? Timestamp.fromDate(new Date(cursor.value))
        : cursor.value;
    query = query.startAfter(cursorValue, cursor.id);
  }
  let snapshot = await query.limit(pageSize + 1).get();
  // During migration, fall back to the indexed legacy phone field only when the
  // new contact field produced no first-page result.
  if (snapshot.empty && contact && contactType === "phone" && !cursor) {
    orderField = "customerPhone";
    query = tenantCollection(user, COLLECTIONS.orders);
    if (status) query = query.where("status", "==", status);
    query = query
      .where(orderField, ">=", contact)
      .where(orderField, "<=", `${contact}\uf8ff`)
      .orderBy(orderField)
      .orderBy(FieldPath.documentId())
      .limit(pageSize + 1);
    snapshot = await query.get();
  }
  const hasMore = snapshot.docs.length > pageSize;
  const pageDocs = snapshot.docs.slice(0, pageSize);
  const orders = pageDocs
    .map(orderResult)
    .filter((order) => !date || order.deliveryDate === date)
    .filter((order) => !name || text(order.customerName).toLowerCase().includes(name))
    .filter(
      (order) =>
        !contact ||
        normalizeContactValue(
          order.customerContactType,
          order.customerContactValue || order.customerPhone,
        ).includes(contact),
    );
  const last = pageDocs.at(-1);
  const result = {
    orders,
    pagination: {
      hasMore,
      nextCursor: hasMore && last ? { value: last.get(orderField), id: last.id, field: orderField } : null,
    },
  };
  return criteria.paginated ? result : orders;
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
      adjustCapacityUsage(
        transaction,
        user,
        order.deliveryDate,
        willCount ? storedOrderUnits(order) : -storedOrderUnits(order),
        now,
      );
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
    const { remainingAmount, newStatus } = domain("payment", { total: totalAmount, paid });
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
  const customerRef = customerReference(user, input);

  const paymentChange = await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(reference);
    if (!orderSnapshot.exists) notFound("找不到要更新的訂單");
    const original = orderSnapshot.data();
    const originalTotal = number(original.totalAmount);
    const originalDeposit = number(original.depositAmount);
    const { status, depositAmount, remainingAmount, paymentNotes } = domain("revisePayment", {
      originalTotal,
      total: input.totalAmount,
      deposit: originalDeposit,
      status: original.status,
      notes: text(original.paymentNotes),
    });

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

    return originalTotal === input.totalAmount
      ? null
      : {
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
      customerLineId: order.customerLineId || "",
      customerContactType: order.customerContactType || (order.customerLineId ? "line" : "phone"),
      customerContactValue: order.customerContactValue || order.customerLineId || order.customerPhone,
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
  assert(snapshot.docs.length < 5000, "日期區間內的訂單達到查詢上限，請縮小日期區間");
  return snapshot.docs.map(orderResult).filter((order) => order.status !== "取消");
}

export async function capacityOrdersInDateRange(user, startDate, endDate) {
  const snapshot = await tenantCollection(user, COLLECTIONS.orders)
    .where("deliveryDate", ">=", dateString(startDate))
    .where("deliveryDate", "<=", dateString(endDate))
    .limit(5000)
    .select("deliveryDate", "orderUnitCount", "items", "status")
    .get();
  return snapshot.docs.map(orderResult).filter((order) => order.status !== "取消");
}
