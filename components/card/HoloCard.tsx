"use client";

import { Mark } from "@/components/site/Mark";
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef } from "react";
import { SEASON, TWIN_HOST, cardCode, twinUrl, type CardData, type CardType } from "@/lib/card";
import { BRAND } from "@/lib/brand";
import { KindSigil, Sigil, Sparkle, TypeSigil } from "./Sigils";
import { qr, qrPath } from "./qr";
import s from "./holo.module.css";

export interface HoloCardHandle {
  /** Freeze the card flat with a static (blend-mode free) foil, for PNG export. */
  still: (on: boolean) => void;
  el: HTMLDivElement | null;
}

/** Text presentation selector so glyphs like ⚡ never render as colour emoji. */
export const glyph = (g: string) => `${g}︎`;

const GEMS = { common: "●", rare: "◆", holo: "◆◆", secret: "◆◆◆" } as const;

/** Rarity hint colours, shared by the card back's edge glow and the reveal. */
export const RARITY_GLOW = { common: "#c7ccd4", rare: "#7dd3fc", holo: "#c4b5fd", secret: "#fcd34d" } as const;

const DOTO = "https://fonts.googleapis.com/css2?family=Doto:wght@600;800&display=swap";
/** Dot-matrix face for serials. React 19 hoists and dedupes this into <head>. */
const DotoFont = () => <link rel="stylesheet" href={DOTO} precedence="default" />;

/**
 * Collectible card with pointer/gyro tilt, rainbow foil and glare. Motion is a small spring on CSS
 * custom properties (no re-renders); it idles with a slow float so it shimmers on its own.
 * Foil layers sit *under* the text (or are masked to the frame/art), so type stays crisp.
 */
export const HoloCard = forwardRef<
  HoloCardHandle,
  {
    card: CardData;
    className?: string;
    idle?: boolean;
    width?: number;
    still?: boolean;
    /** Hero-first reveal: art + name + rarity land, then the details print row by row like a receipt. */
    print?: boolean;
  }
