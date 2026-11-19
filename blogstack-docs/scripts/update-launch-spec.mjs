import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
const path = new URL("../openapi/blogstack.yaml", import.meta.url),
  spec = YAML.parse(readFileSync(path, "utf8")),
  s = spec.components.schemas;
const ref = (name) => ({ $ref: "#/components/schemas/" + name });
const str = { type: "string" },
  nullable = { type: ["string", "null"] },
  integer = { type: "integer" },
  boolean = { type: "boolean" };
const json = (schema) => ({
  description: "Successful response",
  content: { "application/json": { schema } },
});
const body = (schema) => ({
  required: true,
  content: { "application/json": { schema } },
});
const object = (properties) => ({ type: "object", properties });
spec.info.version = "0.2.0";
spec.info.description =
  "BlogStack paid launch API. Management requires a verified session or scoped project key. Public delivery uses published snapshots only. Billing and AI proposal review require a human session. Legacy plan labels never grant paid access.";
spec.tags = spec.tags.filter((t) => t.name !== "webhooks");
for (const t of spec.tags)
  if (t.name === "posts")
    t.description = "Private drafts, previews, explicit publish and unpublish";
for (const name of ["billing", "seo", "links", "analytics", "agent-runs"])
  if (!spec.tags.some((t) => t.name === name)) spec.tags.push({ name });
for (const p of Object.keys(spec.paths))
  if (
    p.includes("/webhooks") ||
    p.endsWith("/schedule") ||
    p.startsWith("/draft/")
  )
    delete spec.paths[p];
for (const key of [
  "WebhookEvent",
  "Webhook",
  "CreateWebhookRequest",
  "UpdateWebhookRequest",
])
  delete s[key];
s.Plan = {
  type: "string",
  enum: ["solo", "studio", "growth"],
  description:
    "Shared billing-account plan. Studio/Growth have unlimited blogs. Canonical prices and allowances are returned by /public/plans.",
};
s.PostStatus = { type: "string", enum: ["draft", "published"] };
delete s.Account.properties.stripeId;
s.Account.properties.canWrite = boolean;
s.AccountDetail = {
  allOf: [
    ref("Account"),
    object({
      owner: ref("User"),
      limits: { type: "object" },
      usage: { type: "object" },
      role: { type: ["string", "null"] },
      trialEndsAt: { type: ["integer", "null"] },
      paidThrough: { type: ["integer", "null"] },
    }),
  ],
};
Object.assign(s.Project.properties, {
  canWrite: boolean,
  canCustomizeBranding: boolean,
  role: ref("ProjectRole"),
  branding: object({
    showAttribution: boolean,
    workspaceName: str,
    logoUrl: nullable,
  }),
});
Object.assign(s.ProjectSettings.properties, {
  blogUrl: {
    type: "string",
    format: "uri",
    description:
      "Actual website blog URL, HTTPS except localhost. No query or fragment.",
  },
  hideAttribution: boolean,
  workspaceName: str,
  logoUrl: nullable,
  analyticsEnabled: boolean,
});
s.ProjectSettings.properties.robotsTxt.description =
  "Legacy stored preference. Preserve and configure robots in the host website; BlogStack does not overwrite it.";
const metadata = {
  excerpt: nullable,
  coverImage: nullable,
  seoTitle: nullable,
  seoDescription: nullable,
  canonicalUrl: nullable,
  noIndex: boolean,
  primaryKeyword: nullable,
};
for (const name of [
  "Post",
  "PublicPost",
  "CreatePostRequest",
  "UpdatePostRequest",
])
  Object.assign(s[name].properties, metadata);
