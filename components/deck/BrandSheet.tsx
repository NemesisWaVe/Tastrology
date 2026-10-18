"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReceiptBody, ReceiptPaper } from "@/components/card/Receipt";
import { brandLink } from "@/components/results/Brands";
import { Thumb } from "@/components/results/ui";
import { readSeen, writeSeen, type Seen } from "@/lib/brandSeen";
import { displayName, proxied, type CardData } from "@/lib/card";
import type { Drift } from "@/lib/drift";
import type { Snap, SnapBrand } from "@/lib/receipt";
import { sfx } from "@/lib/sound";
import type { StyleResult } from "@/lib/types";

type Reply = { status: "fresh" | "lite" | "faded" | "burned" | "error"; snap?: Snap; drift?: Drift | null; error?: string };

/**
 * A receipt for cards whose full reading wasn't kept: printed from the re-read brands, so every card still has its
 * proof of purchase. Marked as a reprint on the paper.
 */
function reprintOf(snap: Snap, card: CardData): StyleResult {
  return {
    runId: "reprint",
    mode: "live",
    planner: "autopilot",
    createdAt: snap.at,
    seeds: snap.loves.map((l) => ({ id: l.id, name: l.name, kind: l.kind as never, image: l.image, tags: [] })),
    dna: { name: card.archetype, tagline: "", keywords: [], lobes: [] },
    brands: snap.brands.map((b) => ({
      entity: { id: b.id, name: b.name, kind: "brand", image: b.image, site: b.site, instagram: b.instagram, tags: [] },
      affinity: b.affinity,
      category: b.category,
      explain: b.explain,
      ablation: b.ablation,
      because: b.because,
      why: b.why,
    })),
    rejected: [],
  } as unknown as StyleResult;
}

const img = (u?: string) => (u ? (u.startsWith("/") ? u : proxied(u)) : undefined);
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function click(code: string, b: { id: string }, src: string) {
  try {
    void fetch(`/api/card/${encodeURIComponent(code)}/click`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brand: b.id, src }), keepalive: true });
  } catch {}
}

