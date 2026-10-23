"use client";

import { forwardRef } from "react";
import type { BattleResult } from "@/lib/battle";
import { BRAND } from "@/lib/brand";
import { proxied, typeOf } from "@/lib/card";
import { glyph } from "@/components/card/HoloCard";
import { maskRude } from "@/lib/guard";

/** Works for hex and hsl() type colours alike. */
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/** The postable payoff: joint sign + crossover brand. Self-contained (no blend modes) so it exports to PNG cleanly. */
export const ResultPanel = forwardRef<HTMLDivElement, { res: BattleResult }>(function ResultPanel({ res }, ref) {
  const { jointSign: sign, crossover: x } = res;
  const [ta, tb] = sign.glyphKeywords.map(typeOf);
  return (
    <div ref={ref} className="w-full rounded-[26px] p-[1.5px]" style={{ background: "linear-gradient(135deg, #c6ff3d, #83fff7 35%, #7894ff 60%, #d875ff 85%, #ff7773)" }}>
      <div
        className="relative flex flex-col gap-5 overflow-hidden rounded-[25px] px-5 pb-5 pt-5"
        style={{
          background: `radial-gradient(120% 70% at 100% 0%, ${mix(tb.b, 34)} 0%, transparent 60%), radial-gradient(100% 60% at 0% 100%, ${mix(ta.b, 34)} 0%, transparent 60%), #0b0b10`,
        }}
      >
        <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
          <span className="whitespace-nowrap">{BRAND.name} · VS</span>
          <span className="whitespace-nowrap text-accent">{res.compatibility}% compatible</span>
        </div>

        <div className="flex flex-col gap-1">
          <p className="font-serif text-[17px] italic leading-tight text-ink-2">
            {res.names.a} <span className="text-ink-3">×</span> {res.names.b}
          </p>
          <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Your joint sign</p>
          <h3 className="font-display text-[30px] font-bold leading-[1.02] tracking-tight text-ink">
            <span aria-hidden className="mr-1.5" style={{ color: ta.a }}>
              {glyph(ta.glyph)}
            </span>
            {sign.name}
          </h3>
        </div>

        <ul className="flex flex-wrap gap-2">
          {sign.keywords.map((k) => {
            const t = typeOf(k);
            const both = sign.consensus.some((c) => c.toLowerCase() === k.toLowerCase());
            return (
              <li key={k} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium text-ink" style={{ borderColor: mix(t.a, 40), background: mix(t.b, 15) }}>
                <span aria-hidden style={{ color: t.a }}>
                  {glyph(t.glyph)}
                </span>
                {k}
                {both && <span className="font-mono text-[9.5px] uppercase tracking-wider text-accent">both</span>}
              </li>
            );
          })}
        </ul>

        {x && (
          <div className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-black/35 p-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
              {x.brand.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxied(x.brand.image)} alt="" className="h-full w-full object-contain p-1.5" crossOrigin="anonymous" />
              ) : (
                <span className="font-display text-[24px] font-bold text-black">{x.brand.name[0]}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{x.shared ? "Crossover brand · on both lists" : "Crossover brand"}</p>
              <p className="truncate font-display text-[20px] font-bold leading-tight text-ink">{maskRude(x.brand.name)}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{x.reason}</p>
            </div>
          </div>
        )}

        <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-3">
          <p className="text-[12.5px] leading-snug text-ink-2">{res.verdict.line}</p>
          <p className="shrink-0 text-right font-serif text-[13px] italic text-ink-3">{BRAND.tagline}</p>
        </div>
      </div>
    </div>
  );
});
