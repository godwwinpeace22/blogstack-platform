# Self-host the complete BlogStack platform

BlogStack is MIT-licensed, including the publishing API, dashboard, media service, link scanner, analytics, AI proposal runtime, public packages and operations worker. Run it in **your own Cloudflare account** without a BlogStack Cloud account or subscription. You pay your infrastructure and email providers directly. BlogStack Cloud is the paid, managed alternative.

The supported backend runtime is Cloudflare Workers with D1, R2 and KV. This is a complete platform installation in your account. A Docker/VPS backend runtime is not included; the separate blog frontend also runs on ordinary Node.js.

## Requirements

- Node.js 24 and npm. Bun 1.4.0 is needed to run the contributor test suite.
- Your Cloudflare account ID and its existing `workers.dev` subdomain. No new domain is needed for the dashboard/API installation.
- R2 enabled in that account. Cloudflare may ask you to activate products or provide billing details; complete those steps yourself. The installer never upgrades your plan, accepts terms or buys anything.
- A Resend send-only key and a verified sender for verification, password-reset and invitation emails.
- For reader reports, an Account Analytics Read token for your Cloudflare account. AI uses your Workers AI binding and its provider allowance.
- For optional automated operations, a D1 Write token for SQL exports. That permission also permits database changes across the account; keep it only on the private operations worker.

