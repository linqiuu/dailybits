import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGithubReadmeSummaryText,
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
