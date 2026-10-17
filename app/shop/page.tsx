import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { SkyBackdrop } from "@/components/site/SkyBackdrop";
import c from "@/components/site/celestial.module.css";
import { BRAND } from "@/lib/brand";
import { formatPaise, paymentsProvider, printsEnabled, PRODUCTS, type Product } from "@/lib/products";

export const metadata: Metadata = { title: `Shop · ${BRAND.name}` };
// Reads PAYMENTS_PROVIDER / PRINTS_ENABLED at request time, so flipping a flag needs no rebuild.
export const dynamic = "force-dynamic";

export default function ShopPage() {
  const paid = paymentsProvider() !== "none";
  const prints = printsEnabled();
  return (
    <SiteShell>
      <SkyBackdrop dim={0.7} focus={[0.6, 0.3]} />
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">The orbital market · est. one galaxy ago</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-7xl">
        New loves, <span className="text-accent">new sign.</span>
      </h1>
      <p className="mt-4 max-w-xl text-ink-2">
        Your card is worked out from what you love, so nothing here is a re-roll. Change the inputs and the stars change with them.
      </p>
      {!paid && (
        <div className="mt-6 max-w-xl rounded-2xl border border-accent/40 bg-accent-soft px-5 py-4">
          <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Concept shop · nothing is for sale
          </p>
          <p className="mt-2 text-sm text-ink-2">
            {BRAND.name} is a student hackathon project and every reading is free during the beta. Prices show what a future version might cost.
          </p>
        </div>
      )}

      <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {PRODUCTS.map((p, i) => (
          <ProductCard key={p.id} p={p} paid={paid} soon={Boolean(p.physical) && !prints} i={i} />
        ))}
      </ul>

      <p className="mt-10 max-w-xl font-mono text-[11px] leading-relaxed text-ink-3">
        Every account starts with free readings. Demo personas and repeat readings never cost anything.{" "}
        <Link href="/account" className="text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
          See your credits
        </Link>
        .
      </p>
    </SiteShell>
  );
}

const ART: Record<Product["id"], string> = { reading: c.star, "shadow-pack": c.eclipse, "domain-deck": c.planet, print: c.print };

function ProductCard({ p, paid, soon, i }: { p: Product; paid: boolean; soon: boolean; i: number }) {
  return (
    <li
      className={`${c.panel} flex flex-col justify-between gap-8 p-6 sm:p-7 ${soon ? "opacity-80" : ""}`}
      style={{ animationDelay: `${-i * 1.7}s` }}
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className={`${c.art} ${ART[p.id]}`} aria-hidden />
            <h2 className="font-display text-2xl font-semibold tracking-[-0.03em]">{p.name}</h2>
          </div>
          {soon ? (
            <span className="shrink-0 rounded-full border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">Coming soon</span>
          ) : (
            p.credits > 0 && (
              <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
                {p.credits} {p.credits === 1 ? "reading" : "readings"}
              </span>
            )
          )}
        </div>
        <p className="mt-2 max-w-sm font-serif text-lg italic leading-snug text-ink-2">{p.blurb}</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className={`font-display text-xl font-semibold ${paid ? "text-ink" : "text-ink-3"}`}>
          {formatPaise(p.pricePaise)}
          {!paid && <span className="ml-2 align-middle font-mono text-[10px] font-normal uppercase tracking-[0.18em]">concept</span>}
        </p>
        {soon ? (
          <span className="rounded-full border border-line px-5 py-2 text-sm text-ink-3">Not yet</span>
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
