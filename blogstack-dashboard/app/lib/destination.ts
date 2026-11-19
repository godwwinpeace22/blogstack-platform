export function safeDestination(
  value: string | undefined,
  fallback = "/projects",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin
      ? url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}
