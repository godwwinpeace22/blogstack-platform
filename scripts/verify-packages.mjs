import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const root = process.cwd(),
  out = resolve("artifacts/packages");
const published = process.argv.includes("--published");
mkdirSync(out, { recursive: true });
function run(command, args, cwd = root) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(command + " " + args.join(" ") + " failed");
  }
  return r.stdout;
}
const archives = {};
for (const workspace of [
  "blogstack-core",
  "blogstack-sdk-js",
  "blogstack-ui-react",
  "blogstack-editor",
]) {
  const packed = JSON.parse(
    run("npm", ["pack", "./" + workspace, "--pack-destination", out, "--json"]),
  );
  archives[packed[0].name] = join(out, packed[0].filename);
}
const temp = mkdtempSync(join(tmpdir(), "blogstack-install-"));
cpSync("examples/nextjs", temp, {
  recursive: true,
  filter: (source) =>
    !source.includes("/node_modules") &&
    !source.includes("/.next") &&
    !source.endsWith(".env.local"),
});
const manifest = JSON.parse(readFileSync(join(temp, "package.json"), "utf8"));
for (const [name, path] of Object.entries(archives))
  manifest.dependencies[name] = published ? "0.2.0" : "file:" + path;
writeFileSync(join(temp, "package.json"), JSON.stringify(manifest, null, 2));
writeFileSync(
  join(temp, "sdk-contract.tsx"),
  'import { BlogStackClient } from "@blogstack/sdk";\nimport { usePosts } from "@blogstack/sdk/react";\nexport function HookContract(){return usePosts(new BlogStackClient(),"project").isLoading?null:null;}\n',
);
console.log(
  "Installing " + (published ? "public npm releases" : "local tarballs") + " in a clean temporary Next.js application...",
);
run(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--cache",
    "/private/tmp/blogstack-npm-cache",
    "--no-audit",
    "--no-fund",
  ],
  temp,
);
run(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    'import {BlogStackClient} from "@blogstack/sdk";import {createBlogClient} from "@blogstack/ui/client";if(!new BlogStackClient().public||!createBlogClient({projectSlug:"test"}))throw new Error("ESM export failed");',
  ],
  temp,
);
run(
  process.execPath,
  [
    "-e",
    'const {BlogStackClient}=require("@blogstack/sdk");if(!new BlogStackClient().public)throw new Error("CJS export failed");',
  ],
  temp,
);
const build = run("npm", ["run", "build"], temp);
writeFileSync(join(out, published ? "published-install-build.log" : "clean-install-build.log"), build);
writeFileSync(
  join(out, published ? "published-verification.json" : "verification.json"),
  JSON.stringify(
    {
      archives,
      source: published ? "public npm registry" : "local tarballs",
      verifiedAt: new Date().toISOString(),
      checks: [
        "isolated npm install",
        "SDK ESM/CJS",
        "UI public client",
        "React hook type identity",
        "Next.js production build",
      ],
    },
    null,
    2,
  ),
);
rmSync(temp, { recursive: true, force: true });
console.log(
  "PASS: packed core, SDK, UI and editor install; SDK ESM/CJS, shared React types and a clean Next.js production build.",
);
