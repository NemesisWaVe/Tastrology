"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { useHasPlace } from "./AfterFirstCard";
import { Mark } from "./Mark";

const PILL =
  "inline-flex items-center whitespace-nowrap rounded-full border border-white/15 bg-paper/75 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink shadow-[0_6px_24px_-10px_rgba(0,0,0,0.9)] backdrop-blur-md transition hover:border-accent hover:text-accent";

/**
 * The top bar for the full-sky pages (battles, shared cards): it sits over galaxies and glow, so each side is its own
 * frosted pill. Home on the left; My deck and Friends once you have a card, else `label`.
 */
export function FloatNav({ label, className = "" }: { label?: string; className?: string }) {
  const has = useHasPlace();
  return (
    <nav className={`relative z-10 flex items-center justify-between gap-2 py-3 ${className}`}>
      <Link href="/" aria-label={BRAND.name} className={`${PILL} gap-2 !pl-1.5 font-display text-[15px] font-bold normal-case tracking-tight !text-ink`}>
        <Mark size={24} />
        {BRAND.name}
      </Link>
      {has ? (
        <span className="flex items-center gap-2">
          <Link href="/deck" className={PILL}>My deck</Link>
          <Link href="/friends" className={PILL}>Friends</Link>
        </span>
      ) : (
        label && <span className={PILL}>{label}</span>
      )}
    </nav>
  );
}
