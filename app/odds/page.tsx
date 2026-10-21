import type { Metadata } from "next";
import Link from "next/link";
import { PageSky } from "@/components/site/PageSky";
import { SiteShell } from "@/components/site/SiteShell";
import { BRAND } from "@/lib/brand";
import { SEASON } from "@/lib/card";
import { ROLL_ODDS } from "@/lib/odds";
import { commitment, rollOn } from "@/lib/roll";
import { dustSaleOn } from "@/lib/products";

export const metadata: Metadata = { title: `Odds · ${BRAND.name}` };
export const dynamic = "force-dynamic";

/** HoloCard's RARITY_GLOW, repeated here: a server page can't read values out of a client module. */
const RARITY_GLOW = { common: "#c7ccd4", rare: "#7dd3fc", holo: "#c4b5fd", secret: "#fcd34d" } as const;
const LABEL = { common: "Common", rare: "Rare", holo: "Holo Rare", secret: "Secret Rare" } as const;

export default function OddsPage() {
  const on = rollOn();
  return (
    <SiteShell>
      <PageSky />
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Published odds</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-7xl">
        Rarity is a roll. <span className="text-accent">Your taste isn&apos;t.</span>
      </h1>
      <p className="mt-5 max-w-xl text-ink-2">
        Your sign, your Big Three and your brands come from what you love, and the same loves always read the same way. How rare the card comes out is
        luck, rolled once when you mint it. Same odds for everyone. Your picks don&apos;t change them, and no money ever buys a roll.
      </p>
      {/* The whole table as one strip of 100 pulls, then each tier with its share of that strip. */}
      <section className="mt-10 max-w-xl rounded-[22px] border border-white/[0.07] bg-paper/70 p-5 backdrop-blur-sm sm:p-6">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Every 100 pulls, on average</p>
        <div className="mt-4 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1" aria-hidden>
          {ROLL_ODDS.flatMap((o) => Array.from({ length: Math.round(o.p * 100) }, (_, i) => (
            <span key={`${o.tier}${i}`} className="aspect-[63/88] rounded-[2px]" style={{ background: RARITY_GLOW[o.tier], opacity: o.tier === "common" ? 0.28 : 0.95, boxShadow: o.tier === "common" ? undefined : `0 0 8px ${RARITY_GLOW[o.tier]}` }} />
          )))}
        </div>
        <ul className="mt-5 flex flex-col gap-3">
          {ROLL_ODDS.map((o) => (
            <li key={o.tier} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RARITY_GLOW[o.tier], boxShadow: `0 0 8px ${RARITY_GLOW[o.tier]}` }} />
              <span className="w-28 shrink-0 font-display text-lg font-semibold">{LABEL[o.tier]}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full rounded-full" style={{ width: `${o.p * 100}%`, background: RARITY_GLOW[o.tier] }} />
              </span>
              <span className="w-12 text-right font-mono text-lg tabular-nums" style={{ color: RARITY_GLOW[o.tier] }}>
                {Math.round(o.p * 100)}%
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">1 in {Math.round(1 / (ROLL_ODDS.find((o) => o.tier === "secret")?.p ?? 0.02))} is a Secret Rare</p>
      </section>
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
        <p>Cards minted before rolls keep the tier their taste score gave them. The Star Pack uses the same table; the Flare and Supernova packs publish their boosted tables on the shop page.</p>
        <p>
          {dustSaleOn() ? (
            <>
              <b className="text-ink">Packs cost Stardust, never money directly.</b> Stardust is earned by retiring cards, or bought in bundles, and also pays
              for recasts and living sigils. Every pack&apos;s odds are published before you open it, there is one pack a day at most, and nothing you pull
              can be sold or cashed out.
            </>
          ) : (
            <>
              <b className="text-ink">Money never buys a chance.</b> Battle Packs and any boosted packs cost earned Stardust only, and Stardust is never
              sold. If paid items arrive, they&apos;ll be things you see before you buy, they won&apos;t roll, and a card bought with money earns no
              Stardust.
            </>
          )}
        </p>
      </div>
      <Link href="/" className="mt-10 inline-block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
        Make your card
      </Link>
    </SiteShell>
  );
}
