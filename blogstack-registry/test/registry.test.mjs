import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test("every component ships source, resolvable dependencies, and editable aliases", async () => {
  execFileSync(process.execPath, ["src/build.mjs"]);
  const registry = JSON.parse(await readFile("public/r/catalog.json", "utf8"));
  const names = new Set(registry.items.map(item => item.name));
  const components = (await readdir("../blogstack-ui-react/src/components")).filter(file => file.endsWith(".tsx"));
  assert.equal(registry.items.filter(item => item.files?.some(file => file.type === "registry:ui")).length, components.length);
  for (const item of registry.items) {
    assert.equal(item.$schema, "https://ui.shadcn.com/schema/registry-item.json");
    for (const dependency of item.registryDependencies ?? []) assert.ok(names.has(new URL(dependency).pathname.split("/").pop().replace(/\.json$/, "")), dependency);
    for (const dependency of item.dependencies ?? []) assert.ok(!dependency.includes("undefined"), dependency);
    for (const file of item.files ?? []) {
      assert.ok(file.content.length > 0);
      assert.ok(!file.content.includes('../lib/cn.js'));
      assert.ok(!file.content.includes('@blogstack/ui'));
      assert.ok(!file.content.includes('@blogstack/sdk'));
      for (const match of file.content.matchAll(/from "@\/components\/ui\/([^"]+)"/g)) assert.ok(item.registryDependencies.includes(`https://blogstack-registry.hidden-silence-2d18.workers.dev/r/${match[1]}.json`));
    }
  }
  assert.equal(registry.items.find(item => item.name === "all-primitives").registryDependencies.length, components.length);
});

test("the public catalog leads with the complete blog, then routed templates", async () => { const registry = JSON.parse(await readFile("public/r/registry.json", "utf8")); assert.deepEqual(registry.items.map(item => item.name), ["blog", "blog-index", "blog-post"]); });
