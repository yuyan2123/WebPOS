import { randomBytes } from "node:crypto";

export function newId(prefix = "") {
  const time = Date.now().toString(36);
  const random = randomBytes(4).toString("hex");
  return `${prefix}${time}${random}`;
}

export function customerDocumentId(phone) {
  const normalized = String(phone || "").replace(/\D/g, "");
  return normalized || newId("C");
}
