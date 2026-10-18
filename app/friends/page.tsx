import type { Metadata } from "next";
import { FriendsView } from "@/components/friends/FriendsView";
import { SiteShell } from "@/components/site/SiteShell";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Friends · ${BRAND.name}` };

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const add = ((await searchParams).add ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
  return (
    <SiteShell>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Your circle</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-6xl">
        Friends, then <span className="text-accent">fights.</span>
      </h1>
      <p className="mb-8 mt-4 max-w-xl text-ink-2">Add people by code. Challenge them to a friendly fight, or put Stardust on a blind draw. Nothing starts until they accept.</p>
      <FriendsView prefill={add} />
    </SiteShell>
  );
}
