import assert from "node:assert/strict";
import test from "node:test";
import { canManageSubscription, canReadContent, canSubscribeContent } from "./access";

const bank = { creatorId: "owner", visibility: "PARTIAL" as const, visibleDepartments: ["dept-1"] };
test("content access uses stable department IDs and denies unrelated or anonymous viewers", () => {
  assert.equal(canReadContent(bank, "viewer", ["dept-1"]), true);
  assert.equal(canReadContent(bank, "viewer", ["Engineering"]), false);
  assert.equal(canReadContent(bank), false);
  assert.equal(canReadContent({ ...bank, visibility: "PRIVATE" }, "viewer", ["dept-1"]), false);
  assert.equal(canReadContent({ ...bank, visibility: "PRIVATE" }, "owner"), true);
});
test("only group subscription creators or administrators can manage a group subscription", () => {
  const group = { targetType: "GROUP", targetId: "123", subscriberId: "owner" };
  assert.equal(canManageSubscription(group, null), false);
  assert.equal(canManageSubscription(group, { id: "other" }), false);
  assert.equal(canManageSubscription(group, { id: "owner" }), true);
  assert.equal(canManageSubscription(group, { id: "admin", isAdmin: true }), true);
  assert.equal(canManageSubscription({ ...group, targetType: "USER" }, { id: "owner", isAdmin: true }), false);
});
test("group subscriptions cannot disclose private or department-only content", () => {
  assert.equal(canSubscribeContent(bank, "GROUP", "owner", ["dept-1"]), false);
  assert.equal(canSubscribeContent({ ...bank, visibility: "PUBLIC" }, "GROUP", "owner", []), true);
});
