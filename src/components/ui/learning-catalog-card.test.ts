import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "learning-catalog-card.tsx"), "utf8");
const bankSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../bank/bank-card.tsx"), "utf8");
const knowledgeSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../knowledge/knowledge-card.tsx"), "utf8");

test("learning catalogues share title links, inline metadata, schedule and separate actions", () => {
  assert.match(source, /<Link href=\{href\} className="learning-link"/);
  assert.match(source, /className="learning-meta"/);
  assert.match(source, /className="learning-action"/);
  assert.match(source, /subscribed \?/);
  assert.match(bankSource, /<LearningCatalogCard/);
  assert.match(knowledgeSource, /<LearningCatalogCard/);
});

test("catalogue cards do not fabricate activity visualizations or fallback descriptions", () => {
  for (const value of [source, bankSource, knowledgeSource]) {
    assert.doesNotMatch(value, /SignalBars|signalValues|QUESTION BANK|KNOWLEDGE DECK/);
  }
  assert.match(source, /description \? <p className="learning-description"/);
  assert.match(bankSource, /accuracy !== null/);
});
