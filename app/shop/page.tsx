import { Atelier } from "@/components/shop/Atelier";
import { BattlePack } from "@/components/shop/BattlePack";
import { MarketBar, MarketHead, MarketTicker } from "@/components/shop/Market";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { SkyBackdrop } from "@/components/site/SkyBackdrop";
import c from "@/components/site/celestial.module.css";
import { BRAND } from "@/lib/brand";
import { DUST_BUNDLES, dustSaleOn, formatPrice, paymentsProvider, printsEnabled, PRODUCTS, type Product } from "@/lib/products";

export const metadata: Metadata = { title: `Shop · ${BRAND.name}` };
// Reads PAYMENTS_PROVIDER / PRINTS_ENABLED at request time, so flipping a flag needs no rebuild.
export const dynamic = "force-dynamic";

/**
 * The orbital market: three aisles (Stardust packs, the Stardust atelier, readings and prints in dollars) under a
 * sticky bar with your wallet, and a ticker of real rares from the Hall up top.
 */
export default function ShopPage() {
  const paid = paymentsProvider() !== "none";
  const prints = printsEnabled();
  return (
    <SiteShell>
      <SkyBackdrop dim={0.7} focus={[0.6, 0.3]} />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">The orbital market · est. one galaxy ago</p>
          <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-7xl">
            Spend your <span className="text-accent">stars.</span>
          </h1>
          <p className="mt-4 max-w-xl text-ink-2">
            Packs of strangers to fight, new orbits for your own cards, and more readings. Nothing here re-rolls who you are: change your loves and the stars change with them.
          </p>
        </div>
        {!paid && (
          <p className="max-w-xs shrink-0 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-[13px] leading-snug text-ink-2">
            <span className="mb-1 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Beta market
            </span>
            Stardust works today. Dollar prices show what a future version might cost; nothing takes money.
          </p>
        )}
      </div>

      <MarketTicker />
      <MarketBar />

      <BattlePack />
      <Atelier />

      <section id="readings" className="mt-20 scroll-mt-36">
        <MarketHead
          kicker="Readings & prints"
          pay="usd"
          title={<>More of <span className="text-accent">you.</span></>}
          blurb="Every account starts with free readings and gets another each new moon. These are for when you can't wait."
        />
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* No multi-card packs: a card is an identity, not a pull (docs/design/identity-limits.md). */}
          {PRODUCTS.filter((p) => p.id === "reading" || p.id === "print").map((p, i) => (
            <ProductCard key={p.id} p={p} paid={paid} soon={Boolean(p.physical) && !prints} i={i} />
          ))}
        </ul>

        {dustSaleOn() && (
          <>
            <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">Stardust bundles</p>
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {DUST_BUNDLES.map((b) => (
                <li key={b.id} className={`${c.panel} flex flex-col gap-4 p-6`}>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">{b.name}</p>
                  <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-accent">
                    <span aria-hidden className="mr-1 text-2xl">✦</span>
                    {b.dust}
                  </p>
                  <div className="flex items-center justify-between">
                    <PriceTag cents={b.priceCents} />
                    <span aria-disabled className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-3">
                      Checkout soon
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="mt-14 max-w-xl font-mono text-[11px] leading-relaxed text-ink-3">
        Demo personas and repeat readings never cost anything.{" "}
        <Link href="/account" className="text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
          See your readings and Stardust
        </Link>
        .
      </p>
    </SiteShell>
  );
}

/** A price on a little tag, like a market stall's. */
function PriceTag({ cents, muted = false }: { cents: number; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-display text-[18px] font-bold tabular-nums ${muted ? "border-line text-ink-2" : "border-accent/40 text-ink"}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-current opacity-60" />
      {formatPrice(cents)}
    </span>
  );
}

const ART: Record<Product["id"], string> = { reading: c.star, "shadow-pack": c.eclipse, "domain-deck": c.planet, print: c.print };

function ProductCard({ p, paid, soon, i }: { p: Product; paid: boolean; soon: boolean; i: number }) {
  return (
    <li className={`${c.panel} flex flex-col justify-between gap-8 p-6 sm:p-7 ${soon ? "opacity-80" : ""}`} style={{ animationDelay: `${-i * 1.7}s` }}>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-4">
            <span className={`${c.art} ${ART[p.id]}`} aria-hidden />
            <div>
              <h3 className="font-display text-2xl font-semibold tracking-[-0.03em]">{p.name}</h3>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
                {soon ? "Coming soon" : p.credits > 0 ? `${p.credits} ${p.credits === 1 ? "reading" : "readings"}` : "Posted to you"}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 max-w-sm font-serif text-lg italic leading-snug text-ink-2">{p.blurb}</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2">
          <PriceTag cents={p.priceCents} muted={!paid} />
          {!paid && <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">concept</span>}
        </span>
        {soon ? (
          <span className="rounded-full border border-line px-5 py-2 text-sm text-ink-3">Coming soon</span>
        ) : paid ? (
          <span aria-disabled className="rounded-full border border-line px-5 py-2 text-sm text-ink-3">
            Checkout soon
          </span>
        ) : (
          <Link href="/?new=1" className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-paper transition hover:brightness-110">
            Free during beta
          </Link>
        )}
      </div>
    </li>
  );
}
