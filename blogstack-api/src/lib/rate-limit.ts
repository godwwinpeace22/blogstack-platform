/** Short-lived limiter identity; raw network addresses never become stored keys. */
export async function rateLimitKey(
  secret: string,
  scope: string,
  address: string,
): Promise<string> {
  const day = Math.floor(Date.now() / 86400000);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret + ":" + day + ":" + scope + ":" + address),
  );
  return (
    scope +
    ":" +
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
  );
}
