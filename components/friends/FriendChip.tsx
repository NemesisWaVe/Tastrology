"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** On a shared card (`?f=<player code>`): a quiet way to add whoever shared it. Hidden on your own links. */
export function FriendChip({ className = "" }: { className?: string }) {
  const [pc, setPc] = useState<string | null>(null);
  useEffect(() => {
    const f = new URLSearchParams(location.search).get("f")?.toUpperCase() ?? "";
    let own = "";
    try {
      own = localStorage.getItem("tastrology:pc") ?? "";
    } catch {}
    if (/^[0-9A-HJKMNP-TV-Z]{6}$/.test(f) && f !== own) setPc(f);
  }, []);
  if (!pc) return null;
  return (
    <Link
      href={`/f/${pc}`}
      className={`inline-flex items-center gap-2 rounded-full border border-accent/50 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition hover:bg-accent hover:text-paper ${className}`}
    >
      Add them as a friend →
    </Link>
  );
}
