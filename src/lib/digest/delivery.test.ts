import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDigestFetchFailureCache,
  buildDigestPushLogKey,
  getDigestFetchFailureCooldownMs,
  isActiveDigestFetchFailureCache,
} from "./delivery";

test("digest push log key includes push time so the same digest can push at a new time today", () => {
  const first = buildDigestPushLogKey({
    targetType: "USER",
    targetId: "user-1",
    digestType: "GITHUB_TRENDING",
    digestDate: "2026-05-08",
    pushTime: "09:00",
  });
  const second = buildDigestPushLogKey({
    targetType: "USER",
    targetId: "user-1",
    digestType: "GITHUB_TRENDING",
    digestDate: "2026-05-08",
    pushTime: "10:30",
  });

  assert.deepEqual(first, {
    targetType_targetId_digestType_digestDate_pushTime: {
      targetType: "USER",
      targetId: "user-1",
      digestType: "GITHUB_TRENDING",
      digestDate: "2026-05-08",
      pushTime: "09:00",
    },
  });
  assert.notDeepEqual(first, second);
});

test("digest fetch failures are active only until their retry time", () => {
  const now = new Date("2026-05-09T01:00:00.000Z");
  const failure = buildDigestFetchFailureCache("GET arXiv failed: 429", now, 60 * 60 * 1000);

  assert.equal(
    isActiveDigestFetchFailureCache(failure, new Date("2026-05-09T01:30:00.000Z")),
    true,
  );
  assert.equal(
    isActiveDigestFetchFailureCache(failure, new Date("2026-05-09T02:00:01.000Z")),
    false,
  );
});

test("digest fetch failure cooldown defaults to three hours", () => {
  const original = process.env.DIGEST_FETCH_FAILURE_COOLDOWN_MINUTES;
  delete process.env.DIGEST_FETCH_FAILURE_COOLDOWN_MINUTES;

  try {
    assert.equal(getDigestFetchFailureCooldownMs(), 180 * 60 * 1000);
  } finally {
    if (original === undefined) {
      delete process.env.DIGEST_FETCH_FAILURE_COOLDOWN_MINUTES;
    } else {
      process.env.DIGEST_FETCH_FAILURE_COOLDOWN_MINUTES = original;
    }
  }
});
