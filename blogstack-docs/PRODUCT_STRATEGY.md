# BlogStack product strategy

## Product promise

> Add a complete blog to any website in minutes. Own the frontend; BlogStack runs everything behind it.

BlogStack is the blog layer for websites developers and agencies already build. The common workflow is:

1. Install native blog routes and editable UI into an existing site.
2. Connect those routes to a BlogStack project.
3. Match the site's design without an iframe or a second hosted website.
4. Invite the client to write and publish in the BlogStack dashboard.
5. Keep managing the project as an agency, or transfer ownership to the client.

Every product decision should reduce the time, code, and operational work required to complete that workflow.

## Product layers

### Open integration layer

- Public content client and API types
- Editable blog templates and supporting components
- Framework adapters
- Metadata, JSON-LD, sitemap, and RSS generators
- Themes and content renderer
- CLI installer
- Self-hostable publishing core and basic editorial experience
- MCP tools

### BlogStack Cloud

- Managed API, database, media storage, CDN, backups, and monitoring
- Hosted editor and client dashboard
- Teams, roles, invitations, and project ownership transfer
- Comments and moderation
- Newsletter subscriptions and delivery
- Analytics and AI writing tools
- Multi-project agency management and billing

Self-hosting is an escape hatch. The default experience should be BlogStack Cloud because operating the publishing system is the work customers want BlogStack to remove.

## Integration levels

1. **Complete install:** one command creates the blog index, article routes, metadata, sitemap, RSS, and selected features.
2. **Framework adapter:** native routing and rendering for Next.js, Astro, Remix, Nuxt, SvelteKit, and other supported hosts.
3. **Editable templates:** React and Tailwind source installed through the registry.
4. **Headless client:** framework-neutral data access for custom implementations.
5. **Client embed:** a low-setup option for sites without a server or build integration.

SSR means rendering through the host framework. It must never mean requiring Next.js.

## Delivery order

### Foundation

- Complete React blog, listing, and article templates
- Framework-neutral public content client
- Public content API, SDK, media delivery, webhooks, and project roles
- Client-scoped dashboard access

### Seamless installation

- `npx blogstack add blog`
- Framework detection and route generation
- Metadata, JSON-LD, sitemap, and RSS generation
- Cloud or self-hosted connection setup
- Installation verification and safe re-runs

### Agency handover

- Client invitations with limited project access
- Project templates and cloning
- Ownership transfer
- Agency overview across projects
- Consolidated billing and reusable defaults

### Complete publication operations

- Comments and moderation
- Newsletter signup, subscribers, campaigns, and delivery
- Analytics
- MCP tools for posts, media, comments, subscribers, and workflows

## Positioning guardrails

- Lead with adding a blog to an existing site and handing publishing to a client.
- Show a complete installed blog before showing individual components or API calls.
- Treat framework support as native adapters over a shared data layer.
- Describe components, APIs, edge delivery, and MCP as supporting capabilities.
- The marketing site should communicate the complete product vision. Documentation and onboarding must distinguish what is available now from what is planned.
- Measure success by time to a production blog and successful client handover.