Object.assign(s.Post.properties, {
  revision: integer,
  publishedRevision: integer,
  hasUnpublishedChanges: boolean,
  everPublished: boolean,
  tagIds: { type: "array", items: str },
});
s.Post.required = [...new Set([...s.Post.required, "revision"])];
s.UpdatePostRequest.required = ["revision"];
s.UpdatePostRequest.properties.revision = {
  type: "integer",
  minimum: 1,
  description: "Expected saved draft revision; stale writes return 409.",
};
s.PublicPost.properties.author = object({
  id: str,
  name: nullable,
  avatarUrl: nullable,
});
s.PublicPost.properties.updatedAt = integer;
spec.paths["/projects"].get.responses["200"] = json({
  type: "array",
  items: ref("Project"),
});
for (const method of ["get", "post"])
  if (spec.paths["/projects/{projectId}/api-keys"]?.[method]) {
    const op = spec.paths["/projects/{projectId}/api-keys"][method];
    op.description =
      (op.description ?? "") +
      " Requires a project-admin session; keys cannot manage keys. Creation returns plaintext once.";
  }
Object.assign(s.ApiKey.properties, {
  scopes: { type: "array", items: str },
  expiresAt: { type: ["integer", "null"] },
  revokedAt: { type: ["integer", "null"] },
});
delete s.ApiKey.properties.keyHash;
const selection = {
  type: "object",
  required: ["plan", "interval"],
  properties: {
    plan: ref("Plan"),
    interval: { type: "string", enum: ["month", "year"] },
  },
};
s.BillingStatus = object({
  accountId: str,
  plan: ref("Plan"),
  interval: { type: ["string", "null"], enum: ["month", "year", null] },
  status: {
    type: "string",
    enum: ["active", "trialing", "expired", "not_started"],
  },
  canWrite: boolean,
  configured: boolean,
  usage: { type: "object" },
  limits: { type: "object" },
  pendingPlan: { type: ["string", "null"] },
  pendingInterval: { type: ["string", "null"] },
  trialEndsAt: { type: ["integer", "null"] },
  paidThrough: { type: ["integer", "null"] },
  cancelAtPeriodEnd: boolean,
  hasSubscription: boolean,
  hasBillingCustomer: boolean,
  providerStatus: nullable,
});
s.AgentInput = {
  type: "object",
  required: ["postId", "profile", "prompt"],
  properties: {
    postId: str,
    profile: { type: "string", enum: ["writing", "seo", "linking"] },
    prompt: { type: "string", minLength: 1, maxLength: 4000 },
  },
};
function op(
  path,
  method,
  summary,
  tag,
  schema = { type: "object" },
  request,
  description = "",
  isPublic = false,
) {
  const names = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const operation = {
    operationId: (method + "_" + path).replaceAll(/[\/{}:-]+/g, "_"),
    summary,
    tags: [tag],
    description,
    parameters: names.map((name) => ({
      name,
      in: "path",
      required: true,
      schema: str,
    })),
    responses: {
      200: json(schema),
      400: { description: "Invalid request" },
      401: { description: "Authentication required" },
      403: { description: "Permission denied" },
      409: { description: "Revision or account allowance conflict" },
      410: { description: "Delivery/retention ended" },
    },
  };
  if (request) operation.requestBody = body(request);
  if (isPublic) operation.security = [];
  spec.paths[path] ??= {};
  spec.paths[path][method] = operation;
}
op(
  "/accounts",
  "get",
  "List accessible billing accounts",
  "accounts",
  { type: "array", items: { type: "object" } },
  undefined,
  "Verified session only.",
);
op(
  "/public/plans",
  "get",
  "Canonical plan catalog",
  "public",
  { type: "object" },
  undefined,
  "USD prices and shared allowances.",
  true,
);
op(
  "/public/{projectSlug}",
  "get",
  "Public project settings and branding",
  "public",
  { type: "object" },
  undefined,
  "No management key required.",
  true,
);
op(
  "/public/{projectSlug}/sitemap.xml",
  "get",
  "Blog sitemap excluding no-index posts",
  "public",
  { type: "string" },
  undefined,
  "XML; host-site blog URLs.",
  true,
);
spec.paths["/public/{projectSlug}/sitemap.xml"].get.responses["200"] = {
  description: "Sitemap XML",
  content: { "application/xml": { schema: str } },
};
op(
  "/public/{projectSlug}/events",
  "post",
  "Optional reader activity collection",
  "public",
  { type: "object" },
  object({
    postId: str,
    type: { type: "string", enum: ["view", "click"] },
    destination: str,
    referrer: str,
    preview: boolean,
  }),
  "Origin validated, bot filtered, rate limited and privacy preserving. Successful collection returns 204.",
  true,
);
spec.paths["/public/{projectSlug}/events"].post.responses = {
  204: { description: "Accepted or intentionally ignored" },
  400: { description: "Invalid event" },
  429: { description: "Rate limited" },
};
for (const [action, method, summary] of [
  ["", "get", "Subscription, usage and allowances"],
  ["/checkout", "post", "Create owner checkout"],
  ["/change", "post", "Request a plan change"],
  ["/portal", "post", "Customer payment portal"],
  ["/sync", "post", "Reconcile provider state"],
]) {
  op(
    "/accounts/{accountId}/billing" + action,
    method,
    summary,
    "billing",
    action ? { type: "object" } : ref("BillingStatus"),
    ["/checkout", "/change"].includes(action) ? selection : undefined,
    "Account owner session only. Access follows confirmed payment service dates.",
  );
}
op(
  "/billing/webhooks/polar",
  "post",
  "Signed Polar billing notifications",
  "billing",
  { type: "object" },
  undefined,
  "Requires valid Standard Webhooks headers. Deduplicates durable events and reconciles provider state.",
  true,
);
for (const [resource, summary] of [
  ["seo", "Revision-specific SEO findings"],
  ["links", "Link inventory, health and orphaned articles"],
  ["analytics", "Authorized sampling-aware reader aggregates"],
  ["agent-runs", "Recent AI requests"],
])
  op(
    "/projects/{projectId}/" + resource,
    "get",
    summary,
    resource,
    resource === "agent-runs"
      ? { type: "array", items: { type: "object" } }
      : { type: "object" },
  );
