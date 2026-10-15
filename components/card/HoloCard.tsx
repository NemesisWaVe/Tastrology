"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CardData, CardType } from "@/lib/card";
import { BRAND } from "@/lib/brand";
import { Sigil, Sparkle } from "./Sigils";
import s from "./holo.module.css";

export interface HoloCardHandle {
  /** Freeze the card flat with a static (blend-mode free) foil, for PNG export. */
  still: (on: boolean) => void;
  el: HTMLDivElement | null;
}

/** Text presentation selector so glyphs like ⚡ never render as colour emoji. */
export const glyph = (g: string) => `${g}︎`;

const GEMS = { common: "●", rare: "◆", holo: "◆◆", secret: "◆◆◆" } as const;

/**
 * Collectible card with pointer/gyro tilt, rainbow foil and glare. Motion is a small spring on CSS
 * custom properties (no re-renders); it idles with a slow float so it shimmers on its own.
 * Foil layers sit *under* the text (or are masked to the frame/art), so type stays crisp.
 */
export const HoloCard = forwardRef<HoloCardHandle, { card: CardData; className?: string; idle?: boolean; width?: number; still?: boolean }>(
  function HoloCard({ card, className = "", idle = true, width = 340, still = false }, ref) {
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
        <div ref={root} className={`${s.card} ${s[card.rarity]}`} style={style} data-rarity={card.rarity}>
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
          <Sparkle className={s.brandMark} />
          {BRAND.name}
        </span>
        <span className={s.serial}>
          № {card.serial} · {BRAND.cardSet}
        </span>
        <span className={s.rarity}>
          <i>{GEMS[card.rarity]}</i>
          {card.rarityLabel}
        </span>
      </header>

      <div className={s.titleBlock}>
        <p className={s.kicker}>{card.dual ? "dual-type taste sign" : "taste sign"}</p>
        <h3 className={s.title} data-size={len > 24 ? "s" : len > 15 ? "m" : "l"}>
          {card.archetype}
        </h3>
      </div>

      <div className={s.art}>
        <ArtCollage card={card} />
        <Constellation card={card} />
        <div className={s.artShine} aria-hidden />
        <div className={s.seal}>
          <b>{card.power}</b>
          <span>taste</span>
        </div>
        <div className={s.artTag}>
          {card.types.map((t, i) => (
            <span key={t.name}>
              {i > 0 && <em>/</em>}
              <i>{glyph(t.glyph)}</i>
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <div className={s.big3}>
        <Sign kind="sun" label="Sun" t={sun} sub="core aesthetic" />
        <Sign kind="moon" label="Moon" t={moon} sub={moonIsContradiction ? "contradiction" : "hidden side"} alert={moonIsContradiction} />
        <Sign kind="rising" label="Rising" t={rising} sub="how you read" />
      </div>

      <ul className={s.moves}>
        {card.moves.map((m, i) => (
          <li key={m.name}>
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
        {card.stats.map((st) => (
          <div key={st.label}>
            <span>{st.label}</span>
            <b>{st.value}</b>
            <i>
              <i style={{ width: `${st.value}%` }} />
            </i>
          </div>
        ))}
      </div>

      <p className={s.flavor}>{card.flavor}</p>

      <footer className={s.mrz}>
        <span>{card.mrz?.[0]}</span>
        <span>{card.mrz?.[1]}</span>
      </footer>
    </div>
  );
}

function Sign({ kind, label, t, sub, alert }: { kind: "sun" | "moon" | "rising"; label: string; t: CardType; sub: string; alert?: boolean }) {
  return (
    <div className={s.sign} data-alert={alert ? "1" : undefined} style={{ ["--c1" as string]: t.a, ["--c2" as string]: t.b }}>
      <div className={s.signHead}>
        <Sigil kind={kind} className={s.sigil} />
        <span>{label}</span>
        <i>{glyph(t.glyph)}</i>
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

function Rosette({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-50 -50 100 100" aria-hidden>
      {ROSETTE.map((d, i) => (
        <path key={i} d={d} />
      ))}
      <circle r="48.5" />
      <circle r="46.8" strokeDasharray="0.6 1.4" />
    </svg>
  );
}
