import assert from "node:assert/strict";
import test from "node:test";
import { pushToTarget, sendToTarget } from "./adapter";
import type { DigestPushPayload, PushPayload } from "../../types";

test("maps question pushes to card-service QA cards", async () => {
  const originalProvider = process.env.PUSH_PROVIDER;
  const originalBase = process.env.CARD_SERVICE_API_BASE;
  const originalKey = process.env.CARD_SERVICE_SEND_API_KEY;
  const originalFetch = globalThis.fetch;

  let requestedUrl = "";
  let requestedHeaders: Headers | null = null;
  let requestedBody: unknown;

  process.env.PUSH_PROVIDER = "card-service";
  process.env.CARD_SERVICE_API_BASE = "http://127.0.0.1:10120";
  process.env.CARD_SERVICE_SEND_API_KEY = "secret";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = new Headers(init?.headers);
    requestedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const payload: PushPayload = {
      receiver: "z100",
      title: "AI 基础题",
      question: "Transformer 的核心机制是什么？",
      options: ["自注意力", "冒泡排序", "哈希表", "位图"],
      correctAnswer: "A",
      explanation: "自注意力让 token 之间直接建模依赖关系。",
      authorId: "authhub-stable-1",
      businessId: "question-1",
    };

    const ok = await pushToTarget(payload);

    assert.equal(ok, true);
    assert.equal(requestedUrl, "http://127.0.0.1:10120/send/qa");
    assert.ok(requestedHeaders);
    assert.equal((requestedHeaders as Headers).get("X-Card-Service-Key"), "secret");
    assert.deepEqual(requestedBody, {
      receiver: "z100",
      authorId: "authhub-stable-1",
      domain: "AI 基础题",
      question: "Transformer 的核心机制是什么？",
      answer: "a",
      choices: {
        a: "自注意力",
        b: "冒泡排序",
        c: "哈希表",
        d: "位图",
      },
      analysis: "自注意力让 token 之间直接建模依赖关系。",
      scene: "AI 基础题",
      source_system: "dailybits",
      business_id: "question-1",
    });
  } finally {
    restoreEnv("PUSH_PROVIDER", originalProvider);
    restoreEnv("CARD_SERVICE_API_BASE", originalBase);
    restoreEnv("CARD_SERVICE_SEND_API_KEY", originalKey);
    globalThis.fetch = originalFetch;
  }
});

test("maps digest pushes to Messaging paged markdown cards", async () => {
  const originalEnv = saveEnv([
    "PUSH_PROVIDER",
    "INNER_API_BASE_URL",
    "INNER_API_KEY",
    "INNER_API_KEY_HEADER",
    "MESSAGING_RETRY_ATTEMPTS",
  ]);
  const originalFetch = globalThis.fetch;

  let requestedUrl = "";
  let requestedHeaders: Headers | null = null;
  let requestedBody: unknown;

  process.env.PUSH_PROVIDER = "messaging";
  process.env.INNER_API_BASE_URL = "http://127.0.0.1:4010";
  process.env.INNER_API_KEY = "inner-secret";
  process.env.INNER_API_KEY_HEADER = "X-Inner-API-Key";
  process.env.MESSAGING_RETRY_ATTEMPTS = "1";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = new Headers(init?.headers);
    requestedBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        messageId: "msg-1",
        status: "accepted",
        recipient: "123456789",
        recipientType: "group",
        cardType: "pages",
        sentAt: "2026-08-28T01:00:00.000Z",
      }),
      { status: 202 },
    );
  }) as typeof fetch;

  try {
    const payload: DigestPushPayload = {
      receiver: "123456789",
      title: "GitHub Trending Daily",
      items: [
        "**[owner/repo-1](https://github.com/owner/repo-1)**\n\n项目摘要 1。",
        "**[owner/repo-4](https://github.com/owner/repo-4)**\n\n项目摘要 4。",
      ],
      digestType: "GITHUB_TRENDING",
      digestDate: "2026-08-28",
      idempotencyKey: "dailybits:digest:GROUP:123456789:GITHUB_TRENDING:2026-08-28:09:00",
    };

    const ok = await pushToTarget(payload);

    assert.equal(ok, true);
    assert.equal(
      requestedUrl,
      "http://127.0.0.1:4010/messaging/v1/cards/send",
    );
    assert.ok(requestedHeaders);
    assert.equal((requestedHeaders as Headers).get("X-Inner-API-Key"), "inner-secret");
    assert.equal(
      (requestedHeaders as Headers).get("Idempotency-Key"),
      "dailybits:digest:GROUP:123456789:GITHUB_TRENDING:2026-08-28:09:00",
    );
    assert.deepEqual(requestedBody, {
      recipient: "123456789",
      content: [
        "## GitHub Trending Daily\n\n**[owner/repo-1](https://github.com/owner/repo-1)**\n\n项目摘要 1。\n\n2026-08-28 · 1/2",
        "## GitHub Trending Daily\n\n**[owner/repo-4](https://github.com/owner/repo-4)**\n\n项目摘要 4。\n\n2026-08-28 · 2/2",
      ],
    });
  } finally {
    restoreEnvMap(originalEnv);
    globalThis.fetch = originalFetch;
  }
});

