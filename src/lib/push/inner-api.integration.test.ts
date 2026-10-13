import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sendToTarget } from "./adapter";

test("Directory and paged Messaging against the local Inner API Mock", { skip: !process.env.TEST_INNER_API_MOCK_URL }, async () => {
  const base = new URL(process.env.TEST_INNER_API_MOCK_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(base.hostname) && base.port === "4010", "This test may only send synthetic content to the local Mock");
  const response = await fetch(new URL("/directory/v1/departments/search?q=技术", base));
  assert.equal(response.status, 200);
  const directory = await response.json();
  assert.ok(Array.isArray(directory.items));
  const previous = new Map(["PUSH_PROVIDER", "INNER_API_BASE_URL", "INNER_API_KEY", "MESSAGING_API_BASE_URL", "MESSAGING_INNER_API_KEY"].map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const keys: string[] = [];
  try {
    process.env.PUSH_PROVIDER = "messaging";
    process.env.INNER_API_BASE_URL = base.toString();
    delete process.env.INNER_API_KEY;
    delete process.env.MESSAGING_API_BASE_URL;
    delete process.env.MESSAGING_INNER_API_KEY;
    globalThis.fetch = (async (input, init) => {
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      return originalFetch(input, init);
    }) as typeof fetch;
    const payload = { receiver: "a1234555", title: "Integration fixture", items: ["Fixture 1\n\nFixture 2\n\nFixture 3", "Fixture 4"], digestType: "AI_NEWS" as const, digestDate: "2026-10-13", idempotencyKey: randomUUID() };
    const first = await sendToTarget(payload);
    const replay = await sendToTarget(payload);
    assert.equal(first.ok, true);
    if (first.ok) { assert.equal(first.status, "accepted"); assert.ok(first.messageId); }
    assert.equal(replay.ok, true);
    // Mock generates a new receipt per call; the contract only requires stable retry keys.
    assert.deepEqual(keys, [payload.idempotencyKey, payload.idempotencyKey]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
