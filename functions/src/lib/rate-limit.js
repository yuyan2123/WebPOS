import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../firebase.js";

export const MAX_OWNED_SHOPS = 20;
export const MAX_SECURITY_DEVICES = 100;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const REPORTS = new Set(["generateDailyReport", "getDemandStats"]);
const SESSIONS = new Set(["initializeSession", "registerDeviceSession"]);

// Separate server-only metadata; existing users/shops/business documents and
// the callable request/response schema are unchanged. Rules deny client access.
export function securityLimitReference(uid) {
  return db.collection("posSecurityLimits").doc(uid);
}

export function nextRateLimits(previous, method, now) {
  const limits = [["rpc", 120, MINUTE]];
  if (SESSIONS.has(method)) limits.push(["session", 10, MINUTE]);
  if (REPORTS.has(method)) limits.push(["report", 10, MINUTE]);
  if (method === "createShop") limits.push(["createShop", 5, DAY]);
  const buckets = { ...previous };
  for (const [name, maximum, period] of limits) {
    const stored = buckets[name];
    const current = stored && Number.isFinite(stored.start) && now - stored.start < period
      ? stored : { start: now, count: 0 };
    if (!Number.isInteger(current.count) || current.count < 0 || current.count >= maximum) {
      throw new HttpsError("resource-exhausted", "操作次數已達上限，請稍後再試");
    }
    buckets[name] = { start: current.start, count: current.count + 1 };
  }
  return buckets;
}

export async function enforceRateLimit(user, method) {
  const reference = securityLimitReference(user.uid);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const now = Date.now();
    const buckets = nextRateLimits(snapshot.exists ? snapshot.data().buckets : {}, method, now);
    transaction.set(reference, { buckets, expiresAt: Timestamp.fromMillis(now + 2 * DAY) }, { merge: true });
  });
}
