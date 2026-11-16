import assert from "node:assert/strict";
import test from "node:test";
import { buildMessagingCardRequest } from "./adapter";
import { formatPushTitle, validatePublicUrlConfiguration, withSubscriptionManagement } from "./subscription-management";

test("subscription URLs use only the configured public base and explicit target type", () => {
  const previous = process.env.APP_PUBLIC_URL;
  try {
    delete process.env.APP_PUBLIC_URL;
    const plain = { title: "测试题库" };
    assert.equal(withSubscriptionManagement(plain, "USER", "123"), plain);
    assert.equal(formatPushTitle(plain), plain.title);
    process.env.APP_PUBLIC_URL = " https://learning.example.test/dailybits/// ";
    assert.equal(withSubscriptionManagement(plain, "USER", "123").subscriptionManageUrl, "https://learning.example.test/dailybits/dashboard");
    assert.equal(withSubscriptionManagement(plain, "GROUP", "00123456").subscriptionManageUrl, "https://learning.example.test/dailybits/group/00123456?tab=subscriptions");
    assert.equal(withSubscriptionManagement({ ...plain, digestType: "AI_NEWS" }, "GROUP", "00123456").subscriptionManageUrl, "https://learning.example.test/dailybits/group/00123456?tab=digests");
    assert.throws(() => withSubscriptionManagement(plain, "GROUP", "../admin"), /Invalid subscription group ID/);
  } finally {
    if (previous === undefined) delete process.env.APP_PUBLIC_URL; else process.env.APP_PUBLIC_URL = previous;
  }
});

test("public website configuration rejects non-HTTP URLs, credentials and ambiguous base queries", () => {
  const previous = process.env.APP_PUBLIC_URL;
  try {
    for (const value of ["learning.example.test", "javascript:alert(1)", "ftp://files.test", "https://user:password@learning.test", "https://learning.test?token=secret", "https://learning.test/#fragment"]) {
      process.env.APP_PUBLIC_URL = value;
      assert.throws(validatePublicUrlConfiguration, /APP_PUBLIC_URL must be an absolute HTTP/);
    }
    process.env.APP_PUBLIC_URL = "http://localhost:3003/";
    assert.doesNotThrow(validatePublicUrlConfiguration);
  } finally {
    if (previous === undefined) delete process.env.APP_PUBLIC_URL; else process.env.APP_PUBLIC_URL = previous;
  }
});

test("management links render in every digest page and knowledge heading without mutating content", () => {
  const subscriptionManageUrl = "https://learning.example.test/group/00123456?tab=digests";
  const payload = { receiver: "00123456", title: "AI 新闻日报", items: ["第一页新闻", "第二页新闻"], digestType: "AI_NEWS" as const, digestDate: "2026-11-02", subscriptionManageUrl };
  const request = buildMessagingCardRequest(payload)!;
  assert.ok(Array.isArray(request.content));
  for (const page of request.content) assert.ok(page.startsWith(`## AI 新闻日报 -- [订阅管理](${subscriptionManageUrl})\n`));
  const knowledge = buildMessagingCardRequest({ receiver: "fixture-user", title: "知识卡片", items: ["知识原文"], knowledgeBankId: "bank-1", knowledgePointId: "point-1", subscriptionManageUrl: "https://learning.example.test/dashboard" })!;
  assert.equal(knowledge.content, "## 知识卡片 -- [订阅管理](https://learning.example.test/dashboard)\n\n知识原文");
  assert.equal(payload.title, "AI 新闻日报");
  assert.deepEqual(payload.items, ["第一页新闻", "第二页新闻"]);
  assert.equal(formatPushTitle({ title: "标题", subscriptionManageUrl: "https://learning.test/path(with-parentheses)/dashboard" }), "标题 -- [订阅管理](https://learning.test/path%28with-parentheses%29/dashboard)");
});
