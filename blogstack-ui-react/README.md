# BlogStack UI

Add a working blog to your React app. Choose a layout, connect a published BlogStack project, and customize only what you need.

```tsx
import { Blog } from "@/components/ui/blog";

export default function BlogPage() {
  return <Blog projectSlug="my-project" title="Our journal" layout="editorial" />;
}
```

`Blog` includes fetching, search, tag filtering, cursor pagination, article pages, author information, safe HTML rendering, loading states, empty states, and retry controls. No API key or SDK is needed for public content. Use `apiUrl` to point at a self-hosted/local API.

## Three starting points

| Install | Use it for |
| --- | --- |
| `blog` | A complete blog with built-in `?post=slug` navigation and shareable links. |
| `blog-index` | A complete listing page when your application already handles routing. |
| `blog-post` | A complete article page for your existing post route. |

The primary registry advertises these three templates. Supporting cards, filters and primitives install automatically. They are available individually in the advanced catalog, but users do not need to assemble them.

## Install editable source

Use a React + Tailwind CSS 4 project initialized with shadcn. This installs source files into your configured UI and library directories, following the [shadcn registry format](https://ui.shadcn.com/docs/registry).

The registry is built locally; it has **not been published to a production URL**.

```sh
# In blogstack-registry
npm run build
npm run serve

# In the consuming app (initialize only if needed)
npx shadcn@latest init -d
npx shadcn@latest add http://localhost:4173/r/blog.json
```

Import from your configured UI alias. The default is `@/components/ui/blog`. The source belongs to the consumer; changes do not require a BlogStack release. React 18 and 19 are supported.

## Simple customization

```tsx
<Blog
  projectSlug="my-project"
  title="Field notes"
  description="Ideas from our team."
  layout="grid" // editorial (default), grid, or list
  pageSize={9}
  showSearch
  showTags
  header={<SiteHeader />}
  footer={<SiteFooter />}
/>
```

Use the host application's shadcn/Tailwind theme for colors and dark mode. `className`, `renderCard`, and `renderContent` are optional escape hatches. A custom `renderContent` is responsible for sanitizing any raw HTML it injects.

## Existing routing

```tsx
<BlogIndex
  projectSlug="my-project"
  postHref={post => `/blog/${encodeURIComponent(post.slug)}`}
/>

// On /blog/:slug
<BlogPost projectSlug="my-project" slug={slug} backHref="/blog" />
```

The self-contained `Blog` owns the `post` query parameter; mount one per page. Browser Back/Forward and direct article links are supported. Its listing filters reset when returning from an article.

## SSR and static generation in any framework

The data layer uses the standard Fetch API and has no React, Next.js, or Node.js dependency. Call it during an Astro build, in a Remix loader, on an edge worker, in a server route, or in the browser.

```tsx
import { createBlogClient } from "@blogstack/ui/client";
import { BlogIndex, BlogPost } from "@blogstack/ui";

const blog = createBlogClient({ projectSlug: "my-project" });
const [page, tags] = await Promise.all([
  blog.listPosts({ limit: 9 }),
  blog.listTags(),
]);

<BlogIndex
  projectSlug="my-project"
  initialPosts={page.data}
  initialTags={tags}
  initialNextCursor={page.nextCursor}
  postHref={post => `/blog/${post.slug}`}
/>;

// On the article route:
const post = await blog.getPost(slug);
<BlogPost projectSlug="my-project" slug={slug} initialPost={post} backHref="/blog" />;
```

The host controls routing, caching, revalidation, and metadata. The initial listing and article render as HTML immediately; after hydration, filtering, search, pagination, and retry behavior continue through the same data source. You can also pass a custom `dataSource` to either template.

The self-contained `Blog` remains the lowest-setup client option because it owns query-string navigation. Use `BlogIndex` and `BlogPost` when route-specific HTML and SEO metadata matter.

## Optional npm package

After building/publishing the package, consumers may import `Blog` from `@blogstack/ui/components/blog` (or the root package) instead of copying source. This mode does not provide editable source in the consumer's app.

```css
@import "tailwindcss";
@import "@blogstack/ui/styles";
/* Adjust this path relative to your stylesheet. */
@source "../node_modules/@blogstack/ui/src";
```

If the host already has shadcn theme variables, keep its theme rather than importing ours. The standalone theme is opt-in; component installation does not overwrite a host theme. The `styles` export contains Tailwind 4 theme mappings, not precompiled utility CSS. Existing animation utilities require the host's animation plugin if desired.

## Preview and verification

```sh
npm install
npm run preview  # http://127.0.0.1:4174 — labelled sample content
npm run typecheck
npm test
npm run build
```

The preview uses the same `Blog` component with a local sample API. Automated interaction tests cover article navigation, shared links, search, filters, pagination, error retry, HTML sanitization, keyboard tabs/accordion controls and dialog focus.

## Advanced components

There are 45 source component families. In addition to the complete templates, the catalog includes blog cards/lists, author cards, related posts, search, tag filters, forms, dialogs, sheets, tables, tabs, accordions, pagination, progress, sliders, and loading/empty states. Browse `blogstack-registry/public/r/catalog.json` after building. Individual source components remain optional customization tools.
