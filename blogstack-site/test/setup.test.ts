import { expect, test } from "bun:test";
import { buildSetupPrompt } from "../src/lib/setup";
import { APP_URL } from "../src/lib/site";
test("setup prompt contains public configuration, safe installation and verification steps", () => {
  const prompt = buildSetupPrompt(
    "company-notes",
    "https://example.com/blog?token=private#fragment",
  );
  expect(prompt).toContain("BLOGSTACK_PROJECT_SLUG=company-notes");
  expect(prompt).toContain("SITE_URL=https://example.com");
  expect(prompt).toContain("BLOGSTACK_API_URL=" + new URL(APP_URL).origin);
  expect(prompt).not.toContain("token=private");
  expect(prompt).not.toContain("#fragment");
  expect(prompt).toContain("Never request");
  expect(prompt).toContain("Do not create external accounts");
  expect(prompt).toContain("Next.js App Router");
});

test("the setup prompt uses a supplied publishing origin for cloud and local installations", () => {
  for (const origin of [
    "https://publish.example.com",
    "http://localhost:8787",
    "http://[::1]:8787",
  ]) {
    const prompt = buildSetupPrompt(
      "my-blog",
      "https://example.com",
      origin + "/",
    );
    expect(prompt).toContain("BLOGSTACK_API_URL=" + origin + " and SITE_URL=");
    expect(prompt).not.toContain(
      "BLOGSTACK_API_URL=" + new URL(APP_URL).origin,
    );
  }
  for (const value of [
    "http://publish.example.com",
    "https://publish.example.com/projects",
    "https://publish.example.com?token=private",
    "https://publish.example.com#private",
    "https://user:secret@publish.example.com",
  ]) {
    expect(() =>
      buildSetupPrompt("my-blog", "https://example.com", value),
    ).toThrow();
  }
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
