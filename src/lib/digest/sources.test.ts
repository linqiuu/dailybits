import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGithubReadmeSummaryText,
  getAiNewsDigestCacheDate,
  getGithubReadmeSummaryInstruction,
  getGithubReadmeSummaryMaxChars,
} from "./sources";

test("GitHub README summary input uses a 5000 character README limit by default", () => {
  const original = process.env.GITHUB_README_SUMMARY_MAX_CHARS;
  delete process.env.GITHUB_README_SUMMARY_MAX_CHARS;

  try {
    assert.equal(getGithubReadmeSummaryMaxChars(), 5000);
  } finally {
    if (original === undefined) {
      delete process.env.GITHUB_README_SUMMARY_MAX_CHARS;
    } else {
      process.env.GITHUB_README_SUMMARY_MAX_CHARS = original;
    }
  }
});

test("GitHub README summary input trims long README content before calling the LLM", () => {
  const input = buildGithubReadmeSummaryText(
    {
      fullName: "owner/repo",
      url: "https://github.com/owner/repo",
      description: "A useful project",
      language: "TypeScript",
    },
    `${"a".repeat(5000)}SHOULD_NOT_BE_SENT`,
    5000,
  );

  assert.equal(input.includes("SHOULD_NOT_BE_SENT"), false);
  assert.equal(input.includes("Project: owner/repo"), true);
  assert.equal(input.includes("Language: TypeScript"), true);
});

test("GitHub README summary prompt requires Chinese 3 to 5 sentence output", () => {
  const instruction = getGithubReadmeSummaryInstruction();

  assert.match(instruction, /中文|简体中文/);
  assert.match(instruction, /3\s*到\s*5\s*句/);
  assert.match(instruction, /不要输出 Markdown/);
});

test("AIHOT daily cache date waits until the daily report is ready", () => {
  const originalProvider = process.env.AI_NEWS_PROVIDER;
  const originalMode = process.env.AIHOT_DIGEST_MODE;
  const originalReadyTime = process.env.AIHOT_DAILY_READY_TIME;
  process.env.AI_NEWS_PROVIDER = "aihot";
  process.env.AIHOT_DIGEST_MODE = "daily";
  process.env.AIHOT_DAILY_READY_TIME = "08:10";

  try {
    assert.equal(
      getAiNewsDigestCacheDate(new Date("2026-05-08T00:09:00.000Z"), "Asia/Shanghai"),
      "2026-05-07",
    );
    assert.equal(
      getAiNewsDigestCacheDate(new Date("2026-05-08T00:10:00.000Z"), "Asia/Shanghai"),
      "2026-05-08",
    );
  } finally {
    if (originalProvider === undefined) {
      delete process.env.AI_NEWS_PROVIDER;
    } else {
      process.env.AI_NEWS_PROVIDER = originalProvider;
    }
    if (originalMode === undefined) {
      delete process.env.AIHOT_DIGEST_MODE;
    } else {
      process.env.AIHOT_DIGEST_MODE = originalMode;
    }
    if (originalReadyTime === undefined) {
      delete process.env.AIHOT_DAILY_READY_TIME;
    } else {
      process.env.AIHOT_DAILY_READY_TIME = originalReadyTime;
    }
  }
});
