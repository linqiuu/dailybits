import assert from "node:assert/strict";
import test from "node:test";
// The deployment entry point runs as JavaScript before application startup.
import { containerDatabaseUrl } from "./container-start.mjs";

test("container database settings stay in sync and encode reserved password characters", () => {
  const url = new URL(containerDatabaseUrl({ POSTGRES_PASSWORD: "fixture@:/?pass", POSTGRES_USER: "owner", POSTGRES_DB: "learning" }));
  assert.equal(url.hostname, "db");
  assert.equal(decodeURIComponent(url.password), "fixture@:/?pass");
  assert.equal(url.pathname, "/learning");
  assert.equal(containerDatabaseUrl({ DOCKER_DATABASE_URL: "postgresql://custom/db" }), "postgresql://custom/db");
  assert.throws(() => containerDatabaseUrl({}), /POSTGRES_PASSWORD/);
});
