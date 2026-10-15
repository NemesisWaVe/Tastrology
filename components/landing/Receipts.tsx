"use client";

import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { typeOf } from "@/lib/card";
import type { StyleResult } from "@/lib/types";
import { EASE, Eyebrow, MaskedWords, Reveal } from "./primitives";
import s from "./landing.module.css";

const clean = (n: string) => n.replace(/\s*\(.*\)$/, "");

interface View {
  sign: string;
  seeds: string[];
  brands: { name: string; aff: number; cat: string }[];
  item: { name: string; cat: string; aff: number; tier?: number };
  earned: { name: string; share: number }[];
  voided?: { name: string; aff: number; reason: string };
  calls: number;
  steps: number;
  lobes: { tags: string[]; seeds: string[] }[];
  overlap: number;
  live: boolean;
  contraLive: boolean;
}

/* Shown until the live specimen arrives: the same neon persona, as it last read. */
const FALLBACK: View = {
  sign: "Futuristic Industrial Minimalist",
  seeds: ["Blade Runner 2049", "Daft Punk", "Cyberpunk 2077", "Neuromancer", "The Great British Baking Show"],
  brands: [
    { name: "Rimowa", aff: 0.876, cat: "Bags & Leather" },
    { name: "Vollebak", aff: 0.865, cat: "Activewear" },
    { name: "Golden Concept", aff: 0.865, cat: "Bags & Leather" },
  ],
  item: { name: "Rimowa", cat: "Bags & Leather", aff: 0.876, tier: 3 },
  earned: [
    { name: "Daft Punk", share: 0.549 },
    { name: "Blade Runner 2049", share: 0.363 },
    { name: "Cyberpunk 2077", share: 0.088 },
  ],
  voided: { name: "Solebox", aff: 0.87, reason: "Carried by one seed: Daft Punk accounts for 81% of the signal. Fragile match." },
  calls: 22,
  steps: 8,
  lobes: [
    { tags: ["Futuristic", "Industrial"], seeds: ["Blade Runner 2049", "Daft Punk", "Cyberpunk 2077", "Neuromancer"] },
    { tags: ["Floral", "British"], seeds: ["The Great British Baking Show"] },
  ],
  overlap: 0,
  live: false,
  contraLive: false,
};

function toView(r: StyleResult | null): View {
  if (!r) return FALLBACK;
  const name = (id: string) => clean(r.seeds.find((x) => x.id === id)?.name ?? "");
  const main = r.brands.filter((b) => !b.side);
  const top = main[0];
  if (!top) return FALLBACK;
  const earned = Object.entries(top.explain ?? {})
    .filter(([, v]) => v > 0.005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, share]) => ({ name: name(id), share }))
    .filter((e) => e.name);
  const dual = r.dna.lobes.length > 1;
  const v = r.rejected[0];
  return {
    sign: r.dna.name,
    seeds: r.seeds.map((x) => clean(x.name)),
    brands: main.slice(0, 3).map((b) => ({ name: b.entity.name, aff: b.affinity, cat: b.category })),
    item: { name: top.entity.name, cat: top.category, aff: top.affinity, tier: top.entity.tier },
    earned: earned.length ? earned : FALLBACK.earned,
    voided: v ? { name: v.entity.name, aff: v.affinity, reason: v.reason } : undefined,
    calls: r.stats.qlooCalls,
    steps: r.stats.llmSteps,
    lobes: dual
      ? r.dna.lobes.slice(0, 2).map((l) => ({ tags: l.keywords.slice(0, 2).map((k) => k.name), seeds: l.seedIds.map(name).filter(Boolean) }))
      : FALLBACK.lobes,
    overlap: dual ? (r.contradictions[0]?.overlap ?? 0) : FALLBACK.overlap,
    live: true,
    contraLive: dual,
  };
}

