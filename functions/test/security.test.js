import test from "node:test";
import assert from "node:assert/strict";
import { extractClientIp, securityHash } from "../src/services/security.js";

test("device and network values are HMAC hashed with domain separation", () => {
  const secret = "a-secure-test-secret-that-is-longer-than-32-characters";
  const deviceHash = securityHash(secret, "device:same-value");
  const ipHash = securityHash(secret, "ip:same-value");
  assert.equal(deviceHash.length, 64);
  assert.notEqual(deviceHash, ipHash);
  assert.doesNotMatch(deviceHash, /same-value/);
});

test("extracts the first proxy address without storing the forwarding chain", () => {
  assert.equal(
    extractClientIp({ headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" }, ip: "127.0.0.1" }),
    "203.0.113.8",
  );
  assert.equal(extractClientIp({ headers: {}, ip: "127.0.0.1" }), "127.0.0.1");
});
