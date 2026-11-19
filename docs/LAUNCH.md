# BlogStack paid launch

BlogStack charges per billing account. The canonical catalog is blogstack-core/src/index.ts and the SQL mirror is checked by tests. Solo is $3/month or $30/year, Studio $9/$90, Growth $19/$190. Studio and Growth have unlimited blogs; Growth includes 100 GB of shared media storage.

Production checkout is disabled by default. Pilot signup is limited to an operator allowlist and project invitations. Enable paid pilot checkout only after the technical, merchant, email and restore gates below pass. Open general signup after three paying pilots, including an agency/client pair, complete one week without unresolved critical issues.

## Local development

Use Node 24 and Bun 1.4.0. From the workspace root:

    npm ci
    npm run build:packages
    npm run setup:local
    npm run migrate:local

Run the API, media worker, dashboard and reference app in separate terminals:

    npm run dev:api
    npm run dev:cdn
    npm run dev:dashboard
    BLOGSTACK_PROJECT_SLUG=your-project BLOGSTACK_API_URL=http://localhost:8787 SITE_URL=http://localhost:3003 npm run dev:example

Setup generates isolated .local-api and .local-cdn configuration/secrets and shares .dev-state for D1 and R2. Existing per-project .dev.vars are not loaded by these root development commands. No real email, AI, analytics or payment providers are bound locally. Verification/reset links are written to the local API log.

The repeatable HTTP drills in scripts/verify-local.mjs and scripts/verify-html.mjs use the disposable local browser account and blog described in their assertions. All drill destinations are fixed localhost addresses. Never copy test credentials to production.

## Build and regression checks

    npm run build:packages
    npm run typecheck
    npm test
    npm run build
    npm run build -w @blogstack/api
    npm run build -w @blogstack/cdn-worker
    npm run build -w @blogstack/link-worker
    npm run build -w @blogstack/ops-worker
    node scripts/check-launch.mjs --static

CI repeats those checks on Node 24. Worker builds are dry runs. Registry output uses https://blogstack-registry.hidden-silence-2d18.workers.dev/r; local serving can override REGISTRY_BASE_URL.

The API tests use real migrated SQLite behind D1's interface and real signed Better Auth sessions. They cover draft isolation, compare-and-swap, quotas, paid coverage, signed notifications and human proposal review. External provider sandbox and production checks remain separate acceptance steps.

## Cloudflare resources

Use the intended Cloudflare account explicitly. The connected token must support D1, Workers, Workers KV, R2, Queues, routes and Analytics Engine queries.

    node scripts/provision.mjs
    CLOUDFLARE_ACCOUNT_ID=your-account-id node scripts/provision.mjs --apply

The script reuses named resources, creates missing resources and fills API/CDN configuration IDs. It does not migrate or deploy production. Review the resulting configuration. The local D1 database ID is deliberately unrelated to production.

Create blogstack-db, blogstack-cache, blogstack-cdn-cache, blogstack-media, blogstack-jobs and blogstack-jobs-dead. The scanner has no DB, secrets, storage or service bindings and no public workers.dev URL. Only the API has a service binding to it.

The selected account is hello@wordman.app (d37dff02b31097b9581ef596777605dc). Its authenticated Wrangler OAuth session has provisioned the BlogStack resources and applied all 18 additive migrations to the remote database. Use node scripts/launch.mjs cloudflare ... to select this account and ignore the unrelated environment token. Do not extract stored OAuth credentials. Current deployment and verification status is in docs/VERIFICATION.md.

Prepare production secrets without placing values in command arguments, screenshots or git:

- API: BETTER_AUTH_SECRET, CDN_SECRET, RESEND_API_KEY, POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, CF_ANALYTICS_TOKEN.
- CDN: the same CDN_SECRET.
- CF_ANALYTICS_TOKEN needs Account Analytics Read for the selected account.
- API vars: CF_ACCOUNT_ID, six Polar product IDs, production URLs, verified EMAIL_FROM, SIGNUP_MODE, PILOT_EMAILS and CHECKOUT_ENABLED.

The Analytics Engine dataset is blogstack_events. Its binding creates the dataset on first write. Confirm weighted SQL queries work for the same account and dataset. Use a test project for a known view/click and verify aggregation and estimates. Workers AI and Analytics Engine are external service dependencies, not emulated success locally.

