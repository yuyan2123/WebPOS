import test from "node:test";
import assert from "node:assert/strict";
import { customerDocumentId, normalizeContactType, normalizeContactValue, orderDocumentId } from "../src/lib/ids.js";

test("normalizes phone and LINE contact values without mixing identities", () => {
  assert.equal(normalizeContactType("LINE"), "line");
  assert.equal(normalizeContactValue("phone", "0912-345-678"), "0912345678");
  assert.equal(normalizeContactValue("line", " GinJia.Pos "), "ginjia.pos");
  assert.equal(customerDocumentId("0912-345-678"), "0912345678");
  assert.match(customerDocumentId("line", "GinJia.Pos"), /^line_[a-f0-9]{32}$/);
  assert.notEqual(customerDocumentId("line", "0912345678"), customerDocumentId("phone", "0912345678"));
});

test("uses a stable opaque order ID for the same client request", () => {
  assert.equal(orderDocumentId("request-123"), orderDocumentId("request-123"));
  assert.notEqual(orderDocumentId("request-123"), orderDocumentId("request-124"));
  assert.match(orderDocumentId("request-123"), /^O[a-f0-9]{32}$/);
});
