import { generateFiles } from "fumadocs-openapi";

await generateFiles({
  input: "openapi/blogstack.yaml",
  output: "content/docs",
  per: "file",
  cwd: process.cwd(),
  name: () => "api-reference",
  includeDescription: true,
  imports: [{ names: ["APIPage"], from: "@/src/lib/openapi" }],
  frontmatter: () => ({
    title: "API Reference",
    description:
      "Advanced API reference generated from the official OpenAPI specification.",
  }),
});
