import { expect, test } from "bun:test";
import { buildSetupPrompt } from "../src/lib/setup";
test("setup prompt contains public configuration, safe installation and verification steps", () => {
  const prompt = buildSetupPrompt(
    "company-notes",
    "https://example.com/blog?token=private#fragment",
  );
  expect(prompt).toContain("BLOGSTACK_PROJECT_SLUG=company-notes");
  expect(prompt).toContain("SITE_URL=https://example.com");
  expect(prompt).not.toContain("token=private");
  expect(prompt).not.toContain("#fragment");
  expect(prompt).toContain("Never request");
  expect(prompt).toContain("Do not create external accounts");
  expect(prompt).toContain("Next.js App Router");
});
test("setup prompt rejects values that cannot be safe public project configuration", () => {
  for (const slug of ["My Blog", "x; run command", "../project", "x\nBAD=1"]) {
    expect(() => buildSetupPrompt(slug, "https://example.com")).toThrow();
  }
  for (const url of [
    "javascript:alert(1)",
    "file:///private",
    "https://user:secret@example.com",
  ]) {
    expect(() => buildSetupPrompt("my-blog", url)).toThrow();
  }
});
