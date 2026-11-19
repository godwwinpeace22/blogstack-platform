import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="mx-auto flex max-w-6xl gap-6 px-6 py-5">
          <Link href="/">Your website</Link>
          <Link href="/blog">Blog</Link>
          <a href="/blog/feed.xml">RSS</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
