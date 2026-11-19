import { test, expect } from "bun:test";
import { dashboardResponse } from "../src/lib/dashboard.js";
test("same-origin dashboard hosting distinguishes browser navigation from API, callbacks and retained media", async () => {
  const seen: string[] = [];
  const assets = {
    fetch: async (request: Request) => {
      seen.push(new URL(request.url).pathname);
      return new Response("<html>Dashboard</html>", {
        headers: { "Content-Type": "text/html" },
      });
    },
  } as unknown as Fetcher;
  for (const path of [
    "/",
    "/login",
    "/register",
    "/invite/token",
    "/settings",
    "/settings/team",
    "/projects",
    "/projects/blog",
    "/projects/blog/posts/post",
    "/projects/blog/analytics",
  ]) {
    const response = await dashboardResponse(
      new Request("https://pilot.example" + path, {
        headers: { Accept: "text/html" },
      }),
      assets,
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  }
  for (const path of [
    "/api/auth/verify-email",
    "/api/auth/get-session",
    "/public/blog/posts",
    "/billing/webhooks/polar",
    "/projects/blog/export",
    "/projects/blog/media/image/download",
    "/projects/blog/posts/post/preview",
  ]) {
    expect(
      await dashboardResponse(
        new Request("https://pilot.example" + path, {
          headers: { Accept: "text/html" },
        }),
        assets,
      ),
    ).toBeNull();
  }
  expect(
    await dashboardResponse(
      new Request("https://pilot.example/projects/blog", {
        headers: { Accept: "application/json" },
      }),
      assets,
    ),
  ).toBeNull();
  expect(
    await dashboardResponse(
      new Request("https://pilot.example/projects", {
        method: "POST",
        headers: { Accept: "text/html" },
      }),
      assets,
    ),
  ).toBeNull();
  expect(
    await dashboardResponse(
      new Request("https://pilot.example/assets/app.js"),
      assets,
    ),
  ).toBeInstanceOf(Response);
  expect(seen).toHaveLength(11);
});
