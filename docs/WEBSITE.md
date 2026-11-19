# Marketing website and Google Analytics

Updated November 19, 2026.

The Astro website uses launch-facing presentation for personal blogs, company publications and agency/client work. Its main signup links point to the publishing app. This presentation does not change the app's pilot allowlist, checkout-disabled setting, Cloudflare plan or the hold on Polar.

## Content and setup

The homepage and features page share sections for publishing, audiences, SEO/analytics/link health, reviewable publishing assistants, AI-assisted code setup and self-hosting. The setup builder at /get-started generates a prompt using only a public project slug and website origin. /setup-prompt.txt and /llms.txt provide machine-readable entry points. The helper uses the customer's existing coding assistant; it is not a hosted installation agent or an MCP integration and does not consume BlogStack credits.

Self-hosting covers the MIT website components/SDK and Next.js frontend. The complete publishing backend is not publicly distributed. A fresh download of the public starter installed, built and served article HTML, metadata, structured data, RSS and sitemap on ordinary Node.js. Functional evidence is in local artifacts/verification/self-hosting-node.json. Dependency-maintenance advisories from that separate install are recorded in self-hosting-dependency-advisories.json; functional acceptance is not a vulnerability-free audit.

## Google Analytics

The operator created the free BlogStack GA4 account under hello@boldlaunchstudio.com and accepted Google's terms. Property: BlogStack website; reporting time: Nigeria (Africa/Lagos); currency: USD. Account ID 417013648, property ID 565225466, web stream ID 16374616198, public measurement ID G-J3M19JGYVZ. The stream URL is the current Cloudflare marketing URL. Update it when the product domain is acquired.

Optional account data-sharing choices and enhanced measurement are disabled. This website sends an explicit page_view after consent with query/fragment-free page location and origin-only referrer. It does not send the setup form values, account data or drafts. Google signals and advertising personalization remain disabled. No Measurement Protocol API secret was created.

The measurement ID is public configuration in blogstack-site/src/lib/site.ts and can be overridden by PUBLIC_GOOGLE_ANALYTICS_ID. Development mode does not load the tag. The static production build includes the ID but loads Google's script only after optional analytics is accepted. Fonts are served locally with their SIL Open Font Licenses, so they do not generate pre-consent Google requests.

## Consent and policies

The notice offers Essential only and Accept analytics. It remembers the choice in localStorage for 180 days, allows reopening from every page's footer, respects Do Not Track and Global Privacy Control, and handles unavailable storage. Withdrawing a previously accepted choice disables the tag, removes accessible analytics cookies and reloads without Google's script. Consent and setup-input regressions run in the root CI suite.

Normal Chrome acceptance verified refusal, persistence across pages, reopening and browser privacy-signal handling. This browser's privacy signal prevents its own analytics collection; do not disable that signal merely to populate the GA dashboard. Native Google event ingestion has not been claimed from that browser. Eligible visitors who explicitly accept analytics can be measured after deployment; Google may take time to show incoming data.

Privacy, terms and cookie policy pages explain the separate marketing GA4 and cookieless BlogStack article analytics. The cookie choice does not limit site access.

## Social links

The requested placeholder social links deliberately use example.com/blogstack/github, /x and /linkedin. Override PUBLIC_GITHUB_URL, PUBLIC_X_URL and PUBLIC_LINKEDIN_URL with owned profiles before sharing publicly. Do not expose the private platform repository as a public-source download.
