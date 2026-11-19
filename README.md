# BlogStack

Open-source blog publishing for personal websites, company publications and agencies. A focused editor, private drafts, native website components, SEO checks, link health, optional reader analytics and reviewable AI suggestions.

The **complete platform is MIT-licensed**: dashboard, publishing API, media service, link scanner, analytics, AI runtime, operations worker, SDK, editor and React components. [View the source](https://github.com/godwwinpeace22/blogstack-platform) or use [BlogStack Cloud](https://blogstack-site.hidden-silence-2d18.workers.dev) for paid managed hosting.

## Host it yourself

Install the full backend and dashboard in **your Cloudflare account**. No BlogStack Cloud account, subscription or Polar setup is required. You own the database, media, deployment and provider credentials. Infrastructure and email charges are yours.

```sh
git clone https://github.com/godwwinpeace22/blogstack-platform.git
cd blogstack-platform
npm ci
npx wrangler login
npm run self-host:init -- \
  --name my-blogstack \
  --account-id YOUR_ACCOUNT_ID \
  --workers-subdomain YOUR_WORKERS_SUBDOMAIN \
  --operator-email you@example.com \
  --email-from 'BlogStack <noreply@yourdomain.com>'
```

Fill your email/analytics credentials in the generated private `.self-hosted/secrets.json`, then:

```sh
npm run self-host:provision
npm run self-host:deploy
npm run self-host:check
```

Follow the [complete self-hosting guide](docs/SELF_HOSTING.md) for provider prerequisites, optional automated backups/alerts, resource budgets, upgrades and acceptance. Cloudflare Workers/D1/R2/KV is the supported backend runtime. Your blog frontend can also run on Node.js. A Docker/VPS backend port is not included.

## Try it locally

Use Node.js 24. In a separate clone, no cloud credentials are needed:

```sh
npm ci
npm run self-host:init -- --local
npm run self-host:dev
```

Open `http://localhost:8787`. Local email links appear in the process console; use `owner@example.com` as the operator. Real inference, Analytics Engine, email delivery and automated operations are verified in your own cloud installation. Local state and generated credentials are Git-ignored.

## Build your blog frontend

The public JavaScript SDK is framework independent. The complete reference uses Next.js App Router with server-rendered articles, metadata, structured data, sitemap and RSS. Editable React components and the BlockNote editor are included.

See [examples/nextjs](examples/nextjs), the [quickstart](https://blogstack-docs.hidden-silence-2d18.workers.dev/docs/quickstart) and the [AI-assisted setup guide](https://blogstack-docs.hidden-silence-2d18.workers.dev/docs/ai-setup). Use your installed API URL when self-hosting.

## Managed hosting

BlogStack Cloud runs the platform for you, including infrastructure, transactional email, operations and provider integration. Plans are Solo $3/month, Studio $9/month and Growth $19/month, with annual options. Studio and Growth include unlimited blogs; Growth includes 100 GB shared storage. See the [pricing page](https://blogstack-site.hidden-silence-2d18.workers.dev/pricing) for managed allowances.

Self-hosted accounts have no trial or subscription expiry. Operators configure their own safety budgets, and authorization, upload validation and human review for AI edits remain enforced.

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [third-party notices](THIRD_PARTY_NOTICES.md). The root workspace builds the API, dashboard, packages, registry, marketing site, docs and reference website together. npm `private: true` on application workspaces prevents accidental npm publishing; it does not limit the MIT source license.

Managed service release and acceptance notes are in [docs/RELEASING.md](docs/RELEASING.md). Deployment credentials, customer data, backups and the original multi-repository workspace metadata are excluded from this repository.
