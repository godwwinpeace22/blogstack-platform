import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

const root = process.cwd();
const target = resolve(".launch/release-repository");
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const excluded = new Set(["node_modules", ".git", ".launch", "artifacts", "dist", "out", "build", ".next", ".open-next", ".output", ".astro", ".source", ".wrangler", ".turbo", ".cache", ".pnpm-store", "coverage", "playwright-report", "test-results", ".dev-state", ".local-api", ".local-cdn", ".self-hosted"]);
const files = [];
function allowed(name) {
  return !excluded.has(name) && ![".DS_Store", "Thumbs.db", ".npmrc", "launch.env"].includes(name) &&
    (!name.startsWith(".env") || name === ".env.example") &&
    (!name.startsWith(".dev.vars") || name === ".dev.vars.example") &&
    !/\.(?:log|tsbuildinfo|db|sqlite3?|pem|key|p12|pfx)$/.test(name);
}
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (!allowed(entry.name) || entry.isSymbolicLink()) continue;
    const child = path + "/" + entry.name;
    if (entry.isDirectory()) walk(child);
    else if (entry.isFile()) files.push(relative(root, child));
  }
}
for (const directory of [...manifest.workspaces, "docs", "scripts", ".github"]) walk(resolve(directory));
for (const file of [".gitignore", "README.md", "package.json", "package-lock.json", "launch.env.example", "API_HARDENING_ROADMAP.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md"]) if (existsSync(file)) files.push(file);
// Compare against known private server/test secrets without printing values.
const secrets = new Set();
function collect(value, key = "") {
  if (typeof value === "string" && /token|secret|api.?key|password|cookie/i.test(key) && value.length >= 20) secrets.add(value);
  else if (value && typeof value === "object") for (const [name, child] of Object.entries(value)) collect(child, name);
}
for (const file of readdirSync(".launch").filter(name => name.endsWith(".json"))) {
  try { collect(JSON.parse(readFileSync(".launch/" + file, "utf8"))); } catch { /* Configuration templates need not be JSON. */ }
}
for (const directory of manifest.workspaces) {
  const path = directory + "/.dev.vars";
  if (existsSync(path)) collect(parseEnv(readFileSync(path, "utf8")));
}
for (const file of files) {
  if (statSync(file).size > 5 * 1024 * 1024) throw new Error("Review unusually large source file: " + file);
  const bytes = readFileSync(file);
  if (!bytes.includes(0) && [...secrets].some(value => bytes.includes(value))) throw new Error("Private credential detected in " + file + " (value withheld)");
}
mkdirSync(target, { recursive: true, mode: 0o700 });
for (const file of files) {
  const destination = resolve(target, file);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  cpSync(file, destination);
}
if (!existsSync(target + "/.git")) {
  const result = spawnSync("git", ["init", "--initial-branch=main", target], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Could not initialize release checkout");
}
writeFileSync(".launch/release-source-manifest.json", JSON.stringify({ preparedAt: new Date().toISOString(), directory: target, files: files.sort(), privateSecretsChecked: secrets.size }, null, 2) + "\n", { mode: 0o600 });
console.log("Prepared " + files.length + " source files in " + target + ". Original repository metadata is unchanged; no existing files were deleted. Run this again to sync source edits before committing the release checkout.");
