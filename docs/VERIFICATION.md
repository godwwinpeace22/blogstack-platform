# BlogStack implementation and setup verification

Updated 19 November 2026. BlogStack is deployed as a private Cloudflare preview. Signup is limited to the verified operator and invited clients; public signup and checkout remain closed. No customer payment has been taken.

## Deployed services

The owner is hello@wordman.app, Cloudflare account d37dff02b31097b9581ef596777605dc. The operator selected Workers Free and deferred buying a domain.

| Service | URL / status |
| --- | --- |
| Dashboard and API | https://blogstack-app.hidden-silence-2d18.workers.dev |
| Media | https://blogstack-cdn.hidden-silence-2d18.workers.dev |
| Documentation | https://blogstack-docs.hidden-silence-2d18.workers.dev/docs/quickstart |
| Editable component registry | https://blogstack-registry.hidden-silence-2d18.workers.dev/r/blog-post.json |
| Private-preview site | https://blogstack-site.hidden-silence-2d18.workers.dev |
| Production Next.js blog | https://blogstack-blog.hidden-silence-2d18.workers.dev/blog |
| Private owner operations | https://blogstack-app.hidden-silence-2d18.workers.dev/operations |
| Link scanner | Private service binding; no public route |

D1, both KV namespaces, R2 media, job/dead-letter queues, Workers AI and Analytics Engine are provisioned. All 17 additive migrations were applied to the new remote D1 database. Dashboard and API share an origin for session cookies. Managed URLs passed HTTP/TLS checks; HTML routes were requested with the browser's Accept header. The registry returns public JSON/CORS headers. The site discloses the closed preview and excludes indexing.

Private deployment configuration and credentials are under gitignored .launch and launch.env with restricted permissions. The launcher selects the approved Cloudflare OAuth session instead of the unrelated environment token. No stored OAuth credential was extracted.

## npm and regression checks

The free @blogstack organization is owned by the approved godwinpeace22 account, with personal 2FA enabled. @blogstack/core, @blogstack/sdk, @blogstack/ui and @blogstack/editor are published at 0.2.0 under MIT licenses.

All four public-registry tarballs match the verified release archives. They installed in a clean temporary Next.js app, including SDK ESM/CJS exports and shared React hook types, and passed its production build. Public defaults and registry examples use actual Cloudflare URLs. Evidence: artifacts/verification/npm-registry.json and artifacts/packages/published-verification.json.

| Check | Result |
| --- | --- |
| API, core, media and scanner tests | 47 passed |
| SDK contract tests | 3 passed |
| React component tests | 14 passed |
| Actual BlockNote editor regression | 1 passed |
| Registry tests | 2 passed |
| Total | 67 passed |
| Workspace type checks | Passed on Node 24.22.3 |
| Production builds | Packages, dashboard, registry, site, docs and reference Next.js app passed |
| Earlier local backup restoration | Access views, entitlement triggers and foreign keys checked |

The editor crash came from text nodes lacking styles. Input now normalizes those nodes recursively without mutating or dropping content. The reported localhost article reopened, saved and reloaded successfully; its title was restored after the save check. Screenshot: artifacts/verification/editor-fixed.png.

Link jobs now process four destinations per continuation. An integration test runs the complete job across chunks, checks every destination and quota total, and keeps each invocation within Free D1's 50-query budget. CPU, load and complete production workflows still require acceptance on the selected free plan.

Deployed scanner acceptance found and fixed a Workers incompatibility: redirect:error is unsupported. DNS requests now use manual redirects and reject non-success responses. Actual private service-bound runs distinguish healthy links, 404s, redirects, blocked sites, redirect loops and timeouts, and refuse direct private addresses and redirects into private addresses. A runtime regression check and all 42 backend/scanner tests pass. Unpublish now reuses normalized internal-link resolution, avoiding D1's short LIKE-pattern limit for long slugs and handling query strings/fragments. Evidence: artifacts/verification/link-scanner-deployed.json.

## Real provider verification

All three Cloudflare AI profiles completed native-provider runs against a disposable local article. Each consumed one credit and persisted a pending proposal while leaving the draft unchanged. The integration fixed selected-post IDs and structured object responses. ACL, review, stale-revision, revocation and failed-run refund regressions also pass. Evidence: artifacts/verification/ai-live.json.

Analytics Engine ingested two synthetic views and one click through the actual collector. Preview, opt-out and bot requests were excluded; destination query strings were removed; actual weighted SQL queries returned the expected counts. Daily-summary writes were verified twice against an isolated migrated SQLite database behind D1's interface. The deployed hourly schedule was not asserted by that drill. The approved Account Analytics Read token is installed privately and expires February 16, 2027. Evidence: artifacts/verification/analytics-live.json. The temporary probe was stopped after verification.

