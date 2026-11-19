import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || ".");
const files = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  cwd: root,
})
  .split("\0")
  .filter(Boolean);
const errors = [];
const privatePath =
  /(?:^|\/)(?:\.launch|artifacts|node_modules|\.wrangler|\.dev-state|\.local-api|\.local-cdn)(?:\/|$)|(?:^|\/)(?:launch\.env|\.npmrc|\.dev\.vars(?:\..+)?|\.env(?:\..+)?)$/;
const credential =
  /(?:gh[pousr]_|github_pat_|npm_|cfat_)[A-Za-z0-9_-]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b/;
for (const path of files) {
  if (
    privatePath.test(path) &&
    !/(?:^|\/)(?:\.env\.example|\.dev\.vars\.example|launch\.env\.example)$/.test(
      path,
    )
  )
    errors.push(path + ": private/generated path");
  const stat = statSync(resolve(root, path));
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024) continue;
  const content = readFileSync(resolve(root, path));
  if (!content.includes(0) && credential.test(content.toString("utf8")))
    errors.push(path + ": credential-shaped content (value withheld)");
}
if (!files.length) throw new Error("No tracked source files were checked");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "PASS: " +
      files.length +
      " tracked files contain no private paths or recognized credential values",
  );
