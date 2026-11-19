import Link from "next/link";
export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-5xl">Your existing website</h1>
      <p className="mt-6">
        The blog uses your routes and your website's styles.
      </p>
      <Link className="mt-8 inline-block underline" href="/blog">
        Read the blog
      </Link>
    </main>
  );
}
