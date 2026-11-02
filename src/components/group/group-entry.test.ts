import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

test("group entry validates strings before navigation and exposes accessible errors", () => {
  const entry = source("components/group/group-entry-dialog.tsx");
  assert.match(entry, /normalizeGroupId\(String\(new FormData/);
  assert.match(entry, /router\.push\(`\/group\/\$\{target\}`\)/);
  assert.match(entry, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(entry, /role="alert"/);
  assert.match(source("components/layout/header.tsx"), /GroupEntryDialog active=\{pathname\.startsWith\("\/group\/"\)\}/);
});

test("switching groups remounts target state and only authenticated users load group content", () => {
  assert.match(source("app/group/[groupId]/page.tsx"), /<GroupDashboard key=\{groupId\}/);
  const dashboard = source("components/group/group-dashboard.tsx");
  assert.match(dashboard, /status === "authenticated" \? <GroupContent key=\{groupId\}/);
  assert.match(dashboard, /<BankExplorer targetType="GROUP" targetId=\{groupId\}/);
  assert.match(dashboard, /<KnowledgeExplorer targetType="GROUP" targetId=\{groupId\}/);
  assert.match(dashboard, /<DigestSubscriptionList targetType="GROUP" targetId=\{groupId\}/);
  assert.match(dashboard, /if \(!response\.ok\) throw/);
  assert.match(dashboard, /failed \? \([\s\S]*<RequestState/);
});

test("group subscription actions identify the recipient instead of silently using personal endpoints", () => {
  for (const path of ["components/bank/bank-card.tsx", "components/knowledge/knowledge-card.tsx"]) {
    const card = source(path);
    assert.match(card, /targetType === "GROUP" \? "订阅到群" : "订阅"/);
    assert.match(card, /接收群：\{targetId\}/);
    assert.match(card, /targetType === "GROUP" && !isGroupId\(targetId\)/);
  }
  const digest = source("components/dashboard/digest-subscription-list.tsx");
  assert.match(digest, /managedByOther/);
  assert.match(digest, /由其他用户管理/);
  assert.doesNotMatch(digest, /isGroupTarget && targetId\s*\?/);
});
