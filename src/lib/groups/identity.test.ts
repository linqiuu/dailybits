import assert from "node:assert/strict";
import test from "node:test";
import { isGroupId, MAX_GROUP_ID_LENGTH, normalizeGroupId } from "./identity";

test("group IDs stay strings, preserving leading zeros and large identifiers", () => {
  assert.equal(normalizeGroupId(" 00123456 "), "00123456");
  assert.equal(normalizeGroupId("90071992547409931234"), "90071992547409931234");
  assert.equal(isGroupId("1".repeat(MAX_GROUP_ID_LENGTH)), true);
});

test("group entry rejects empty, malformed, nonnumeric and overlong identifiers", () => {
  for (const value of ["", " ", "1 234", "12/34", "../123", "123?x=1", "-123", "1e6", "１２３", "1".repeat(MAX_GROUP_ID_LENGTH + 1)]) {
    assert.equal(normalizeGroupId(value), null, value);
  }
  for (const value of [undefined, null, 123, {}, " 123 "]) assert.equal(isGroupId(value), false);
});
