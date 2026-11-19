# API hardening roadmap

This is the working backlog for making BlogStack's API safe, dependable, and operable in production. Items are deliberately ordered: complete one phase, verify it, then move to the next.

Status markers: `[ ]` not started, `[-]` in progress, `[x]` complete.

## Guiding release rule

Do not deploy a phase until its acceptance checks pass in CI and against a preview Worker. Breaking schema changes must be introduced through forward-only migrations and remain compatible with the currently deployed Workers during rollout.

## Phase 1 — Repair API, database, and worker contracts

**Why first:** several critical paths currently disagree on table columns, queue messages, or HTTP methods. These are functional blockers rather than edge cases.

- [x] Add a forward-only D1 migration that adds `projects.updated_at` and initializes existing rows. (Migration `0006`)
- [x] Define and migrate the `webhook_deliveries` table used by the ingest worker, including indexes for webhook history and failed deliveries. (Migration `0007`)
- [x] Align webhook persistence names across the API and ingest worker: use `webhooks.url` and `webhooks.enabled` consistently.
- [x] Align the queue message contract: API produces `{ webhookId, projectId, event, payload, attempt }`; the consumer reads precisely that shape.
- [ ] Decide and implement the media upload architecture. Either add a protected upload handler to the CDN worker that verifies the API signature and writes to R2, or return an actual R2 presigned `PUT` URL from the API. The current generated `/upload/*` URL has no accepting handler.
- [ ] Make upload confirmation inspect R2 object metadata instead of trusting client-supplied size/dimensions.
- [ ] Add contract tests for migrations, webhook queue delivery, and media upload/confirmation.

Acceptance criteria:

- A project update succeeds on a migrated database.
- A subscribed webhook is queued, delivered, and its result is written to `webhook_deliveries`.
- A valid upload can be stored, confirmed from R2 metadata, served, and deleted; invalid or expired upload signatures fail.
- API, ingest, and CDN workers typecheck and deploy in a preview environment.

## Phase 2 — Close authorization boundaries

**Why next:** these issues can expose or modify customer content.

- [ ] Authenticate `/draft/:postId/ws` before proxying to the Durable Object.
- [ ] Authorize the connecting user for the post's project and enforce the required role before allowing draft read/write access.
- [ ] Pass verified identity and role to the Durable Object using a signed internal assertion; never trust a client-provided cursor `userId`.
- [ ] Limit draft message sizes and validate the supported message schema.
- [ ] Extend auth context with API-key identity, project ID, and scopes.
- [ ] Enforce that an API key can only access its own project and permitted actions; do not derive wider access from its creator's membership.
- [ ] Add API-key expiry, explicit revocation status, rotation, last-used audit data, and an immutable audit event when keys are created/revoked.
- [ ] Add authorization-matrix tests covering owner, account admin/editor, project admin/editor/writer, outsider, session, and API-key callers.

Acceptance criteria:

- Unauthenticated or unauthorized users cannot read, connect to, or save a draft.
- A project-A API key cannot access project B, even if its creator belongs to both projects.
- Every protected route has positive and negative authorization tests.

## Phase 3 — Safeguard external I/O and abuse-prone routes

- [ ] Validate webhook endpoints as HTTPS public addresses only; reject localhost, private/link-local/reserved IP ranges, credentials in URLs, and unsafe redirects.
- [ ] Resolve and revalidate destination addresses at delivery time to mitigate DNS rebinding.
- [ ] Cap webhook request/response sizes, use a short timeout, preserve bounded retries, and provide a dead-letter queue plus an operator replay path.
- [ ] Apply rate limits by IP, user, API key, and route. Prioritize registration, sign-in, resend-verification, upload presign/confirm, public reads, and webhook management.
- [ ] Return `429` responses with `Retry-After` when a limit is exceeded.
- [ ] Enforce upload content type/extension allowlists and maximum byte sizes before an object becomes confirmed or publicly deliverable.

Acceptance criteria:

- Private-network webhook destinations cannot be stored or contacted.
- Repeated abusive requests are limited without impacting unrelated tenants.
- Failed webhook deliveries are observable and recoverable from the DLQ.

## Phase 4 — Validate input and make writes resilient

- [ ] Make request schemas strict and reject unknown fields where appropriate.
- [ ] Validate all pagination controls: finite positive limits, bounded values, and valid cursors. Avoid passing `NaN` into database bindings.
- [ ] Bound title, search, JSON document, query-string, and request-body sizes; validate BlockNote payload shape/depth before rendering or storing it.
- [ ] Add idempotency keys for externally retryable create, publish, schedule, invitation, and upload-confirm endpoints.
- [ ] Use atomic D1 batches/transactions for coupled mutations, especially invite acceptance, post/tag replacement, limit checks, and publish/cache/outbox changes.
- [ ] Move cache invalidation and webhook dispatch to a transactional outbox or equivalent reliable post-commit mechanism.
- [ ] Enforce plan limits with concurrency-safe database constraints or atomic conditional writes.

Acceptance criteria:

- Invalid inputs consistently return documented 4xx responses.
- Retrying an idempotent write does not create duplicates or trigger duplicate side effects.
- Concurrent requests cannot exceed plan limits or leave partial relational data.