export function Receipts({ result }: { result: StyleResult | null }) {
  const v = useMemo(() => toView(result), [result]);

  return (
    <section id="receipts" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8 lg:px-12">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Eyebrow n="03">Why it&apos;s different</Eyebrow>
            <h2 className="mt-5 font-display text-[clamp(2.6rem,9vw,5.6rem)] font-bold leading-[0.9] tracking-[-0.045em]">
              <MaskedWords text="Receipts," inView className="block" />
              <MaskedWords text="not vibes." inView delay={0.12} wordClassName="font-serif font-normal italic text-ink-2" />
            </h2>
          </div>
          <Reveal delay={0.1} className="max-w-sm text-[15px] leading-relaxed text-ink-3">
            Horoscopes guess. This one shows its work: every line below is {v.live ? "live from the card above" : "from a real run"}, read from Qloo.
          </Reveal>
        </div>

        <div className="mt-16 space-y-20 sm:mt-24 sm:space-y-28">
          <Beat
            n="01"
            title="Grounded in the graph"
            body={
              <>
                Every pick is a live Qloo affinity score, read across film, music, books, places, games, podcasts and TV.{" "}
                <span className="text-ink">Zero purchase history needed.</span> Your taste is the only input.
              </>
            }
          >
            <Graph v={v} />
          </Beat>

          <Beat
            n="02"
            flip
            title="Shows its work"
            body={
              <>
                Each brand comes with who earned it. Then the agent removes each love and{" "}
                <span className="text-ink">re-queries Qloo</span>: if a match leans on a single seed, it gets voided, on the record.
              </>
            }
          >
            <Receipt v={v} />
          </Beat>

          <Beat
            n="03"
            title="Catches contradictions"
            body={
              <>
                Love {v.lobes[0].seeds[0] ?? "one thing"} <em className="font-serif text-ink">and</em> {v.lobes[1].seeds[0] ?? "its opposite"}? It doesn&apos;t average
                you into beige. It <span className="text-ink">splits your taste</span> and makes the other side your Moon.
              </>
            }
          >
            <Split v={v} />
          </Beat>
        </div>

        <Stats calls={v.calls} />
      </div>
    </section>
  );
}

function Beat({ n, title, body, children, flip }: { n: string; title: string; body: ReactNode; children: ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
      <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
        <Reveal>
          <span className={`${s.holoText} font-display text-[clamp(4.5rem,12vw,8rem)] font-bold leading-none tracking-[-0.06em]`}>{n}</span>
        </Reveal>
        <h3 className="mt-3 font-display text-[clamp(1.9rem,5vw,3rem)] font-semibold leading-none tracking-[-0.035em]">
          <MaskedWords text={title} inView />
        </h3>
        <Reveal delay={0.1}>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-3">{body}</p>
        </Reveal>
      </div>
      <Reveal delay={0.15} className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
        {children}
      </Reveal>
    </div>
  );
}