/** The loves as a small constellation: tap a star to see what it pulled in. Pure SVG, no animation loop. */
function LoveSky({ loves, sel, onSel }: { loves: Snap["loves"]; sel: string; onSel: (id: string) => void }) {
  const W = 480;
  const H = 120;
  const pts = loves.map((l, i) => {
    const x = loves.length === 1 ? W / 2 : 40 + (i * (W - 80)) / (loves.length - 1);
    const y = 46 + Math.sin(i * 2.1 + 0.7) * 22;
    return { ...l, x, y };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label="Your loves">
      {pts.slice(1).map((p, i) => (
        <line key={p.id} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y} stroke="rgb(255 255 255 / .18)" strokeWidth="1" />
      ))}
      {pts.map((p, i) => {
        const on = p.id === sel;
        return (
          <g
            key={p.id}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={p.name}
            className="cursor-pointer outline-none"
            onClick={() => {
              sfx("tick", { i });
              onSel(p.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSel(p.id);
              }
            }}
          >
            <circle cx={p.x} cy={p.y} r="18" fill="transparent" />
            {on && <circle cx={p.x} cy={p.y} r="11" fill="none" stroke="#c6ff3d" strokeOpacity=".5" />}
            <circle cx={p.x} cy={p.y} r={on ? 5.5 : 3.5} fill={on ? "#c6ff3d" : "#e9f0ff"} />
            <text x={p.x} y={p.y + 30} textAnchor="middle" className={`font-mono text-[10px] ${on ? "fill-[#c6ff3d]" : "fill-[rgb(255_255_255/.45)]"}`}>
              {displayName(p.name).slice(0, 16)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function BrandRow({ b, love, loves, code, onJump, src }: { b: SnapBrand; love: Snap["loves"][number]; loves: Snap["loves"]; code: string; onJump: (id: string) => void; src: string }) {
  const share = Math.round((b.explain[love.id] ?? 0) * 100);
  const drop = Math.round(b.ablation[love.id] ?? 0);
  const others = b.because.filter((id) => id !== love.id).map((id) => loves.find((l) => l.id === id)).filter((x): x is Snap["loves"][number] => Boolean(x)).slice(0, 2);
  const link = brandLink(b);
  return (
    <li className="rise flex gap-4 border-t border-line/70 py-4 first:border-t-0">
      <Thumb src={img(b.image)} name={b.name} size={44} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-lg font-semibold">{b.name}</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">{b.category}</span>
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {share > 0 ? <b className="font-semibold text-ink">{share}% of the pull</b> : "In the pull"}
          {drop > 0 && <span className="text-ink-3"> · without {displayName(love.name)} it drops {drop} points</span>}
        </p>
        {others.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">also pulled by</span>
            {others.map((o) => (
              <button key={o.id} type="button" onClick={() => onJump(o.id)} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:border-accent hover:text-ink">
                {displayName(o.name)}
              </button>
            ))}
          </p>
        )}
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => click(code, b, src)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-paper transition hover:bg-accent"
        >
          {link.label} <span aria-hidden>↗</span>
        </a>
        <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{link.note}</span>
      </div>
    </li>
  );
}

/**
 * "Pulled": a card's brands as a reverse lookup (docs/design/brand-return-ui.md). Pick a love, see only what it
 * brought in; fresh brands this week; the original receipt as a stub. Not the first-mint printer on purpose.
 */
export function BrandSheet({
  code,
  card,
  open,
  onClose,
  src = "deck",
  sealed = false,
  owned = false,
  onOpened,
}: {
  code: string;
  card: CardData;
  open: boolean;
  onClose: () => void;
  src?: string;
  /** This week's seal is unbroken: open on the fresh brands. */
  sealed?: boolean;
  /** The viewer minted this card: opening breaks the seal and may pay the weekly bonus (lib/brandOpen.ts). */
  owned?: boolean;
  onOpened?: (dust: number) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const [r, setR] = useState<Reply | null>(null);
  const [sel, setSel] = useState<string>("");
  const [seen, setSeen] = useState<Seen | null>(null);
  // The receipt: pinned at the top, folded to its head until unrolled. Never the printing show (that's the first mint's).
  const [full, setFull] = useState<StyleResult | null>(null);
  const [unrolled, setUnrolled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const freshRef = useRef<HTMLElement>(null);
  const [shared, setShared] = useState<string | null>(null);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  // Breaking the seal: once per open, owners only. The bonus is for opening, never for clicking out.
  useEffect(() => {
    if (!open || !owned) return;
    void fetch(`/api/card/${encodeURIComponent(code)}/opened`, { method: "POST" })
      .then((x) => (x.ok ? (x.json() as Promise<{ status: string; dust?: number }>) : null))
      .then((j) => {
        if (!j) return;
        if (j.status === "paid" && j.dust) {
          setToast(`+${j.dust} Stardust. See you Monday.`);
          sfx("reveal");
        }
        if (j.status === "paid" || j.status === "capped" || j.status === "opened") onOpenedRef.current?.(j.status === "paid" ? (j.dust ?? 0) : 0);
      })
      .catch(() => {});
  }, [open, owned, code]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    sfx("flip");
    setSeen(readSeen(code));
    let off = false;
    fetch(`/api/card/${encodeURIComponent(code)}/receipt?drift=1&full=1`, { cache: "no-store" })
      .then((x) => x.json() as Promise<Reply & { result?: StyleResult }>)
      .then((j) => {
        if (off) return;
        setR(j);
        setFull(j.result ?? null);
      })
      .catch(() => !off && setR({ status: "error" }));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.documentElement.style.overflow = "hidden";
    return () => {
      off = true;
      window.removeEventListener("keydown", esc);
      document.documentElement.style.overflow = "";
    };
  }, [open, code, onClose]);

  const snap = r?.snap;
  // Default star: the strongest love; from the third visit, the one whose brands moved most, so it opens somewhere new.
  useEffect(() => {
    if (!snap || sel) return;
    const weight = (id: string) => snap.brands.reduce((a, b) => a + (b.explain[id] ?? 0), 0);
    const ranked = [...snap.loves].sort((a, b) => weight(b.id) - weight(a.id));
    const pick = (seen?.visits ?? 0) >= 2 && ranked.length > 1 ? ranked[(seen?.visits ?? 0) % ranked.length] : ranked[0];
    if (pick) setSel(pick.id);
    writeSeen(code, snap.brands.map((b) => b.id), seen);
  }, [snap, sel, seen, code]);

  // A sealed week with fresh brands opens on them.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!sealed || scrolled.current || !r?.drift?.entered.length || !freshRef.current) return;
    scrolled.current = true;
    freshRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [sealed, r, reduce]);

  const sharePull = async () => {
    const names = (r?.drift?.entered.length ? r.drift.entered : (snap?.brands ?? [])).slice(0, 3).map((b) => b.name);
    const url = `${location.origin}/c/${code}?b=1`;
    const text = `My taste pulled in ${names.join(", ")} this week.`;
    try {
      const png = await fetch(`/c/${encodeURIComponent(code)}/postcard`).then((x) => (x.ok ? x.blob() : null));
      const file = png ? new File([png], `tastrology-${code}.png`, { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text, url });
      else if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShared("Link copied.");
      }
    } catch {}
  };

  const love = snap?.loves.find((l) => l.id === sel);
  const pulled = useMemo(() => {
    if (!snap || !love) return [];
    const by = snap.brands.filter((b) => b.because.includes(love.id) || (b.explain[love.id] ?? 0) > 0);
    return by.sort((a, b) => (b.explain[love.id] ?? 0) - (a.explain[love.id] ?? 0)).slice(0, 3);
  }, [snap, love]);
  const silent = snap ? snap.loves.filter((l) => !snap.brands.some((b) => b.because.includes(l.id) || (b.explain[l.id] ?? 0) > 0)) : [];

  const since = (() => {
    if (!seen || !snap) return null;
    const now = new Set(snap.brands.map((b) => b.id));
    const was = new Set(seen.brands);
    const nu = [...now].filter((x) => !was.has(x)).length + (r?.drift?.entered.length ?? 0);
    const gone = [...was].filter((x) => !now.has(x)).length + (r?.drift?.left.length ?? 0);
    if (!nu && !gone) return `Nothing moved since ${day(seen.at)}.`;
    return `Since ${day(seen.at)}: ${nu} new brand${nu === 1 ? "" : "s"}${gone ? `, ${gone} gone` : ""}.`;
  })();

  const reread = async () => {
    setBusy(true);
    const j = (await fetch(`/api/card/${encodeURIComponent(code)}/receipt?reread=1`, { cache: "no-store" }).then((x) => x.json()).catch(() => null)) as Reply | null;
    setBusy(false);
    if (j?.snap) {
      sfx("reveal");
      setR(j);
    } else setR((cur) => ({ ...(cur ?? { status: "faded" }), error: j?.error ?? "Couldn't re-read it just now." }));
  };

  const receipt = full ?? (snap ? reprintOf(snap, card) : null);
  const reprint = !full && Boolean(snap);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex justify-end bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`Brands pulled by ${card.archetype}`}
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? false : { x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="h-[100dvh] w-full overflow-y-auto overscroll-contain border-l border-line bg-[var(--card,#0d0d12)] px-5 pb-16 pt-5 sm:w-[560px] sm:px-8"
          >
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-accent">Pulled by your taste</p>
                <h2 className="mt-1 truncate font-serif text-3xl italic leading-tight">{card.archetype}</h2>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">No. {card.serial} · {code}</p>
              </div>
              <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-line px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 hover:text-ink">
                Close
              </button>
            </header>

            {toast && (
              <p role="status" className="mt-4 rounded-full border border-accent/50 bg-accent/10 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                {toast}
              </p>
            )}

            {receipt && (
              <section className="mt-5">
                <ReceiptPaper curl>
                  {unrolled ? (
                    <ReceiptBody card={card} result={receipt} stagger={false} />
                  ) : (
                    <div className="px-5 pt-3 font-mono text-[11px] uppercase leading-[1.55] tracking-[0.06em]">
                      <p className="text-center text-[18px] font-bold tracking-[0.18em]">Tastrology</p>
                      <p className="mt-1 flex justify-between">
                        <span>order #{card.serial}</span>
                        <span>{day(receipt.createdAt)}</span>
                      </p>
                      <p className="mt-2 border-t border-dashed border-black/30 pt-2">
                        {receipt.seeds.length} loves · {receipt.brands.length} brands
                      </p>
                      <p className="flex justify-between text-[14px] font-black">
                        <span>total: your taste</span>
                        <span>{card.power}</span>
                      </p>
                      <p className="mt-1 text-[10px] opacity-70">{reprint ? "Reprint from a re-read · original not kept" : "Paid in full · kept on file"}</p>
                    </div>
                  )}
                </ReceiptPaper>
                <button
                  type="button"
                  onClick={() => {
                    sfx("rustle");
                    setUnrolled((u) => !u);
                  }}
                  className="mt-2 w-full text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3 hover:text-ink"
                >
                  {unrolled ? "Fold the receipt ↑" : "Unroll the receipt ↓"}
                </button>
              </section>
            )}

            {!r && <p className="mt-10 font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Finding what it pulled in…</p>}

            {r?.status === "burned" && <p className="mt-10 text-ink-2">This card was retired, and its brands went with it.</p>}

            {(r?.status === "faded" || r?.status === "error") && (
              <div className="mt-10">
                <p className="font-serif text-2xl italic leading-tight">This card was made before we kept receipts.</p>
                <p className="mt-2 text-ink-2">Its loves are still on it. Ask Qloo again and see which brands they pull in today.</p>
                <button type="button" disabled={busy} onClick={() => void reread()} className="mt-5 rounded-full bg-accent px-5 py-2 font-semibold text-paper disabled:opacity-50">
                  {busy ? "Asking Qloo…" : "Re-read its brands"}
                </button>
                {r.error && <p className="mt-3 text-sm text-warn">{r.error}</p>}
              </div>
            )}

            {snap && love && (
              <>
                {since && <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">{since}</p>}
                {snap.lite && <p className="mt-2 text-xs text-ink-3">Re-read {day(snap.at)}. The original receipt wasn&apos;t kept for this card.</p>}
                <div className="mt-5 rounded-2xl border border-line/70 bg-black/30 px-2 pt-2">
                  <LoveSky loves={snap.loves} sel={sel} onSel={setSel} />
                </div>
                <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">Tap a star to see what it brought</p>

                <h3 className="mt-7 font-serif text-2xl italic">Sent by {displayName(love.name)}</h3>
                {pulled.length ? (
                  <ul className="mt-2">
                    {pulled.map((b) => (
                      <BrandRow key={`${love.id}-${b.id}`} b={b} love={love} loves={snap.loves} code={code} onJump={setSel} src={src} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-ink-2">Nothing on the list leans on this one. Try another star.</p>
                )}

                {r?.drift && (r.drift.entered.length > 0 || r.drift.left.length > 0) && (
                  <section ref={freshRef} className="mt-8 scroll-mt-4">
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Fresh this week</h3>
                    {r.drift.entered.length > 0 && (
                      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {r.drift.entered.map((b) => {
                          const link = brandLink(b);
                          return (
                            <li key={b.id}>
                              <a
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => click(code, b, "drift")}
                                className="flex items-center gap-3 rounded-xl border border-dashed border-accent/40 p-3 transition hover:border-accent"
                              >
                                <Thumb src={img(b.image)} name={b.name} size={32} />
                                <span className="min-w-0 truncate text-sm font-semibold">{b.name}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {r.drift.left.length > 0 && <p className="mt-3 text-sm text-ink-3">Left your orbit: {r.drift.left.slice(0, 3).map((b) => b.name).join(", ")}.</p>}
                    <p className="mt-2 text-xs text-ink-3">Suggested by Qloo today for the same loves. Not part of the original card.</p>
                  </section>
                )}

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void sharePull()} className="rounded-full border border-accent/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-accent hover:bg-accent hover:text-paper">
                    Share this week&apos;s pull
                  </button>
                  {shared && <span className="text-xs text-ink-3">{shared}</span>}
                </div>

                {silent.length > 0 && <p className="mt-8 text-sm text-ink-3">Nothing here for {silent.map((l) => displayName(l.name)).join(", ")}.</p>}

              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
