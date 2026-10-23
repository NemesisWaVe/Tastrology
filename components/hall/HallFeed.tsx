"use client";

import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HoloCard, RARITY_GLOW } from "@/components/card/HoloCard";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { Mark } from "@/components/site/Mark";
import type { CardData, Rarity } from "@/lib/card";
import { ROLL_ODDS, tierAt } from "@/lib/odds";
import { sfx } from "@/lib/sound";
import s from "./hall.module.css";
import { buzz as haptic } from "@/lib/haptics";

type Entry = { code: string; card: CardData };
type Census = { holo: number; secret: number };
/** What sits between cards: your turn (mint), a practice roll, or a dare to fight the card you just saw. */
type Inter = "turn" | "roll" | "fight";
type Slide = { kind: "card"; e: Entry; pass: number; n: number } | { kind: Inter; pass: number; k: number; end: boolean; ref: Entry };

/** Cards between interruptions: a fresh 3 to 5 each time, so the next one never lands on a beat you can count. */
const GAP_MIN = 3;
const GAP_SPAN = 3;
/** Passes the loop may grow to (each pass is the whole Hall again, reshuffled); far past anyone's thumb. */
const MAX_PASSES = 40;
const SEEN = "tastrology:hallSeen";
const OPEN_SKY = skyState([], "");
const TIERS: Rarity[] = ["common", "rare", "holo", "secret"];
const TIER_NAME: Record<Rarity, string> = { common: "Common", rare: "Rare", holo: "Holo Rare", secret: "Secret Rare" };
const P = (tier: Rarity) => ROLL_ODDS.find((o) => o.tier === tier)?.p ?? 0;
const pct = (tier: Rarity) => `${Math.round(P(tier) * 1000) / 10}%`;
const oneIn = (tier: Rarity) => `1 in ${Math.round(1 / P(tier))}`;

/** Small seeded PRNG (mulberry32): the session's own order, stable while the feed grows. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useCardWidth() {
  const [w, setW] = useState(300);
  useEffect(() => {
    // phones keep room under the card for the plaque and the action row
    const f = () => setW(Math.round(Math.min(380, window.innerWidth * 0.8, ((window.innerHeight - (window.innerWidth < 900 ? 400 : 280)) * 63) / 88)));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return w;
}

function buzz(pattern: number[]) {
  haptic(pattern);
}

/**
 * The Hall of Rares as a feed: one card per screen under the night sky, swipe (or scroll, or arrow) to the next, and it
 * never ends: past the last card the Hall starts over, reshuffled. Every card arrives sealed and is opened on screen
 * (the tier only shows as it charges), and between cards, at uneven gaps, the feed turns to you: a practice roll at the
 * real odds, a dare to fight the card you just saw, or the way to mint. Only nearby cards are drawn as live cards.
 */
