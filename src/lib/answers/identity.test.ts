import assert from "node:assert/strict";
import test from "node:test";
import {
  batchResolveDirectoryPeople,
  DirectoryRequestError,
} from "../directory";

test("Directory failures defer long Retry-After without immediate retries", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("{}", {
      status: 429,
      headers: { "Retry-After": "120" },
    });
  }) as typeof fetch;
  try {
    await assert.rejects(
      batchResolveDirectoryPeople([{ type: "uid", value: "a00123" }]),
      (error) =>
        error instanceof DirectoryRequestError && error.retryAfterMs === 120000,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Directory preserves string employee numbers and checks result identity alignment", async () => {
  const originalFetch = globalThis.fetch;
  const input = { type: "uid" as const, value: "a00123" };
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            input,
            status: "found",
            user: {
              id: "stable-1",
              uid: input.value,
              name: "Fixture",
              employeeNo: "00123",
              newOptionalField: true,
            },
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const rows = await batchResolveDirectoryPeople([input]);
    assert.equal(rows[0].status, "found");
    if (rows[0].status === "found")
      assert.equal(rows[0].user.employeeNo, "00123");
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              input: { ...input, value: "another-person" },
              status: "not_found",
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    await assert.rejects(
      batchResolveDirectoryPeople([input]),
      /INVALID_DIRECTORY_RESPONSE/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
