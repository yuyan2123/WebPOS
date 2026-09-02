import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { authorize } from "../src/lib/auth.js";
import { tenantCollection, tenantPath } from "../src/lib/tenant.js";

test("builds different Firestore paths for different shops", () => {
  assert.equal(tenantPath({ shopId: "shop-a" }, "orders"), "shops/shop-a/orders");
  assert.equal(tenantPath({ shopId: "shop-b" }, "orders"), "shops/shop-b/orders");
  assert.notEqual(
    tenantCollection({ shopId: "shop-a" }, "orders").path,
    tenantCollection({ shopId: "shop-b" }, "orders").path,
  );
  assert.throws(() => tenantPath({ uid: "user-without-shop" }, "orders"), /店鋪身分/);
});

test("rejects requests without Firebase Authentication", () => {
  assert.throws(() => authorize({ auth: null }), /請先使用授權帳號登入/);
});

test("derives UID from verified auth context", () => {
  const previous = process.env.POS_ALLOWED_EMAILS;
  process.env.POS_ALLOWED_EMAILS = "";
  try {
    const user = authorize({
      auth: { uid: "verified-uid", token: { email: "user@example.com", name: "User", email_verified: true } },
      data: { uid: "attacker-controlled-uid" },
    });
    assert.equal(user.uid, "verified-uid");
    assert.notEqual(user.uid, "attacker-controlled-uid");
  } finally {
    if (previous === undefined) delete process.env.POS_ALLOWED_EMAILS;
    else process.env.POS_ALLOWED_EMAILS = previous;
  }
});

test("rejects an authenticated account with an unverified email", () => {
  assert.throws(
    () => authorize({ auth: { uid: "unverified", token: { email: "user@example.com", email_verified: false } } }),
    /請先完成 Email 驗證/,
  );
});

test("optional email allowlist rejects an authenticated outsider", () => {
  const previous = process.env.POS_ALLOWED_EMAILS;
  process.env.POS_ALLOWED_EMAILS = "owner@example.com";
  try {
    assert.throws(
      () => authorize({ auth: { uid: "outsider", token: { email: "other@example.com", email_verified: true } } }),
      /沒有 POS 使用權限/,
    );
  } finally {
    if (previous === undefined) delete process.env.POS_ALLOWED_EMAILS;
    else process.env.POS_ALLOWED_EMAILS = previous;
  }
});

test("services never access a root-level business collection", async () => {
  const servicesDirectory = resolve(import.meta.dirname, "../src/services");
  const accountScopedServices = new Set(["shops.js", "security.js"]);
  const files = (await readdir(servicesDirectory))
    .filter((file) => file.endsWith(".js") && !accountScopedServices.has(file));
  for (const file of files) {
    const source = await readFile(resolve(servicesDirectory, file), "utf8");
    assert.equal(/\bdb\.collection\s*\(/.test(source), false, `${file} contains a root collection access`);
  }
});

test("public JavaScript bundle contains no mock business or customer records", async () => {
  const source = await readFile(resolve(import.meta.dirname, "../../public/js/app.js"), "utf8");
  assert.doesNotMatch(source, /09\d{8}/, "public bundle contains a Taiwanese mobile number");
  assert.doesNotMatch(source, /mockProducts|mockOrders|mockOrderDetails/);
});
