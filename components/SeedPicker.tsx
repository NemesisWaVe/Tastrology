"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { proxied } from "@/lib/card";
import { normQ } from "@/lib/searchKey";
import type { EntityKind } from "@/lib/types";

export interface Seed {
  id: string;
  name: string;
  /** "vibe": a Qloo tag ("ramen", "shoegaze"), not one named thing (lib/vibes.ts). */
  kind: EntityKind | "vibe";
  subtitle?: string;
  image?: string;
}

export const KIND_LABEL: Record<string, string> = {
  artist: "Artist",
  movie: "Film",
  tv_show: "TV",
  book: "Book",
  place: "Place",
  podcast: "Podcast",
  videogame: "Game",
  brand: "Brand",
  vibe: "Vibe",
};

export const KIND_ICON: Record<string, string> = {
  artist: "♪",
  movie: "◐",
  tv_show: "▭",
  book: "❡",
  place: "⌖",
  podcast: "◉",
  videogame: "✦",
  brand: "◆",
  vibe: "∿",
};

const FILTERS: (EntityKind | "vibe")[] = ["vibe", "artist", "movie", "tv_show", "book", "place", "podcast", "videogame"];
/** "Try" suggestions, one set per tab. */
const TRY: Record<string, string[]> = {
  all: ["Frank Ocean", "Aftersun", "Hades", "Fleabag", "ramen", "The Secret History"],
  vibe: ["ramen", "shoegaze", "hiking", "thrifting", "brutalism", "matcha"],
  artist: ["Frank Ocean", "Radiohead", "SZA", "Bad Bunny", "Mitski", "A. R. Rahman"],
  movie: ["Aftersun", "Spirited Away", "Past Lives", "In the Mood for Love", "Dune", "Parasite"],
  tv_show: ["Fleabag", "Jujutsu Kaisen", "The Bear", "Succession", "Twin Peaks", "Arcane"],
  book: ["The Secret History", "Norwegian Wood", "Normal People", "Dune", "Piranesi", "Circe"],
  place: ["Kyoto", "Lisbon", "Mexico City", "Seoul", "Marrakech", "Copenhagen"],
  podcast: ["99% Invisible", "Radiolab", "Song Exploder", "This American Life", "Huberman Lab"],
  videogame: ["Hades", "Disco Elysium", "Outer Wilds", "Elden Ring", "Stardew Valley", "Hollow Knight"],
};
/** The type of each mixed "all" suggestion, so a one-tap add finds the game Hades, not a band called Hades. */
const TRY_KIND: Record<string, EntityKind | "vibe"> = {
  "Frank Ocean": "artist",
  Aftersun: "movie",
  Hades: "videogame",
  Fleabag: "tv_show",
  ramen: "vibe",
  "The Secret History": "book",
};
const MAX = 8;
const VIBES_MAX = 2;
const PLURAL: Record<string, string> = { artist: "artists", movie: "films", tv_show: "shows", book: "books", place: "places", podcast: "podcasts", videogame: "games" };
/** Cycled in the empty search box, one of each kind, so it reads "type something like this". */
const ALL_HINTS = ["Frank Ocean", "Spirited Away", "Fleabag", "Kyoto", "Hades", "Normal People", "matcha"];
const VIBE_HINTS = ["ramen", "shoegaze", "hiking", "thrifting", "brutalism", "matcha", "k-pop"];

const ease = [0.16, 1, 0.3, 1] as const;

/** "Frank Ocean", "frank  ocean", "FRANK OCEAN " all collapse to one key. */
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dupKey = (h: Seed) => `${h.kind}|${norm(h.name)}`;

