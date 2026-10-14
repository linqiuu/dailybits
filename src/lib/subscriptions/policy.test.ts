import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLearningPolicy,
  parseLearningMode,
  SubscriptionPolicyError,
} from "./policy";
import { parseQuestionBankSchedule } from "./schedule";

test("learning modes, review counts and creator recommendations are independent", () => {
  assert.equal(
    parseLearningMode(undefined, "FOLLOW_UPDATES"),
    "FOLLOW_UPDATES",
  );
  assert.deepEqual(
    parseLearningPolicy(
      { endCondition: "REPEAT_N_TIMES", repeatCount: 3 },
      { mode: "CURRENT_EDITION" },
    ),
    { mode: "CURRENT_EDITION", endCondition: "REPEAT_N_TIMES", repeatCount: 3 },
  );
  assert.throws(
    () =>
      parseLearningPolicy(
        {
          mode: "FOLLOW_UPDATES",
          endCondition: "REPEAT_N_TIMES",
          repeatCount: 2,
        },
        { mode: "CURRENT_EDITION" },
      ),
    SubscriptionPolicyError,
  );
  for (const body of [
    { mode: "INVALID" },
    { mode: null },
    { endCondition: null },
    { repeatCount: null },
    { repeatCount: -1 },
    { repeatCount: 1.1 },
  ])
    assert.throws(
      () => parseLearningPolicy(body, { mode: "CURRENT_EDITION" }),
      SubscriptionPolicyError,
    );
  assert.equal(
    parseQuestionBankSchedule({ recommendedSubscriptionMode: "FOLLOW_UPDATES" })
      .ok,
    true,
  );
  assert.equal(
    parseQuestionBankSchedule({ recommendedSubscriptionMode: null }).ok,
    false,
  );
});
