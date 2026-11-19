export interface LinkResult {
  status: "healthy" | "broken" | "redirected" | "inconclusive" | "unsafe";
  httpStatus: number | null;
  finalUrl: string | null;
}
function blockedHost(host: string): boolean {
  const value = host.toLowerCase().replace(/\.$/, "");
  return (
    !value ||
    value === "localhost" ||
    value === "metadata.google.internal" ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    value.endsWith(".internal") ||
    value.endsWith(".invalid") ||
    !value.includes(".")
  );
}
export function publicAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.includes(":")) {
    // Only global-unicast IPv6; exclude IPv4-mapped, NAT64, ULA, link-local,
    // loopback, documentation and multicast address families.
    return (
      /^[23][0-9a-f]{0,3}:/.test(host) &&
      !host.startsWith("2001:db8:") &&
      !host.startsWith("2001:0:") &&
      !host.startsWith("2002:")
    );
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const p = host.split(".").map(Number);
  if (p.some((n) => n > 255)) return false;
  const [a, b] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    (a === 100 && b! >= 64 && b! <= 127)
  );
}
async function allowed(url: URL, request: typeof fetch): Promise<boolean> {
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return false;
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
    return false;
  const host = url.hostname.replace(/\.$/, "");
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return publicAddress(host);
  if (blockedHost(host)) return false;
  const answers = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const response = await request(
        "https://cloudflare-dns.com/dns-query?name=" +
          encodeURIComponent(host) +
          "&type=" +
          type,
        {
          headers: { Accept: "application/dns-json" },
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) throw new Error("DNS unavailable");
      return response.json() as Promise<{
        Answer?: { type: number; data: string }[];
      }>;
    }),
  );
  let found = false;
  for (const record of answers.flatMap((a) => a.Answer ?? [])) {
    if (record.type === 5 && blockedHost(record.data)) return false;
    if (record.type === 1 || record.type === 28) {
      found = true;
      if (!publicAddress(record.data)) return false;
    }
  }
  return found;
}
export async function checkUrl(
  value: string,
  request: typeof fetch = fetch,
): Promise<LinkResult> {
  const unknown: LinkResult = {
    status: "inconclusive",
    httpStatus: null,
    finalUrl: null,
  };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ...unknown, status: "unsafe" };
  }
  let redirected = false;
  let phase = "dns";
  try {
    for (let hop = 0; hop <= 3; hop++) {
      phase = "dns";
      if (!(await allowed(url, request)))
        return { ...unknown, status: "unsafe" };
      phase = "head";
      let response = await request(url.href, {
        method: "HEAD",
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": "BlogStack-LinkChecker/1.0",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 405 || response.status === 501) {
        await response.body?.cancel();
        phase = "get";
        response = await request(url.href, {
          method: "GET",
          redirect: "manual",
          headers: {
            Range: "bytes=0-1023",
            Accept: "text/html",
            "User-Agent": "BlogStack-LinkChecker/1.0",
          },
          signal: AbortSignal.timeout(8000),
        });
      }
      const status = response.status,
        location = response.headers.get("location");
      // Never buffer a remote response body.
      await response.body?.cancel();
      if (status >= 300 && status < 400 && location) {
        if (hop === 3)
          return { ...unknown, httpStatus: status, finalUrl: url.href };
        url = new URL(location, url);
        redirected = true;
        continue;
      }
      const state =
        status >= 200 && status < 300
          ? redirected
            ? "redirected"
            : "healthy"
          : [404, 410].includes(status)
            ? "broken"
            : "inconclusive";
      return { status: state, httpStatus: status, finalUrl: url.href };
    }
  } catch (error) {
    // Do not log article URLs, query parameters or response bodies.
    console.warn("Link scanner request failed", {
      phase,
      name: error instanceof Error ? error.name : "UnknownError",
      message:
        error instanceof Error
          ? error.message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 160)
          : "Request failed",
    });
    /* Rate limits, firewalls, DNS failures and timeouts are inconclusive. */
  }
  return unknown;
}
export default {
  async fetch(request: Request) {
    if (request.method !== "POST")
      return new Response("Not found", { status: 404 });
    const body = await request.text();
    if (body.length > 4096) return new Response(null, { status: 413 });
    try {
      const data = JSON.parse(body);
      if (typeof data.url !== "string")
        return new Response(null, { status: 400 });
      return Response.json(await checkUrl(data.url));
    } catch {
      return new Response(null, { status: 400 });
    }
  },
};