## Merchant and six prices

Complete Polar merchant verification and supported payout setup first. Operator identity and country must be real and consistent with checkout, receipts, support and policy pages. Configure PUBLIC_OPERATOR_NAME and PUBLIC_SUPPORT_EMAIL when building the marketing site. Review the factual service/privacy/refund pages for the actual operator and jurisdiction before charging.

Preview and create the catalog:

    node scripts/polar-products.mjs
    POLAR_SERVER=sandbox node scripts/polar-products.mjs --apply
    MERCHANT_VERIFIED=true POLAR_SERVER=production node scripts/polar-products.mjs --apply

Supply POLAR_ACCESS_TOKEN through a secret environment. The script creates or verifies six distinct products, each with one fixed USD recurring price, because Polar defines the billing interval at product level. It writes non-secret product IDs to artifacts/polar-products.environment.json. Copy IDs into API vars. It never checks out or charges a card.

Configure https://blogstack-app.hidden-silence-2d18.workers.dev/billing/webhooks/polar for customer state, order paid/refunded and subscription lifecycle events. Store its signing secret in the API. Disable plan changes in Polar's customer portal so every downgrade passes BlogStack's capacity guards; keep payment-method and cancellation controls available.

Test all six options in Polar sandbox. Complete payment, failed renewal/recovery, immediate same-interval upgrade, scheduled downgrade and interval switch, cancellation, full/partial refund, duplicate/out-of-order delivery and replay. Confirm the paid order line-item service dates are present. Subscription current_period_end alone must never grant access.

## Deployment sequence

1. Back up an existing production D1 database and complete a separate restoration drill.
2. Review additive migrations 0009 onward. Apply migrations with wrangler d1 migrations apply MAIN_DB --remote --config blogstack-api/wrangler.toml.
3. Deploy the isolated link scanner, then media worker, then API. Keep CHECKOUT_ENABLED=false and SIGNUP_MODE=closed until owner onboarding is ready; then use the pilot allowlist.
4. Deploy the dashboard and API together with .launch/app.wrangler.json, keeping authentication on one origin. Deploy the static site, registry and docs using each workspace's wrangler.toml. The current workers.dev URLs require no domain purchase. Verify TLS, auth callbacks, private endpoint CORS and the public API.
5. Publish version 0.2.0 of core, SDK, UI and editor in dependency order. First run scripts/verify-packages.mjs in a clean temporary application using local tarballs.
6. Verify real email delivery from the selected verified sender domain: signup verification, resend, password reset, invitation and lifecycle notice. Confirm production emails are not development log messages.
7. Test a complete illustrated article and private revision in a clean customer Next.js application, including initial HTML, search/social metadata, JSON-LD, indexing, RSS and both existing and blog sitemaps.
8. Configure and test alerts and backups, then run the production gate with --pilot. Set CHECKOUT_ENABLED=true only after paid pilot readiness, and list the pilot owner emails in PILOT_EMAILS. Client invitees are admitted by matching active invitations.
9. Run the three-account paying pilot. After a clean week, mark pilot acceptance and set SIGNUP_MODE=open.

The legacy ingest worker is retired for this release and has no launch queue consumers. Existing deployments of the old ingest worker must be disabled by the operator so old image/webhook jobs do not run.

## Scheduled jobs and recovery

The API consumes blogstack-jobs notifications. Every mutation also persists an outbox row; the minute cron drains queued work if notifications are lost. An hourly lifecycle cron handles expiry notices, 90-day purge, expired uploads, durable R2 deletions, monthly usage housekeeping, paid-state reconciliation, scheduled audits and daily Analytics Engine summaries.

Weekly/daily link scans share the account allowance. External results cache for 24 hours. Known internal article references do not make external requests. Each article indexes up to 500 links. Reports paginate the inventory in pages of 100, with a maximum API page size of 200.

Retries use leases, bounded attempts and durable errors. Failed jobs remain visible in D1. The dead-letter queue is a notification failure signal; the outbox remains authoritative. After correcting a provider outage, requeue an identified failed job by setting its status to pending, attempts to zero and available_at to unixepoch(). Replay payment events through reconciliation; never manually set a legacy account plan to grant access.

## Monitoring and cost

