import { createHmac } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../firebase.js";
import { assert } from "../lib/errors.js";
import { text } from "../lib/values.js";
import { MAX_SECURITY_DEVICES, securityLimitReference } from "../lib/rate-limit.js";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{16,128}$/;

export function securityHash(secret, value) {
  assert(text(secret).length >= 32, "SECURITY_HASH_SALT 尚未設定或長度不足");
  return createHmac("sha256", secret).update(String(value)).digest("hex");
}

export function extractClientIp(rawRequest) {
  const forwarded = rawRequest?.headers?.["x-forwarded-for"];
  const firstForwarded = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim();
  return firstForwarded || rawRequest?.ip || rawRequest?.socket?.remoteAddress || "";
}

export async function recordDeviceSession(user, request, secret, input = {}) {
  const deviceId = text(input.deviceId);
  const userAgent = text(input.userAgent).slice(0, 512);
  assert(DEVICE_ID_PATTERN.test(deviceId), "瀏覽器裝置識別碼不正確");

  const deviceHash = securityHash(secret, `device:${deviceId}`);
  const ip = extractClientIp(request.rawRequest);
  const ipHash = ip ? securityHash(secret, `ip:${ip}`) : null;
  const userAgentHash = userAgent ? securityHash(secret, `ua:${userAgent}`) : null;
  const reference = db.collection("users").doc(user.uid).collection("securityDevices").doc(deviceHash);
  const now = Timestamp.now();

  const data = {
    deviceHash,
    identifierType: "random-local-id-v1",
    lastSeenAt: now,
    seenCount: FieldValue.increment(1),
    lastIpHash: ipHash,
    userAgentHash,
    emailVerifiedAtLastSeen: true,
  };
  await db.runTransaction(async (transaction) => {
    const limitRef = securityLimitReference(user.uid);
    const [existing, limitSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(limitRef),
    ]);
    if (!existing.exists) {
      const oldest = await transaction.get(reference.parent.orderBy("lastSeenAt").limit(MAX_SECURITY_DEVICES + 1));
      // Retain the latest 100 devices; pre-existing larger histories shrink on
      // subsequent registrations. Existing hashes and record fields stay intact.
      const removeCount = Math.max(0, oldest.size - MAX_SECURITY_DEVICES + 1);
      for (const device of oldest.docs.slice(0, removeCount)) transaction.delete(device.ref);
    }
    transaction.set(limitRef, { deviceRevision: (limitSnapshot.data()?.deviceRevision || 0) + 1 }, { merge: true });
    transaction.set(reference, data, { merge: true });
  });

  return { recorded: true, deviceReference: deviceHash.slice(0, 12) };
}
