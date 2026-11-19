export const APP_URL =
  import.meta.env.PUBLIC_APP_URL ||
  "https://blogstack-app.hidden-silence-2d18.workers.dev";
export const DOCS_URL =
  import.meta.env.PUBLIC_DOCS_URL ||
  "https://blogstack-docs.hidden-silence-2d18.workers.dev";
export const DEMO_URL =
  import.meta.env.PUBLIC_DEMO_URL ||
  "https://blogstack-blog.hidden-silence-2d18.workers.dev/blog";
export const SUPPORT_EMAIL =
  import.meta.env.PUBLIC_SUPPORT_EMAIL || "hello@boldlaunchstudio.com";
export const ACCESS_URL = APP_URL + "/register";
export const ACCESS_LABEL = "Start free trial";
// A GA4 measurement ID is public configuration, not a credential.
export const GOOGLE_ANALYTICS_ID = import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID || "";
export const STARTER_URL =
  "https://blogstack-registry.hidden-silence-2d18.workers.dev/downloads/blogstack-nextjs-0.2.0.tar.gz";
export const SOURCE_URL = "https://github.com/godwwinpeace22/blogstack-platform";
export const SOCIAL_LINKS = [
  {
    label: "GitHub",
    href:
      import.meta.env.PUBLIC_GITHUB_URL ||
      SOURCE_URL,
  },
  {
    label: "X",
    href: import.meta.env.PUBLIC_X_URL || "https://example.com/blogstack/x",
  },
  {
    label: "LinkedIn",
    href:
      import.meta.env.PUBLIC_LINKEDIN_URL ||
      "https://example.com/blogstack/linkedin",
  },
];
