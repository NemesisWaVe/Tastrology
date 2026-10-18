"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { brandLink } from "@/components/results/Brands";
import { loadDeck, type DeckEntry } from "@/lib/deck";
import type { Economy } from "@/lib/economy";
import type { Snap } from "@/lib/receipt";
import { sfx } from "@/lib/sound";

interface Lens {
  id: string;
  label: string;
}
interface Row {
  lens: string;
  at: number;
  season?: string;
  snap: Snap;
}
interface RecastInfo {
  on: boolean;
  cost: number;
  lenses: Lens[];
  season: { lens: string; month: string };
  rows: Row[];
}

const MONTH = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" });

/**
 * Stardust spends on your own cards: Recast (a new territory of brands for the same card) and Living sigils.
 * Neither changes the card's code or rarity. The crest on Holo and Secret is never for sale.
 */
export function Atelier() {
  const [cards, setCards] = useState<DeckEntry[] | null>(null);
  const [eco, setEco] = useState<Economy | null>(null);
  const [dust, setDust] = useState<number | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [info, setInfo] = useState<RecastInfo | null>(null);
  const [lens, setLens] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [fresh, setFresh] = useState<Row | null>(null);

  useEffect(() => {
    void loadDeck().then((d) => {
      const own = d.owner === "user" ? d.cards.filter((c) => c.minted) : [];
      setCards(own);
      if (own[0]) setPick(own[0].code);
    });
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { stardust?: { dust: number | null; economy?: Economy } | null } | null) => {
        setEco(m?.stardust?.economy ?? null);
        setDust(m?.stardust?.dust ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!pick) return;
    setInfo(null);
    setFresh(null);
    setMsg(undefined);
    fetch(`/api/card/${encodeURIComponent(pick)}/recast`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<RecastInfo>) : null))
      .then((j) => {
        setInfo(j);
        if (j) setLens((l) => l ?? j.season.lens);
      })
      .catch(() => {});
  }, [pick]);

  if (!eco || (eco.recast === null && eco.living === null)) return null;
  const entry = cards?.find((c) => c.code === pick) ?? null;
  const prestige = entry && (entry.card.rarity === "holo" || entry.card.rarity === "secret");

  const recast = async () => {
    if (!pick || !lens) return;
    setBusy(true);
    setMsg(undefined);
    sfx("tear");
    const res = await fetch(`/api/card/${encodeURIComponent(pick)}/recast`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lens }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { row?: Row; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !j?.row) return setMsg(j?.error ?? "Couldn't recast just now.");
    sfx("reveal");
    setFresh(j.row);
    setDust((d) => (d === null ? d : Math.max(0, d - (eco.recast ?? 0))));
    setInfo((i) => (i ? { ...i, rows: [j.row!, ...i.rows.filter((r) => r.lens !== j.row!.lens)] } : i));
    setCards((cs) => cs?.map((c) => (c.code === pick ? { ...c, card: { ...c.card, recasts: [...new Set([...(c.card.recasts ?? []), j.row!.lens])] } } : c)) ?? cs);
  };

  const wake = async () => {
    if (!pick) return;
    setBusy(true);
    setMsg(undefined);
    const res = await fetch(`/api/card/${encodeURIComponent(pick)}/living`, { method: "POST" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res?.ok) return setMsg(j?.error ?? "Couldn't do that just now.");
    sfx("reveal");
    setDust((d) => (d === null ? d : Math.max(0, d - (eco.living ?? 0))));
    setCards((cs) => cs?.map((c) => (c.code === pick ? { ...c, card: { ...c.card, living: true } } : c)) ?? cs);
  };

  const shown = fresh ?? (info?.rows.find((r) => r.lens === lens) || null);
  const seasonLabel = info?.lenses.find((l) => l.id === info.season.lens)?.label;

  return (
    <section className="mt-16 rounded-[28px] border border-line bg-paper/60 p-6 sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">The atelier · Stardust only</p>
      <h2 className="mt-2 font-serif text-4xl italic leading-tight">Same card. New orbit.</h2>
      <p className="mt-3 max-w-xl text-ink-2">
        Recast a card into a new territory and see which brands there your taste pulls in. Its loves, code and rarity stay exactly as they are.
        {seasonLabel && (
          <>
            {" "}
            This {MONTH(info!.season.month)}, <span className="text-accent">{seasonLabel}</span> is the season: recasts into it carry a mark you can&apos;t get later.
          </>
        )}
      </p>

      {cards === null ? (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Loading your deck…</p>
      ) : cards.length === 0 ? (
        <p className="mt-6 text-sm text-ink-3">
          Recasts work on cards you minted.{" "}
          <Link href="/" className="text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
            Make your card
          </Link>{" "}
          first.
        </p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-4">
            {entry && <HoloCard card={entry.card} width={240} idle />}
            {cards.length > 1 && (
              <div className="flex max-w-[260px] flex-wrap justify-center gap-2">
                {cards.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setPick(c.code)}
                    className={`min-h-9 rounded-full border px-3 font-mono text-[10.5px] uppercase tracking-[0.14em] ${c.code === pick ? "border-accent text-accent" : "border-line text-ink-3 hover:text-ink"}`}
                  >
                    {c.card.archetype.split(" ").slice(-1)[0]} · {c.code.slice(-4)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0">
            {eco.recast !== null && info?.on && (
              <>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Recast into</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {info.lenses.map((l) => {
                    const done = info.rows.some((r) => r.lens === l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          setLens(l.id);
                          setFresh(null);
                        }}
                        className={`min-h-10 rounded-full border px-4 text-sm ${lens === l.id ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2 hover:border-ink-3"}`}
                      >
                        {l.label}
                        {l.id === info.season.lens && <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-accent">season</span>}
                        {done && <span className="ml-2 text-ink-3">·</span>}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={busy || !lens || (dust !== null && dust < eco.recast)}
                  onClick={() => void recast()}
                  className="mt-5 min-h-11 rounded-full bg-accent px-6 font-display text-[15px] font-semibold text-paper transition disabled:opacity-40"
                >
                  {busy ? "Reading the sky…" : `Recast · ${eco.recast} Stardust`}
                </button>
                {dust !== null && <span className="ml-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">You have {dust}</span>}
              </>
            )}

            {msg && <p className="mt-4 text-sm text-ink-2">{msg}</p>}

            {shown && (
              <div className="mt-8">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
                  {fresh ? "Just pulled in" : "Last recast"} · {info?.lenses.find((l) => l.id === shown.lens)?.label}
                  {shown.season && <span className="text-accent"> · {MONTH(shown.season)} season</span>}
                </p>
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {shown.snap.brands.slice(0, 8).map((b) => {
                    const link = brandLink(b);
                    return (
                      <li key={b.id} className="flex items-center gap-4 py-3">
                        <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-accent">{Math.round(b.affinity * 100)}</span>
                        <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold">{b.name}</span>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            void fetch(`/api/card/${encodeURIComponent(pick!)}/click`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brand: b.id, src: "recast" }), keepalive: true })
                          }
                          className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3 hover:text-accent"
                        >
                          {link.label} ↗
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {eco.living !== null && entry && (
              <div className="mt-10 border-t border-line pt-6">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Living sigils</p>
                {prestige ? (
                  <p className="mt-2 max-w-md text-sm text-ink-2">
                    This {entry.card.rarityLabel} was born with them, and with the crest: the turning rosette only Holo and Secret cards carry. That one isn&apos;t for sale.
                  </p>
                ) : entry.card.living ? (
                  <p className="mt-2 max-w-md text-sm text-ink-2">Awake. Its sigils breathe on every page it&apos;s shown.</p>
                ) : (
                  <>
                    <p className="mt-2 max-w-md text-sm text-ink-2">Wake this card&apos;s sigils so they breathe and turn. Holo and Secret cards are born with them.</p>
                    <button
                      type="button"
                      disabled={busy || (dust !== null && dust < eco.living)}
                      onClick={() => void wake()}
                      className="mt-4 min-h-11 rounded-full border border-accent px-6 font-display text-[15px] font-semibold text-accent transition hover:bg-accent-soft disabled:opacity-40"
                    >
                      Wake its sigils · {eco.living} Stardust
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
