import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider";
import "fumadocs-ui/style.css";

export const metadata = {
  title: {
    template: "%s — BlogStack Docs",
    default: "BlogStack Documentation",
  },
  description:
    "Installable, customizable BlogStack components with optional API reference for advanced integrations.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider search={{ options: { type: "static" } }}>{children}</RootProvider>
      </body>
    </html>
  );
}
