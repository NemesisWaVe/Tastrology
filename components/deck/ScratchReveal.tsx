"use client";

import { useEffect, useRef, useState } from "react";
import {
  autoPath,
  buzz,
  Coverage,
  foilFor,
  hash,
  paintFoil,
  pathAt,
  type PathPt,
  rareFoil,
  streakStep,
  thresholdFor,
} from "@/lib/scratch";
import { scrub, sfx } from "@/lib/sound";

type Flake = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  r: number;
  vr: number;
  life: number;
  age: number;
};

/** How far the flake canvas reaches past the foil, so flecks can fall out of it. */
const BLEED = { x: 24, top: 12, bottom: 44 };
const LOGO = 44;

/**
 * A sealed brand under scratch-off foil. Rub it with a cursor or a finger and the foil comes away under your stroke,
 * with flecks falling and a held scratching sound that follows your speed; past the threshold the rest lets go, a
 * chord plays (climbing the scale if you're on a streak) and a shine runs over the brand. `autoRun` (bump it) runs
 * the same scratch by itself, slow enough to watch: tap once to hurry it, twice to finish, or start rubbing to take
 * over. Each love wears its own foil, and about one brand in twelve a week wears a shimmer foil.
 */
export function ScratchReveal({
  name,
  image,
  loveId,
  brandId,
  strength = 0.5,
  reduce,
  autoRun = 0,
  cascade = 0,
  onCleared,
  onDone,
}: {
  name: string;
  image?: string;
  loveId: string;
  brandId: string;
  strength?: number;
  reduce: boolean;
  autoRun?: number;
  /** Bump to run a quicker auto scratch as part of a chain; ignored once a hand has touched the foil. */
  cascade?: number;
  /** The foil just let go (onDone follows once the shine has played). */
  onCleared?: () => void;
  onDone: () => void;
}) {
  const foil = foilFor(loveId);
  const rare = rareFoil(brandId);
  const box = useRef<HTMLDivElement>(null);
  const foilC = useRef<HTMLCanvasElement>(null);
  const fxC = useRef<HTMLCanvasElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<"sealed" | "going" | "done">("sealed");
  const [cover, setCover] = useState(0);
  const [byHand, setByHand] = useState(true);
  const [touch, setTouch] = useState(false);

  // Everything the frame loop touches lives in one ref, so a stroke never waits on React.
  const st = useRef({
    w: 0,
    h: 0,
    cov: null as Coverage | null,
    last: null as { x: number; y: number } | null,
    down: false,
    downAt: null as { x: number; y: number } | null,
    moved: false,
    mode: "idle" as "idle" | "hand" | "auto" | "done",
    speed: 0,
    lastMove: 0,
    run: 0,
    flakes: [] as Flake[],
    spawn: 0,
    buzzAt: 0,
    buzzPx: 0,
    path: [] as PathPt[],
    autoT: 0,
    autoK: 1,
    taps: 0,
    tip: [] as { x: number; y: number }[],
    marks: 0,
    t: 0,
  });

  const threshold = thresholdFor(strength);

  /** Size the canvases to the box and paint fresh foil. */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const paint = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = st.current;
      if (!w || !h || s.mode === "done" || (w === s.w && h === s.h)) return;
      s.w = w;
      s.h = h;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = foilC.current!;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const font = nameRef.current
        ? getComputedStyle(nameRef.current).fontFamily
        : undefined;
      paintFoil(g, w, h, {
        ...foil,
        strength,
        letter: name.trim()[0] ?? "",
        seed: hash(brandId),
        rare,
        font,
      });
      const fx = fxC.current!;
      fx.width = Math.round((w + BLEED.x * 2) * dpr);
      fx.height = Math.round((h + BLEED.top + BLEED.bottom) * dpr);
      fx.getContext("2d")!.setTransform(
        dpr,
        0,
        0,
        dpr,
        BLEED.x * dpr,
        BLEED.top * dpr,
      );
      s.cov = new Coverage(w, h, 8 + LOGO + 6);
      s.path = autoPath(w, h, 8 + LOGO + 6);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [foil, strength, name, brandId, rare]);

  useEffect(() => () => scrub.end(), []);

  const radius = (pt: string) => (pt === "touch" ? 13 : pt === "auto" ? 11 : 9);

  /** Take foil off along a stroke from the last point to (x, y). */
  const strokeTo = (x: number, y: number, r: number) => {
    const s = st.current;
    const g = foilC.current?.getContext("2d");
    if (!g || !s.cov) return;
    const from = s.last ?? { x, y };
    const dx = x - from.x;
    const dy = y - from.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (r / 3)));
    g.save();
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#000";
    g.globalAlpha = 1;
    for (let k = 1; k <= steps; k++) {
      const px = from.x + (dx * k) / steps;
      const py = from.y + (dy * k) / steps;
      // two slightly offset, slightly ragged circles: a torn foil edge, not a clean vector line
      for (const o of [-1.5, 1.5]) {
        g.beginPath();
        g.arc(
          px + o * Math.random(),
          py + o * Math.random(),
          r * (0.85 + Math.random() * 0.3),
          0,
          Math.PI * 2,
        );
        g.fill();
      }
      s.cov.stamp(px, py, r);
    }
    g.restore();
    // flakes: one per 6px moved, at most three a frame
    if (!reduce) {
      s.spawn += dist;
      let n = 0;
      while (s.spawn >= 6 && n++ < 3) {
        s.spawn -= 6;
        if (s.flakes.length < 40) {
          const size = 1.5 + Math.random() * 2;
          s.flakes.push({
            x,
            y,
            vx: -0.3 * dx * 60 + (Math.random() - 0.5) * 80,
            vy: -40 - Math.random() * 80,
            s: size,
            r: Math.random() * 6,
            vr: 4 + Math.random() * 6,
            life: 450 + Math.random() * 250,
            age: 0,
          });
          if (size > 3) sfx("flake");
        }
      }
    }
    // a tiny buzz every 40px on phones
    s.buzzPx += dist;
    const now = performance.now();
    if (s.buzzPx >= 40 && now - s.buzzAt > 60) {
      s.buzzPx = 0;
      s.buzzAt = now;
      buzz(4);
    }
    s.last = { x, y };
    const total = s.cov.total;
    if (s.marks < 1 && total >= 0.25) {
      s.marks = 1;
      sfx("ripple", { i: 1, gain: 0.5 });
      buzz(8);
    } else if (s.marks < 2 && total >= 0.5) {
      s.marks = 2;
      sfx("ripple", { i: 3, gain: 0.5 });
      buzz(8);
    }
    setCover(total);
    if (s.cov.done(threshold)) finish();
  };

  const finish = () => {
    const s = st.current;
    if (s.mode === "done") return;
    const auto = s.mode === "auto";
    s.mode = "done";
    s.down = false;
    s.tip = [];
    scrub.end();
    // the rest lets go in a burst of flecks
    if (!reduce)
      for (let k = 0; k < 14; k++)
        s.flakes.push({
          x: Math.random() * s.w,
          y: Math.random() * s.h,
          vx: (Math.random() - 0.5) * 160,
          vy: -60 - Math.random() * 120,
          s: 1.5 + Math.random() * 2,
          r: Math.random() * 6,
          vr: 4 + Math.random() * 6,
          life: 500 + Math.random() * 300,
          age: 0,
        });
    kick();
    sfx("scratchDone", { i: streakStep() });
    if (rare) setTimeout(() => sfx("shimmer", { gain: 0.6 }), 120);
    buzz([12, 40, 24]);
    if (auto) setByHand(false);
    setPhase("done");
    onCleared?.();
    setTimeout(onDone, reduce ? 500 : 1300);
  };

  /** The frame loop: auto fingertip, speed falling off when the hand rests, flakes. Runs only while needed. */
  const kick = () => {
    const s = st.current;
    if (s.run) return;
    s.t = performance.now();
    const frame = (now: number) => {
      // flakes step at most 50ms a frame; the auto scratch keeps real time even when frames come slowly
      const real = now - s.t;
      const dt = Math.min(50, real);
      s.t = now;
      if (s.mode === "auto") {
        s.autoT += real * s.autoK;
        const end = s.path[s.path.length - 1]?.t ?? 0;
        const p = pathAt(s.path, Math.min(s.autoT, end));
        if (p.down) {
          if (!s.last) s.last = { x: p.x, y: p.y };
          const d = Math.hypot(p.x - s.last.x, p.y - s.last.y);
          s.speed = Math.min(1, d / Math.max(1, real) / 1.5);
          strokeTo(p.x, p.y, radius("auto"));
          if (st.current.mode === "auto")
            scrub.move(s.speed, p.x / s.w, s.cov?.total ?? 0);
        } else {
          s.last = null;
          scrub.move(0, p.x / s.w, s.cov?.total ?? 0);
        }
        s.tip.push({ x: p.x, y: p.y });
        if (s.tip.length > 7) s.tip.shift();
        if (s.autoT >= end && st.current.mode === "auto") finish();
      } else if (s.mode === "hand" && now - s.lastMove > 60) {
        s.speed *= 0.6;
        scrub.move(
          s.down ? s.speed : 0,
          (s.last?.x ?? s.w / 2) / s.w,
          s.cov?.total ?? 0,
        );
      }
      drawFx(dt);
      const busy =
        s.mode === "auto" ||
        (s.mode === "hand" && s.down) ||
        s.flakes.length > 0;
      s.run = busy ? requestAnimationFrame(frame) : 0;
      if (!busy) drawFx(0);
    };
    s.run = requestAnimationFrame(frame);
  };

  const drawFx = (dt: number) => {
    const s = st.current;
    const c = fxC.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.restore();
    const k = dt / 1000;
    s.flakes = s.flakes.filter((f) => (f.age += dt) < f.life);
    for (const f of s.flakes) {
      f.vy += 900 * k;
      f.x += f.vx * k;
      f.y += f.vy * k;
      f.r += f.vr * k;
      const lit = Math.sin(f.r) > 0;
      g.save();
      g.globalAlpha = 1 - f.age / f.life;
      g.translate(f.x, f.y);
      g.rotate(f.r * 0.6);
      g.scale(Math.max(0.2, Math.abs(Math.cos(f.r))), 1);
      g.fillStyle =
        foil.material === "gold"
          ? lit
            ? "#f3dc9c"
            : "#8a6d2f"
          : foil.material === "carbon"
            ? lit
              ? "#5a5d66"
              : "#16171b"
            : lit
              ? "#eef0f4"
              : "#7f838c";
      g.fillRect(-f.s / 2, -f.s / 2, f.s, f.s);
      g.restore();
    }
    // the auto fingertip: a lime dot with a short fading trail
    if (s.mode === "auto" && s.tip.length) {
      s.tip.forEach((p, i) => {
        g.beginPath();
        g.fillStyle = `rgb(198 255 61 / ${((i + 1) / s.tip.length) * 0.35})`;
        g.arc(p.x, p.y, 2 + i * 0.5, 0, Math.PI * 2);
        g.fill();
      });
      const p = s.tip[s.tip.length - 1];
      g.beginPath();
      g.shadowColor = "rgb(198 255 61 / .8)";
      g.shadowBlur = 12;
      g.fillStyle = "#c6ff3d";
      g.arc(p.x, p.y, 5, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }
  };

  /** Run the scratch by itself. Again while running: hurry; a third time: finish. */
  const runAuto = (pace = 1) => {
    const s = st.current;
    if (s.mode === "done" || !s.cov) return;
    if (s.mode === "auto") {
      s.taps++;
      if (s.taps === 1) s.autoK = 4;
      else finish();
      return;
    }
    if (reduce) {
      // a plain fade for reduced motion
      s.mode = "auto";
      if (foilC.current) {
        foilC.current.style.transition = "opacity 600ms linear";
        foilC.current.style.opacity = "0";
      }
      setTimeout(finish, 600);
      return;
    }
    s.mode = "auto";
    s.autoT = 0;
    s.autoK = pace;
    s.taps = 0;
    s.last = null;
    setPhase("going");
    scrub.start(foil.material);
    kick();
  };

  const firstRun = useRef(autoRun);
  useEffect(() => {
    if (autoRun && autoRun !== firstRun.current) runAuto();
    firstRun.current = autoRun;
  }, [autoRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // a chained unsealing runs about twice as fast, so a star's four brands open in a few seconds
  const firstCascade = useRef(cascade);
  useEffect(() => {
    if (cascade && cascade !== firstCascade.current && st.current.mode === "idle") runAuto(2.2);
    firstCascade.current = cascade;
  }, [cascade]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const done = phase === "done";
  const hint = done
    ? byHand
      ? "Decoded · by hand"
      : "Decoded"
    : cover >= 0.25
      ? "Almost"
      : cover > 0
        ? "Keep going"
        : touch
          ? "Rub sideways to scratch"
          : "Rub the foil to scratch";

  return (
    <div className="min-w-0">
      <div
        ref={box}
        role="button"
        tabIndex={0}
        data-nopop
        aria-label={
          done
            ? `Decoded: ${name}`
            : "Sealed brand. Rub to scratch, or press Enter."
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            runAuto();
          }
        }}
        onPointerDown={(e) => {
          const s = st.current;
          if (s.mode === "done" || !s.cov) return;
          setTouch(e.pointerType !== "mouse");
          try {
            box.current?.setPointerCapture(e.pointerId);
          } catch {}
          s.down = true;
          s.moved = false;
          s.downAt = local(e);
          s.lastMove = performance.now();
          if (s.mode === "auto") return; // a tap hurries it; rubbing takes over (on move)
          s.mode = "hand";
          setPhase("going");
          s.last = s.downAt;
          scrub.start(foil.material);
          strokeTo(s.downAt.x, s.downAt.y, radius(e.pointerType));
          kick();
        }}
        onPointerMove={(e) => {
          const s = st.current;
          if (!s.down || s.mode === "done") return;
          const p0 = local(e);
          if (s.mode === "auto") {
            if (
              !s.downAt ||
              Math.hypot(p0.x - s.downAt.x, p0.y - s.downAt.y) < 6
            )
              return;
            // the hand takes over from the auto scratch, keeping what's already gone
            s.mode = "hand";
            s.tip = [];
            s.last = p0;
            setByHand(false);
          }
          s.moved = true;
          const evs = (e.nativeEvent.getCoalescedEvents?.() ??
            []) as PointerEvent[];
          const now = performance.now();
          const dt = Math.max(1, now - s.lastMove);
          const before = s.last ?? p0;
          for (const ev of evs.length ? evs : [e.nativeEvent]) {
            if (st.current.mode !== "hand") break;
            const p = local(ev);
            strokeTo(p.x, p.y, radius(e.pointerType));
          }
          if (st.current.mode !== "hand") return;
          s.speed = Math.min(
            1,
            Math.hypot(p0.x - before.x, p0.y - before.y) / dt / 1.5,
          );
          s.lastMove = now;
          scrub.move(s.speed, p0.x / s.w, s.cov?.total ?? 0);
          if (rare && foilC.current)
            foilC.current.style.filter = `hue-rotate(${(p0.x / s.w - 0.5) * 120}deg)`;
        }}
        onPointerUp={() => {
          const s = st.current;
          s.down = false;
          if (s.mode === "auto" && !s.moved) runAuto();
          else if (s.mode === "hand") {
            scrub.end();
            s.last = null;
          }
        }}
        onPointerCancel={() => {
          const s = st.current;
          s.down = false;
          if (s.mode === "hand") {
            scrub.end();
            s.last = null;
          }
        }}
        className="relative flex w-fit min-w-[220px] max-w-full cursor-grab touch-pan-y select-none items-center gap-3 rounded-xl py-1.5 pl-2 pr-4 outline-none focus-visible:ring-1 focus-visible:ring-accent active:cursor-grabbing"
      >
        {/* what's under the foil */}
        <span
          aria-hidden={!done}
          className={`relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white transition-shadow duration-500 ${done ? "shadow-[0_0_0_2px_rgba(198,255,61,.8),0_0_24px_rgba(198,255,61,.55)]" : ""}`}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-display text-lg font-bold text-paper">
              {name[0]}
            </span>
          )}
        </span>
        <span
          ref={nameRef}
          aria-hidden={!done}
          className="min-w-0 truncate font-display text-lg font-semibold text-ink"
        >
          {name}
        </span>

        <canvas
          ref={foilC}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full rounded-xl"
          style={{
            transition: "opacity 220ms ease-out, filter 200ms",
            opacity: done ? 0 : 1,
            boxShadow: done
              ? "none"
              : "0 1px 0 rgb(255 255 255 / .06), 0 6px 14px -8px rgb(0 0 0 / .8)",
          }}
        />
        <canvas
          ref={fxC}
          aria-hidden
          className="pointer-events-none absolute z-10"
          style={{
            left: -BLEED.x,
            top: -BLEED.top,
            width: `calc(100% + ${BLEED.x * 2}px)`,
            height: `calc(100% + ${BLEED.top + BLEED.bottom}px)`,
          }}
        />
        {done && !reduce && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
          >
            <span
              className="absolute -inset-y-2 w-14 -skew-x-[18deg] blur-[6px] mix-blend-screen [animation:scratchShine_.8s_ease-out_forwards]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgb(198 255 61 / .35) 30%, rgb(255 255 255 / .7) 50%, rgb(198 255 61 / .35) 70%, transparent)",
              }}
            />
          </span>
        )}
      </div>
      <p
        aria-live="polite"
        className={`mt-1 pl-2 font-mono text-[10px] uppercase tracking-[0.18em] ${done ? "text-accent" : "text-ink-3"}`}
      >
        {hint}
        {rare && !done ? " · shimmer foil" : ""}
      </p>
    </div>
  );
}