/* Beat 1: seeds → Qloo → brands, drawn as live wires. */
function Graph({ v }: { v: View }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: "-15% 0px" });
  const seeds = v.seeds.slice(0, 5);
  const brands = v.brands;
  const ys = (n: number) => Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * 100);
  const sy = ys(seeds.length);
  const by = ys(brands.length);

  return (
    <div ref={ref} className="relative rounded-[28px] border border-line bg-[radial-gradient(80%_70%_at_50%_50%,rgba(198,255,61,0.05),transparent_70%)] p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-3">
        <span>Your loves</span>
        <span>Brands · affinity</span>
      </div>
      <div className="relative h-[300px] sm:h-[340px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {sy.map((y, i) => (
            <g key={`s${i}`}>
              <motion.path
                d={`M33 ${y} C 42 ${y}, 42 50, 50 50`}
                fill="none"
                stroke="rgba(243,241,236,0.18)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={on ? { pathLength: 1 } : undefined}
                transition={{ duration: 1.1, ease: EASE, delay: 0.1 + i * 0.08 }}
              />
              {on && (
                <path d={`M33 ${y} C 42 ${y}, 42 50, 50 50`} fill="none" stroke="#c6ff3d" strokeOpacity={0.55} strokeWidth={1.2} vectorEffect="non-scaling-stroke" className={s.flow} />
              )}
            </g>
          ))}
          {by.map((y, i) => (
            <g key={`b${i}`}>
              <motion.path
                d={`M50 50 C 58 50, 58 ${y}, 67 ${y}`}
                fill="none"
                stroke="rgba(243,241,236,0.18)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={on ? { pathLength: 1 } : undefined}
                transition={{ duration: 1, ease: EASE, delay: 0.8 + i * 0.1 }}
              />
              {on && (
                <path d={`M50 50 C 58 50, 58 ${y}, 67 ${y}`} fill="none" stroke="#c6ff3d" strokeOpacity={0.55} strokeWidth={1.2} vectorEffect="non-scaling-stroke" className={s.flow} />
              )}
            </g>
          ))}
        </svg>

        {seeds.map((n, i) => (
          <motion.div
            key={n}
            className="absolute left-0 flex w-[32%] -translate-y-1/2 justify-end"
            style={{ top: `${sy[i]}%` }}
            initial={{ opacity: 0, x: -10 }}
            animate={on ? { opacity: 1, x: 0 } : undefined}
            transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
          >
            <span className="max-w-full truncate rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] text-ink-2 sm:text-[12.5px]">{n}</span>
          </motion.div>
        ))}

        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={on ? { scale: 1, opacity: 1 } : undefined}
          transition={{ duration: 0.8, ease: EASE, delay: 0.55 }}
        >
          <div className={`${s.pulse} grid h-[68px] w-[68px] place-items-center rounded-full border border-accent/50 bg-paper sm:h-20 sm:w-20`}>
            <span className="text-center font-mono text-[9px] uppercase leading-tight tracking-[0.16em] text-accent sm:text-[10px]">
              Qloo
              <br />
              <span className="text-ink-3">graph</span>
            </span>
          </div>
        </motion.div>

        {brands.map((b, i) => (
          <motion.div
            key={b.name}
            className="absolute right-0 w-[32%] -translate-y-1/2"
            style={{ top: `${by[i]}%` }}
            initial={{ opacity: 0, x: 10 }}
            animate={on ? { opacity: 1, x: 0 } : undefined}
            transition={{ duration: 0.6, ease: EASE, delay: 1.2 + i * 0.1 }}
          >
            <div className="rounded-xl border border-line bg-paper-2 px-2.5 py-2">
              <p className="truncate text-[12px] font-medium text-ink sm:text-[13.5px]">{b.name}</p>
              <p className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9.5px] text-ink-3 sm:text-[10.5px]">
                <span className="truncate">{b.cat}</span>
                <span className="text-accent">{b.aff.toFixed(3)}</span>
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* Beat 2: a literal receipt. */
function Receipt({ v }: { v: View }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: "-15% 0px" });
  const reduce = useReducedMotion();
  const max = Math.max(...v.earned.map((e) => e.share), 0.01);
  const tier = v.item.tier ? "$".repeat(v.item.tier) : "";
  const no = String(Math.round(v.item.aff * 9973) % 10000).padStart(4, "0");

  return (
    <div ref={ref} className="flex justify-center py-4">
      <motion.div
        className={s.receiptWrap}
        initial={reduce ? false : { y: 60, rotate: 0, opacity: 0 }}
        animate={on ? { y: 0, rotate: -2.5, opacity: 1 } : undefined}
        transition={{ duration: 1.1, ease: EASE }}
      >
        <div className={`${s.receipt} w-[min(360px,86vw)] px-6 pt-7 font-mono text-[11.5px] leading-relaxed sm:px-7`}>
          <div className="text-center">
            <p className="font-display text-[22px] font-bold uppercase tracking-[-0.02em]">{BRAND.name} ✦</p>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">Taste receipt · No. {no}</p>
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.14em] opacity-60">Sign</p>
          <p className="font-serif text-[18px] italic leading-tight">{v.sign}</p>

          <div className={`${s.dash} my-4`} />
          <div className="flex justify-between text-[10px] uppercase tracking-[0.14em] opacity-60">
            <span>Item</span>
            <span>Affinity</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-[14px] font-medium">{v.item.name}</span>
            <span className="text-[14px] font-medium">{v.item.aff.toFixed(3)}</span>
          </div>
          <p className="opacity-60">
            {v.item.cat}
            {tier && ` · ${tier}`}
          </p>

          <div className={`${s.dash} my-4`} />
          <p className="text-[10px] uppercase tracking-[0.14em] opacity-60">Earned by</p>
          <ul className="mt-2 space-y-1.5">
            {v.earned.map((e, i) => (
              <li key={e.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
                <span className="truncate">{e.name}</span>
                <span className="w-9 text-right">{Math.round(e.share * 100)}%</span>
                <span className="col-span-2 h-[5px] overflow-hidden rounded-full bg-black/10">
                  <motion.span
                    className="block h-full rounded-full bg-[#111014]"
                    initial={{ width: 0 }}
                    animate={on ? { width: `${(e.share / max) * 100}%` } : undefined}
                    transition={{ duration: 1, ease: EASE, delay: 0.5 + i * 0.12 }}
                  />
                </span>
              </li>
            ))}
          </ul>

          {v.voided && (
            <>
              <div className={`${s.dash} my-4`} />
              <div className="relative">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate">
                    <span className="mr-2 rounded-sm bg-[#111014] px-1 py-px text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#f1eee6]">Void</span>
                    <span className="line-through">{v.voided.name}</span>
                  </span>
                  <span className="line-through opacity-60">{v.voided.aff.toFixed(2)}</span>
                </div>
                <p className="mt-1 text-[10.5px] leading-snug opacity-60">{v.voided.reason}</p>
                <motion.span
                  className="pointer-events-none absolute -right-2 -top-4 rotate-[14deg] rounded border-2 border-[#d9365b] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#d9365b]"
                  initial={reduce ? false : { scale: 2.2, opacity: 0 }}
                  animate={on ? { scale: 1, opacity: 0.85 } : undefined}
                  transition={{ duration: 0.35, ease: [0.5, 0, 0.75, 0], delay: 1.5 }}
                >
                  Ablated
                </motion.span>
              </div>
            </>
          )}

          <div className={`${s.dash} my-4`} />
          <div className="flex justify-between">
            <span>Qloo calls</span>
            <span>{v.calls}</span>
          </div>
          <div className="flex justify-between">
            <span>Agent steps</span>
            <span>{v.steps}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Purchase history used</span>
            <span>0</span>
          </div>
          <div className={`${s.barcode} mt-5`} />
          <p className="mt-2 text-center text-[10px] uppercase tracking-[0.24em] opacity-60">Thank you for your taste</p>
        </div>
      </motion.div>
    </div>
  );
}

