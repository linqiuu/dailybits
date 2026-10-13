import assert from "node:assert/strict";
import test from "node:test";
import { isWorkingDay } from "../lib/subscriptions/workdays";

test("working-day policy excludes weekends and Chinese holidays", () => {
  const previous = process.env.SKIP_NON_WORKING_DAYS;
  process.env.SKIP_NON_WORKING_DAYS = "true";
  try {
    assert.equal(isWorkingDay(new Date("2026-10-13T01:00:00Z"), "Asia/Shanghai"), true);
    assert.equal(isWorkingDay(new Date("2026-10-17T01:00:00Z"), "Asia/Shanghai"), false);
    assert.equal(isWorkingDay(new Date("2026-10-01T01:00:00Z"), "Asia/Shanghai"), false);
    process.env.SKIP_NON_WORKING_DAYS = "false";
    assert.equal(isWorkingDay(new Date("2026-10-17T01:00:00Z"), "Asia/Shanghai"), true);
  } finally {
    if (previous === undefined) delete process.env.SKIP_NON_WORKING_DAYS;
    else process.env.SKIP_NON_WORKING_DAYS = previous;
  }
});
