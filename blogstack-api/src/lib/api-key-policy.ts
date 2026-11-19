export const API_KEY_SCOPES = [
  "posts:read",
  "posts:write",
  "media:read",
  "media:write",
  "tags:read",
  "tags:write",
  "projects:read",
  "seo:read",
  "links:read",
  "links:write",
  "analytics:read",
  "agent-runs:read",
  "agent-runs:write",
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
export function permitsApiKey(
  key: { projectId: string; scopes: string[] },
  projectId: string | undefined,
  resource: string,
  method: string,
): boolean {
  if (!projectId || key.projectId !== projectId) return false;
  const action = method === "GET" || method === "HEAD" ? "read" : "write";
  return (
    key.scopes.includes(`${resource}:${action}`) &&
    (API_KEY_SCOPES as readonly string[]).includes(`${resource}:${action}`)
  );
}