>(
  function HoloCard({ card, className = "", idle = true, width = 340, still = false, print = false }, ref) {
    const root = useRef<HTMLDivElement>(null);
    const state = useRef({ tx: 0, ty: 0, x: 0, y: 0, active: false, still: false, t0: 0 });

    const freeze = (on: boolean) => {
      state.current.still = on;
      const el = root.current;
      if (!el) return;
      if (on) el.dataset.still = "1";
      else delete el.dataset.still;
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--mx", "34%");
      el.style.setProperty("--my", "26%");
      el.style.setProperty("--o", on ? "0.6" : "0");
    };

    useImperativeHandle(ref, () => ({
      still: freeze,
      get el() {
        return root.current;
      },
    }));

    useEffect(() => {
      if (still) freeze(true);
      return () => {
        if (still) freeze(false);
      };
    }, [still]);

    useEffect(() => {
      const el = root.current;
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      state.current.t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const st = state.current;
        if (!st.still) {
          if (!st.active && idle && !reduce) {
            const t = (now - st.t0) / 1000;
            st.tx = Math.sin(t * 0.6) * 0.34;
            st.ty = Math.cos(t * 0.45) * 0.24;
          } else if (!st.active) {
            st.tx = 0;
            st.ty = 0;
          }
          st.x += (st.tx - st.x) * 0.09;
          st.y += (st.ty - st.y) * 0.09;
          const mx = 50 + st.x * 50;
          const my = 50 + st.y * 50;
          el.style.setProperty("--rx", `${(-st.y * 14).toFixed(2)}deg`);
          el.style.setProperty("--ry", `${(st.x * 18).toFixed(2)}deg`);
          el.style.setProperty("--mx", `${mx.toFixed(1)}%`);
          el.style.setProperty("--my", `${my.toFixed(1)}%`);
          el.style.setProperty("--ang", `${(st.x * 120 + st.y * 60).toFixed(1)}deg`);
          el.style.setProperty("--hyp", Math.min(1, Math.hypot(st.x, st.y)).toFixed(3));
          el.style.setProperty("--o", (st.active ? 1 : idle ? 0.6 : 0.3).toFixed(2));
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        state.current.active = true;
        state.current.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        state.current.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      };
      const leave = () => (state.current.active = false);
      const orient = (e: DeviceOrientationEvent) => {
        if (e.gamma == null || e.beta == null) return;
        state.current.active = true;
        state.current.tx = Math.max(-1, Math.min(1, e.gamma / 30));
        state.current.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      window.addEventListener("deviceorientation", orient);
      return () => {
        cancelAnimationFrame(raf);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
        window.removeEventListener("deviceorientation", orient);
      };
    }, [idle]);

    const [t1, t2] = card.types;
    const style = {
      "--a": t1?.a ?? "#a78bfa",
      "--b": (t2 ?? t1)?.b ?? "#22d3ee",
      "--a2": t2?.a ?? t1?.b ?? "#f472b6",
    } as React.CSSProperties;

    return (
      <div className={`${s.scene} ${className}`} style={{ width }}>
        <div ref={root} className={`${s.card} ${s[card.rarity]}`} style={style} data-rarity={card.rarity} data-print={print ? "1" : undefined}>
          <DotoFont />
          <CardFace card={card} />
          <div className={s.frameShine} aria-hidden />
          <div className={s.glare} aria-hidden />
        </div>
      </div>
    );
  },
);

function CardFace({ card }: { card: CardData }) {
  const { sun, moon, rising, moonIsContradiction } = card.bigThree;
  const len = card.archetype.length;
  return (
    <div className={s.face}>
      <div className={s.faceFoil} aria-hidden />
      <Rosette className={s.rosette} />

      <header className={s.top}>
        <span className={s.brand}>
          <Mark className={s.brandMark} color="currentColor" />
          {BRAND.name}
        </span>
        <span className={s.serial}>
          <b className={s.dots}>№{card.serial}</b> {BRAND.cardSet}
        </span>
        <span className={`${s.rarity} ${s.heroRarity}`}>
          <i>{GEMS[card.rarity]}</i>
          {card.rarityLabel}
        </span>
      </header>

      <div className={`${s.titleBlock} ${s.heroTitle}`}>
        <p className={s.kicker}>{card.dual ? "dual-type taste sign" : "taste sign"}</p>
        <h3 className={s.title} data-size={len > 24 ? "s" : len > 15 ? "m" : "l"}>
          {card.archetype}
        </h3>
      </div>

      <div className={`${s.art} ${s.heroArt}`}>
        <ArtCollage card={card} />
        <Constellation card={card} />
        <div className={s.artShine} aria-hidden />
        <div className={s.seal}>
          <b>{card.power}</b>
          <span>taste</span>
        </div>
        {card.deepCut && (
          <div className={s.stamp} aria-label={`Deep Cut: your loves average ${card.avgPop}% popularity`}>
            <b>Deep Cut</b>
            <small>{card.avgPop}% avg pop</small>
          </div>
        )}
        <div className={s.artTag}>
          {card.types.map((t, i) => (
            <span key={t.name}>
              {i > 0 && <em>/</em>}
              <TypeSigil glyph={t.glyph} className={s.tagSigil} />
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <div className={s.big3}>
        <Sign d={0} kind="sun" label="Sun" t={sun} sub="core aesthetic" />
        <Sign d={1} kind="moon" label="Moon" t={moon} sub={moonIsContradiction ? "contradiction" : "hidden side"} alert={moonIsContradiction} />
        <Sign d={2} kind="rising" label="Rising" t={rising} sub="how you read" />
      </div>

      <ul className={s.moves}>
        {card.moves.map((m, i) => (
          <li key={m.name} className={s.pr} style={pd(3 + i)}>
            <span className={s.moveIdx}>{String(i + 1).padStart(2, "0")}</span>
            <span className={s.moveName}>
              {m.name}
              {m.note && <small>via {m.note}</small>}
            </span>
            <b className={s.moveVal}>
              {m.value}
              <small>aff</small>
            </b>
          </li>
        ))}
      </ul>

      <div className={s.stats}>
        {card.stats.map((st, i) => (
          <div key={st.label} className={s.pr} style={pd(3 + card.moves.length + i)} title={st.hint} aria-label={st.hint ? `${st.value}. ${st.hint}` : undefined}>
            <span>{st.label}</span>
            <b>{st.value}</b>
            <i>
              <i style={{ width: `${st.value}%` }} />
            </i>
          </div>
        ))}
      </div>

      <div className={`${s.foot} ${s.pr}`} style={pd(7 + card.moves.length)}>
        <p className={s.flavor}>{card.flavor}</p>
        {card.weak && (
          <p className={s.weak}>
            <b>Weak to:</b> {card.weak.name}. Moved {card.weak.pct}% of your picks.
          </p>
        )}
      </div>

      <footer className={`${s.mrz} ${s.pr}`} style={pd(8 + card.moves.length)}>
        <span>{card.mrz?.[0]}</span>
        <span>{card.mrz?.[1]}</span>
      </footer>
    </div>
  );
}

/** Print-order index → CSS var used by the hero-first receipt reveal. */
const pd = (d: number) => ({ ["--d" as string]: d }) as React.CSSProperties;

function Sign({ d, kind, label, t, sub, alert }: { d: number; kind: "sun" | "moon" | "rising"; label: string; t: CardType; sub: string; alert?: boolean }) {
  return (
    <div className={`${s.sign} ${s.pr}`} data-alert={alert ? "1" : undefined} style={{ ["--c1" as string]: t.a, ["--c2" as string]: t.b, ...pd(d) }}>
      <div className={s.signHead}>
        <Sigil kind={kind} className={s.sigil} />
        <span>{label}</span>
        <TypeSigil glyph={t.glyph} className={s.typeSigil} />
      </div>
      <b className={s.signVal}>{t.name}</b>
      <small className={s.signSub}>{alert ? `≠ ${sub}` : sub}</small>
    </div>
  );
}

function Constellation({ card }: { card: CardData }) {
  const stars = card.stars ?? [];
  if (stars.length < 2) return null;
  const path = [...stars].sort((a, b) => a.x - b.x);
  return (
    <div className={s.constellation} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={path.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} />
        {path.length > 3 && <line x1={path[0].x * 100} y1={path[0].y * 100} x2={path[2].x * 100} y2={path[2].y * 100} className={s.faint} />}
      </svg>
      {stars.map((p) => (
        <span key={p.name} className={s.star} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, ["--w" as string]: p.weight.toFixed(2) }}>
          <Sparkle />
        </span>
      ))}
    </div>
  );
}

function ArtCollage({ card }: { card: CardData }) {
  if (!card.art.length) {
    // Generative fallback: layered orbs in the card's type colours.
    return (
      <div className={s.gen}>
        <i />
        <i />
        <i />
      </div>
    );
  }
  const imgs = card.art.slice(0, 5);
  return (
    <div className={s.collage} data-n={imgs.length}>
      {imgs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" crossOrigin="anonymous" style={{ ["--i" as string]: i }} />
      ))}
    </div>
  );
}