The private `blogstack-ops` worker now checks service responses, Worker error estimates, jobs/email failures, queue backlog/dead letters, backup freshness and credential expiry every five minutes. It sends changed incidents and recovery to hello@boldlaunchstudio.com. Both labeled delivery tests passed. Its daily D1/R2 backups, automatic retention and actual production restoration also passed. Use the operator dashboard's `/operations` page; see [OPERATIONS.md](OPERATIONS.md) for configuration, procedures and limitations. `node scripts/launch.mjs operations` remains a manual database-only check.

Track AI prompt/completion tokens from agent_runs, paid_orders and storage per account. Include failed model runs in cost estimates even when customer credits are refunded. Compare estimates with Cloudflare and Polar invoices. Configure an account-level Workers AI spending limit and review daily during the pilot.

Measure trial creation, first publication, checkout completion, paying accounts, support minutes and cost per account toward the first ten paying customers. Record pilot support and failures in a private operator log; do not put customer data in the public repository.

## Final release gate

Copy launch.env.example to a private environment file, fill verified values and use a secret-aware launcher. Do not commit it.

    node scripts/check-launch.mjs --pilot
    node scripts/check-launch.mjs

The gate checks configuration and recorded acceptance flags; it does not replace merchant verification, actual payment tests, alert delivery, package publication or a restore drill. Public launch additionally requires PILOT_ACCEPTANCE_PASSED=true.

Record PAYMENTS_VERIFIED only after the real Polar sandbox matrix succeeds, AI_VERIFIED after all three profiles complete reviewable provider-backed runs, ANALYTICS_VERIFIED after known view/click events appear in weighted reports and a daily summary, and LINK_SCANNER_VERIFIED after deployed egress and redirect tests. PUBLICATION_VERIFIED requires the production customer installation flow, and MEDIA_BACKUP_VERIFIED requires an independent object copy and restoration. Local mocks and configuration presence do not satisfy these flags.

## Deliberate release limits

Native embedded admin, live collaboration, suggestion mode, multilingual publishing, customer webhooks, scheduling, ownership transfer, MCP, more framework adapters and native comments/newsletters are deferred. The client editor is hosted. Comments/newsletters are customer integrations with separate provider accounts and charges.

Expiry pauses editing immediately, preserves public delivery for 30 days and exports for 90 days before deletion with notices. Downloaded/customer-built copies cannot be withdrawn. No plan silently buys extra storage, link checks or AI credits.

## Current operator choices

Use the free Cloudflare plan and managed workers.dev URLs for now. No domain purchase or Workers Paid upgrade is authorized. The app is https://blogstack-app.hidden-silence-2d18.workers.dev; site, docs and registry use the matching blogstack-site, blogstack-docs and blogstack-registry hostnames. All four npm packages are published at 0.2.0 under the godwinpeace22-owned @blogstack organization.

Polar sandbox has all six products and a verified signed webhook. It is separate from live merchant onboarding. The live form requires the operator's own identity, country, agreement and payout information. Never copy sandbox product IDs or credentials into a production catalog.

Email uses mail.boldlaunchstudio.com. After explicit authorization for email DNS only, all four Resend records were installed in the existing Vercel zone and verified. Root Zoho mail records remain intact. A domain-restricted send-only credential is stored privately. BlogStack hosting remains on Cloudflare. End-to-end auth and scheduled lifecycle emails passed delivery acceptance using the approved disposable sandbox account; see docs/EMAIL-DNS.md. Reverify the sender when moving to the product domain.

The live Polar organization is Wordman Technologies. Six live prices and a disabled signed webhook are staged using .launch/production.env; merchant verification and live activation remain pending. Use scripts/polar-products.mjs --env-file .launch/production.env --apply --prepare-live and scripts/polar-webhook.mjs --env-file .launch/production.env --stage to prepare this configuration without enabling checkout or replacing sandbox credentials.

The operator has deferred further Polar work until purchasing the product domain. Keep the staged live endpoint and checkout disabled; do not resume merchant onboarding or payment tests until instructed. Production installation, recurring SQL/media backups, restoration and delivered alerts are verified. Merchant verification, payment acceptance, operator/legal details and checkout activation remain, followed by the paying pilot. Recorded evidence is in docs/VERIFICATION.md.
