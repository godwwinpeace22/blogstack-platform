/** Optional same-origin dashboard hosting for a workers.dev pilot deployment. */
export async function dashboardResponse(
  request: Request,
  assets?: Fetcher,
): Promise<Response | null> {
  if (!assets || !["GET", "HEAD"].includes(request.method)) return null;
  const path = new URL(request.url).pathname;
  const page =
    /^\/(?:$|login\/?$|register\/?$|operations\/?$|forgot-password\/?$|reset-password\/?$|verify-email\/?$|invite\/[^/]+\/?$|settings(?:\/team)?\/?$|projects(?:\/[^/]+(?:\/(?:api-keys|members|analytics|links|agents|settings|posts\/[^/]+))?)?\/?$)/.test(
      path,
    );
  const asset =
    path.startsWith("/assets/") || /^\/favicon(?:\.[a-z]+)?$/.test(path);
  if (!asset && !(page && request.headers.get("accept")?.includes("text/html")))
    return null;
  const response = await assets.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  if (page) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}
