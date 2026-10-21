import Link from "next/link";
import { Mark } from "./Mark";
import { AuthNav } from "@/components/auth/AuthNav";
import { BRAND } from "@/lib/brand";
import { LegalLinks } from "./LegalLinks";
import { SoundToggle } from "./SoundToggle";
import { AfterFirstCard } from "./AfterFirstCard";
import { PhoneMenu } from "./PhoneMenu";

/** Nav + footer for the quiet pages (shop, account, legal, sign-in). Same look as /deck. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-clip">
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-10 sm:px-6 sm:pt-14">{children}</main>
      <footer className="border-t border-line/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
            {BRAND.cardSet} · {BRAND.tagline}
          </p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-line/60 bg-paper/70 px-4 py-3 backdrop-blur-md sm:px-6">
      <Link href="/" aria-label={BRAND.name} className="flex shrink-0 items-center gap-2 font-display text-lg font-bold tracking-tight">
        <Mark size={34} />
        <span>{BRAND.name}</span>
      </Link>
      <span className="flex items-center gap-2.5 sm:gap-4">
        {/* phones: links move into the menu, so the bar fits a 320px screen */}
        <span className="hidden items-center gap-4 sm:flex">
        <AfterFirstCard>
        <Link href="/shop" className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2 transition hover:text-ink sm:text-[11px] sm:tracking-[0.18em]">
          Shop
        </Link>
        <Link href="/deck" className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2 transition hover:text-ink sm:text-[11px] sm:tracking-[0.18em]">
          My deck
        </Link>
        <Link href="/friends" className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2 transition hover:text-ink sm:text-[11px] sm:tracking-[0.18em]">
          Friends
        </Link>
        </AfterFirstCard>
        </span>
        <SoundToggle />
        <AuthNav />
        <Link href="/?new=1" className="hidden rounded-full border border-line px-4 py-1.5 text-sm text-ink-2 hover:border-ink-3 hover:text-ink sm:inline-block">
          New sign
        </Link>
        <PhoneMenu />
      </span>
    </nav>
  );
}
