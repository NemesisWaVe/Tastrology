"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ReceiptRoll } from "@/components/card/ReceiptRoll";
import { ShareSheet } from "@/components/card/ShareSheet";
import { PulledSky } from "@/components/deck/PulledSky";
import { ScratchReveal } from "@/components/deck/ScratchReveal";
import { brandLink } from "@/components/results/Brands";
import { Thumb } from "@/components/results/ui";
import { readSeen, writeSeen, type Seen } from "@/lib/brandSeen";
import { cardNo, displayName, proxied, type CardData } from "@/lib/card";
import type { Drift } from "@/lib/drift";
import type { Snap, SnapBrand } from "@/lib/receipt";
import { sfx } from "@/lib/sound";
import type { StyleResult } from "@/lib/types";

type Reply = {
  status: "fresh" | "lite" | "faded" | "burned" | "error";
  snap?: Snap;
  drift?: Drift | null;
  error?: string;
};

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
    seeds: snap.loves.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind as never,
      image: l.image,
      tags: [],
    })),
    dna: { name: card.archetype, tagline: "", keywords: [], lobes: [] },
    brands: snap.brands.map((b) => ({
      entity: {
        id: b.id,
        name: b.name,
        kind: "brand",
        image: b.image,
        site: b.site,
        instagram: b.instagram,
        tags: [],
      },
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

const img = (u?: string) =>
  u ? (u.startsWith("/") ? u : proxied(u)) : undefined;
const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

function click(code: string, b: { id: string }, src: string) {
  try {
    void fetch(`/api/card/${encodeURIComponent(code)}/click`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand: b.id, src }),
      keepalive: true,
    });
  } catch {}
}