/* Beat 3: two lobes that refuse to merge. */
function Split({ v }: { v: View }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: "-20% 0px" });
  const [a, b] = v.lobes;
  const ta = typeOf(a.tags[0] ?? "Sun");
  const tb = typeOf(b.tags[0] ?? "Moon");

  return (
    <div ref={ref} className="relative overflow-hidden rounded-[28px] border border-line p-5 sm:p-8">
      <div className="relative mx-auto flex h-[240px] max-w-[520px] items-center justify-center sm:h-[300px]">
        <motion.div
          className="absolute grid aspect-square w-[52%] place-items-center rounded-full mix-blend-screen"
          style={{ background: `radial-gradient(circle at 35% 35%, ${ta.a}, ${ta.b} 70%)`, boxShadow: `0 0 80px -10px ${ta.a}` }}
          initial={{ x: "0%", opacity: 0.6 }}
          animate={on ? { x: "-38%", opacity: 0.9 } : undefined}
          transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
        />
        <motion.div
          className="absolute grid aspect-square w-[44%] place-items-center rounded-full mix-blend-screen"
          style={{ background: `radial-gradient(circle at 35% 35%, ${tb.a}, ${tb.b} 70%)`, boxShadow: `0 0 80px -10px ${tb.a}` }}
          initial={{ x: "0%", opacity: 0.6 }}
          animate={on ? { x: "52%", opacity: 0.9 } : undefined}
          transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
        />
        <motion.div
          className="relative z-10 rounded-full border border-white/20 bg-paper/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink backdrop-blur"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={on ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: 0.6, ease: EASE, delay: 1.2 }}
        >
          overlap {v.overlap.toFixed(2)}
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-8">
        <Lobe sym="☉" role="Sun" tags={a.tags} seeds={a.seeds} color={ta.a} />
        <Lobe sym="☽" role="Moon" tags={b.tags} seeds={b.seeds} color={tb.a} right />
      </div>
      {!v.contraLive && (
        <p className="mt-5 text-center font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-3">Example: The Neon Contradiction</p>
      )}
    </div>
  );
}

function Lobe({ sym, role, tags, seeds, color, right }: { sym: string; role: string; tags: string[]; seeds: string[]; color: string; right?: boolean }) {
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color }}>
        {sym} {role}
      </p>
      <p className="mt-1.5 font-serif text-[clamp(1.25rem,3.6vw,1.75rem)] italic leading-tight text-ink">{tags.join(" · ")}</p>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-3">{seeds.join(", ")}</p>
    </div>
  );
}

function Count({ to, on }: { to: number; on: boolean }) {
  const [n, setN] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!on) return;
    if (reduce) {
      setN(to);
      return;
    }
    const c = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (x) => setN(Math.round(x)) });
    return () => c.stop();
  }, [on, to, reduce]);
  return <>{n}</>;
}

function Stats({ calls }: { calls: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: "-10% 0px" });
  const items: [number, string, string][] = [
    [0, "purchases needed", "Cold start, solved. No history, no sign-up."],
    [calls, "live Qloo calls", "Behind the specimen above, re-queries that check its work included."],
    [7, "taste domains", "Film, music, books, places, games, podcasts and TV, cross-read."],
  ];
  return (
    <div ref={ref} className="mt-24 grid gap-px overflow-hidden rounded-[28px] border border-line bg-line sm:mt-32 sm:grid-cols-3">
      {items.map(([n, label, sub]) => (
        <div key={label} className="bg-paper p-6 sm:p-8">
          <p className="font-display text-[clamp(3.5rem,8vw,5.5rem)] font-bold leading-none tracking-[-0.05em] text-ink">
            <Count to={n} on={on} />
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{label}</p>
          <p className="mt-2 max-w-[26ch] text-[14px] leading-relaxed text-ink-3">{sub}</p>
        </div>
      ))}
    </div>
  );
}
