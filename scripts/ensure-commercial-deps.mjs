import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(
  new URL("../commercial-dashboard/node_modules/@angular/cli/bin/ng.js", import.meta.url),
);

try {
  await access(cli);
} catch {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npm,
    ["ci", "--prefix", "commercial-dashboard", "--no-audit", "--no-fund"],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
