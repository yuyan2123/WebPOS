import test from "node:test";
import assert from "node:assert/strict";
import { getAuth } from "firebase-admin/auth";
import { db } from "../src/firebase.js";
import { requireCurrentSession } from "../src/lib/auth.js";
import { nextRateLimits, enforceRateLimit, MAX_SECURITY_DEVICES } from "../src/lib/rate-limit.js";
import { executeRpc } from "../src/index.js";
import { recordDeviceSession, securityHash } from "../src/services/security.js";

const authTime = 1789000000;
const user = { uid: "member", email: "member@example.test", authTime };
const activeAccount = () => ({
  email: user.email, emailVerified: true, disabled: false,
  tokensValidAfterTime: new Date(authTime * 1000).toISOString(),
});

test("live authentication rejects disabled/deleted/revoked/unverified and changed-email sessions", async (t) => {
  let account = activeAccount();
  t.mock.method(getAuth(), "getUser", async () => {
    if (!account) throw Object.assign(new Error("deleted"), { code: "auth/user-not-found" });
    return account;
  });
  await requireCurrentSession(user);
  for (const invalid of [
    { ...activeAccount(), disabled: true },
    { ...activeAccount(), emailVerified: false },
    { ...activeAccount(), email: "changed@example.test" },
    { ...activeAccount(), tokensValidAfterTime: new Date((authTime + 1) * 1000).toISOString() },
    null,
  ]) {
    account = invalid;
    await assert.rejects(requireCurrentSession(user), (error) => error.code === "unauthenticated");
  }
  account = activeAccount();
  await assert.rejects(requireCurrentSession({ ...user, authTime: undefined }), (error) => error.code === "unauthenticated");
});

test("revoked ordinary members are rejected before any Firestore access or mutation", async (t) => {
  t.mock.method(getAuth(), "getUser", async () => ({ ...activeAccount(), disabled: true }));
  t.mock.method(db, "runTransaction", () => assert.fail("Revoked session reached Firestore"));
  const prototype = Object.getPrototypeOf(db.doc("shops/test"));
  t.mock.method(prototype, "get", () => assert.fail("Revoked session read a document"));
  t.mock.method(prototype, "update", () => assert.fail("Revoked session updated a document"));
  for (const method of ["initializeSession", "createShop", "registerDeviceSession", "getProducts", "updateProductSpecialPrice"]) {
    await assert.rejects(executeRpc({
      auth: { uid: user.uid, token: { email: user.email, email_verified: true, auth_time: authTime } },
      data: { method, shopId: "test", args: [] },
    }), (error) => error.code === "unauthenticated");
  }
});

test("RPC/session/report/shop limits share a budget and reset only after their own period", () => {
  const now = 1_000_000;
  for (const [method, maximum, period] of [
    ["getProducts", 120, 60_000], ["initializeSession", 10, 60_000],
    ["generateDailyReport", 10, 60_000], ["createShop", 5, 86_400_000],
  ]) {
    let buckets = {};
    for (let i = 0; i < maximum; i++) buckets = nextRateLimits(buckets, method, now);
    const before = structuredClone(buckets);
    assert.throws(() => nextRateLimits(buckets, method, now + period - 1), (error) => error.code === "resource-exhausted");
    assert.deepEqual(buckets, before, "rejected requests must not mutate counters");
    assert.doesNotThrow(() => nextRateLimits(buckets, method, now + period));
  }
  const sessions = { session: { start: now, count: 10 } };
  assert.throws(() => nextRateLimits(sessions, "registerDeviceSession", now), /上限/);
  const reports = { report: { start: now, count: 10 } };
  assert.throws(() => nextRateLimits(reports, "getDemandStats", now), /上限/);
  assert.throws(() => nextRateLimits({ rpc: { start: now + 1000, count: 120 } }, "getProducts", now), /上限/);
});

test("rate accounting writes only the independent security document", async (t) => {
  const writes = [];
  t.mock.method(db, "runTransaction", async (callback) => callback({
    get: async (ref) => { assert.equal(ref.path, "posSecurityLimits/member"); return { exists: false }; },
    set: (ref, data, options) => writes.push({ path: ref.path, data, options }),
  }));
  await enforceRateLimit(user, "getProducts");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "posSecurityLimits/member");
  assert.equal(writes[0].data.buckets.rpc.count, 1);
  assert.deepEqual(writes[0].options, { merge: true });
  assert.ok(writes[0].data.expiresAt.toMillis() > Date.now());
});

test("new device registration evicts the oldest record without changing hashes or record/response fields", async (t) => {
  const secret = "isolated-test-secret-01234567890123456789";
  const deviceId = "test-device-0123456789";
  const hash = securityHash(secret, `device:${deviceId}`);
  const path = `users/member/securityDevices/${hash}`;
  const writes = [];
  const oldest = Array.from({ length: MAX_SECURITY_DEVICES }, (_, index) => ({ ref: { path: `users/member/securityDevices/old-${index}` } }));
  t.mock.method(db, "runTransaction", async (callback) => callback({
    get: async (reference) => {
      if (reference.path === path) return { exists: false };
      if (reference.path === "posSecurityLimits/member") return { data: () => ({ deviceRevision: 3 }) };
      return { size: oldest.length, docs: oldest };
    },
    set: (reference, data, options) => writes.push({ type: "set", path: reference.path, data, options }),
    delete: (reference) => writes.push({ type: "delete", path: reference.path }),
  }));
  assert.deepEqual(await recordDeviceSession(user, { rawRequest: {} }, secret, { deviceId }), { recorded: true, deviceReference: hash.slice(0, 12) });
  assert.deepEqual(writes.filter((write) => write.type === "delete"), [{ type: "delete", path: oldest[0].ref.path }]);
  assert.deepEqual(Object.keys(writes.find((write) => write.path === path).data).sort(), [
    "deviceHash", "emailVerifiedAtLastSeen", "identifierType", "lastIpHash", "lastSeenAt", "seenCount", "userAgentHash",
  ]);
});
