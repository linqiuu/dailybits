import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server, type RequestListener } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect, type Socket } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import OpenAI from "openai";
import { OutboundHttpClient, internalFetch } from "./outbound";
import { certificate, privateKey } from "./test-tls-fixture";

async function listen(server: Server): Promise<number> {
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}

async function fixture(secure = false, customHandler?: RequestListener) {
  const originHeaders: string[] = [];
  const handler: RequestListener = (req, res) => {
    originHeaders.push(req.headers["proxy-authorization"]?.toString() || "");
    if (customHandler) { customHandler(req, res); return; }
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: `http://127.0.0.1:${originPort}/ok` });
      res.end();
    } else if (req.url !== "/slow") {
      res.writeHead(req.url === "/rate-limit" ? 429 : 200, { "Retry-After": "12" });
      res.end("fixture");
    }
  };
  const origin = secure ? createHttpsServer({ cert: certificate, key: privateKey }, handler) : createServer(handler);
  const originPort = await listen(origin);
  const tunnels: { target: string; authorization: string }[] = [];
  const sockets = new Set<Socket>();
  const proxy = createServer((_req, res) => { res.writeHead(500); res.end(); });
  proxy.on("connect", (req, socket, head) => {
    tunnels.push({ target: req.url!, authorization: req.headers["proxy-authorization"] || "" });
    const upstream = connect(originPort, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    sockets.add(upstream);
    socket.on("error", () => upstream.destroy());
    upstream.on("error", () => socket.destroy());
    socket.on("close", () => upstream.destroy());
  });
  for (const server of [origin, proxy]) server.on("connection", socket => sockets.add(socket));
  const proxyPort = await listen(proxy);
  return {
    originPort, tunnels, originHeaders, proxyUrl: `http://127.0.0.1:${proxyPort}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([origin, proxy].map(server => new Promise<void>(done => server.close(() => done()))));
    },
  };
}

test("HTTP proxy forwards external traffic, authenticates only to the proxy and preserves HTTP errors", async () => {
  const f = await fixture();
  const client = new OutboundHttpClient({ OUTBOUND_PROXY_URL: f.proxyUrl.replace("http://", "http://fixture-user:fixture%3Apass@") });
  try {
    const response = await client.fetch("http://external.test/rate-limit");
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "12");
    assert.equal(await response.text(), "fixture");
    assert.deepEqual(f.tunnels, [{ target: "external.test:80", authorization: `Basic ${Buffer.from("fixture-user:fixture:pass").toString("base64")}` }]);
    assert.deepEqual(f.originHeaders, [""]);
  } finally { await client.close(); await f.close(); }
});

test("direct defaults and internal requests/redirects bypass a configured proxy", async () => {
  const f = await fixture();
  const direct = new OutboundHttpClient({});
  const proxied = new OutboundHttpClient({ HTTP_PROXY: f.proxyUrl });
  const previous = getGlobalDispatcher();
  const globalProxy = new ProxyAgent("http://127.0.0.1:1");
  try {
    assert.equal(await (await direct.fetch(`http://127.0.0.1:${f.originPort}/ok`)).text(), "fixture");
    assert.equal(await (await proxied.fetch(`http://127.0.0.1:${f.originPort}/ok`)).text(), "fixture");
    assert.equal(f.tunnels.length, 0);
    assert.equal(await (await proxied.fetch("http://external.test/redirect")).text(), "fixture");
    assert.equal(f.tunnels.length, 1, "redirect to internal host is direct");
    setGlobalDispatcher(globalProxy);
    assert.equal(await (await internalFetch(`http://127.0.0.1:${f.originPort}/ok`)).text(), "fixture");
    assert.equal(f.tunnels.length, 1, "internal fetch ignores host global proxy");
  } finally {
    setGlobalDispatcher(previous);
    await globalProxy.close(); await direct.close(); await proxied.close(); await f.close();
  }
});

test("OpenAI compatible SDK sends POST bodies through the same proxy without changing its own timeout", async () => {
  let body = "";
  const f = await fixture(false, (req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/chat/completions");
    req.on("data", data => body += data);
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "fixture" } }] }));
    });
  });
  const transport = new OutboundHttpClient({ OUTBOUND_PROXY_URL: f.proxyUrl, OUTBOUND_HTTP_TIMEOUT_MS: "1" });
  const sdk = new OpenAI({ apiKey: "fixture-key", baseURL: "http://external.test/v1", fetch: transport.fetch, timeout: 5000, maxRetries: 0 });
  try {
    const result = await sdk.chat.completions.create({ model: "fixture-model", messages: [{ role: "user", content: "fixture" }] });
    assert.equal(result.choices[0].message.content, "fixture");
    assert.equal(JSON.parse(body).model, "fixture-model");
    assert.equal(f.tunnels.length, 1);
    assert.deepEqual(f.originHeaders, [""]);
  } finally { await transport.close(); await f.close(); }
});

