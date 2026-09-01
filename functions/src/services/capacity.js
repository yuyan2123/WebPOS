import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../config.js";
import { assert } from "../lib/errors.js";
import { boolean, dateString, integer, text } from "../lib/values.js";
import { capacityOrdersInDateRange } from "./orders.js";
import { tenantCollection } from "../lib/tenant.js";
import { calculateOrderUnitCount as countOrderUnits } from "../lib/order-units.js";

export function calculateOrderUnitCount(items = []) {
  return countOrderUnits(items);
}

function capacityConfigReference(user) {
  return user.shopRef.collection("settings").doc("capacity");
}

export async function getCapacitySettings(user, startDate = "", endDate = "") {
  let overrideQuery = tenantCollection(user, COLLECTIONS.capacityOverrides).orderBy("date");
  if (startDate) overrideQuery = overrideQuery.where("date", ">=", dateString(startDate));
  if (endDate) overrideQuery = overrideQuery.where("date", "<=", dateString(endDate));
  const [configSnapshot, overrideSnapshot] = await Promise.all([
    capacityConfigReference(user).get(),
    overrideQuery.get(),
  ]);
  const weekday = {};
  let usageVersion = 0;
  if (configSnapshot.exists) {
    usageVersion = integer(configSnapshot.data().usageVersion);
    Object.entries(configSnapshot.data().weekday || {}).forEach(([key, data]) => {
      weekday[key] = {
        id: key,
        dayOfWeek: integer(data.dayOfWeek, integer(key)),
        maxQuantity: data.maxQuantity ?? "",
        enabled: boolean(data.enabled),
      };
    });
  } else {
    const legacySnapshot = await tenantCollection(user, COLLECTIONS.weekdayCapacity).get();
    legacySnapshot.docs.forEach((snapshot) => {
      const data = snapshot.data();
      weekday[String(data.dayOfWeek)] = {
        id: snapshot.id,
        dayOfWeek: integer(data.dayOfWeek),
        maxQuantity: data.maxQuantity ?? "",
        enabled: boolean(data.enabled),
      };
    });
  }
  const dateOverrides = overrideSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    ...snapshot.data(),
  }));
  return { weekday, dateOverrides, usageVersion };
}

export async function saveWeekdayCapacity(user, settings = []) {
  assert(Array.isArray(settings), "星期產能設定格式不正確");
  const now = Timestamp.now();
  const weekday = {};
  for (const setting of settings) {
    const dayOfWeek = integer(setting.dayOfWeek, -1);
    assert(dayOfWeek >= 0 && dayOfWeek <= 6, "星期設定不正確");
    const maxQuantity = setting.maxQuantity === "" ? "" : Math.max(0, integer(setting.maxQuantity));
    weekday[String(dayOfWeek)] = {
      dayOfWeek,
      maxQuantity,
      enabled: boolean(setting.enabled),
    };
  }
  await capacityConfigReference(user).set({ weekday, updateTime: now }, { merge: true });
  return { success: true };
}

export async function getCapacityRangeData(user, startDate, endDate, settings) {
  if (integer(settings?.usageVersion) >= 1) {
    const snapshot = await tenantCollection(user, COLLECTIONS.capacityUsage)
      .where("date", ">=", dateString(startDate))
      .where("date", "<=", dateString(endDate))
      .select("date", "quantity")
      .get();
    return snapshot.docs.map((document) => ({
      date: document.data().date || document.id,
      quantity: Math.max(0, integer(document.data().quantity)),
    }));
  }
  const orders = await capacityOrdersInDateRange(user, startDate, endDate);
  return orders.map((order) => ({
    date: order.deliveryDate,
    quantity: integer(order.orderUnitCount, calculateOrderUnitCount(order.items)),
  }));
}

export async function saveDateOverrideCapacity(user, setting = {}) {
  const date = dateString(setting.date);
  const reference = tenantCollection(user, COLLECTIONS.capacityOverrides).doc(date);
  const now = Timestamp.now();
  await reference.set({
    date,
    maxQuantity: setting.maxQuantity === "" ? "" : Math.max(0, integer(setting.maxQuantity)),
    enabled: boolean(setting.enabled),
    updateTime: now,
  }, { merge: true });
  return { success: true, id: date };
}

export async function saveDateOverrideCapacityBatch(user, settings = []) {
  assert(Array.isArray(settings), "日期產能設定格式不正確");
  const batch = tenantCollection(user, COLLECTIONS.capacityOverrides).firestore.batch();
  const now = Timestamp.now();
  settings.forEach((setting) => {
    const date = dateString(setting.date);
    batch.set(tenantCollection(user, COLLECTIONS.capacityOverrides).doc(date), {
      date,
      maxQuantity: setting.maxQuantity === "" ? "" : Math.max(0, integer(setting.maxQuantity)),
      enabled: boolean(setting.enabled),
      updateTime: now,
    }, { merge: true });
  });
  await batch.commit();
  return { success: true };
}

