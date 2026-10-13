import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

function testsIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : testsIn(path);
    return entry.name.endsWith(".test.ts") ? [path] : [];
  });
}
const child = spawn(process.execPath, ["--import", "tsx", "--test", ...testsIn("src"), ...testsIn("scripts")], { stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 1));