test("retries Messaging rate limits with the same idempotency key", async () => {
  const originalEnv = saveEnv([
    "PUSH_PROVIDER",
    "INNER_API_BASE_URL",
    "INNER_API_KEY",
    "MESSAGING_RETRY_ATTEMPTS",
    "MESSAGING_RETRY_BASE_MS",
    "MESSAGING_MAX_RETRY_DELAY_MS",
  ]);
  const originalFetch = globalThis.fetch;

  const idempotencyKeys: string[] = [];
  let callCount = 0;

  process.env.PUSH_PROVIDER = "messaging";
  process.env.INNER_API_BASE_URL = "http://127.0.0.1:4010";
  delete process.env.INNER_API_KEY;
  process.env.MESSAGING_RETRY_ATTEMPTS = "2";
  process.env.MESSAGING_RETRY_BASE_MS = "1";
  process.env.MESSAGING_MAX_RETRY_DELAY_MS = "1";
  globalThis.fetch = (async (_input, init) => {
    callCount += 1;
    const headers = new Headers(init?.headers);
    idempotencyKeys.push(headers.get("Idempotency-Key") ?? "");
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          error: {
            code: "rate_limited",
            message: "too many requests",
            requestId: "req-429",
          },
        }),
        { status: 429, headers: { "Retry-After": "0" } },
      );
    }
    return new Response(
      JSON.stringify({
        messageId: "msg-2",
        status: "accepted",
        recipient: "a1234555",
        recipientType: "user",
        cardType: "pages",
        sentAt: "2026-08-28T01:00:00.000Z",
      }),
      { status: 202 },
    );
  }) as typeof fetch;

  try {
    const ok = await pushToTarget({
      receiver: "a1234555",
      title: "AI News Daily",
      items: ["**[News](https://example.com)**\n\n摘要。"],
      digestType: "AI_NEWS",
      digestDate: "2026-08-28",
      idempotencyKey: "dailybits:digest:USER:user-1:AI_NEWS:2026-08-28:09:00",
    });

    assert.equal(ok, true);
    assert.equal(callCount, 2);
    assert.deepEqual(idempotencyKeys, [
      "dailybits:digest:USER:user-1:AI_NEWS:2026-08-28:09:00",
      "dailybits:digest:USER:user-1:AI_NEWS:2026-08-28:09:00",
    ]);
  } finally {
    restoreEnvMap(originalEnv);
    globalThis.fetch = originalFetch;
  }
});

test("production cannot report a mock success for missing configuration", async () => {
  const previous = saveEnv(["PUSH_PROVIDER", "PUSH_API_URL", "PUSH_MOCK", "NODE_ENV"]);
  try {
    process.env.PUSH_PROVIDER = "generic";
    delete process.env.PUSH_API_URL;
    process.env.PUSH_MOCK = "true";
    Object.assign(process.env, { NODE_ENV: "production" });
    const result = await sendToTarget({ receiver: "fixture", title: "Fixture", items: ["Fixture"], digestType: "AI_NEWS", digestDate: "2026-10-13" });
    assert.deepEqual(result, { ok: false, code: "PUSH_NOT_CONFIGURED", retryable: false });
  } finally { restoreEnvMap(previous); }
});

test("long idempotency keys do not collide and Retry-After is never shortened", async () => {
  const previous = saveEnv(["PUSH_PROVIDER", "INNER_API_BASE_URL", "MESSAGING_RETRY_ATTEMPTS", "MESSAGING_MAX_RETRY_DELAY_MS"]);
  const originalFetch = globalThis.fetch;
  const keys: string[] = [];
  try {
    process.env.PUSH_PROVIDER = "messaging";
    process.env.INNER_API_BASE_URL = "http://127.0.0.1:4010";
    process.env.MESSAGING_RETRY_ATTEMPTS = "3";
    process.env.MESSAGING_MAX_RETRY_DELAY_MS = "1";
    globalThis.fetch = (async (_input, init) => {
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      return new Response(JSON.stringify({ error: { code: "rate_limited" } }), { status: 429, headers: { "Retry-After": "120" } });
    }) as typeof fetch;
    const payload = { receiver: "fixture", title: "Fixture", items: ["Fixture"], digestType: "AI_NEWS" as const, digestDate: "2026-10-13" };
    for (const suffix of ["a", "b"]) {
      const result = await sendToTarget({ ...payload, idempotencyKey: "x".repeat(128) + suffix });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.retryAfterMs, 120000);
    }
    assert.equal(keys.length, 2);
    assert.ok(keys.every(key => key.length <= 128));
    assert.notEqual(keys[0], keys[1]);
  } finally { restoreEnvMap(previous); globalThis.fetch = originalFetch; }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function saveEnv(keys: string[]): Map<string, string | undefined> {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnvMap(values: Map<string, string | undefined>): void {
  for (const [key, value] of values) {
    restoreEnv(key, value);
  }
}
