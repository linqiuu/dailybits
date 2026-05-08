import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGithubReadmeSummaryText,
  formatAiNewsOverviewPages,
  formatArxivOverviewPages,
  formatGithubOverviewPages,
  getAiNewsDigestCacheDate,
  getDigestItemLimit,
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

test("daily digest limit defaults to 12 overview source items", () => {
  const original = process.env.DIGEST_ITEM_LIMIT;
  delete process.env.DIGEST_ITEM_LIMIT;

  try {
    assert.equal(getDigestItemLimit(), 12);
  } finally {
    if (original === undefined) {
      delete process.env.DIGEST_ITEM_LIMIT;
    } else {
      process.env.DIGEST_ITEM_LIMIT = original;
    }
  }
});

test("daily digest limit is capped to three pages of four rows", () => {
  const original = process.env.DIGEST_ITEM_LIMIT;
  process.env.DIGEST_ITEM_LIMIT = "99";

  try {
    assert.equal(getDigestItemLimit(), 12);
  } finally {
    if (original === undefined) {
      delete process.env.DIGEST_ITEM_LIMIT;
    } else {
      process.env.DIGEST_ITEM_LIMIT = original;
    }
  }
});

test("GitHub overview renders three table strings without fork details", () => {
  const pages = formatGithubOverviewPages(
    Array.from({ length: 12 }, (_, index) => ({
      fullName: `owner/repo-${index + 1}`,
      url: `https://github.com/owner/repo-${index + 1}`,
      description: `Repo ${index + 1} helps developers build useful AI tools.`,
      language: "TypeScript",
      totalStars: "1,234",
      forks: "99",
      starsToday: "56",
      aiSummary: `这是第 ${index + 1} 个项目的一句话总结，说明问题、能力和适用人群。`,
    })),
  );

  assert.equal(pages.length, 3);
  assert.match(pages[0], /GitHub Trending 总览 1\/3/);
  assert.match(pages[0], /Star 趋势/);
  assert.match(pages[0], /今日 \+56/);
  assert.doesNotMatch(pages.join("\n"), /Fork|fork|🍴|99/);
});

test("AI news overview omits category and daily columns", () => {
  const pages = formatAiNewsOverviewPages(
    Array.from({ length: 12 }, (_, index) => ({
      title: `AI news ${index + 1}`,
      url: `https://example.com/news-${index + 1}`,
      source: "AIHOT",
      summary: `这是一条 AI 新闻摘要，保留主体、动作和影响。`,
      meta: "日报: 2026-05-08 | 分类: 模型发布/更新",
    })),
  );

  assert.equal(pages.length, 3);
  assert.match(pages[0], /AI 新闻总览 1\/3/);
  assert.match(pages[0], /\| 标题 \| 来源 \| 一句话摘要 \|/);
  assert.doesNotMatch(pages.join("\n"), /分类|日报/);
});

test("arXiv overview omits author and category columns", () => {
  const pages = formatArxivOverviewPages(
    Array.from({ length: 12 }, (_, index) => ({
      title: `Paper ${index + 1}`,
      url: `https://arxiv.org/abs/2605.${String(index + 1).padStart(5, "0")}`,
      authors: ["Alice", "Bob"],
      summary: "本文提出一种新的 AI 方法，用于提升模型推理效率并降低训练成本。",
      published: "2026-05-08T00:00:00Z",
      primaryCategory: "cs.AI",
    })),
  );

  assert.equal(pages.length, 3);
  assert.match(pages[0], /arXiv 论文总览 1\/3/);
  assert.match(pages[0], /\| 论文 \| 发布时间 \| 一句话摘要 \|/);
  assert.doesNotMatch(pages.join("\n"), /作者|分类|Alice|Bob|cs\.AI/);
});