Polar sandbox organization blogstack has six distinct recurring products at $3/$9/$19 monthly and $30/$90/$190 annually. Its approved 30-day credential is stored privately. The signed webhook uses API version 2026-10. A temporary product-metadata event was delivered by Polar, accepted by Cloudflare, persisted and processed by the real background job; probe metadata and temporary event subscription were restored. That probe created no customer or payment. Sandbox portal plan changes are disabled. Evidence: artifacts/polar-products.sandbox.json, artifacts/verification/polar-webhook.json and artifacts/verification/polar-portal.json.

A separate Cloudflare sandbox now has its own D1, R2, KV, queues, auth secrets and signed Polar endpoint. Six synthetic owner sessions and checkout sessions were verified against the actual API. Solo monthly and annual test-card submissions reached Polar's confirmed state but produced no paid order or subscription; the payment gate remains false. The main preview's sandbox webhook was restored after these attempts. Evidence: artifacts/verification/polar-sandbox-processing.json and artifacts/verification/billing-sandbox.json.

Live Polar organization Wordman Technologies has the six canonical prices, an approved 90-day scoped credential and a disabled signed webhook staged separately from the preview. Native API verification confirms portal plan changes are disabled, the support email and product website are saved, and merchant review has not yet been submitted or a payout account connected. Checkout remains disabled. Evidence: artifacts/polar-products.production.json, artifacts/polar-webhook.production.json and artifacts/verification/polar-live-setup.json.

Resend verified all four mail.boldlaunchstudio.com records. The approved domain-restricted send-only key is installed in Cloudflare. The operator approved one disposable sandbox account and generated private password for email acceptance. Actual Cloudflare handlers sent signup, verification resend, reset, invitation and hourly-scheduled trial-ending messages to hello@boldlaunchstudio.com; Resend confirmed all delivered. Verification and invitation acceptance succeeded, password reset revoked the old session and new login worked. Main signup and checkout remain closed. Evidence: artifacts/verification/auth-email.json, artifacts/verification/email-configuration.json and artifacts/verification/email-delivery.json.

These checks do not establish that the six checkout/payment, failed-renewal, change, cancellation and refund scenarios have passed. Sandbox setup does not verify a live merchant or payout account.

## Local publication evidence

The disposable local flow previously completed signup, verification resend, an agency blog, client invitation/acceptance, illustrated publication, private revision, republishing and unpublishing. The client workspace displays the agency name and restricts administrative navigation.

Signed image upload, hidden pending media, R2 confirmation, CDN delivery, private preview and stale publish rejection passed in the local Worker. The reference Next.js app's initial HTML contains article content, metadata and escaped BlogPosting JSON-LD; RSS and sitemap use the customer's blog URL while retaining host sitemap/robots configuration.

Repeatable drills are scripts/verify-local.mjs and scripts/verify-html.mjs. Fixtures and local backups are gitignored. Dashboard/editor chunk warnings remain a performance improvement. The CI workflow exists but has not run remotely; original workspace repositories remain intact.

The separate deployed Cloudflare sandbox also passed signed R2 upload, hidden pending media, confirmation, illustrated publication, private draft isolation, stale-revision rejection, agency branding, SEO metadata, noindex sitemap exclusion, republishing, long-slug unpublishing, normalized internal-link health, content export and authenticated image export. This is separate from installing a paying pilot's production website. Evidence: artifacts/verification/publishing-sandbox.json.

The remote D1 export was also restored into a separate in-memory database: zero customer records, 23 entitlement triggers, both access views and zero foreign-key violations. This does not replace a remote recovery deployment or independent object-backup drill. Evidence: artifacts/verification/remote-backup-local-restore.json. The deployed operations check reported zero failed/stalled jobs, stale media cleanup and unprocessed notifications.

A populated sandbox backup was subsequently restored into a separate remote D1 database and a recovery API/CDN, with fresh secrets, revoked sessions, no outbound provider credentials and no scheduled jobs. Its confirmed image was copied to a separate private R2 bucket and downloaded checksums matched. Native HTTP checks verified owner/client permissions, blocked client billing/settings changes, protected private drafts, published content, branding, export and recovered CDN bytes. Row counts match the source backup, with 23 entitlement triggers, two access views and zero foreign-key violations. This passes the remote recovery exercise; it does not configure production backup retention, independent operator storage or recurring copies. Evidence: artifacts/verification/recovery-drill.json.

