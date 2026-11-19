import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "../blogstack-ui-react/src");
const pkg = JSON.parse(await readFile(resolve(source, "../package.json"), "utf8"));
const out = resolve(root, process.env.REGISTRY_OUTPUT ?? "public/r");
const base = (process.env.REGISTRY_BASE_URL ?? "https://blogstack-registry.hidden-silence-2d18.workers.dev/r").replace(/\/$/, "");
const homepage = new URL(base).origin;
const names = (await readdir(resolve(source, "components"))).filter(file => file.endsWith(".tsx")).sort();
/** @type {Record<string, any>[]} */
const items = [];
const templates = new Set(["blog", "blog-index", "blog-post"]);
const titles = { blog: "Complete blog", "blog-index": "Blog listing page", "blog-post": "Blog article page" };
const descriptions = {
  blog: "A complete drop-in blog with listing, article navigation, search, tags, pagination, and polished states.",
  "blog-index": "A complete routed blog listing with optional server-provided content, search, tags, and pagination.",
  "blog-post": "A complete routed article page with optional server-provided content, safe rendering, author details, and recovery states.",
};

for (const file of names) {
  const name = basename(file, ".tsx");
  const content = await readFile(resolve(source, "components", file), "utf8");
  const external = [...content.matchAll(/from ["']([^."'][^"']*)["']/g)].map(match => match[1] ?? "");
  const dependencies = [...new Set(external.filter(dep => dep !== "react").map(dep => `${dep}@${pkg.dependencies[dep]}`))];
  const local = [...content.matchAll(/from ["']\.\/([^"']+)\.js["']/g)].map(match => `${base}/${match[1]}.json`);
  const libraries = [...new Set([...content.matchAll(/from ["']\.\.\/lib\/([^"']+)\.js["']/g)].map(match => match[1]))];
  items.push({
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name, type: templates.has(name) ? "registry:block" : "registry:ui", categories: [templates.has(name) ? "templates" : "supporting components"], title: titles[/** @type {keyof typeof titles} */ (name)] ?? name.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
    description: descriptions[/** @type {keyof typeof descriptions} */ (name)] ?? `Editable BlogStack ${name} component for React and Tailwind CSS.`,
    dependencies,
    registryDependencies: [...local, ...libraries.map(lib => `${base}/${lib === "cn" ? "utils" : lib}.json`)],
    files: [{ path: `ui/${file}`, type: "registry:ui", content: content.replaceAll('../lib/cn.js', '@/lib/utils').replaceAll('../lib/blog-types.js', '@/lib/blog-types').replaceAll('../lib/blog-client.js', '@/lib/blog-client').replace(/from "\.\/([^"/]+)\.js"/g, 'from "@/components/ui/$1"') }],
  });
}

for (const lib of ["cn", "blog-types", "blog-client"]) {
  const name = lib === "cn" ? "utils" : lib;
  items.push({ $schema: "https://ui.shadcn.com/schema/registry-item.json", name, type: "registry:lib",
    dependencies: lib === "cn" ? [`clsx@${pkg.dependencies.clsx}`, `tailwind-merge@${pkg.dependencies["tailwind-merge"]}`] : [],
    registryDependencies: lib === "blog-client" ? [`${base}/blog-types.json`] : [],
    files: [{ path: `lib/${name}.ts`, type: "registry:lib", content: (await readFile(resolve(source, `lib/${lib}.ts`), "utf8")).replaceAll('./blog-types.js', '@/lib/blog-types') }],
  });
}
items.push({ $schema: "https://ui.shadcn.com/schema/registry-item.json", name: "theme", type: "registry:style",
  files: [{ path: "styles/blogstack.css", target: "styles/blogstack.css", type: "registry:file", content: (await readFile(resolve(source, "styles.css"), "utf8")).replace('@import "./theme.css";', await readFile(resolve(source, "theme.css"), "utf8")) }],
});
items.push({ $schema: "https://ui.shadcn.com/schema/registry-item.json", name: "all-primitives", type: "registry:block", registryDependencies: names.map(file => `${base}/${basename(file, ".tsx")}.json`) });
items.push({ $schema: "https://ui.shadcn.com/schema/registry-item.json", name: "all", type: "registry:block", title: "Complete blog", registryDependencies: [`${base}/blog.json`] });
await mkdir(out, { recursive: true });
for (const item of items) await writeFile(resolve(out, `${item.name}.json`), JSON.stringify(item, null, 2) + "\n");
await writeFile(resolve(out, "catalog.json"), JSON.stringify({ $schema: "https://ui.shadcn.com/schema/registry.json", name: "blogstack", homepage, items }, null, 2) + "\n");
console.log(`Built ${names.length} components and ${items.length - names.length} supporting entries in ${out}`);

await writeFile(resolve(out, "registry.json"), JSON.stringify({ $schema: "https://ui.shadcn.com/schema/registry.json", name: "blogstack", homepage, items: [...templates].map(name => items.find(item => item.name === name)) }, null, 2) + "\n");

// An explicit allowlist keeps local environments, build output and credentials
// out of the downloadable native-route starter.
const downloads = resolve(out, "../downloads");
await mkdir(downloads, { recursive: true });
execFileSync("tar", ["-czf", resolve(downloads, "blogstack-nextjs-0.2.0.tar.gz"), "-C", resolve(root, "../examples/nextjs"),
  "app", "components", "lib", "README.md", "package.json", "next.config.mjs", "postcss.config.mjs", "tsconfig.json", ".env.example", "next-env.d.ts"]);
console.log("Built the standalone Next.js starter from public source files");
