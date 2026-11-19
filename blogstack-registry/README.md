# BlogStack registry

The main catalog contains three complete templates: **blog**, **blog-index**, and **blog-post**. Installing a template copies its source and every dependency into the consumer's project. Users start with a finished blog, then customize as needed.

```sh
npm run build
npm run serve
# In a Tailwind 4 / shadcn app:
npx shadcn@latest add http://localhost:4173/r/blog.json
```

`public/r/registry.json` is the primary template catalog. `public/r/catalog.json` is the complete advanced catalog; individual components remain addressable by URL. `all.json` installs the complete blog. `all-primitives.json` is the explicit advanced bundle of every source component.

Before hosting, rebuild with the real public base URL so dependency links point to the same deployment:

```sh
REGISTRY_BASE_URL=https://your-domain.example/r npm run build
```

Serve `public/` as static files. No production hosting or npm publishing has been performed. Registry content is generated directly from `../blogstack-ui-react/src`; never edit generated JSON. Source aliases are rewritten to shadcn conventions and resolved by the consumer's `components.json`.

Components inherit the consumer's theme. The optional `theme.json` installs `styles/blogstack.css`; import it into global CSS only if the app does not already define shadcn tokens.
