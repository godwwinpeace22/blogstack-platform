import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const [service, ...args] = process.argv.slice(2);
const settings = JSON.parse(readFileSync(".launch/settings.json", "utf8"));
if (existsSync("launch.env")) process.loadEnvFile("launch.env");
const env = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: settings.accountId,
  NPM_CONFIG_USERCONFIG: resolve(".launch/npmrc"),
};
if (service === "check" && existsSync(".launch/secrets.json"))
  Object.assign(env, JSON.parse(readFileSync(".launch/secrets.json", "utf8")));
if (settings.cloudflareAuth === "oauth") delete env.CLOUDFLARE_API_TOKEN;
let command, parameters;
if (service === "cloudflare") {
  command = process.execPath;
  parameters = ["node_modules/wrangler/bin/wrangler.js", ...args];
} else if (service === "npm") {
  command = "npm";
  parameters = args;
} else if (service === "polar") {
  command = process.execPath;
  parameters = ["scripts/polar-products.mjs", ...args];
} else if (service === "check") {
  command = process.execPath;
  parameters = ["scripts/check-launch.mjs", ...args];
} else if (["backup", "operations"].includes(service)) {
  command = process.execPath;
  parameters = ["scripts/" + service + ".mjs", ...args];
} else
  throw new Error(
    "Usage: node scripts/launch.mjs cloudflare|npm|polar|check|backup|operations ...arguments",
  );
const result = spawnSync(command, parameters, { stdio: "inherit", env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
