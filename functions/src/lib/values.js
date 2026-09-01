import { Timestamp } from "firebase-admin/firestore";
import { assert } from "./errors.js";

export function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

export function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function integer(value, fallback = 0) {
  return Math.trunc(number(value, fallback));
}

export function boolean(value) {
  return value === true || value === "是" || value === "true" || value === 1;
}

export function dateString(value, fieldName = "日期") {
  const result = text(value);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(result), `${fieldName}格式必須為 YYYY-MM-DD`);
  return result;
}

export function serialize(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

export function taipeiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
