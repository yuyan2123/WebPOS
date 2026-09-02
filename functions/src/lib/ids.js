import { createHash, randomBytes } from "node:crypto";

export function newId(prefix = "") {
  const time = Date.now().toString(36);
  const random = randomBytes(4).toString("hex");
  return `${prefix}${time}${random}`;
}

export function normalizeContactType(value) {
  return String(value || "").trim().toLowerCase() === "line" ? "line" : "phone";
}

export function normalizeContactValue(type, value) {
  const contactType = normalizeContactType(type);
  const raw = String(value || "").trim();
  return contactType === "phone" ? raw.replace(/\D/g, "") : raw.toLocaleLowerCase("en-US");
}

export function customerDocumentId(typeOrPhone, contactValue) {
  // One-argument calls are the legacy phone API. Keeping numeric phone IDs
  // prevents duplicate customer records while the contact schema is migrated.
  const legacyCall = contactValue === undefined;
  const type = legacyCall ? "phone" : normalizeContactType(typeOrPhone);
  const value = legacyCall ? typeOrPhone : contactValue;
  const normalized = normalizeContactValue(type, value);
  if (!normalized) return newId("C");
  if (type === "phone") return normalized;
  return `line_${createHash("sha256").update(normalized).digest("hex").slice(0, 32)}`;
}

export function orderDocumentId(requestId) {
  const normalized = String(requestId || "").trim();
  if (!normalized) return newId("O");
  return `O${createHash("sha256").update(normalized).digest("hex").slice(0, 32)}`;
}
