import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const dashboardPageSource = readFileSync(
  join(process.cwd(), "src/app/dashboard/page.tsx"),
  "utf8",
);

const componentSource = readFileSync(
  join(process.cwd(), "src/components/dashboard/created-content-list.tsx"),
  "utf8",
);

test("dashboard mounts created content in its own tab below the stats", () => {
  assert.match(dashboardPageSource, /import \{ CreatedContentList \}/);
  assert.match(
    dashboardPageSource,
    /<TabsContent value="created"[^>]*>\s*<CreatedContentList \/>/,
  );
  assert.ok(dashboardPageSource.indexOf("<StatsCards />") < dashboardPageSource.indexOf('<TabsContent value="created"'));
});

test("created content list fetches only the current user's created banks", () => {
  assert.match(componentSource, /\/api\/banks\?owner=mine/);
  assert.match(componentSource, /\/api\/knowledge-banks\?owner=mine/);
  assert.match(componentSource, /<TabsTrigger value="question-banks"/);
  assert.match(componentSource, /<TabsTrigger value="knowledge-banks"/);
});
