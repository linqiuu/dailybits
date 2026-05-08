import assert from "node:assert/strict";
import test from "node:test";
import { buildDigestPushLogKey } from "./delivery";

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
