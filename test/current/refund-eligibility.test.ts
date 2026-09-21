import assert from "node:assert/strict";
import test from "node:test";
import { isPartnerRefundAllowed } from "../../src/lib/refunds/eligibility";

test("partners can request refunds for realtime deliveries", () => {
  assert.equal(isPartnerRefundAllowed("realtime"), true);
});

test("partners cannot request refunds for aged deliveries", () => {
  assert.equal(isPartnerRefundAllowed("aged"), false);
});