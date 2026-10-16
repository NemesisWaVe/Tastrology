"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { proxied } from "@/lib/card";
import type { EntityKind } from "@/lib/types";

export interface Seed {
  id: string;
  name: string;
  kind: EntityKind;
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
};

const FILTERS: (EntityKind | "all")[] = ["all", "artist", "movie", "tv_show", "book", "place", "podcast", "videogame"];
const TRY = ["Frank Ocean", "Aftersun", "Hades", "Fleabag", "Kyoto", "The Secret History"];
const MAX = 8;

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

/** Qloo-backed autocomplete. Seeds come back with real Qloo entity ids. */
export function SeedPicker({ seeds, onChange }: { seeds: Seed[]; onChange: (s: Seed[]) => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<EntityKind | "all">("all");
  const [hits, setHits] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const req = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const full = seeds.length >= MAX;

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const id = ++req.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}${kind !== "all" ? `&types=${kind}` : ""}`);
        const data = (await res.json()) as { results: Seed[] };
        if (id === req.current) {
          setHits(dedupe(data.results ?? []).slice(0, 6));
          setActive(0);
        }
      } catch {
        if (id === req.current) setHits([]);
      } finally {
        if (id === req.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, kind]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => {
      setNote(null);
      setFlash(null);
    }, 2200);
    return () => clearTimeout(t);
  }, [note]);

  const isTaken = (h: Seed) => seeds.some((x) => x.id === h.id || dupKey(x) === dupKey(h));

  const add = (h: Seed) => {
    if (full) return;
    const dup = seeds.find((x) => x.id === h.id || dupKey(x) === dupKey(h));
    if (dup) {
      setNote(`${dup.name} is already in.`);
      setFlash(dup.id);
      return;
    }
    setNote(null);
    onChange([...seeds, h]);
    setQ("");
    setHits([]);
    input.current?.focus();
  };

  const showList = open && hits.length > 0;

  return (
    <div>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by type">
        {FILTERS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] transition ${
              kind === k ? "border-ink bg-ink text-paper" : "border-line text-ink-2 hover:border-ink-3 hover:text-ink"
            }`}
          >
            {k === "all" ? "Anything" : (
              <>
                <span className="mr-1 opacity-60">{KIND_ICON[k]}</span>
                {KIND_LABEL[k]}
              </>
            )}
          </button>
        ))}
      </div>

      <div className="relative">
        <div className="group relative flex items-center rounded-2xl border border-line bg-black/30 transition focus-within:border-accent/70 focus-within:shadow-[0_0_0_4px_rgba(198,255,61,0.08)]">
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
              if (e.key === "Backspace" && !q && seeds.length) onChange(seeds.slice(0, -1));
            }}
            placeholder={full ? "That's plenty: 8 max" : "Search anything you love…"}
            disabled={full}
            className="w-full min-w-0 bg-transparent px-3 py-4 text-[16px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-50"
            aria-label="Search Qloo for something you love"
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

      <p className="mt-2 min-h-[16px] px-1 text-[12px] text-warn" role="status" aria-live="polite">
        {note}
      </p>

      <div className="mt-2 flex min-h-[44px] flex-wrap content-start gap-2">
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
        {seeds.length === 0 && (
          <span className="flex flex-wrap items-center gap-1.5 py-1 text-[13px] text-ink-3">
            <span className="mr-1">Try</span>
            {TRY.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setQ(t);
                  setOpen(true);
                  input.current?.focus();
                }}
                className="rounded-full border border-dashed border-line px-2.5 py-1 text-ink-2 transition hover:border-ink-3 hover:text-ink"
              >
                {t}
              </button>
            ))}
          </span>
        )}
      </div>
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
