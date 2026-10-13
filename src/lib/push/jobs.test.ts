import assert from "node:assert/strict";
import test from "node:test";
import { jobDedupeKey, retryAt } from "./jobs";

test("delivery keys stay stable across retries and distinguish slots and subscriptions", () => {
  const key = jobDedupeKey("QUESTION", "sub-1", "2026-10-13", "09:00");
  assert.equal(key, jobDedupeKey("QUESTION", "sub-1", "2026-10-13", "09:00"));
  assert.notEqual(key, jobDedupeKey("QUESTION", "sub-1", "2026-10-13", "14:00"));
  assert.equal(key.length, 64);
});
test("job retries respect Retry-After even when it exceeds the normal backoff cap", () => {
  const now = new Date("2026-10-13T01:00:00Z");
  assert.equal(retryAt(now, 1, 3600000).toISOString(), "2026-10-13T02:00:00.000Z");
  assert.equal(retryAt(now, 8).getTime() - now.getTime(), 600000);
});
