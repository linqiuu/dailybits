import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "digest-subscription-list.tsx"),
  "utf8",
);

test("digest subscription cards render per-type subscriber counts", () => {
  assert.match(source, /subscriberCounts/);
  assert.match(source, /人已订阅/);
});

test("digest subscription cards show subscriber counts as title-row badges", () => {
  assert.match(
    source,
    /<CardTitle className="flex min-w-0 flex-wrap items-center gap-2">[\s\S]*<Badge[\s\S]*aria-label=\{`\$\{option\.title\} \$\{subscriberCounts\[option\.type\]\} 人已订阅`\}/,
  );
  assert.doesNotMatch(
    source,
    /<div className="text-xs text-muted-foreground">\s*\{subscriberCounts\[option\.type\]\} 人已订阅\s*<\/div>/,
  );
});

test("digest scheduling is disclosed only after an explicit subscribe or edit action", () => {
  assert.match(source, /isEditing \? \([\s\S]*<form className="digest-editor"/);
  assert.match(source, /onClick=\{\(\) => setEditingType\(option\.type\)\}/);
  assert.match(source, /isValidPushTime\(pushTime\)/);
  assert.match(source, /new FormData\(event\.currentTarget\)\.get\("pushTime"\)/);
  assert.match(source, /pushTimes: \[pushTime\]/);
  assert.match(source, /setEditingType\(null\)/);
  assert.match(source, /getTime\(sub, option\)/);
});

test("digest editor restores keyboard focus and does not display unknown counts as zero", () => {
  assert.match(source, /actionRefs\.current\[returnFocusTo\.current\]\?\.focus\(\)/);
  assert.match(source, /required autoFocus/);
  assert.match(source, /countsAvailable \? <Badge/);
  assert.match(source, /disabled=\{savingType !== null\}/);
});

test("digest subscription cards render only subscribable digest options", () => {
  assert.match(source, /SUBSCRIBABLE_DIGEST_TYPES/);
  assert.match(
    source,
    /const DIGEST_OPTIONS = ALL_DIGEST_OPTIONS\.filter\(\(option\) =>\s*SUBSCRIBABLE_DIGEST_TYPE_SET\.has\(option\.type\),\s*\);/,
  );
});
