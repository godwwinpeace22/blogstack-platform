import { randomBytes } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
mkdirSync(".local-api", { recursive: true });
mkdirSync(".local-cdn", { recursive: true });
const secretPath = ".local-api/.dev.vars";
const existing = existsSync(secretPath)
  ? readFileSync(secretPath, "utf8")
  : null;
const secret =
  existing?.match(/^CDN_SECRET=(.+)$/m)?.[1] || randomBytes(32).toString("hex");
if (!existing)
  writeFileSync(
    secretPath,
    "BETTER_AUTH_SECRET=" +
      randomBytes(32).toString("hex") +
      "\nCDN_SECRET=" +
      secret +
      "\n",
    { mode: 0o600 },
  );
writeFileSync(".local-cdn/.dev.vars", "CDN_SECRET=" + secret + "\n", {
  mode: 0o600,
});
for (const [name, source] of [
  ["api", "blogstack-api"],
  ["cdn", "blogstack-cdn-worker"],
]) {
  const config = readFileSync(source + "/wrangler.local.toml", "utf8")
    .replace('main = "src/index.ts"', 'main = "../' + source + '/src/index.ts"')
    .replace(
      'migrations_dir = "migrations"',
      'migrations_dir = "../blogstack-api/migrations"',
    );
  writeFileSync(".local-" + name + "/wrangler.toml", config);
  mkdirSync(".local-" + name + "/.wrangler", { recursive: true });
  if (!existsSync(".local-" + name + "/.wrangler/state"))
    symlinkSync(
      "../../.dev-state",
      ".local-" + name + "/.wrangler/state",
      "dir",
    );
}
console.log(
  "Isolated local API/media configuration is ready. Existing .dev.vars files were not loaded or changed.",
);
