import { test, expect } from "bun:test";
import { checkUrl, publicAddress } from "../src/index.js";
test("DNS checks use Workers-supported redirects and refuse redirected DNS answers", async () => {
  let websiteRequests = 0;
  const runtimeFetch = async (input: string, init?: RequestInit) => {
    // Workers throws before making any request for redirect:error.
    if (init?.redirect === "error")
      throw new TypeError("Unsupported redirect mode");
    if (input.includes("dns-query")) {
      return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    }
    websiteRequests++;
    return new Response(null, { status: 200 });
  };
  expect(
    (await checkUrl("https://example.com", runtimeFetch as typeof fetch))
      .status,
  ).toBe("healthy");
  expect(websiteRequests).toBe(1);
  const redirectedDns = async (_input: string, init?: RequestInit) => {
    expect(init?.redirect).toBe("manual");
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/" },
    });
  };
  expect(
    (await checkUrl("https://example.com", redirectedDns as typeof fetch))
      .status,
  ).toBe("inconclusive");
});
test("private, obfuscated, metadata, mapped IPv6 and non-HTTP destinations never reach a website", async () => {
  for (const url of [
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://10.0.0.1",
    "http://169.254.169.254",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "https://example.com:8443",
    "file:///etc/passwd",
    "https://user:password@example.com",
    "http://localhost",
    "http://metadata.google.internal",
  ]) {
    let called = false;
    const result = await checkUrl(url, (async () => {
      called = true;
      throw new Error("Unexpected request");
    }) as any);
    expect(result.status).toBe("unsafe");
    expect(called).toBe(false);
  }
  expect(publicAddress("8.8.8.8")).toBe(true);
  expect(publicAddress("2606:4700:4700::1111")).toBe(true);
});
test("mixed public/private DNS and private redirects are refused at each hop", async () => {
  let web = 0;
  const mixed = async (input: string) =>
    input.includes("dns-query")
      ? Response.json({
          Answer: [
            { type: 1, data: "93.184.216.34" },
            { type: 1, data: "192.168.0.2" },
          ],
        })
      : (web++, new Response(null));
  expect((await checkUrl("https://example.com", mixed as any)).status).toBe(
    "unsafe",
  );
  expect(web).toBe(0);
  const redirect = async (input: string) =>
    input.includes("dns-query")
      ? Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] })
      : (web++,
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        }));
  expect((await checkUrl("https://example.com", redirect as any)).status).toBe(
    "unsafe",
  );
  expect(web).toBe(1);
});
test("blocked requests and timeouts are inconclusive; redirects and missing pages stay distinct", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    const result = await checkUrl(
      "https://93.184.216.34",
      (async () => new Response(null, { status })) as any,
    );
    expect(result.status).toBe("inconclusive");
  }
  expect(
    (
      await checkUrl("https://93.184.216.34", (async () => {
        throw new Error("Timeout");
      }) as any)
    ).status,
  ).toBe("inconclusive");
  expect(
    (
      await checkUrl(
        "https://93.184.216.34",
        (async () => new Response(null, { status: 404 })) as any,
      )
    ).status,
  ).toBe("broken");
  let calls = 0;
  const result = await checkUrl("https://93.184.216.34", (async () =>
    ++calls === 1
      ? new Response(null, { status: 301, headers: { location: "/new" } })
      : new Response(null, { status: 200 })) as any);
  expect(result.status).toBe("redirected");
  expect(result.finalUrl).toBe("https://93.184.216.34/new");
});