export async function deleteDateOverrideCapacity(user, id) {
  await tenantCollection(user, COLLECTIONS.capacityOverrides).doc(text(id)).delete();
  return { success: true };
}

function weekdayForDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function capacityLimit(date, settings) {
  const override = settings.dateOverrides.find((item) => item.date === date && item.enabled);
  const setting = override || settings.weekday[String(weekdayForDate(date))];
  if (!setting?.enabled) return { limit: 0, source: "none", hasLimit: false };
  const limit = integer(setting.maxQuantity);
  return {
    limit,
    source: override ? "dateOverride" : "weeklyDefault",
    hasLimit: limit > 0,
  };
}

function statusFor(limitInfo, currentQuantity, newOrderQuantity = 0) {
  const projectedQuantity = currentQuantity + newOrderQuantity;
  if (!limitInfo.hasLimit) {
    return {
      limit: 0,
      currentQuantity,
      newOrderQuantity,
      projectedQuantity,
      exceededQuantity: 0,
      usageRate: 0,
      status: "unlimited",
      source: limitInfo.source,
      hasLimit: false,
    };
  }
  const usageRate = Math.round((currentQuantity / limitInfo.limit) * 100);
  let status = "available";
  if (currentQuantity >= limitInfo.limit) status = "full";
  else if (usageRate >= 90) status = "nearFull";
  else if (usageRate >= 70) status = "warning";
  const exceededQuantity = Math.max(0, projectedQuantity - limitInfo.limit);
  if (exceededQuantity > 0) status = "exceeded";
  return {
    limit: limitInfo.limit,
    currentQuantity,
    newOrderQuantity,
    projectedQuantity,
    exceededQuantity,
    usageRate,
    status,
    source: limitInfo.source,
    hasLimit: true,
  };
}

export async function getDateCapacityStatus(user, date, excludeOrderId = null, newOrderItems = []) {
  const normalizedDate = dateString(date);
  const settings = await getCapacitySettings(user, normalizedDate, normalizedDate);
  const [usage, excludedOrder] = await Promise.all([
    getCapacityRangeData(user, normalizedDate, normalizedDate, settings),
    excludeOrderId
      ? tenantCollection(user, COLLECTIONS.orders).doc(text(excludeOrderId)).get()
      : Promise.resolve(null),
  ]);
  let currentQuantity = usage.reduce((sum, item) => sum + integer(item.quantity), 0);
  if (excludedOrder?.exists) {
    const order = excludedOrder.data();
    if (order.deliveryDate === normalizedDate && order.status !== "取消") {
      currentQuantity = Math.max(0, currentQuantity - integer(order.orderUnitCount, calculateOrderUnitCount(order.items)));
    }
  }
  return {
    date: normalizedDate,
    ...statusFor(capacityLimit(normalizedDate, settings), currentQuantity, calculateOrderUnitCount(newOrderItems)),
  };
}

export async function getMonthCapacityStatus(user, yearValue, monthValue) {
  const year = integer(yearValue);
  const month = integer(monthValue);
  assert(year >= 2000 && month >= 1 && month <= 12, "月份格式不正確");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${prefix}-01`;
  const endDate = `${prefix}-${String(daysInMonth).padStart(2, "0")}`;
  const settings = await getCapacitySettings(user, startDate, endDate);
  const usage = await getCapacityRangeData(user, startDate, endDate, settings);
  return buildMonthCapacityStatus(settings, usage, year, month);
}

export function buildMonthCapacityStatus(settings, usage, year, month) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const quantities = {};
  usage.forEach((item) => {
    quantities[item.date] = (quantities[item.date] || 0) + integer(item.quantity);
  });
  const result = {};
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${prefix}-${String(day).padStart(2, "0")}`;
    result[date] = statusFor(capacityLimit(date, settings), quantities[date] || 0);
  }
  return result;
}

export async function checkCapacityBeforeOrder(user, date, items, excludeOrderId, confirmed) {
  const capacityStatus = await getDateCapacityStatus(user, date, excludeOrderId, items);
  if (capacityStatus.status === "unlimited") return { allowed: true, capacityStatus };
  if (capacityStatus.exceededQuantity > 0 && !confirmed) {
    return { allowed: false, needConfirm: true, capacityStatus };
  }
  return { allowed: true, capacityStatus };
}