## Phase 5 — Standardize error handling and application security

- [ ] Return a documented, stable JSON error envelope with `code`, safe message, and request ID.
- [ ] Do not return raw exception messages to clients; retain stack/context only in structured logs.
- [ ] Add a request-body limit and safe JSON parsing fallback.
- [ ] Protect cookie-authenticated state-changing routes against CSRF and verify the CORS/origin policy using production domains.
- [ ] Review security headers/CSP, cookie attributes, trusted origins, and secret requirements at Worker startup/deploy time.
- [ ] Encrypt or otherwise protect webhook secrets at rest if the threat model requires database-read isolation.
- [ ] Create tamper-evident audit events for memberships, invitations, project settings, API keys, webhooks, publication, and destructive actions.

Acceptance criteria:

- Unexpected failures expose no internal message, SQL, secret, or stack trace.
- Cross-site state-changing requests are rejected.
- Security-relevant changes are attributable in an audit trail.

## Phase 6 — Observability, testing, and operations

- [ ] Install and lock package dependencies so typechecking can run locally and in CI. At present, `tsc` is unavailable in each Worker package.
- [ ] Add unit tests, D1 integration tests, Worker route tests, and end-to-end preview smoke tests.
- [ ] Instrument structured logs, request IDs, latency/error metrics, queue depth/retry/DLQ metrics, and database failure metrics.
- [ ] Define alerts and runbooks for elevated 5xx/429 rates, failed migrations, queue backlog/DLQ growth, auth failures, and webhook delivery failures.
- [ ] Automate preview deployments, migrations, smoke tests, and rollback checks in CI/CD.
- [ ] Document backup, restore, secret rotation, incident response, and migration rollback/forward-fix procedures; rehearse them.
- [ ] Set service objectives for availability, latency, webhook delivery, and recovery time, then measure them.

Acceptance criteria:

- CI blocks merge on typecheck, tests, lint, migration checks, and smoke tests.
- Operators can detect and diagnose a failed API/queue path from logs and metrics within minutes.
- Restore and rollback procedures have been tested, not just documented.

## Recommended execution order

1. Phase 1: repair functional contracts.
2. Phase 2: drafts and API-key authorization.
3. Phase 3: webhooks, uploads, and rate limiting.
4. Phase 4: validation, idempotency, and atomic writes.
5. Phase 5: error/security consistency.
6. Phase 6: testing and operational maturity (begin foundational CI work alongside Phase 1).

## Definition of "robust enough" for initial production

The initial bar is met once Phases 1–5 are complete, the Phase 6 CI/smoke-test and monitoring foundations are running, there are no known critical/high authorization or data-integrity gaps, and a preview deployment has exercised auth, post lifecycle, media, and webhook flows end to end.


## Implementation update — 2026-09-27

The core API/SDK and UI integration pass now includes:

- A signed, immutable CDN upload handler for JPEG/PNG/GIF/WebP/AVIF (10 MiB maximum), pending-record checks, verified R2 confirmation, and delivery restricted to confirmed records. CDN now needs the same `MAIN_DB` D1 binding as the API. Client-supplied dimensions are ignored; dimensions remain null until trusted image processing exists.
- Migration `0008_api_key_policy.sql`: project scopes, expiration and soft revocation. Keys cannot manage accounts, memberships, other keys, or webhooks. Session authorization still checks the creator's current project role for content operations.
- Project owner/inherited-role fixes, target-project checks for deletion, corrected member route mounting, recipient checks for invitation acceptance, and same-project tag checks.
- Authenticated draft WebSockets with signed internal assertions, message bounds/schema checks, trusted cursor identity, hibernation-safe broadcasts and per-message membership checks.
- Cursor pagination with timestamp/ID ties, correct public totals, a working unpublish endpoint, fresh public reads after edits/unpublishing, and matching SDK response types, paths, feed handling, and query parameters.
- Safe internal error messages, consistent error request IDs, request-body bounds, bounded content rendering and rejection of executable links. Public delivery permits cross-origin reads; cookie mutations verify Origin.
- Runnable SQLite migration/route tests, SDK-to-API contract tests, CDN upload tests, UI interaction tests, and registry dependency/schema checks.

### Release work still open

This pass does **not** mean the full roadmap is complete. Before production approval:

- Apply migration 0008 and configure the CDN D1 binding in a preview environment; run real Worker, Durable Object, R2, email and queue smoke tests.
- Complete rate limiting, webhook destination/DNS/redirect protections, delivery retry/DLQ/replay behavior, transactional outbox/idempotency, concurrency-safe plan limits, and audit records.
- Review remaining account/invitation flows under concurrent requests and finish the full session/API-key authorization matrix.
- Replace the ingest image-processing placeholder (it references media columns that do not exist); no image job is queued by the new upload flow.
- Add CI deployment gates, monitoring, backup/restore validation, and operational runbooks.
- Host the UI registry at an approved URL and publish the npm packages if package distribution is desired. Neither publishing nor deployment was performed.

The complete UI templates (`Blog`, `BlogIndex`, `BlogPost`) now lead the registry. Their client-side rendering is appropriate for drop-in integration; server-rendered article HTML and SEO metadata require framework routing/server composition.