/** Guilloche rosette (banknote / passport security linework), generated once. */
const ROSETTE = (() => {
  const out: string[] = [];
  const fam = (N: number, R: number, amp: number, k: number) => {
    for (let j = 0; j < N; j++) {
      const ph = (j / N) * ((Math.PI * 2) / k);
      let d = "";
      for (let i = 0; i <= 240; i++) {
        const t = (i / 240) * Math.PI * 2;
        const r = R + amp * Math.sin(k * (t + ph));
        d += `${i ? "L" : "M"}${(Math.cos(t) * r).toFixed(2)} ${(Math.sin(t) * r).toFixed(2)}`;
      }
      out.push(d + "Z");
    }
  };
  fam(14, 38, 9, 9);
  fam(10, 24, 6, 7);
  return out;
})();

function Rosette({ className, paths = ROSETTE }: { className?: string; paths?: string[] }) {
  return (
    <svg className={className} viewBox="-50 -50 100 100" aria-hidden>
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
      <circle r="48.5" />
      <circle r="46.8" strokeDasharray="0.6 1.4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ card back */

const fnv = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Seeded generative linework, unique to the card: a guilloche rosette and a "taste fingerprint" tick ring. */
function backArt(seed: number, stars: { cx: number; cy: number; weight: number }[]) {
  let st = seed || 1;
  const rnd = () => (st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296;
  const rosette: string[] = [];
  const fam = (N: number, R: number, amp: number, k: number) => {
    for (let j = 0; j < N; j++) {
      const ph = (j / N) * ((Math.PI * 2) / k);
      let d = "";
      for (let i = 0; i <= 180; i++) {
        const t = (i / 180) * Math.PI * 2;
        const r = R + amp * Math.sin(k * (t + ph));
        d += `${i ? "L" : "M"}${(Math.cos(t) * r).toFixed(2)} ${(Math.sin(t) * r).toFixed(2)}`;
      }
      rosette.push(d + "Z");
    }
  };
  fam(12, 38, 6 + rnd() * 5, 7 + Math.floor(rnd() * 5));
  fam(9, 24, 4 + rnd() * 3, 5 + Math.floor(rnd() * 4));
  // Fingerprint: 120 radial ticks; each seed raises a crest at its own bearing, scaled by how much it drives the brands.
  const sky = stars.map((p) => ({ a: Math.atan2(p.cy - 50, p.cx - 50), w: p.weight }));
  let ticks = "";
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2 - Math.PI / 2;
    let len = 0.8 + rnd() * 1.6;
    for (const p of sky) {
      const da = Math.atan2(Math.sin(a - p.a), Math.cos(a - p.a));
      len += 4.2 * (0.35 + p.w) * Math.exp(-((da / 0.13) ** 2));
    }
    const r0 = 41.5;
    const r1 = r0 + Math.min(5, len);
    ticks += `M${(50 + Math.cos(a) * r0).toFixed(2)} ${(50 + Math.sin(a) * r0).toFixed(2)}L${(50 + Math.cos(a) * r1).toFixed(2)} ${(50 + Math.sin(a) * r1).toFixed(2)}`;
  }
  return { rosette, ticks };
}

/**
 * The face-down side, designed as the printed back of a 63 x 88 mm card:
 * brand + set/season, a generative sky (seed constellation, fingerprint ring, seeded guilloche, micro-text),
 * a 1st-edition rarity stamp, a holo-foil seal zone, the edition number, a certificate-of-taste line and a QR
 * plus short code to the verifiable digital twin (/c/<code>).
 * A parent can set `--charge` (0-1) on any ancestor to brighten the glow and speed the foil sweep (hold-to-mint).
 * `printSafe` drops every screen-only effect (glows, sheen, animation, blend modes) for print/PDF export.
 */
export function CardBack({ card, className = "", crack = false, printSafe = false }: { card: CardData; className?: string; crack?: boolean; printSafe?: boolean }) {
  const stars = card.stars ?? [];
  // Map stars into a centred square field, so the constellation reads as a sigil, not a chart.
  const pts = stars.map((p) => ({ ...p, cx: 20 + p.x * 60, cy: 20 + Math.max(0, Math.min(1, (p.y - 0.18) / 0.6)) * 60 }));
  const path = [...pts].sort((a, b) => a.cx - b.cx);
  const chords = path.length > 3 ? [[0, 2], [1, path.length - 1]] : [];
  const glow = RARITY_GLOW[card.rarity];
  const code = cardCode(card);
  const url = twinUrl(card);
  const seedKey = stars.map((p) => `${p.name}:${p.weight.toFixed(2)}`).join("|") + card.serial;
  const art = useMemo(() => backArt(fnv(seedKey), pts), [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const code2d = useMemo(() => {
    const m = qr(url);
    return { n: m.length, d: qrPath(m) };
  }, [url]);
  const ring = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const micro = `${BRAND.name} · certified taste · ${BRAND.cardSet} · S${SEASON} · No ${card.serial} · ${code} · `.toUpperCase();
  const q = code2d.n + 8; // 4-module quiet zone on each side

  return (
    <div className={`${s.backScene} ${className}`} data-rarity={card.rarity} data-print-safe={printSafe ? "1" : undefined} style={{ ["--glow" as string]: glow }}>
      <DotoFont />
      <div className={s.backCard}>
        <div className={s.backFace}>
          <Rosette className={s.backRosette} paths={art.rosette} />
          <header className={s.backTop}>
            <span className={s.brand}>
              <Mark className={s.brandMark} color="currentColor" />
              {BRAND.name}
            </span>
            <span>
              {BRAND.cardSet} · Season {SEASON}
            </span>
          </header>

          <div className={s.backMid}>
            <div className={s.backSky} aria-hidden>
              <svg viewBox="0 0 100 100">
                <defs>
                  <path id={ring} d="M50 2.6a47.4 47.4 0 1 1 0 94.8a47.4 47.4 0 1 1 0-94.8" />
                </defs>
                <text className={s.micro}>
                  <textPath href={`#${ring}`} textLength="296" lengthAdjust="spacing">
                    {micro.repeat(3)}
                  </textPath>
                </text>
                <path d={art.ticks} className={s.ticks} />
                <circle cx="50" cy="50" r="40" className={s.orbit} />
                <circle cx="50" cy="50" r="30" className={s.orbit} strokeDasharray="0.6 2.2" />
                <polyline points={path.map((p) => `${p.cx},${p.cy}`).join(" ")} />
                {chords.map(([a, b]) => (
                  <line key={`${a}-${b}`} x1={path[a].cx} y1={path[a].cy} x2={path[b].cx} y2={path[b].cy} className={s.faint} />
                ))}
              </svg>
              {pts.map((p, i) => (
                <span
                  key={p.name + i}
                  className={s.node}
                  style={{ left: `${p.cx}%`, top: `${p.cy}%`, ["--w" as string]: p.weight.toFixed(2), ["--i" as string]: i }}
                  title={p.name}
                >
                  <KindSigil kind={p.kind} />
                </span>
              ))}
            </div>
            <div className={s.edition}>
              <b>1st edition</b>
              <span>
                {GEMS[card.rarity]} {card.rarityLabel}
              </span>
            </div>
            <div className={s.foilSeal} data-layer="foil" aria-hidden>
              <svg viewBox="-50 -50 100 100">
                <defs>
                  <path id={`${ring}s`} d="M0-37a37 37 0 1 1 0 74a37 37 0 1 1 0-74" />
                </defs>
                <text>
                  <textPath href={`#${ring}s`} textLength="230" lengthAdjust="spacing">
                    {`AUTHENTIC · ${BRAND.name.toUpperCase()} · S${SEASON} · `}
                  </textPath>
                </text>
                <circle r="27" />
              </svg>
              <Sparkle className={s.sealMark} />
            </div>
          </div>

          <div className={s.backId}>
            <span className={s.backLabel}>No.</span>
            <b className={`${s.dots} ${s.backSerial}`}>{card.serial}</b>
            <span className={s.backLabel}>/ Season {SEASON}</span>
          </div>
          <p className={s.cert}>
            <b>Certificate of taste.</b> {stars.length} loves across {card.domains} domains, read from Qloo’s taste graph. One of one.
          </p>

          <div className={s.verify}>
            <svg className={s.qr} viewBox={`-4 -4 ${q} ${q}`} shapeRendering="crispEdges" role="img" aria-label={`QR code: verify this card at ${url}`}>
              <rect x="-4" y="-4" width={q} height={q} fill="#fff" />
              <path d={code2d.d} />
            </svg>
            <div className={s.verifyText}>
              <span className={s.backLabel}>scan · verify the digital twin</span>
              <b className={s.code}>{code}</b>
              <span className={s.url}>
                {TWIN_HOST}/c/{code}
              </span>
            </div>
          </div>
          <p className={s.microLine} aria-hidden>
            {micro.repeat(4)}
          </p>
        </div>
        {!printSafe && <div className={s.backSheen} aria-hidden />}
        {crack && (
          <svg className={s.crack} viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
            <path d="M54 -2 L47 14 L57 27 L43 44 L55 58 L41 74 L53 90 L44 106 L56 121 L49 142" />
          </svg>
        )}
      </div>
    </div>
  );
}

