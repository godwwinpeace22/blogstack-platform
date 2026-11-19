import { spawnSync } from "node:child_process";
import { mkdirSync, chmodSync } from "node:fs";
const local = process.argv.includes("--local");
const configIndex = process.argv.indexOf("--config");
const outputIndex = process.argv.indexOf("--output");
const stamp = new Date().toISOString().replaceAll(":", "-"),
  output =
    outputIndex < 0
      ? "artifacts/backups/blogstack-" + stamp + ".sql"
      : process.argv[outputIndex + 1];
const config =
  configIndex < 0
    ? local
      ? ".local-api/wrangler.toml"
      : "blogstack-api/wrangler.toml"
    : process.argv[configIndex + 1];
if (!output || !config)
  throw new Error("A config/output flag requires its path");
mkdirSync("artifacts/backups", { recursive: true });
const args = [
  "d1",
  "export",
  "MAIN_DB",
  local ? "--local" : "--remote",
  "--config",
  config,
  "--output",
  output,
];
const result = spawnSync(
  process.execPath,
  ["node_modules/wrangler/bin/wrangler.js", ...args],
  { encoding: "utf8", env: process.env, maxBuffer: 10 * 1024 * 1024 },
);
// Wrangler includes a temporary signed download URL; the private local copy is sufficient.
const logOutput = ((result.stdout ?? "") + (result.stderr ?? "")).replace(
  /https:\/\/\S+[?&]X-Amz-\S+/g,
  "[temporary backup download URL hidden]",
);
process.stdout.write(logOutput);
if (result.status !== 0) process.exit(result.status ?? 1);
chmodSync(output, 0o600);
if (local) {
  const verify = spawnSync("python3", ["scripts/verify-restore.py", output], {
    stdio: "inherit",
    env: process.env,
  });
  if (verify.status !== 0) process.exit(verify.status ?? 1);
}
console.log(
  "Backup created. Encrypt and copy it to independently controlled storage; see docs/RESTORE.md.",
);
