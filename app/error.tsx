"use client";

import Link from "next/link";
import { useEffect } from "react";

const STORE = "tastrology:v1";

/** Route-level crash screen. "Clear saved sign" covers the one crash we can cause ourselves: a bad saved result. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const clearAndReset = () => {
    try {
      localStorage.removeItem(STORE);
    } catch {}
    reset();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Something slipped</p>
      <h1 className="font-serif text-5xl italic leading-[0.95]">The stars knocked something over.</h1>
      <p className="text-ink-2">This page fell over while drawing. Try again first. If it keeps happening, clearing your saved sign usually sorts it out; you can always read a new one.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-full bg-accent px-6 py-3 font-semibold text-paper">
          Try again
        </button>
        <button type="button" onClick={clearAndReset} className="rounded-full border border-line px-6 py-3 font-semibold text-ink hover:border-ink-3">
          Clear saved sign
        </button>
      </div>
      <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3 hover:text-ink-2">
        Back to the start
      </Link>
      {error.digest && <p className="font-mono text-[10px] text-ink-3">ref {error.digest}</p>}
    </main>
  );
}
