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
  assert.match(source, /fetchKnowledgeSubscriptions/);
  assert.match(source, /targetType", "GROUP"/);
  assert.match(source, /targetId", groupId/);
  assert.match(source, /\/api\/knowledge-subscriptions\?\$\{params\}/);
});

test("group knowledge subscriptions can be edited and cancelled from management", () => {
  assert.match(source, /KnowledgeSubscriptionsTab/);
  assert.match(source, /handleUnsubscribeKnowledge/);
  assert.match(source, /headers: \{ "x-group-id": groupId \}/);
  assert.match(source, /<SubscriptionPanel[^>]*kind="KNOWLEDGE"/);
  assert.match(source, /targetType="GROUP" targetId=\{groupId\}/);
});
