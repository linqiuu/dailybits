import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

test("all learning subscription entry points submit and edit the selected order", () => {
  for (const path of ["components/bank/bank-card.tsx", "components/knowledge/knowledge-card.tsx", "components/group/bank-selector.tsx", "components/bank/subscription-panel.tsx"]) {
    const value = source(path);
    assert.match(value, /pushOrder/);
    assert.match(value, /onPushOrderChange=\{setPushOrder\}/);
    assert.match(value, /JSON\.stringify\([\s\S]*pushOrder/);
  }
  assert.match(source("components/bank/subscription-panel.tsx"), /setPushOrder\(subscription\.pushOrder \?\? "SEQUENTIAL"\)/);
  assert.doesNotMatch(source("components/bank/subscription-panel.tsx"), /\(!fixed \|\|/);
  assert.match(source("components/bank/subscription-policy-fields.tsx"), /<Select value=\{pushOrder\} disabled=\{disabled\}/);
});

test("detail and editing headers use the same readable foreground and surface tokens", () => {
  const css = source("app/globals.css");
  const header = css.match(/\.editor-hero \{([^}]+)\}/)?.[1] ?? "";
  assert.match(header, /color: var\(--foreground\)/);
  assert.match(header, /background: var\(--card\)/);
  assert.doesNotMatch(header, /surface-night|color: white/);
  assert.match(css, /\.editor-hero p \{ color: var\(--muted-foreground\)/);
});

test("header foreground and supporting text meet normal-text contrast on the card surface", () => {
  const css = source("app/globals.css");
  const token = (name: string) => {
    const hex = css.match(new RegExp(`--${name}: #(\\w{6});`))?.[1];
    assert.ok(hex, `Missing color token ${name}`);
    const rgb = [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
    const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const surface = token("card");
  for (const name of ["foreground", "muted-foreground"]) {
    const text = token(name);
    assert.ok((Math.max(surface, text) + 0.05) / (Math.min(surface, text) + 0.05) >= 4.5, name);
  }
});
