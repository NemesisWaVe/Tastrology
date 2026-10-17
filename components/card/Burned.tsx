import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { CursorArrow } from "@/components/CursorArrow";

/** 410: the owner burned this card (docs/design/burn.md). Ash, a lime afterglow, and the way back to minting. */
export function Burned({ code, what = "card" }: { code: string; what?: string }) {
  return (
    <div className="relative max-w-md text-center">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-6 -z-10 h-56 w-56 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <p aria-hidden className="font-mono text-[13px] tracking-[0.6em] text-ink-3">
        · ˙ . · ˙ ·
      </p>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Burned</p>
      <h1 className="mt-3 font-serif text-5xl italic leading-[0.95]">Only dust left.</h1>
      <p className="mt-3 text-ink-2">
        The owner of {what} No. {code} burned it, so this link shows nothing now. It comes back only if someone reads the same loves fresh.
      </p>
      <Link href="/" className="group mt-8 inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 font-semibold text-paper">
        Get your own {BRAND.name} sign
        <CursorArrow className="h-9 w-9 bg-paper text-accent" />
      </Link>
    </div>
  );
}
