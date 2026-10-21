"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { Mark } from "@/components/site/Mark";
import type { CardData } from "@/lib/card";
import { ROLL_ODDS } from "@/lib/odds";
import { sfx } from "@/lib/sound";
import s from "./hall.module.css";

type Entry = { code: string; card: CardData };
type Census = { holo: number; secret: number };
type Slide = { kind: "card"; e: Entry; pass: number; n: number } | { kind: "turn"; pass: number; k: number; end: boolean };

/** A "your turn" slide after every TURN_EVERY cards, and at the end of every pass through the Hall. */
const TURN_EVERY = 4;
/** Passes the loop may grow to (each pass is the whole Hall again); far past anyone's thumb. */
const MAX_PASSES = 40;
const odds = (tier: string) => `${Math.round((ROLL_ODDS.find((o) => o.tier === tier)?.p ?? 0) * 1000) / 10}%`;

function useCardWidth() {
  const [w, setW] = useState(300);
  useEffect(() => {
    // phones keep room under the card for the plaque and the action row
    const f = () => setW(Math.round(Math.min(380, window.innerWidth * 0.8, ((window.innerHeight - (window.innerWidth < 900 ? 330 : 250)) * 63) / 88)));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return w;
}

/**
 * The Hall of Rares as a feed: one card per screen, swipe (or scroll, or arrow) to the next, and it never ends: past
 * the last card the Hall starts over. Every few cards it turns to you, with the real odds and the way to mint.
 * Only the card on screen and its neighbours are drawn as live cards; the rest are empty frames.
 */
export function HallFeed() {
  const [cards, setCards] = useState<Entry[]>([]);
  const [census, setCensus] = useState<Census | null>(null);
  const [next, setNext] = useState<number | null>(0);
  const [failed, setFailed] = useState(false);
  const [passes, setPasses] = useState(1);
  const [cur, setCur] = useState(0);
  const loading = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  const w = useCardWidth();

  const load = useCallback(async () => {
    if (loading.current || next === null) return;
    loading.current = true;
    const j = (await fetch(`/api/rares?cursor=${next}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { cards: Entry[]; census: Census | null; next: number | null } | null;
    loading.current = false;
    if (!j) {
      setFailed(true);
      setNext(null);
      return;
    }
    setCards((c) => [...c, ...j.cards.filter((x) => !c.some((y) => y.code === x.code))]);
    setCensus(j.census);
    setNext(j.next);
  }, [next]);
  useEffect(() => {
    void load();
  }, [load]);

  // the whole Hall, pass after pass, with a turn to you every few cards and at the end of each pass
  const slides = useMemo(() => {
    const out: Slide[] = [];
    if (!cards.length) return out;
    for (let pass = 0; pass < passes; pass++) {
      cards.forEach((e, n) => {
        out.push({ kind: "card", e, pass, n });
        const last = n === cards.length - 1;
        if ((n + 1) % TURN_EVERY === 0 || last) out.push({ kind: "turn", pass, k: n, end: last });
      });
    }
    return out;
  }, [cards, passes]);

  // which slide is on screen
  useEffect(() => {
    const root = feed.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setCur(Number((e.target as HTMLElement).dataset.i));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-i]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [slides.length]);

  // near the end: fetch the next page, or once everything is in, start the next pass
  useEffect(() => {
    if (!slides.length || cur < slides.length - 3) return;
    if (next !== null) void load();
    else setPasses((p) => Math.min(MAX_PASSES, p + 1));
  }, [cur, slides.length, next, load]);

  const prev = useRef(-1);
  useEffect(() => {
    if (prev.current >= 0 && prev.current !== cur) sfx("tick", { gain: 0.35 });
    prev.current = cur;
  }, [cur]);

  useEffect(() => feed.current?.focus({ preventScroll: true }), []);

  const at = slides[cur];
  const total = cards.length;
  const position = at?.kind === "card" ? `${at.n + 1} / ${census ? census.secret + census.holo : total}` : "your turn";

  return (
    <div className={s.page}>
      <header className={s.bar}>
        <Link href="/" className={s.home} aria-label="Tastrology home">
          <Mark size={28} />
        </Link>
        <p className={s.title}>
          <span>Hall of Rares</span>
          <small>{at && at.pass > 0 ? `${position} · lap ${at.pass + 1}` : position}</small>
        </p>
        <Link href="/#byo" className={s.barCta}>
          Mint yours
        </Link>
      </header>

      <div ref={feed} className={s.feed} tabIndex={-1} aria-label="Hall of Rares, one card at a time">
        {!slides.length && (
          <section className={s.slide}>
            <p className={s.empty}>{failed ? "The Hall is closed for a moment. Try again shortly." : next === null ? "No foil pulled yet. The first one hangs here." : "Opening the Hall…"}</p>
          </section>
        )}
        {slides.map((x, i) =>
          x.kind === "card" ? (
            <section key={`${x.pass}-${x.e.code}`} data-i={i} className={s.slide} data-tier={x.e.card.rarity} data-current={i === cur ? "1" : undefined}>
              <span className={s.aura} aria-hidden />
              <div className={s.stage}>
                <Link href={`/c/${x.e.code}`} className={s.cardLink} aria-label={`Open ${x.e.card.archetype}`} style={{ width: w }}>
                  {Math.abs(i - cur) <= 1 ? <HoloCard card={x.e.card} width={w} idle={i === cur} /> : <span className={s.ghost} style={{ width: w }} />}
                </Link>
                <div className={s.plaque}>
                  <span>
                    {x.e.card.rarityLabel}
                    {x.e.card.rarityNo ? ` · No. ${String(x.e.card.rarityNo).padStart(3, "0")}` : ""}
                  </span>
                  <b>{x.e.card.archetype}</b>
                  <small>
                    Sun {x.e.card.bigThree.sun.name} · Moon {x.e.card.bigThree.moon.name}
                  </small>
                </div>
                <nav className={s.rail} aria-label="Card actions">
                  <Link href={`/c/${x.e.code}`}>
                    <i aria-hidden>◎</i>
                    <span>Open</span>
                  </Link>
                  <Link href={`/vs/${x.e.code}`}>
                    <i aria-hidden>⚔</i>
                    <span>Fight</span>
                  </Link>
                  <button type="button" onClick={() => share(x.e)}>
                    <i aria-hidden>↗</i>
                    <span>Share</span>
                  </button>
                </nav>
              </div>
              {i === 0 && (
                <p className={s.hint} aria-hidden>
                  <i>↑</i> swipe for the next one
                </p>
              )}
            </section>
          ) : (
            <section key={`t${x.pass}-${x.k}`} data-i={i} className={`${s.slide} ${s.turn}`} data-current={i === cur ? "1" : undefined}>
              <span className={s.aura} aria-hidden />
              <div className={s.stage}>
                <div className={s.sealed} style={{ width: Math.round(w * 0.7) }} aria-hidden>
                  <b>?</b>
                </div>
                <div className={s.turnText}>
                  <p className={s.turnKicker}>{x.end ? "That's the whole Hall" : "Your turn"}</p>
                  <h2>{x.end ? "It starts again. Or yours goes up next." : "Yours could hang here."}</h2>
                  <p className={s.turnOdds}>
                    Every mint rolls: <b>{odds("secret")}</b> Secret · <b>{odds("holo")}</b> Holo
                    {census ? ` · ${census.secret + census.holo} pulled so far` : ""}
                  </p>
                  <div className={s.turnCtas}>
                    <Link href="/#byo" className={s.turnMain}>
                      Make my card →
                    </Link>
                    <Link href="/#pick" className={s.turnAlt}>
                      Try a ready-made one
                    </Link>
                  </div>
                  <p className={s.turnMore}>↓ keep scrolling the Hall</p>
                </div>
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  );
}

function share(e: Entry) {
  const url = `${window.location.origin}/c/${e.code}`;
  const text = `${e.card.rarityLabel} in the Tastrology Hall of Rares: ${e.card.archetype}`;
  if (navigator.share) void navigator.share({ url, text }).catch(() => {});
  else void navigator.clipboard?.writeText(url).catch(() => {});
}
