"use client";

import { forwardRef } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import type { BattleResult } from "@/lib/battle";
import { BRAND } from "@/lib/brand";
import { rng } from "@/components/reveal/skyFigures";

/** 9:16 fight image (360x640, exported at 3x). Both card fronts, score, the roast from the biggest-margin round, joint sign, crossover. */
export const FightShare = forwardRef<HTMLDivElement, { res: BattleResult }>(function FightShare({ res }, ref) {
  const margin = (r: (typeof res.rounds)[number]) => (r.winner === "tie" ? -1 : Math.abs(r.a - r.b));
  const top = [...res.rounds].sort((x, y) => margin(y) - margin(x))[0];
  const x = res.crossover;
  const ta = res.cards.a.types[0]?.a ?? "#c6ff3d";
  const tb = res.cards.b.types[0]?.a ?? "#d875ff";
  // Two tinted nebulae meeting at a lime seam, plus a seeded scatter of stars: plain gradients, so it exports cleanly.
  const r = rng(`share:${res.cards.a.serial}:${res.cards.b.serial}`);
  const dust = Array.from({ length: 34 }, () => `radial-gradient(${(0.6 + r() * 0.9).toFixed(1)}px ${(0.6 + r() * 0.9).toFixed(1)}px at ${(r() * 100).toFixed(1)}% ${(r() * 100).toFixed(1)}%, rgb(255 255 255 / ${(0.35 + r() * 0.5).toFixed(2)}), transparent)`);
  const sky = [
    ...dust,
    "radial-gradient(18% 9% at 50% 21%, rgb(198 255 61 / 0.45), transparent 70%)",
    `radial-gradient(55% 32% at 22% 22%, color-mix(in srgb, ${ta} 38%, transparent), transparent 70%)`,
    `radial-gradient(55% 32% at 78% 22%, color-mix(in srgb, ${tb} 38%, transparent), transparent 70%)`,
    "#07070a",
  ].join(", ");
  return (
    <div
      ref={ref}
      aria-hidden
      style={{ position: "fixed", left: -10000, top: 0, width: 360, height: 640, background: sky, color: "#f3f3f5", display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 18px", gap: 12, overflow: "hidden" }}
    >
      <p className="font-mono" style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.6 }}>{BRAND.name} · VS</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <HoloCard card={res.cards.a} width={158} idle={false} still />
        <HoloCard card={res.cards.b} width={158} idle={false} still />
      </div>
      <p className="font-display" style={{ fontSize: 54, fontWeight: 700, lineHeight: 1, color: "#c6ff3d" }}>
        {res.score.a}<span style={{ opacity: 0.4 }}> : </span>{res.score.b}
      </p>
      {top && top.winner !== "tie" && <p className="font-serif" style={{ fontSize: 16, fontStyle: "italic", textAlign: "center", lineHeight: 1.25, opacity: 0.9 }}>{top.roast}</p>}
      <div style={{ marginTop: "auto", width: "100%", border: "1px solid rgba(255,255,255,.14)", borderRadius: 16, padding: "12px 14px", textAlign: "center" }}>
        <p className="font-mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55 }}>Joint sign · {res.compatibility}% compatible</p>
        <p className="font-display" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{res.jointSign.name}</p>
        {x && <p style={{ fontSize: 12.5, marginTop: 6, opacity: 0.8 }}>Crossover brand: <b style={{ color: "#c6ff3d" }}>{x.brand.name}</b></p>}
      </div>
    </div>
  );
});
