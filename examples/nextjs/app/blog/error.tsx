"use client";
export default function BlogError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24" role="alert">
      <h1 className="text-3xl">The blog is temporarily unavailable</h1>
      <p className="my-5">Please try again shortly.</p>
      <button className="rounded border px-4 py-2" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