test("NO_PROXY supports domains, ports and wildcard; configured internal service names are always direct", async () => {
  const f = await fixture();
  try {
    for (const env of [
      { NO_PROXY: ".test" }, { NO_PROXY: "external.test:80" }, { NO_PROXY: "*" },
      { no_proxy: "external.test", NO_PROXY: "unrelated.test" },
      { CARD_SERVICE_API_BASE: "http://external.test:9000" },
    ]) {
      const client = new OutboundHttpClient({ OUTBOUND_PROXY_URL: f.proxyUrl, OUTBOUND_HTTP_TIMEOUT_MS: "1000", ...env });
      try { await assert.rejects(client.fetch("http://external.test/ok")); }
      finally { await client.close(); }
      assert.equal(f.tunnels.length, 0, "DNS-unresolvable fixture must not reach proxy when bypassed");
    }
    const client = new OutboundHttpClient({ http_proxy: f.proxyUrl, HTTP_PROXY: "http://127.0.0.1:1", NO_PROXY: "external.test:81" });
    try { assert.equal(await (await client.fetch("http://external.test/ok")).text(), "fixture"); }
    finally { await client.close(); }
    assert.equal(f.tunnels.length, 1, "nonmatching port does not bypass and lowercase proxy wins");
  } finally { await f.close(); }
});

test("failed proxies do not silently fall back or leak credentials; aborts and deadlines are preserved", async () => {
  assert.throws(() => new OutboundHttpClient({ OUTBOUND_PROXY_URL: "socks5://fixture-user:secret@localhost:1080" }), error => {
    assert.doesNotMatch(String(error), /fixture-user|secret/);
    return true;
  });
  const failed = new OutboundHttpClient({ OUTBOUND_PROXY_URL: "http://fixture-user:secret@127.0.0.1:1" });
  try {
    await assert.rejects(failed.fetch("http://external.test"), error => {
      assert.doesNotMatch(String(error), /fixture-user|secret/);
      assert.equal((error as Error).cause, undefined);
      return true;
    });
  } finally { await failed.close(); }
  const f = await fixture();
  const timeout = new OutboundHttpClient({ OUTBOUND_PROXY_URL: f.proxyUrl, OUTBOUND_HTTP_TIMEOUT_MS: "50" });
  try {
    await assert.rejects(timeout.fetch("http://external.test/slow"), { name: "TimeoutError" });
    await assert.rejects(timeout.fetch("http://external.test/ok", { signal: AbortSignal.abort() }), { name: "AbortError" });
  } finally { await timeout.close(); await f.close(); }
});

test("HTTPS CONNECT works with a trusted private CA without disabling certificate verification", async () => {
  const f = await fixture(true);
  const directory = await mkdtemp(join(tmpdir(), "dailybits-proxy-ca-"));
  const caPath = join(directory, "ca.pem");
  await writeFile(caPath, certificate);
  const moduleUrl = pathToFileURL(join(process.cwd(), "src/lib/http/outbound.ts")).href;
  const script = `const module = await import(${JSON.stringify(moduleUrl)});
    const { OutboundHttpClient } = module.default ?? module;
    const client = new OutboundHttpClient();
    try { console.log(await (await client.fetch('https://external.test/ok')).text()); }
    finally { await client.close(); }`;
  try {
    const output = await new Promise<string>((done, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
        env: { ...process.env, OUTBOUND_PROXY_URL: "", http_proxy: "", HTTP_PROXY: "", https_proxy: "", HTTPS_PROXY: f.proxyUrl, NO_PROXY: "", no_proxy: "", NODE_EXTRA_CA_CERTS: caPath },
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", data => stdout += data);
      child.stderr.on("data", data => stderr += data);
      child.on("error", reject);
      child.on("exit", code => code === 0 ? done(stdout) : reject(new Error(stderr)));
    });
    assert.equal(output.trim(), "fixture");
    assert.equal(f.tunnels[0].target, "external.test:443");
  } finally {
    await f.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true });
  }
});
