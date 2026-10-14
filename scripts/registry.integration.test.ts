import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

test("lockfile registry markers remain portable without changing pinned packages", async () => {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  for (const [path, pkg] of Object.entries(lock.packages) as [string, { resolved?: string; integrity?: string }][]) {
    if (!path || !pkg.resolved) continue;
    assert.ok(pkg.resolved.startsWith("https://registry.npmjs.org/"), `${path} uses a fixed custom download origin`);
    assert.ok(pkg.integrity, `${path} must retain its integrity hash`);
  }
});

test("npm ci downloads a canonical locked tarball from an authenticated internal registry path", {
  skip: !process.env.TEST_NPM_CLI_PATH,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "dailybits-registry-"));
  const packagePath = join(directory, "fixture-package");
  const applicationPath = join(directory, "application");
  const cliPath = process.env.TEST_NPM_CLI_PATH!;
  const paths: string[] = [];
  const authorizations: string[] = [];
  const server = createServer();
  async function npm(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
    return new Promise<string>((done, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args], { cwd, env });
      let stdout = "", stderr = "";
      child.stdout.on("data", data => stdout += data);
      child.stderr.on("data", data => stderr += data);
      child.on("error", reject);
      child.on("exit", code => code === 0 ? done(stdout) : reject(new Error(stderr)));
    });
  }
  try {
    await mkdir(packagePath); await mkdir(applicationPath);
    await writeFile(join(packagePath, "package.json"), JSON.stringify({ name: "dailybits-fixture", version: "1.0.0", main: "index.js" }));
    await writeFile(join(packagePath, "index.js"), "module.exports = 'fixture';\n");
    await npm(["pack", "--ignore-scripts", "--pack-destination", directory], packagePath);
    const tarball = await readFile(join(directory, "dailybits-fixture-1.0.0.tgz"));
    server.on("request", (req, res) => {
      paths.push(req.url!);
      authorizations.push(req.headers.authorization || "");
      if (req.url !== "/repository/npm-group/dailybits-fixture/-/dailybits-fixture-1.0.0.tgz") {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(tarball);
    });
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const registry = `http://127.0.0.1:${address.port}/repository/npm-group/`;
    const credentialsPath = join(directory, "fixture.npmrc");
    await writeFile(credentialsPath, `//127.0.0.1:${address.port}/repository/npm-group/:_authToken=fixture-token\n`);
    const manifest = { name: "fixture-app", version: "1.0.0", dependencies: { "dailybits-fixture": "1.0.0" } };
    const lock = {
      name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true,
      packages: {
        "": manifest,
        "node_modules/dailybits-fixture": {
          version: "1.0.0", resolved: "https://registry.npmjs.org/dailybits-fixture/-/dailybits-fixture-1.0.0.tgz",
          integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
        },
      },
    };
    await writeFile(join(applicationPath, "package.json"), JSON.stringify(manifest));
    await writeFile(join(applicationPath, "package-lock.json"), JSON.stringify(lock));
    await npm(["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--registry", registry, "--cache", join(directory, "cache")], applicationPath, {
      ...process.env, NPM_CONFIG_USERCONFIG: credentialsPath, NPM_CONFIG_REGISTRY: registry, npm_config_registry: registry,
      NPM_CONFIG_UPDATE_NOTIFIER: "false", npm_config_update_notifier: "false",
    });
    assert.deepEqual(paths, ["/repository/npm-group/dailybits-fixture/-/dailybits-fixture-1.0.0.tgz"]);
    assert.deepEqual(authorizations, ["Bearer fixture-token"]);
    assert.equal(await readFile(join(applicationPath, "node_modules/dailybits-fixture/index.js"), "utf8"), "module.exports = 'fixture';\n");
  } finally {
    await new Promise<void>(done => server.close(() => done()));
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true, force: true });
  }
});
