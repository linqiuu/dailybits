import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  answerOrder,
  answerWhere,
  canReadAnswerDetails,
  parseAnswerFilters,
  type AnswerRecordView,
} from "./query";
import { answerWorkbook } from "./export";

test("answer dates include full Shanghai days and reject invalid filters", () => {
  const filters = parseAnswerFilters(
    new URLSearchParams(
      "from=2026-10-14&to=2026-10-14&result=incorrect&q=00123&sort=incorrect-first",
    ),
  );
  const where = answerWhere("bank-1", filters);
  assert.equal(where.bankId, "bank-1");
  assert.equal(where.isCorrect, false);
  assert.deepEqual(where.answeredAt, {
    gte: new Date("2026-10-13T16:00:00Z"),
    lt: new Date("2026-10-14T16:00:00Z"),
  });
  assert.deepEqual(answerOrder(filters.sort), [
    { isCorrect: "asc" },
    { answeredAt: "desc" },
    { id: "desc" },
  ]);
  for (const input of [
    "from=2026-02-30",
    "from=2026-10-15&to=2026-10-14",
    "sort=arbitrary",
    "result=invalid",
    "page=-1",
    "pageSize=10000",
    "page=1.5",
  ])
    assert.throws(() => parseAnswerFilters(new URLSearchParams(input)));
});

test("answer detail permissions do not inherit public or department visibility", () => {
  const bank = { creatorId: "owner" };
  assert.equal(canReadAnswerDetails(bank, { id: "owner" }), true);
  assert.equal(
    canReadAnswerDetails(bank, { id: "admin", isAdmin: true }),
    true,
  );
  assert.equal(canReadAnswerDetails(bank, { id: "subscriber" }), false);
  assert.equal(canReadAnswerDetails(bank, null), false);
});

test("Excel keeps employee numbers and formula-like strings as plain text", () => {
  const record: AnswerRecordView = {
    id: "record-1",
    accountId: "a00123",
    name: "=1+1",
    employeeNo: "00123",
    identityStatus: "RESOLVED",
    identityCapturedAt: "2026-10-14T01:00:00Z",
    identityBackfilled: true,
    questionId: "question-1",
    question: "+SUM(1,2)",
    questionSnapshotAvailable: true,
    selectedAnswer: "A",
    correctAnswer: "B",
    isCorrect: false,
    answeredAt: "2026-10-13T16:00:00Z",
  };
  const workbook = XLSX.read(answerWorkbook("Fixture", [record]), {
    type: "buffer",
  });
  const sheet = workbook.Sheets["答题记录"];
  assert.equal(sheet.B2.v, "00123");
  assert.equal(sheet.B2.t, "s");
  assert.equal(sheet.A2.v, "=1+1");
  assert.equal(sheet.A2.t, "s");
  assert.equal(sheet.A2.f, undefined);
  assert.equal(sheet.E2.f, undefined);
  assert.equal(sheet.H2.v, "错误");
  assert.match(String(sheet.I2.v), /2026.*10.*14.*00:00:00/);
});