Review [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and your provider allowances. A self-hosting software license does not include infrastructure, storage, inference or email. Free plan limits can interrupt requests and background work; this guide does not promise that every workload fits a free plan.

## 1. Get the source and authenticate

```sh
git clone https://github.com/godwwinpeace22/blogstack-platform.git
cd blogstack-platform
npm ci
npx wrangler login
npx wrangler whoami
```

Check that Wrangler is using the intended account. An existing `CLOUDFLARE_API_TOKEN` takes precedence over an OAuth login; remove an unrelated environment token or provide a token scoped for the installation. The installer pins every command to the account ID you supply. It never reads BlogStack Cloud's private launch settings or credentials.

## 2. Prepare your installation

Use an unused installation name. The generated resource names are prefixed with it.

```sh
npm run self-host:init -- \
  --name my-blogstack \
  --account-id YOUR_32_CHARACTER_ACCOUNT_ID \
  --workers-subdomain YOUR_WORKERS_SUBDOMAIN \
  --operator-email you@example.com \
  --email-from 'BlogStack <noreply@yourdomain.com>'
```

The subdomain is the account part of `my-blogstack-app.YOUR_WORKERS_SUBDOMAIN.workers.dev`, without `.workers.dev`. `init` generates separate random authentication and upload-signing secrets. It writes restricted files under **`.self-hosted/`**, which Git ignores, and never prints their values. It refuses to overwrite an existing installation.

Open `.self-hosted/secrets.json` locally and fill `RESEND_API_KEY` and `CF_ANALYTICS_TOKEN`. Keep the generated `BETTER_AUTH_SECRET` and `CDN_SECRET`. Never put credentials into website code, `install.json`, Git issues or chat.

The default enables AI and reader analytics. Pass `--without-ai` or `--without-analytics` to `init` to omit those provider bindings. The publishing service still works; disabled reports/assistance show as unavailable. Link checking uses a separate public-egress worker without database bindings or credentials.

To include automated backups and alerts, add `--with-operations` to `init` and set `CF_BACKUP_TOKEN` as well. The installer then creates a separate state database and private backup bucket, four queues and an operations worker with no public route. Backup credentials are never uploaded to the API, CDN or link scanner. Core installations use the durable D1 job outbox plus cron, with jobs starting on the next minute tick.

## 3. Provision and deploy

```sh
npm run self-host:provision
npm run self-host:deploy
npm run self-host:check
```

Provisioning creates a fresh D1 database, two KV namespaces, a private R2 media bucket and installation-specific Worker configuration. Progress is recorded locally so successful resource-creation steps are not repeated. If a provider call fails after creating a resource but before recording it, inspect the generated provision file and your dashboard before retrying; never substitute a managed BlogStack database.

Deployment builds the packages and dashboard, applies additive migrations, marks the new database as self-hosted, uploads only each Worker's required secrets and deploys the scanner, CDN and API/dashboard. An analytics dataset is named per installation; it is created when the first valid event is written. Reports query that same name. No Polar credentials, products, checkouts or subscriptions are involved.

The installer refuses to convert a database that already has managed customer accounts. It does not run deletion commands or change existing managed resources.

Open the printed dashboard URL, register with the operator email and follow the verification email. Signup initially permits the operator and valid invitations. Create a blog, set its actual Website blog URL and invite authors as needed. Authentication and project/account permissions are enforced as usual.

## 4. Connect your website

Use the [Next.js quickstart](https://blogstack-docs.hidden-silence-2d18.workers.dev/docs/quickstart), or the source in `examples/nextjs`. Set `BLOGSTACK_API_URL` to **your new API/dashboard URL**, not the managed BlogStack URL. Set the public project slug and website origin. Public article rendering needs no private management key.

Your website can run on Cloudflare, Node.js or another compatible frontend host. SEO, private revisions, media uploads, roles, analytics and reviewable AI use your installed backend. Your content and credentials are not sent to BlogStack Cloud. Optional comments/newsletter providers and a coding assistant are separate integrations.

## Budgets and access

Self-hosted accounts have no subscription or trial expiry, and expiry jobs do not remove their content. Branding settings are available without a paid plan. Project permissions, upload validation, revision checks and human approval for AI proposals remain enforced.

`.self-hosted/install.json` contains operator-controlled resource budgets: unlimited blogs, 100 people per account, 100 GB media per account, 500 AI credits/month, 25,000 external checks/month, 365 days of analytics history and 10,000 posts/blog by default. Images remain limited to 10 MiB. These are safety budgets, not purchased storage or provider usage. Adjust `limits` and redeploy to change them. Database guards enforce reservations atomically. New self-hosted accounts refresh AI/check budgets on calendar months.

No automatic provider top-up or BlogStack overage purchase is performed. Monitor your provider account separately. Only an operator with deployment/database access can change self-hosting mode or budgets; there is no customer API or header to grant it.

## Upgrades, backups and recovery

Before upgrading, export your database and copy the matching media objects. Keep private configuration, migration state and secret recovery instructions outside the server/account as well. Pull a reviewed source revision, run `npm ci`, then `self-host:deploy`; resource IDs and generated secrets are reused. Review migration release notes before a production update. The installer does not downgrade a schema or automatically roll back data.

With operations enabled, open `/operations` as the verified operator. Confirm the heartbeat, complete a backup, verify an incident/recovery email and restore into separate resources before relying on the schedule. The default daily backup starts at 02:00 UTC; SQL copies retain 30 days, Sunday copies 90 days, and media versions 90 days after their last snapshot reference. Download a completed operations snapshot with `node scripts/download-operations-backup.mjs --config .self-hosted/ops.wrangler.json --bucket my-blogstack-backups --snapshot SNAPSHOT_UUID --kind daily --directory /new/private/recovery-directory`. Use your actual bucket, snapshot kind and ID. The destination must not exist, and files/checksums are verified. Same-account copies do not protect against losing that Cloudflare account. See [RESTORE.md](RESTORE.md) for the recovery checklist; use your installation's generated configuration and resources rather than managed service IDs.

Custom domains are optional. Add `"domains": {"app": "publish.yourdomain.com", "media": "media.yourdomain.com"}` to `install.json` using domains in your Cloudflare account, then redeploy. The installer binds these custom domains and rebuilds the dashboard with the matching API origin. Do not set a cookie domain wider than necessary. Keep `workers_dev=false` and `preview_urls=false` on the scanner and operations worker. Never add internal bindings or credentials to the scanner.

## Local development without cloud credentials

In a separate clone:

```sh
npm ci
npm run self-host:init -- --local
npm run self-host:dev
```

Open `http://localhost:8787` and use `owner@example.com` for the local operator. Verification/reset links appear only in the local process console. D1, R2 and KV persist under `.self-hosted/state`. If those ports are already in use, edit `localPorts` in `install.json` before starting; debugger ports are allocated independently. Public egress runs in a separate local Worker. Local mode does not bind remote AI, Analytics Engine, queues or automated operations, and does not require Polar or a Cloudflare login. Use your cloud installation to verify real provider inference, analytics and transactional delivery.

For a bundling check without creating/deploying anything:

```sh
npm run self-host:deploy -- --local --dry-run
```

## Acceptance before serving real users

Verify registration/email recovery, invitation acceptance, image upload, publish/private revision/republish/unpublish, public HTML/SEO and export using your own installed URLs. Check account isolation, AI proposal review and stale revisions. Verify reports after sending opted-in article events and run an external link audit. Exercise budget reservations concurrently. If using operations, verify a completed backup, delivered alerts and a restore into independent resources. `self-host:check` checks reachability; it does not claim to complete that acceptance on your behalf.