function BrandRow({
  b,
  love,
  loves,
  code,
  onJump,
  src,
  flash = false,
}: {
  b: SnapBrand;
  love: Snap["loves"][number];
  loves: Snap["loves"];
  code: string;
  onJump: (id: string) => void;
  src: string;
  flash?: boolean;
}) {
  const share = Math.round((b.explain[love.id] ?? 0) * 100);
  const drop = Math.round(b.ablation[love.id] ?? 0);
  const others = b.because
    .filter((id) => id !== love.id)
    .map((id) => loves.find((l) => l.id === id))
    .filter((x): x is Snap["loves"][number] => Boolean(x))
    .slice(0, 2);
  const link = brandLink(b);
  return (
    <li
      id={`pulled-${b.id}`}
      className={`rise flex gap-4 rounded-2xl border-t border-line/70 py-4 transition-shadow duration-700 first:border-t-0 ${flash ? "shadow-[0_0_0_1px_rgba(198,255,61,0.6),0_0_30px_-6px_rgba(198,255,61,0.5)]" : ""}`}
    >
      <Thumb src={img(b.image)} name={b.name} size={44} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-lg font-semibold">{b.name}</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">
            {b.category}
          </span>
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {share > 0 ? (
            <b className="font-semibold text-ink">{share}% of the pull</b>
          ) : (
            "In the pull"
          )}
          {drop > 0 && (
            <span className="text-ink-3">
              {" "}
              · without {displayName(love.name)} it drops {drop} points
            </span>
          )}
        </p>
        {others.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
              also pulled by
            </span>
            {others.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onJump(o.id)}
                className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:border-accent hover:text-ink"
              >
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
        <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {link.note}
        </span>
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
  visitor = false,
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
  /** Someone else's card (a scanned QR or a shared link): the copy talks about "this taste", not "your". */
  visitor?: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  const [r, setR] = useState<Reply | null>(null);
  const [sel, setSel] = useState<string>("");
  const [seen, setSeen] = useState<Seen | null>(null);
  // The receipt: pinned at the top, folded to its head until unrolled. Never the printing show (that's the first mint's).
  const [full, setFull] = useState<StyleResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const freshRef = useRef<HTMLElement>(null);
  /** One share flow everywhere: the card's share sheet, over this one. */
  const [share, setShare] = useState(false);
  useEffect(() => {
    if (!open) setShare(false);
  }, [open]);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  // Breaking the seal: once per open, owners only. The bonus is for opening, never for clicking out.
  useEffect(() => {
    if (!open || !owned) return;
    void fetch(`/api/card/${encodeURIComponent(code)}/opened`, {
      method: "POST",
    })
      .then((x) =>
        x.ok ? (x.json() as Promise<{ status: string; dust?: number }>) : null,
      )
      .then((j) => {
        if (!j) return;
        if (j.status === "paid" && j.dust) {
          setToast(`+${j.dust} Stardust. See you Monday.`);
          sfx("reveal");
        }
        if (
          j.status === "paid" ||
          j.status === "capped" ||
          j.status === "opened"
        )
          onOpenedRef.current?.(j.status === "paid" ? (j.dust ?? 0) : 0);
      })
      .catch(() => {});
  }, [open, owned, code]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    sfx("flip");
    setSeen(readSeen(code));
    let off = false;
    fetch(`/api/card/${encodeURIComponent(code)}/receipt?drift=1&full=1`, {
      cache: "no-store",
    })
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
    const weight = (id: string) =>
      snap.brands.reduce((a, b) => a + (b.explain[id] ?? 0), 0);
    const ranked = [...snap.loves].sort((a, b) => weight(b.id) - weight(a.id));
    const pick =
      (seen?.visits ?? 0) >= 2 && ranked.length > 1
        ? ranked[(seen?.visits ?? 0) % ranked.length]
        : ranked[0];
    if (pick) setSel(pick.id);
    writeSeen(
      code,
      snap.brands.map((b) => b.id),
      seen,
    );
  }, [snap, sel, seen, code]);

  // A sealed week with fresh brands opens on them.
  const scrolled = useRef(false);
  useEffect(() => {
    if (
      !sealed ||
      scrolled.current ||
      !r?.drift?.entered.length ||
      !freshRef.current
    )
      return;
    scrolled.current = true;
    freshRef.current.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }, [sealed, r, reduce]);

  // Decoded signals (components/deck/PulledSky.tsx): fresh foil every visit, so opening a card is always an unsealing.
  const [decoded, setDecoded] = useState<Set<string>>(new Set());
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setDecoded(new Set());
    setHeld(new Set());
  }, [open, code]);
  // A sealed brand is scratched open by hand on its row (ScratchReveal); a tap from the sky runs it for you.
  const [autoRun, setAutoRun] = useState<Record<string, number>>({});
  // The unsealing: once a star's list is in view, its sealed brands scratch themselves one after another. Rubbing a
  // row takes it over (the chain waits for it), and "I'll scratch these" stops the chain for that star.
  const [cascade, setCascade] = useState<Record<string, number>>({});
  const [held, setHeld] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const chain = useRef({ love: "", on: false, sent: new Set<string>() });
  const decodedRef = useRef(decoded);
  decodedRef.current = decoded;
  const pulledRef = useRef<SnapBrand[]>([]);
  const nextInChain = () => {
    const c = chain.current;
    if (!c.on) return;
    const b = pulledRef.current.find(
      (p) => !decodedRef.current.has(p.id) && !c.sent.has(p.id),
    );
    if (!b) {
      c.on = false;
      return;
    }
    c.sent.add(b.id);
    setCascade((m) => ({ ...m, [b.id]: (m[b.id] ?? 0) + 1 }));
  };
  const decode = (b: SnapBrand) => {
    if (!decoded.has(b.id))
      setAutoRun((m) => ({ ...m, [b.id]: (m[b.id] ?? 0) + 1 }));
    else {
      setFlashId(b.id);
      setTimeout(() => setFlashId((f) => (f === b.id ? null : f)), 1800);
    }
    setTimeout(
      () =>
        document.getElementById(`pulled-${b.id}`)?.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "center",
        }),
      60,
    );
  };
  const scratched = (b: SnapBrand) => {
    setDecoded((cur) => new Set(cur).add(b.id));
    // the last of a love's signals: a little set chord
    if (
      pulled.length > 1 &&
      pulled.every((p) => p.id === b.id || decoded.has(p.id))
    )
      setTimeout(() => sfx("form", { gain: 0.6 }), 700);
    setFlashId(b.id);
    setTimeout(() => setFlashId((f) => (f === b.id ? null : f)), 1800);
  };

  const love = snap?.loves.find((l) => l.id === sel);
  // Each love's planets: the brands it pulled hardest, at most four.
  const brandsOf = useMemo(() => {
    const out: Record<string, SnapBrand[]> = {};
    for (const l of snap?.loves ?? [])
      out[l.id] = snap!.brands
        .filter((b) => b.because.includes(l.id) || (b.explain[l.id] ?? 0) > 0)
        .sort((a, b) => (b.explain[l.id] ?? 0) - (a.explain[l.id] ?? 0))
        .slice(0, 4);
    return out;
  }, [snap]);
  const pulled = love ? (brandsOf[love.id] ?? []) : [];
  pulledRef.current = pulled;
  const sealedHere = pulled.some((b) => !decoded.has(b.id));
  const holding = love ? held.has(love.id) : false;
  // Start the chain when this star's list comes into view; a new star starts its own.
  useEffect(() => {
    const el = listRef.current;
    const id = love?.id;
    if (!open || !el || !id || holding) return;
    chain.current = { love: id, on: false, sent: new Set() };
    let t = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting || chain.current.on) return;
        io.disconnect();
        chain.current.on = true;
        t = window.setTimeout(nextInChain, 450);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(t);
      chain.current.on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, love?.id, holding, Boolean(snap)]);
  const silent = snap
    ? snap.loves.filter(
        (l) =>
          !snap.brands.some(
            (b) => b.because.includes(l.id) || (b.explain[l.id] ?? 0) > 0,
          ),
      )
    : [];

  const since = (() => {
    if (!seen || !snap) return null;
    const now = new Set(snap.brands.map((b) => b.id));
    const was = new Set(seen.brands);
    const nu =
      [...now].filter((x) => !was.has(x)).length +
      (r?.drift?.entered.length ?? 0);
    const gone =
      [...was].filter((x) => !now.has(x)).length + (r?.drift?.left.length ?? 0);
    if (!nu && !gone) return `Nothing moved since ${day(seen.at)}.`;
    return `Since ${day(seen.at)}: ${nu} new brand${nu === 1 ? "" : "s"}${gone ? `, ${gone} gone` : ""}.`;
  })();

  const reread = async () => {
    setBusy(true);
    const j = (await fetch(
      `/api/card/${encodeURIComponent(code)}/receipt?reread=1`,
      { cache: "no-store" },
    )
      .then((x) => x.json())
      .catch(() => null)) as Reply | null;
    setBusy(false);
    if (j?.snap) {
      sfx("reveal");
      setR(j);
    } else
      setR((cur) => ({
        ...(cur ?? { status: "faded" }),
        error: j?.error ?? "Couldn't re-read it just now.",
      }));
  };

  const receipt = full ?? (snap ? reprintOf(snap, card) : null);
  const reprint = !full && Boolean(snap);

  const head = (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-accent">
          {visitor ? "Pulled by this taste" : "Pulled by your taste"}
        </p>
        <h2 className="mt-1 truncate font-serif text-3xl italic leading-tight">
          {card.archetype}
        </h2>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
          No. {card.print ? cardNo(card) : `${card.serial} · ${code}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full border border-line bg-black/40 px-3 py-1 backdrop-blur font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 hover:text-ink"
      >
        Close
      </button>
    </header>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex justify-end bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
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
            {snap && love ? (
              <PulledSky
                header={head}
                loves={snap.loves}
                onSel={setSel}
                brandsOf={brandsOf}
                decoded={decoded}
                onDecode={decode}
                onScratched={scratched}
              />
            ) : (
              head
            )}

            {toast && (
              <p
                role="status"
                className="mt-4 rounded-full border border-accent/50 bg-accent/10 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-accent"
              >
                {toast}
              </p>
            )}

            {!r && (
              <p className="mt-10 font-mono text-xs uppercase tracking-[0.2em] text-ink-3">
                Finding what it pulled in…
              </p>
            )}

            {r?.status === "burned" && (
              <p className="mt-10 text-ink-2">
                This card was retired, and its brands went with it.
              </p>
            )}

            {(r?.status === "faded" || r?.status === "error") && (
              <div className="mt-10">
                <p className="font-serif text-2xl italic leading-tight">
                  This card was made before we kept receipts.
                </p>
                <p className="mt-2 text-ink-2">
                  Its loves are still on it. Ask Qloo again and see which brands
                  they pull in today.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reread()}
                  className="mt-5 rounded-full bg-accent px-5 py-2 font-semibold text-paper disabled:opacity-50"
                >
                  {busy ? "Asking Qloo…" : "Re-read its brands"}
                </button>
                {r.error && <p className="mt-3 text-sm text-warn">{r.error}</p>}
              </div>
            )}

            {snap && love && (
              <>
                {since && (
                  <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
                    {since}
                  </p>
                )}
                {snap.lite && (
                  <p className="mt-2 text-xs text-ink-3">
                    Re-read {day(snap.at)}. The original receipt wasn&apos;t
                    kept for this card.
                  </p>
                )}
                <div className="mt-6 flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 truncate font-serif text-2xl italic">
                    Sent by {displayName(love.name)}
                  </h3>
                  {sealedHere && !holding && (
                    <button
                      type="button"
                      onClick={() => setHeld((h) => new Set(h).add(love.id))}
                      className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3 underline decoration-white/20 underline-offset-4 hover:text-ink"
                    >
                      I&apos;ll scratch these
                    </button>
                  )}
                </div>
                {pulled.length ? (
                  <ul ref={listRef} className="mt-2">
                    {pulled.map((b, i) =>
                      decoded.has(b.id) ? (
                        <BrandRow
                          key={`${love.id}-${b.id}`}
                          b={b}
                          love={love}
                          loves={snap.loves}
                          code={code}
                          onJump={setSel}
                          src={src}
                          flash={flashId === b.id}
                        />
                      ) : (
                        <li
                          key={`${love.id}-${b.id}`}
                          id={`pulled-${b.id}`}
                          className="flex items-center gap-4 border-t border-line/70 py-4 first:border-t-0"
                        >
                          <div className="min-w-0 flex-1">
                            <ScratchReveal
                              name={b.name}
                              image={img(b.image)}
                              loveId={love.id}
                              brandId={b.id}
                              strength={Math.min(
                                1,
                                (b.explain[love.id] ?? 0) * 2,
                              )}
                              reduce={reduce}
                              autoRun={autoRun[b.id] ?? 0}
                              cascade={cascade[b.id] ?? 0}
                              onCleared={() => {
                                if (!chain.current.on) return;
                                chain.current.sent.add(b.id);
                                setTimeout(nextInChain, 220);
                              }}
                              onDone={() => scratched(b)}
                            />
                            <p className="mt-0.5 pl-2 text-sm text-ink-3">
                              Signal {i + 1} ·{" "}
                              {Math.round((b.explain[love.id] ?? 0) * 100) ||
                                "?"}
                              % of the pull
                            </p>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="mt-2 text-ink-2">
                    Nothing on the list leans on this one. Try another star.
                  </p>
                )}

                {r?.drift &&
                  (r.drift.entered.length > 0 || r.drift.left.length > 0) && (
                    <section ref={freshRef} className="mt-8 scroll-mt-4">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
                        Fresh this week
                      </h3>
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
                                  <Thumb
                                    src={img(b.image)}
                                    name={b.name}
                                    size={32}
                                  />
                                  <span className="min-w-0 truncate text-sm font-semibold">
                                    {b.name}
                                  </span>
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {r.drift.left.length > 0 && (
                        <p className="mt-3 text-sm text-ink-3">
                          {visitor ? "Left its orbit" : "Left your orbit"}:{" "}
                          {r.drift.left
                            .slice(0, 3)
                            .map((b) => b.name)
                            .join(", ")}
                          .
                        </p>
                      )}
                      <p className="mt-2 text-xs text-ink-3">
                        Suggested by Qloo today for the same loves. Not part of
                        the original card.
                      </p>
                    </section>
                  )}

                {receipt && (
                  <div className="mt-10">
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">
                      {visitor ? "The receipt" : "Your receipt"}
                    </h3>
                    <ReceiptRoll
                      card={card}
                      result={receipt}
                      note={
                        reprint
                          ? "Reprinted from a re-read. The original wasn't kept."
                          : undefined
                      }
                    />
                  </div>
                )}

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShare(true)}
                    className="rounded-full border border-accent/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-accent hover:bg-accent hover:text-paper"
                  >
                    {visitor ? "Share this card" : "Share your card"}
                  </button>
                </div>
                {share && createPortal(<ShareSheet card={card} mine={!visitor} linkable onClose={() => setShare(false)} />, document.body)}

                {silent.length > 0 && (
                  <p className="mt-8 text-sm text-ink-3">
                    Nothing here for{" "}
                    {silent.map((l) => displayName(l.name)).join(", ")}.
                  </p>
                )}
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