/** Qloo search sometimes returns case/spacing variants of the same thing; keep the first (best-ranked) one. */
function dedupe(xs: Seed[]): Seed[] {
  const seen = new Set<string>();
  return xs.filter((h) => {
    const k = dupKey(h);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type SearchAnswer = { hits?: Seed[]; results?: Seed[]; vibes?: { id: string; name: string; label: string }[]; blocked?: boolean; care?: boolean; suggest?: string[] };
/** This visit's answers by URL (newest last), so going back over a query is instant. */
const answers = new Map<string, SearchAnswer>();
function remember(url: string, a: SearchAnswer) {
  answers.delete(url);
  answers.set(url, a);
  if (answers.size > 80) answers.delete(answers.keys().next().value!);
}

/** Qloo-backed autocomplete. Seeds come back with real Qloo entity ids. */
export function SeedPicker({ seeds, onChange }: { seeds: Seed[]; onChange: (s: Seed[]) => void }) {
  const [q, setQ] = useState("");
  // "all" = no chip pressed: named things plus a few vibes. Tapping a pressed chip goes back to it.
  const [kind, setKind] = useState<EntityKind | "vibe" | "all">("all");
  const [hits, setHits] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // A search the content guard stopped (lib/guard.ts): where to go instead, or a help line.
  const [off, setOff] = useState<{ care: boolean; suggest: string[] } | null>(null);
  const req = useRef(0);
  // a suggestion being looked up after a tap (it adds itself: one tap, not search-then-pick)
  const [adding, setAdding] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const full = seeds.length >= MAX;
  // The Vibes field cycles examples until you type (fixed on reduced motion).
  const [hint, setHint] = useState(0);
  useEffect(() => {
    if ((kind !== "vibe" && kind !== "all") || q || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setHint((h) => h + 1), 2200);
    return () => clearInterval(t);
  }, [kind, q]);

  useEffect(() => {
    const nq = normQ(q);
    if (nq.length < 2) {
      setHits([]);
      setLoading(false);
      setOff(null);
      return;
    }
    const id = ++req.current;
    const url = `/api/search?q=${encodeURIComponent(nq)}${kind === "vibe" ? "&vibes=only" : kind !== "all" ? `&types=${kind}` : "&vibes=1"}`;
    const show = (data: SearchAnswer) => {
      if (id !== req.current) return;
      setOff(data.blocked ? { care: Boolean(data.care), suggest: data.suggest ?? [] } : null);
      setHits(dedupe(data.hits ?? []).slice(0, 7));
      setActive(0);
      setLoading(false);
    };
    // Seen this exact query in this visit (backspacing, flipping tabs): no wait, no request.
    const seen = answers.get(url);
    if (seen) {
      show(seen);
      return;
    }
    setLoading(true);
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        const data = (await res.json()) as SearchAnswer;
        if (res.ok) remember(url, data);
        show(data);
      } catch {
        // Aborted (typed on) or offline: a newer keystroke owns the list.
        if (id === req.current && !ac.signal.aborted) {
          setHits([]);
          setLoading(false);
        }
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, kind]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => {
      setNote(null);
      setFlash(null);
    }, 2200);
    return () => clearTimeout(t);
  }, [note]);

  // "Use my own favorites" lands here: on a desktop, put the cursor in the box so typing just works.
  useEffect(() => {
    const f = () => {
      if (matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
    };
    window.addEventListener("tastrology:focus-picker", f);
    return () => window.removeEventListener("tastrology:focus-picker", f);
  }, []);

  const isTaken = (h: Seed) => seeds.some((x) => x.id === h.id || dupKey(x) === dupKey(h));

  const add = (h: Seed) => {
    if (full) return;
    const dup = seeds.find((x) => x.id === h.id || dupKey(x) === dupKey(h));
    if (dup) {
      setNote(`${dup.name} is already in.`);
      setFlash(dup.id);
      return;
    }
    if (h.kind === "vibe" && seeds.filter((x) => x.kind === "vibe").length >= VIBES_MAX) {
      setNote(`Two vibes is the limit. Add something you love by name.`);
      return;
    }
    setNote(null);
    onChange([...seeds, h]);
    setQ("");
    setHits([]);
    input.current?.focus();
  };

  const showList = open && hits.length > 0;
  const noMatch = open && !loading && !off && q.trim().length >= 2 && hits.length === 0;

  /** One tap on a suggestion: look it up and add Qloo's best match straight away. */
  const quickAdd = async (t: string) => {
    if (full || adding) return;
    setAdding(t);
    try {
      const k = kind !== "all" ? kind : TRY_KIND[t];
      const vibeWord = k === "vibe";
      const res = await fetch(`/api/search?q=${encodeURIComponent(normQ(t))}${vibeWord ? "&vibes=only" : k ? `&types=${k}` : ""}`);
      const data = (await res.json()) as { results?: Seed[]; vibes?: { id: string; name: string; label: string }[] };
      const v = (data.vibes ?? []).find((x) => norm(x.name) === norm(t)) ?? (vibeWord ? data.vibes?.[0] : undefined);
      const pick: Seed | undefined = v ? { id: v.id, name: v.name, kind: "vibe", subtitle: `${v.label} · a vibe, not one thing` } : dedupe(data.results ?? [])[0];
      if (pick) add(pick);
      else {
        setQ(t);
        setOpen(true);
        input.current?.focus();
      }
    } catch {
      setQ(t);
      setOpen(true);
    } finally {
      setAdding(null);
    }
  };
  // Suggestions stay until the card is ready to mint, minus what's already in, so there is always a next tap.
  const picked = new Set(seeds.map((x) => norm(x.name)));
  const ideas = (TRY[kind] ?? TRY.all).filter((t) => !picked.has(norm(t)));

  return (
    <div>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by type">
        {FILTERS.map((k) => (
          <button
            key={k}
            onClick={() => setKind((cur) => (cur === k ? "all" : k))}
            aria-pressed={kind === k}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] transition ${
              k === "vibe"
                ? "vibeChip inline-flex items-center gap-1.5 font-semibold"
                : kind === k
                  ? "border border-ink bg-ink text-paper"
                  : "border border-line text-ink-2 hover:border-ink-3 hover:text-ink"
            }`}
          >
            {k === "vibe" ? (
              <>
                <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden className="transition-transform">
                  <defs>
                    <linearGradient id="vibeInk" x1="0" x2="1">
                      <stop offset="0" stopColor="#ff7773" />
                      <stop offset="0.35" stopColor="#ffed5f" />
                      <stop offset="0.65" stopColor="#83fff7" />
                      <stop offset="1" stopColor="#d875ff" />
                    </linearGradient>
                  </defs>
                  <path d="M1 3.2q3-3 6 0t6 0M1 7.2q3-3 6 0t6 0" stroke="url(#vibeInk)" />
                </svg>
                <span className="vibeText">Vibes</span>
              </>
            ) : (
              <>
                <span className="mr-1 opacity-60">{KIND_ICON[k]}</span>
                {KIND_LABEL[k]}
              </>
            )}
          </button>
        ))}
      </div>
      <p className="-mt-1 mb-3 text-[12.5px] text-ink-3">
        Don&apos;t know what your taste is?{" "}
        <button
          type="button"
          onClick={() => {
            setKind("vibe");
            input.current?.focus();
          }}
          className="font-semibold"
          style={{ backgroundImage: "var(--holo)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
        >
          Go with your vibes.
        </button>
      </p>

      <div className="relative">
        <div
          className={`group relative flex items-center rounded-2xl border border-line bg-black/30 transition focus-within:border-accent/70 focus-within:shadow-[0_0_0_4px_rgba(198,255,61,0.08)] ${kind === "vibe" ? "vibeField" : ""}`}
        >
          {(kind === "vibe" || kind === "all") && !q && !full && (
            <span aria-hidden className="pointer-events-none absolute left-11 right-14 top-1/2 -translate-y-1/2 truncate text-[16px] text-ink-3">
              {kind === "all" && <span className="text-ink-3/70">Search anything you love · </span>}
              <span key={hint} className="inline-block animate-[fadeIn_0.2s_ease-out] text-ink-2">
                {kind === "vibe" ? VIBE_HINTS[hint % VIBE_HINTS.length] : ALL_HINTS[hint % ALL_HINTS.length]}…
              </span>
            </span>
          )}
          <span className="pl-4 text-ink-3 group-focus-within:text-accent" aria-hidden>
            ✦
          </span>
          <input
            ref={input}
            value={q}
            maxLength={80}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (hits[active]) add(hits[active]);
                else {
                  const dup = seeds.find((x) => norm(x.name) === norm(q));
                  if (dup) {
                    setNote(`${dup.name} is already in.`);
                    setFlash(dup.id);
                  }
                }
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder={full ? "That's plenty: 8 max" : kind === "vibe" || kind === "all" ? "" : `Search ${PLURAL[kind] ?? "anything"} you love…`}
            disabled={full}
            className="w-full min-w-0 bg-transparent px-3 py-4 text-[16px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-50"
            aria-label={kind === "vibe" ? "Search vibes, like ramen, shoegaze or hiking" : "Search Qloo for something you love"}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={showList}
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          />
          <span className="pr-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            {loading ? <span className="inline-block h-2 w-2 rounded-full bg-accent pulse-dot align-middle" /> : `${seeds.length}/${MAX}`}
          </span>
        </div>

        <AnimatePresence>
          {showList && (
            <motion.ul
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2, ease }}
              className="absolute z-30 mt-2 w-full origin-top overflow-hidden rounded-2xl border border-line bg-[#0c0c11]/95 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
              role="listbox"
              id={listId}
            >
              {hits.map((h, i) => {
                const taken = isTaken(h);
                return (
                  <li key={h.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => add(h)}
                      onMouseEnter={() => setActive(i)}
                      disabled={taken}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:opacity-40 ${i === active ? "bg-white/[0.05]" : ""}`}
                    >
                      <Thumb seed={h} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink">{h.name}</span>
                        {h.subtitle && <span className="block truncate text-[12px] text-ink-3">{h.subtitle}</span>}
                      </span>
                      <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
                        {taken ? "added" : (KIND_LABEL[h.kind] ?? h.kind)}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li className="flex items-center justify-between border-t border-line px-4 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-3">
                <span>Results from Qloo search</span>
                <span className="hidden sm:inline">↑↓ · enter</span>
              </li>
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <p className={`mt-2 min-h-[16px] px-1 text-[12px] ${note ? "text-warn" : "text-ink-3"}`} role="status" aria-live="polite">
        {note ?? (noMatch ? (kind === "vibe" ? "No vibe by that name. Try a single word, like ramen or hiking." : "Nothing on Qloo by that name yet. Try the full title, or a vibe instead.") : null)}
      </p>
      {off && q.trim().length >= 2 && (
        <div className="mb-2 rounded-2xl border border-line bg-black/30 px-4 py-3 text-[13px] text-ink-2" role="status">
          {off.care ? (
            <>
              <p>If things feel heavy right now, you don&apos;t have to carry it alone. Free, confidential support is a message away.</p>
              <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-accent underline underline-offset-4">
                Find a helpline near you
              </a>
            </>
          ) : (
            <>
              <p>That one doesn&apos;t go on public cards.{off.suggest.length ? " Closest we can read:" : " Try something else you love."}</p>
              {off.suggest.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {off.suggest.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setQ(t);
                        setOpen(true);
                        input.current?.focus();
                      }}
                      className="rounded-full border border-accent/50 px-3 py-1 text-[12px] text-accent hover:bg-accent hover:text-paper"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-1 flex flex-wrap content-start gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {seeds.map((sd) => (
            <motion.span
              layout
              key={sd.id}
              initial={{ opacity: 0, scale: 0.6, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
              className={`inline-flex max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-1 text-[13px] text-ink transition-colors duration-300 ${
                flash === sd.id ? "border-warn bg-warn-soft" : "border-white/10 bg-white/[0.06]"
              }`}
            >
              <Thumb seed={sd} size={26} />
              <span className="truncate">{sd.name}</span>
              <button
                onClick={() => onChange(seeds.filter((x) => x.id !== sd.id))}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-white/10 hover:text-ink"
                aria-label={`Remove ${sd.name}`}
              >
                ×
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      {!full && seeds.length < 3 && ideas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-3">
          <span className="mr-1">{seeds.length ? "Or tap one" : "Tap to add"}</span>
          {ideas.slice(0, 6).map((t) => (
            <button
              key={t}
              type="button"
              disabled={Boolean(adding)}
              onClick={() => void quickAdd(t)}
              className={`rounded-full border border-dashed px-2.5 py-1 transition active:scale-95 ${adding === t ? "border-accent text-accent" : "border-line text-ink-2 hover:border-ink-3 hover:text-ink"} disabled:cursor-wait`}
            >
              <span className="mr-1 text-ink-3">+</span>
              {t}
              {adding === t && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent pulse-dot align-middle" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Thumb({ seed, size }: { seed: Seed; size: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (seed.image && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={proxied(seed.image)} alt="" style={style} onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" loading="lazy" />
    );
  return (
    <span style={style} className="grid shrink-0 place-items-center rounded-full bg-paper-2 text-[12px] text-ink-3">
      {KIND_ICON[seed.kind] ?? "◆"}
    </span>
  );
}