export function HallFeed() {
  const [cards, setCards] = useState<Entry[]>([]);
  const [census, setCensus] = useState<Census | null>(null);
  const [next, setNext] = useState<number | null>(0);
  const [failed, setFailed] = useState(false);
  const [passes, setPasses] = useState(1);
  const [cur, setCur] = useState(0);
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [seenBefore, setSeenBefore] = useState<Set<string>>(() => new Set());
  const opened = useRef(new Set<string>());
  const loading = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  const w = useCardWidth();
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    try {
      setSeenBefore(new Set(JSON.parse(localStorage.getItem(SEEN) || "[]") as string[]));
    } catch {}
  }, []);
  const onOpen = useCallback(
    (code: string) => {
      opened.current.add(code);
      try {
        localStorage.setItem(SEEN, JSON.stringify([...new Set([...seenBefore, ...opened.current])].slice(-500)));
      } catch {}
    },
    [seenBefore],
  );

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

  // The whole Hall, pass after pass (each later pass reshuffled), interrupted at uneven gaps by a rotating turn to you.
  // Deterministic from the session seed, so the slides already on screen never move as the feed grows.
  const slides = useMemo(() => {
    const out: Slide[] = [];
    if (!cards.length) return out;
    const kinds: Inter[] = prng(seed)() < 0.5 ? ["roll", "fight", "turn"] : ["fight", "roll", "turn"];
    let ki = 0;
    for (let pass = 0; pass < passes; pass++) {
      const r = prng(seed + pass * 7919);
      const order = [...cards];
      if (pass > 0)
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(r() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      let gap = GAP_MIN + Math.floor(r() * GAP_SPAN);
      let since = 0;
      order.forEach((e, n) => {
        out.push({ kind: "card", e, pass, n });
        since++;
        const end = n === order.length - 1 && next === null;
        if (since >= gap || end) {
          out.push({ kind: kinds[ki++ % kinds.length], pass, k: n, end, ref: e });
          since = 0;
          gap = GAP_MIN + Math.floor(r() * GAP_SPAN);
        }
      });
    }
    return out;
  }, [cards, passes, seed, next]);

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
  const total = census ? census.secret + census.holo : cards.length;
  const position = !at ? "" : at.kind === "card" ? `${at.n + 1} / ${total}` : at?.kind === "roll" ? "practice roll" : at?.kind === "fight" ? "your move" : "your turn";

  return (
    <div className={s.page}>
      <Sky f={OPEN_SKY} reduce={reduce} fixed quiet drawn dim={0.55} />
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
            <CardSlide
              key={`${x.pass}-${x.e.code}`}
              x={x}
              i={i}
              cur={cur}
              w={w}
              reduce={reduce}
              fresh={!opened.current.has(x.e.code)}
              isNew={!seenBefore.has(x.e.code)}
              onOpen={onOpen}
            />
          ) : (
            <section key={`t${x.pass}-${x.k}`} data-i={i} className={`${s.slide} ${s.turn}`} data-kind={x.kind} data-current={i === cur ? "1" : undefined}>
              <span className={s.aura} aria-hidden />
              {x.end && <p className={s.lapNote}>End of the Hall · reshuffling</p>}
              {x.kind === "roll" ? (
                <RollSlide w={w} reduce={reduce} />
              ) : x.kind === "fight" ? (
                <FightSlide e={x.ref} w={w} />
              ) : (
                <TurnSlide w={w} end={x.end} total={total} />
              )}
            </section>
          ),
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ a card: sealed, charged, opened */

const SPARKS = Array.from({ length: 14 }, (_, k) => ({ a: (k * 360) / 14 + (k % 2 ? 9 : -6), d: 0.75 + ((k * 37) % 5) / 10 }));
const DUST = Array.from({ length: 12 }, (_, k) => ({ x: (k * 53 + 11) % 100, d: (k * 0.73) % 6, t: 7 + ((k * 29) % 5), h: (k * 47) % 360 }));

function CardSlide({
  x,
  i,
  cur,
  w,
  reduce,
  fresh,
  isNew,
  onOpen,
}: {
  x: Extract<Slide, { kind: "card" }>;
  i: number;
  cur: number;
  w: number;
  reduce: boolean;
  fresh: boolean;
  isNew: boolean;
  onOpen: (code: string) => void;
}) {
  const { e } = x;
  const tier = e.card.rarity;
  const current = i === cur;
  const near = Math.abs(i - cur) <= 1;
  const [phase, setPhase] = useState<"sealed" | "charge" | "open">("sealed");
  const done = useRef(false);

  const open = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setPhase("open");
    onOpen(e.code);
    if (tier === "secret") {
      sfx("reveal", { gain: 0.9 });
      setTimeout(() => sfx("stamp", { gain: 0.6 }), 280);
      buzz([18, 50, 36]);
    } else {
      sfx("reveal", { gain: 0.55 });
      buzz([14]);
    }
  }, [e.code, onOpen, tier]);

  // On screen: charge (neutral first, the tier's colour bleeding in only at the end), then burst open. First sight takes
  // its time, a Secret longest; a card already opened this visit re-opens quickly. Scrolled away mid-charge, it re-seals.
  useEffect(() => {
    if (!current || done.current) return;
    const quick = reduce || !fresh;
    const t1 = setTimeout(() => {
      setPhase("charge");
      if (!quick) sfx("shimmer", { gain: 0.25 });
    }, quick ? 0 : 220);
    const t2 = setTimeout(open, reduce ? 0 : quick ? 420 : tier === "secret" ? 1650 : 1150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (!done.current) setPhase("sealed");
    };
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOpen = phase === "open";
  const glow = RARITY_GLOW[tier];
  return (
    <section
      data-i={i}
      className={s.slide}
      data-tier={tier}
      data-phase={phase}
      data-quick={fresh ? undefined : "1"}
      data-current={current ? "1" : undefined}
      style={{ ["--tc" as string]: glow }}
    >
      <span className={s.aura} aria-hidden />
      <span className={s.tierWord} aria-hidden>
        {tier === "secret" ? "SECRET" : "HOLO"}
      </span>
      {current && isOpen && !reduce && (
        <span className={s.dust} aria-hidden>
          {DUST.map((d, k) => (
            <i key={k} style={{ left: `${d.x}%`, animationDelay: `${d.d}s`, animationDuration: `${d.t}s`, ["--h" as string]: `${d.h}deg` }} />
          ))}
        </span>
      )}
      <div className={s.stage}>
        <div className={s.cardWrap} style={{ width: w }}>
          {isOpen ? (
            <Link href={`/c/${e.code}`} className={s.cardLink} aria-label={`Open ${e.card.archetype}`}>
              {near ? <HoloCard card={e.card} width={w} idle={current} /> : <span className={s.ghost} style={{ width: w }} />}
            </Link>
          ) : (
            <button type="button" className={s.pack} onClick={open} aria-label="Open this card">
              <span className={s.packGlow} aria-hidden />
              <span className={s.packFace}>
                <Mark size={Math.round(w * 0.22)} color="#f3f1ec" />
                <b>Tastrology</b>
                <small>Hall of Rares · sealed</small>
              </span>
              <em className={s.packTap}>{phase === "charge" ? "opening…" : "tap to open"}</em>
            </button>
          )}
          {isOpen && !reduce && (
            <span className={s.burst} aria-hidden>
              {SPARKS.map((p, k) => (
                <i key={k} style={{ ["--a" as string]: `${p.a}deg`, ["--d" as string]: p.d }} />
              ))}
            </span>
          )}
          {isOpen && (
            <p className={s.stamp}>
              <b>{tier === "secret" ? "◆◆◆" : "◆◆"}</b> {TIER_NAME[tier]} <span>{oneIn(tier)} mints</span>
            </p>
          )}
        </div>
        <div className={s.plaque}>
          {isOpen ? (
            <>
              <span>
                {isNew && <mark className={s.new}>New</mark>}
                {e.card.rarityLabel}
                {e.card.rarityNo ? ` · No. ${String(e.card.rarityNo).padStart(3, "0")}` : ""}
              </span>
              <b>{e.card.archetype}</b>
              <small>
                Sun {e.card.bigThree.sun.name} · Moon {e.card.bigThree.moon.name} · power {e.card.power}
              </small>
              {e.card.rarityWhy[0] && <em>Why it&apos;s rare: {e.card.rarityWhy[0]}</em>}
            </>
          ) : (
            <>
              <span>{phase === "charge" ? "Something's in here" : "Sealed"}</span>
              <b>? ? ?</b>
              <small>Holo or Secret. You&apos;ll know in a second.</small>
              <em>&nbsp;</em>
            </>
          )}
        </div>
        <nav className={s.rail} aria-label="Card actions" data-hidden={isOpen ? undefined : "1"}>
          <Link href={`/c/${e.code}`} tabIndex={isOpen ? undefined : -1}>
            <i aria-hidden>◎</i>
            <span>Open</span>
          </Link>
          <Link href={`/vs/${e.code}`} tabIndex={isOpen ? undefined : -1}>
            <i aria-hidden>⚔</i>
            <span>Fight</span>
          </Link>
          <button type="button" onClick={() => share(e)} tabIndex={isOpen ? undefined : -1}>
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
  );
}

/* ------------------------------------------------------------------ the turns to you */

/** A practice roll at the real odds: the reel spins through the tiers and lands where a mint would. Not a mint. */
function RollSlide({ w, reduce }: { w: number; reduce: boolean }) {
  const [face, setFace] = useState<Rarity | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rolls, setRolls] = useState<Rarity[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const roll = () => {
    if (rolling) return;
    sfx("tap");
    const land = tierAt(Math.random());
    if (reduce) {
      setFace(land);
      setRolls((r) => [...r, land]);
      return;
    }
    setRolling(true);
    // a reel that slows down: 16 flicks, each a little longer, the last one the real result
    let t = 0;
    for (let k = 0; k < 16; k++) {
      t += 40 + k * k * 0.9;
      const last = k === 15;
      timers.current.push(
        setTimeout(() => {
          setFace(last ? land : TIERS[(k + Math.floor(Math.random() * 3)) % 4]);
          if (!last) sfx("tick", { gain: 0.2 });
          else {
            setRolling(false);
            setRolls((r) => [...r, land]);
            if (land === "secret") {
              sfx("reveal", { gain: 0.9 });
              buzz([18, 50, 36]);
            } else if (land === "holo") sfx("reveal", { gain: 0.5 });
            else sfx("pop", { gain: 0.4 });
          }
        }, t),
      );
    }
  };

  const best = rolls.reduce<Rarity | null>((b, r) => (b === null || TIERS.indexOf(r) > TIERS.indexOf(b) ? r : b), null);
  const landed = !rolling && face;
  const line: Record<Rarity, string> = {
    common: "Common. Where 7 in 10 rolls land. The Hall only hangs the other kind.",
    rare: "Rare. Close. The Hall starts at Holo.",
    holo: `Holo Rare. ${oneIn("holo")}. Now picture it with your taste on it.`,
    secret: `SECRET RARE. ${oneIn("secret")}. That's the feeling. Now do it for real.`,
  };
  return (
    <div className={s.stage}>
      <button
        type="button"
        className={s.reel}
        onClick={roll}
        data-face={face ?? undefined}
        data-landed={landed ? "1" : undefined}
        style={{ width: Math.round(w * 0.72), ["--tc" as string]: face ? RARITY_GLOW[face] : "#c6ff3d" }}
        aria-label="Practice roll"
      >
        <span className={s.reelWindow}>
          <b key={rolls.length + (face ?? "") + (rolling ? "r" : "")}>{face ? TIER_NAME[face] : "Roll"}</b>
        </span>
        <small>{rolling ? "rolling…" : face ? "tap to roll again" : "tap · just practice"}</small>
      </button>
      <div className={s.turnText}>
        <p className={s.turnKicker}>Practice roll · real odds</p>
        <h2>{landed && face ? line[face] : "Would you have pulled one?"}</h2>
        <p className={s.turnOdds}>
          {rolls.length ? (
            <>
              {rolls.length} roll{rolls.length > 1 ? "s" : ""} · best <b>{TIER_NAME[best!]}</b>
            </>
          ) : (
            <>
              Every mint rolls once: <b>{pct("secret")}</b> Secret · <b>{pct("holo")}</b> Holo
            </>
          )}
        </p>
        <div className={s.turnCtas}>
          <Link href="/#byo" className={s.turnMain}>
            Roll for real →
          </Link>
        </div>
        <p className={s.turnMore}>↓ keep scrolling the Hall</p>
      </div>
    </div>
  );
}

/** A dare: the card you just saw, its power, against a card that doesn't exist yet. */
function FightSlide({ e, w }: { e: Entry; w: number }) {
  const tier = e.card.rarity;
  return (
    <div className={s.stage}>
      <div className={s.duel} style={{ width: Math.min(360, Math.round(w * 1.05)) }}>
        <div className={s.duelSide} data-tier={tier} style={{ ["--tc" as string]: RARITY_GLOW[tier] }}>
          <small>{TIER_NAME[tier]}</small>
          <b>{e.card.archetype}</b>
          <span>
            <em>{e.card.power}</em> power
          </span>
        </div>
        <i className={s.duelVs}>vs</i>
        <div className={`${s.duelSide} ${s.duelYou}`}>
          <small>Yours</small>
          <b>?</b>
          <span>
            <em>??</em> power
          </span>
        </div>
      </div>
      <div className={s.turnText}>
        <p className={s.turnKicker}>Your move</p>
        <h2>Think your taste beats {e.card.archetype}?</h2>
        <p className={s.turnOdds}>A fight is decided by real taste data. No luck on this one.</p>
        <div className={s.turnCtas}>
          <Link href={`/vs/${e.code}`} className={s.turnMain}>
            Fight it ⚔
          </Link>
          <Link href="/#byo" className={s.turnAlt}>
            Make my fighter
          </Link>
        </div>
        <p className={s.turnMore}>↓ keep scrolling the Hall</p>
      </div>
    </div>
  );
}

function TurnSlide({ w, end, total }: { w: number; end: boolean; total: number }) {
  return (
    <div className={s.stage}>
      <div className={s.sealed} style={{ width: Math.round(w * 0.7) }} aria-hidden>
        <b>?</b>
      </div>
      <div className={s.turnText}>
        <p className={s.turnKicker}>{end ? "That's the whole Hall" : "Your turn"}</p>
        <h2>{end ? "It starts again. Or yours goes up next." : "Yours could hang here."}</h2>
        <p className={s.turnOdds}>
          Every mint rolls: <b>{pct("secret")}</b> Secret · <b>{pct("holo")}</b> Holo
          {total ? ` · ${total} pulled so far` : ""}
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
  );
}

function share(e: Entry) {
  const url = `${window.location.origin}/c/${e.code}`;
  const text = `${e.card.rarityLabel} in the Tastrology Hall of Rares: ${e.card.archetype}`;
  if (navigator.share) void navigator.share({ url, text }).catch(() => {});
  else void navigator.clipboard?.writeText(url).catch(() => {});
}