spec.paths["/projects/{projectId}/seo"].get.parameters.push({
  name: "postId",
  in: "query",
  required: true,
  schema: str,
});
spec.paths["/projects/{projectId}/analytics"].get.parameters.push({
  name: "days",
  in: "query",
  schema: { type: "integer", minimum: 1, maximum: 365, default: 30 },
});
op(
  "/projects/{projectId}/links/scans",
  "post",
  "Request asynchronous link checks",
  "links",
);
op(
  "/projects/{projectId}/links/{linkId}",
  "patch",
  "Ignore or include an indexed link",
  "links",
  { type: "object" },
  object({ ignored: boolean }),
);
op(
  "/projects/{projectId}/agent-runs/estimate",
  "get",
  "Available AI credits and maximum reservation",
  "agent-runs",
);
op(
  "/projects/{projectId}/agent-runs",
  "post",
  "Start a bounded reviewable agent request",
  "agent-runs",
  { type: "object" },
  ref("AgentInput"),
  "No publish, delete or settings tools. At most four model calls.",
);
op(
  "/projects/{projectId}/agent-runs/{runId}",
  "get",
  "Run status and proposals",
  "agent-runs",
);
op(
  "/projects/{projectId}/agent-runs/{runId}/proposals/{proposalId}/review",
  "post",
  "Accept selected changes or reject proposal",
  "agent-runs",
  { type: "object" },
  object({
    action: { type: "string", enum: ["accept", "reject"] },
    fields: { type: "array", items: str },
  }),
  "Human session only. Stale revisions are rejected; accepted changes remain a draft.",
);
op(
  "/projects/{projectId}/posts/{postId}/preview",
  "get",
  "Private no-index rendered preview",
  "posts",
  { type: "object" },
);
op(
  "/projects/{projectId}/export",
  "get",
  "Content, drafts, tag relationships and media manifest",
  "projects",
  { type: "object" },
  undefined,
  "Project-admin session only; retained until the 90-day export deadline.",
);
op(
  "/projects/{projectId}/media/{mediaId}/download",
  "get",
  "Authenticated retained media download",
  "media",
  { type: "string" },
  undefined,
  "Project-admin session only.",
);
spec.paths["/projects/{projectId}/posts/{postId}/publish"].post.requestBody =
  body(object({ revision: { type: "integer", minimum: 1 } }));
