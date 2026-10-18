import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { BRAND } from "@/lib/brand";
import { SEASON } from "@/lib/card";
import { ROLL_ODDS } from "@/lib/odds";
import { commitment, rollOn } from "@/lib/roll";

export const metadata: Metadata = { title: `Odds · ${BRAND.name}` };
export const dynamic = "force-dynamic";

const LABEL = { common: "Common", rare: "Rare", holo: "Holo Rare", secret: "Secret Rare" } as const;

export default function OddsPage() {
  const on = rollOn();
  return (
    <SiteShell>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Published odds</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-7xl">
        Rarity is a roll. <span className="text-accent">Your taste isn&apos;t.</span>
      </h1>
      <p className="mt-5 max-w-xl text-ink-2">
        Your sign, your Big Three and your brands come from what you love, and the same loves always read the same way. How rare the card comes out is
        luck, rolled once when you mint it. Same odds for everyone. Your picks don&apos;t change them, and no money ever buys a roll.
      </p>
      <ul className="mt-10 max-w-md divide-y divide-line border-y border-line">
        {ROLL_ODDS.map((o) => (
          <li key={o.tier} className="flex items-center justify-between py-3">
            <span className="font-display text-lg font-semibold">{LABEL[o.tier]}</span>
            <span className="font-mono text-lg tabular-nums text-accent">{Math.round(o.p * 100)}%</span>
          </li>
        ))}
      </ul>
      <div className="mt-10 max-w-xl space-y-3 text-sm text-ink-2">
        <p>
          <b className="text-ink">One roll per card.</b> It&apos;s tied to your account and the reading you paid for, so reloading or making the same picks
          again gives the same card. A regret redraws the reading, and a Common can come back as Rare at most.
        </p>
        <p>
          <b className="text-ink">Checkable.</b> Each season&apos;s roll key is fixed before it starts. Its fingerprint is below; the key itself is
          published when the season ends, so anyone can recompute their own roll.
        </p>
        {on && (
          <p className="break-all font-mono text-[11px] text-ink-3">
            Season {SEASON} key fingerprint (sha256): {commitment(SEASON)}
          </p>
        )}
        <p>Cards minted before rolls keep the tier their taste score gave them. Battle Packs use the same table.</p>
        <p>
          <b className="text-ink">Money never buys a chance.</b> Battle Packs and any boosted packs cost earned Stardust only, and Stardust is never
          sold. If paid items arrive, they&apos;ll be things you see before you buy, they won&apos;t roll, and a card bought with money earns no
          Stardust.
        </p>
      </div>
      <Link href="/" className="mt-10 inline-block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
        Make your card
      </Link>
    </SiteShell>
  );
}
