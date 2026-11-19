# Contributing to BlogStack

The complete platform is available under the [MIT license](LICENSE). Issues and pull requests are welcome at https://github.com/godwwinpeace22/blogstack-platform.

Use Node.js 24, npm and Bun 1.4.0. Run `npm ci`, `npm run build:packages`, `npm run typecheck`, `npm test` and `npm run build`. The CI job builds the API, media/scanner/operations workers and checks tracked source as well. It requires no production secrets and never deploys.

See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for local development and full installation in your Cloudflare account. Keep `.self-hosted/`, local databases, exported content, credentials, screenshots with private data and backups out of commits. Use synthetic accounts and isolated resources for tests.

Changes that affect migrations, permissions, resource budgets, billing, public delivery or proposal review need meaningful regression coverage. Keep managed and self-hosted behavior explicit, and document new provider dependencies. Include the observed behavior, change and validation in your pull request.

Do not post credentials or private customer data in issues. See [SECURITY.md](SECURITY.md) for private reporting.
