import { HttpsError } from "firebase-functions/v2/https";

export function invalid(message) {
  throw new HttpsError("invalid-argument", message);
}

export function notFound(message) {
  throw new HttpsError("not-found", message);
}

export function forbidden(message) {
  throw new HttpsError("permission-denied", message);
}

export function assert(condition, message) {
  if (!condition) invalid(message);
}
