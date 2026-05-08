import assert from "node:assert/strict";
import test from "node:test";
import { getSubscriptionReuseAction } from "./reuse";

test("active existing subscriptions still conflict", () => {
  assert.deepEqual(getSubscriptionReuseAction({ isActive: true }), {
    action: "conflict",
  });
});

test("inactive existing subscriptions are reactivated instead of blocking resubscribe", () => {
  assert.deepEqual(getSubscriptionReuseAction({ isActive: false }), {
    action: "reactivate",
  });
});
