# BlogStack Next.js reference

This application shows native /blog and /blog/[slug] routes with request-time fetching, initial article HTML, search/social metadata, BlogPosting JSON-LD, RSS, a separate blog sitemap and optional analytics.

For the standalone download, run `npm install`. Copy `.env.example` to a private `.env.local`, set the public project slug, API URL and website origin, and set the identical website blog URL in BlogStack project settings. Run `npm run dev` from this directory. `npm run build` checks the production application.

When working inside the BlogStack monorepo instead, install the root workspace and build packages first.

For an existing website, copy the blog routes and adapt imports. Keep the website's existing main sitemap and robots rules. Add the blog sitemap to those rules; the included root sitemap is only an example of independent host content.

Do not put private API keys into public rendering code. Use public project reads. Add customer-owned comments/newsletter components to the named article slots if needed; those providers remain separate.

The public packages are published as version 0.2.0. `node scripts/verify-packages.mjs --published` verifies a clean installation from npm.

For Cloudflare Workers, prepare a standalone installation from the repository root:

```sh
node scripts/prepare-production-install.mjs --directory /absolute/path/to/new-site --project your-project --api https://your-api.workers.dev --site https://your-site.workers.dev --worker your-site --account YOUR_CLOUDFLARE_ACCOUNT_ID
```

The destination must not exist. The command copies the native blog routes, pins the published SDK/UI packages, and configures the official OpenNext Cloudflare adapter and Worker assets. In the generated directory run `npm install`, `npm run build:cloudflare`, then `npm run deploy:cloudflare` using your own Cloudflare login. Keep `.env.local` private. Deployment uses Cloudflare only; no Vercel project or account is needed.
