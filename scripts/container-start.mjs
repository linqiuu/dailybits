import { spawn } from "node:child_process";

export function containerDatabaseUrl(env) {
  if (env.DOCKER_DATABASE_URL?.trim()) return env.DOCKER_DATABASE_URL.trim();
  if (!env.POSTGRES_PASSWORD) throw new Error("POSTGRES_PASSWORD is required");
  const url = new URL("postgresql://db:5432");
  url.username = env.POSTGRES_USER || "postgres";
  url.password = env.POSTGRES_PASSWORD;
  url.pathname = `/${env.POSTGRES_DB || "dailybits"}`;
  url.searchParams.set("schema", "public");
  return url.toString();
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/container-start.mjs")) {
  const mode = process.argv[2];
  const commands = {
    web: ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"],
    migrate: ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    scheduler: ["--import", "tsx", "src/scheduler/index.ts"],
  };
  if (!commands[mode]) throw new Error("Expected web, migrate or scheduler");
  const child = spawn(process.execPath, commands[mode], { stdio: "inherit", env: { ...process.env, DATABASE_URL: containerDatabaseUrl(process.env) } });
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.on("SIGINT", () => child.kill("SIGINT"));
  child.on("exit", (code) => process.exit(code ?? 1));
}
