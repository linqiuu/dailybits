import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "group-dashboard.tsx"),
  "utf8",
);

test("group dashboard labels the existing subscriptions tab as subscription management", () => {
  assert.match(source, /订阅管理/);
  assert.doesNotMatch(source, />\s*题库订阅\s*</);
});

test("subscription management fetches group knowledge subscriptions", () => {
  assert.match(source, /useGroupSubscriptions\(endpoint\)/);
  assert.match(source, /new URLSearchParams\(\{ targetType: "GROUP", targetId: groupId \}\)/);
  assert.match(source, /\/api\/knowledge-subscriptions\?/);
});

test("group knowledge subscriptions can be edited and cancelled from management", () => {
  assert.match(source, /<GroupSubscriptionsSection groupId=\{groupId\} kind="KNOWLEDGE"/);
  assert.match(source, /<SubscriptionPanel[^>]*kind=\{kind\}/);
  assert.match(source, /targetType="GROUP" targetId=\{groupId\}/);
  const panel = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../bank/subscription-panel.tsx"), "utf8");
  assert.match(panel, /"\/api\/knowledge-subscriptions"/);
  assert.match(panel, /method: action === "cancel" \? "DELETE" : "PATCH"/);
  assert.match(source, /onChanged=\{\(\) => void refresh\(\)\}/);
});