spec.paths[
  "/projects/{projectId}/posts/{postId}/publish"
].post.requestBody.required = false;
spec.paths["/projects/{projectId}/posts/{postId}/publish"].post.description =
  "Render the saved draft before replacing the live snapshot. Optional expected revision rejects stale publication.";
spec.paths["/projects/{projectId}/api-keys"].get.responses["200"] = json({
  type: "array",
  items: ref("ApiKey"),
});
spec.paths["/projects/{projectId}/api-keys"].post.responses["201"] = json({
  allOf: [ref("ApiKey"), object({ plaintext: str })],
});
spec.paths["/projects/{projectId}/media/{mediaId}/download"].get.responses[
  "200"
] = {
  description: "Media binary",
  content: {
    "application/octet-stream": {
      schema: { type: "string", format: "binary" },
    },
  },
};
spec.paths["/billing/webhooks/polar"].post.parameters = [
  "webhook-id",
  "webhook-timestamp",
  "webhook-signature",
].map((name) => ({ name, in: "header", required: true, schema: str }));

spec.paths["/projects"].post.description =
  "Creates a blog in the selected billing account. Solo allows one blog. Studio and Growth have no numerical blog cap. The first owned blog starts the 14-day Studio trial.";
s.CreateProjectRequest.required = ["name"];
s.CreateProjectRequest.properties.settings = ref("ProjectSettings");
spec.paths["/projects/{projectId}/posts/{postId}/unpublish"].post.summary =
  "Unpublish an article and preserve its draft";
spec.paths["/projects/{projectId}/posts/{postId}/unpublish"].post.description =
  "Removes the live snapshot from public delivery. Saved draft content remains available.";
const linkStatuses = [
  "unchecked",
  "healthy",
  "broken",
  "redirected",
  "inconclusive",
  "unsafe",
];
s.LinkEntry = object({
  id: str,
  postId: str,
  url: str,
  anchor: str,
  kind: str,
  status: { type: "string", enum: linkStatuses },
  httpStatus: { type: ["integer", "null"] },
  finalUrl: nullable,
  checkedAt: { type: ["integer", "null"] },
  ignored: { type: "integer", enum: [0, 1] },
  insecure: boolean,
});
s.LinkReport = object({
  links: { type: "array", items: ref("LinkEntry") },
  scans: {
    type: "array",
    items: object({
      id: str,
      status: str,
      checked: integer,
      error: nullable,
      createdAt: integer,
      completedAt: { type: ["integer", "null"] },
    }),
  },
  orphaned: {
    type: "array",
    items: object({ id: str, title: str, slug: str }),
  },
  nextCursor: nullable,
  limited: boolean,
});
const links = spec.paths["/projects/{projectId}/links"].get;
links.responses["200"] = json(ref("LinkReport"));
links.description =
  "Cursor-paginated inventory. Checked timestamps retain the original cache result time. Known internal article routes are resolved locally without external quota.";
links.parameters.push(
  { name: "cursor", in: "query", schema: str },
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 200, default: 100 },
  },
  {
    name: "status",
    in: "query",
    schema: { type: "string", enum: linkStatuses },
  },
);
for (const route of [
  "/projects/{projectId}/links/scans",
  "/projects/{projectId}/agent-runs",
]) {
  const responses = spec.paths[route].post.responses;
  responses["202"] = responses["200"];
  delete responses["200"];
}
spec.paths["/accounts/me"].get.responses["200"] = json(ref("AccountDetail"));
spec.paths["/accounts/me"].patch.responses["200"] = json(ref("AccountDetail"));
const output = YAML.stringify(spec, { lineWidth: 110 });
writeFileSync(path, output);
writeFileSync(
  new URL("../../blogstack-api/openapi/blogstack.yaml", import.meta.url),
  output,
);
console.log("Updated and synchronized launch OpenAPI routes and schemas.");
