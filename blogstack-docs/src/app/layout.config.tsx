import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: <span style={{ fontWeight: 700 }}>BlogStack</span>,
  },
  links: [
    {
      text: "Home",
      url: "https://blogstack-site.hidden-silence-2d18.workers.dev",
    },
    {
      text: "Dashboard",
      url: "https://blogstack-app.hidden-silence-2d18.workers.dev",
    },
  ],
};
