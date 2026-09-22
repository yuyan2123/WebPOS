import { createHmac } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../firebase.js";
import { assert } from "../lib/errors.js";
import { text } from "../lib/values.js";

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

  await reference.set({
    deviceHash,
    identifierType: "random-local-id-v1",
    lastSeenAt: now,
    seenCount: FieldValue.increment(1),
    lastIpHash: ipHash,
    userAgentHash,
    emailVerifiedAtLastSeen: true,
  }, { merge: true });

  return { recorded: true, deviceReference: deviceHash.slice(0, 12) };
}
