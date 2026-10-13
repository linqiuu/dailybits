import assert from "node:assert/strict";
import test from "node:test";
import { atZonedTime, calendarRange, dateKey } from "./time";

test("calendar ranges include the whole first Shanghai day, including days=1", () => {
  const now = new Date("2026-10-13T07:15:00Z");
  assert.equal(dateKey(now), "2026-10-13");
  assert.equal(calendarRange(now, 1).start.toISOString(), "2026-10-12T16:00:00.000Z");
  assert.equal(calendarRange(now, 7).start.toISOString(), "2026-10-06T16:00:00.000Z");
  assert.equal(calendarRange(now, 7).end.toISOString(), "2026-10-13T16:00:00.000Z");
  assert.equal(atZonedTime("2026-10-13", "09:30").toISOString(), "2026-10-13T01:30:00.000Z");
});