The disposable email account is removed after acceptance, including its restored copy. The sandbox's hourly lifecycle schedule is disabled to avoid later emails to synthetic fixtures; its minute outbox drain remains. Main production schedules are unchanged.

## Production installation, backups and alerts completed

The real hello@boldlaunchstudio.com owner registered, verified and signed in. A post-signup dashboard crash was caused by duplicate React Query contexts in the monorepo bundle (SDK and dashboard resolved different versions). Vite now deduplicates React, React DOM and React Query. A later clean build also exposed `.env.local` leaking a development API origin into production. Production now always uses the dashboard's own origin; the local override applies only during development. Fresh owner dashboard/editor/operations loads were verified.

A separate clean Next.js application installed SDK/UI 0.2.0 from public npm and was deployed through official OpenNext 1.20.17 and Wrangler 4.165.0 on Cloudflare. Native article HTML, title/description/canonical/social metadata, BlogPosting JSON-LD, CDN cover image, listing, RSS and separate website/blog sitemaps passed without JavaScript. An actual private revision did not leak until explicitly republished. Unpublish returned 404 and removed the article from listing/RSS/sitemap; final republishing succeeded. The actual project stores the managed production blog URL. Evidence: `artifacts/verification/production-install-*.json` and `production-published-article.jpg`. The root generator `scripts/prepare-production-install.mjs` reproduces the standalone Cloudflare configuration. The registry distributes the complete allowlisted Next.js source starter independently of repository access.

The owner downloaded the actual production content export and an authenticated media export. The JSON contains the published body, saved draft, SEO fields, cover, tags and media download path; image SHA-256 matches the original upload. The public starter archive matches the local release checksum, includes only the allowlisted reference files, and is linked from the deployed installation guide. Evidence: `production-owner-export.json` and `production-starter-download.json`. Fresh owner settings and operations reloads and an authenticated manual health check succeeded after the final same-origin deployment. The operations page shows the real cron heartbeat, completed backups, delivered test timestamps and healthy service checks.

The private operations worker, separate D1 state, private backup bucket and queue/dead-letter queue are provisioned. An actual five-minute cron heartbeat and scheduled daily backup completed, as did manual backups. SQL and media checksums passed. One automated production snapshot was restored into fresh, isolated Cloudflare resources: published article, separate newer private draft, metadata, tags, 23 triggers, both access views, zero foreign-key violations and exact recovered image bytes passed. Restored sessions/verification/API keys were revoked, and outbound integrations/cron/queues were absent. Evidence: `production-automated-backup-restore.json`. This uses a separate bucket within the same Cloudflare account, not an independent provider/account. See [OPERATIONS.md](OPERATIONS.md) for schedules, automatic retention and actual limitations.

Actual service probes, native queue metrics, Worker error estimates and database checks reported healthy. Both labeled incident/recovery test emails received Resend `delivered` events; evidence: `operations-alert-delivery.json`. Alerts persist provider idempotency keys, stay quiet for unchanged issues and send recovery when issues clear. The owner-only UI rejects other users/API keys/unverified users/cross-origin mutations and remains available after trial expiry. Media deletion tests verify immediate CDN withdrawal, 48-hour physical retention and subsequent lifecycle purge. The release suite passed 76 tests; an additional concurrent/retry alert regression also passed (77 distinct tests total). Workspace type checks and changed production builds passed. The operations suite and dry-run Worker build are included in CI; no remote CI run is claimed.

## Remaining paid-launch gates

- Polar work is deferred at the operator's request until the product domain is purchased. Later complete support-email, identity and payout verification, submit merchant review, then activate the already staged live catalog and signed endpoint only after acceptance. Do not resume Polar changes or enable checkout before the operator resumes this work.
- Repeat sender DNS and delivery verification when moving from the borrowed email domain to the product domain. Current transactional-email acceptance passed; see docs/EMAIL-DNS.md.
- Exercise all six payment options and the failed/out-of-order/change/cancellation/refund matrix against the actual provider.
- Monitor free-plan CPU, storage and request usage during the pilot. The production publication, backup/restore and alert acceptance checks above have passed; a Cloudflare paid upgrade is not authorized.
- Confirm real operator/support details, then run three paying pilots, including an agency/client pair, for a clean week before general signup.

Keep CHECKOUT_ENABLED=false and SIGNUP_MODE=pilot with only the operator allowlist and invited clients. Do not open general signup before the paying pilot and remaining launch gates pass. Do not resume Polar until the operator buys the domain and explicitly resumes that work.
