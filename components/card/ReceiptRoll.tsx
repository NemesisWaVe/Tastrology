"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { CardData } from "@/lib/card";
import { sfx } from "@/lib/sound";
import type { StyleResult } from "@/lib/types";
import { ReceiptBody, ReceiptPaper } from "./Receipt";

/** How much paper shows while it's rolled: the shop header, the order line and the first loves. */
const ROLLED = 176;
const PAPER = "#f3f0e8";
/** Full unroll and full roll-up, in ms. A partial move takes its share. */
const OPEN_MS = 1700;
const CLOSE_MS = 1100;

/**
 * Memory of being rolled: soft bands every ~58px where the paper bowed, a shadow side and a lit side, never a hard
 * line. They relax as the paper hangs open.
 */
const SET = [
  "repeating-linear-gradient(180deg, rgb(0 0 0 / 0) 0 30px, rgb(0 0 0 / 0.045) 44px, rgb(255 255 255 / 0.32) 50px, rgb(0 0 0 / 0) 58px)",
  "linear-gradient(90deg, rgb(0 0 0 / 0.06), transparent 6%, transparent 94%, rgb(0 0 0 / 0.07))",
].join(", ");

/** The printed underside of the curl: faint rows of ink seen through thin thermal paper. */
const UNDERSIDE = `repeating-linear-gradient(180deg, rgb(40 32 24 / 0.1) 0 1px, transparent 1px 5px), linear-gradient(180deg, ${PAPER} 0%, #ddd8cb 55%, #b9b3a4 100%)`;

/** The roll: a paper cylinder, lit from above, with the wound layers as fine bands that travel with the paper. */
const ROLL = `repeating-linear-gradient(180deg, rgb(0 0 0 / 0.06) 0 1px, transparent 1px 3px), linear-gradient(180deg, #8f8a7e 0%, #e4dfd2 18%, ${PAPER} 38%, #e9e4d7 58%, #b3ad9f 84%, #77726a 100%)`;

const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The nearest scrolling box (the brand sheet), or the page. */
function scroller(el: HTMLElement): HTMLElement {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const y = getComputedStyle(n).overflowY;
    if ((y === "auto" || y === "scroll") && n.scrollHeight > n.clientHeight)
      return n;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/**
 * The card's receipt, kept like the real thing: rolled up under the header, unrolled downward on request. One
 * progress value drives everything per frame: the paper's length, the roll thinning as paper leaves it (its bands
 * travel at the paper's speed), the last turn flopping flat at the end, and the view following the roll so you never
 * scroll after it. Rolling back up runs the same film backwards.
 */
export function ReceiptRoll({
  card,
  result,
  note,
}: {
  card: CardData;
  result: StyleResult;
  note?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const clip = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const set = useRef<HTMLDivElement>(null);
  const bend = useRef<HTMLDivElement>(null);
  const curl = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const roll = useRef<HTMLDivElement>(null);
  const p = useRef(0);
  const raf = useRef(0);

  /** Draw the receipt at progress x (0 rolled, 1 all out). */
  const paint = (x: number) => {
    const c = clip.current;
    if (!c) return;
    const full = paper.current?.offsetHeight ?? ROLLED;
    const h = ROLLED + x * Math.max(0, full - ROLLED);
    c.style.height = x >= 1 ? "auto" : `${h}px`;
    const out = h - ROLLED;
    // 1 while there's paper on the roll; falls to 0 over the last turn, when the tail lies flat.
    const tail = clamp((1 - x) / 0.07, 0, 1);
    const d = (13 + 19 * Math.sqrt(1 - x)) * tail;
    if (roll.current) {
      const s = roll.current.style;
      s.height = `${d}px`;
      s.opacity = String(tail);
      s.borderRadius = `${d / 2}px / 50%`;
      s.backgroundPositionY = `${out}px`;
    }
    if (under.current) {
      under.current.style.transform = `rotateX(${-62 * tail}deg)`;
      under.current.style.opacity = String(tail);
    }
    if (curl.current) curl.current.style.height = `${(12 + d) * tail}px`;
    if (bend.current) bend.current.style.opacity = String(tail);
    if (set.current)
      set.current.style.opacity = String(0.45 + 0.55 * Math.sqrt(1 - x));
  };

  useEffect(() => {
    paint(0);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const toggle = () => {
    const to = open ? 0 : 1;
    setOpen(!open);
    sfx("rustle");
    cancelAnimationFrame(raf.current);
    const from = p.current;
    const ms = reduce ? 0 : (to ? OPEN_MS : CLOSE_MS) * Math.abs(to - from);
    const box = clip.current ? scroller(clip.current) : null;
    // A hand on the wheel or the screen takes the view back.
    let follow = !reduce;
    const stop = () => (follow = false);
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    const done = () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = ms ? clamp((now - t0) / ms, 0, 1) : 1;
      p.current = from + (to - from) * ease(t);
      paint(p.current);
      if (follow && box && curl.current) {
        const page =
          box === document.scrollingElement || box === document.documentElement;
        const view = page
          ? { top: 0, bottom: innerHeight }
          : box.getBoundingClientRect();
        const r = curl.current.getBoundingClientRect();
        if (to) {
          // keep the roll and the button under it in sight as it comes down
          const lim = view.bottom - 110;
          if (r.bottom > lim) box.scrollTop += r.bottom - lim;
        } else {
          const lim = view.top + 160;
          if (r.top < lim) box.scrollTop -= lim - r.top;
        }
      }
      if (t < 1) raf.current = requestAnimationFrame(frame);
      else done();
    };
    raf.current = requestAnimationFrame(frame);
  };

  return (
    <section className="mt-5" style={{ perspective: 700 }}>
      <div
        ref={clip}
        className="relative overflow-hidden"
        style={{ height: ROLLED }}
      >
        <div ref={paper}>
          <ReceiptPaper curl>
            <ReceiptBody card={card} result={result} stagger={false} />
            <div
              ref={set}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: SET }}
            />
          </ReceiptPaper>
        </div>
        {/* Where the paper starts to bow toward the roll: it darkens as it turns away from the light. */}
        <div
          ref={bend}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgb(60 50 35 / 0.12) 55%, rgb(30 24 16 / 0.32))",
          }}
        />
      </div>

      {/* The curl and the roll ride the bottom edge of the paper; decorative, so they never catch a click. */}
      <div
        ref={curl}
        aria-hidden
        className="pointer-events-none relative z-10 overflow-visible"
        style={{ height: 44 }}
      >
        {/* the paper bending back and under, toward the roll */}
        <div
          ref={under}
          className="absolute inset-x-[3px] top-0 h-[22px] origin-top"
          style={{
            background: UNDERSIDE,
            transform: "rotateX(-62deg)",
            boxShadow: "inset 0 -6px 8px -4px rgb(0 0 0 / 0.35)",
          }}
        />
        {/* the roll: thins as it gives up paper */}
        <div
          ref={roll}
          className="absolute inset-x-[-2px] top-[10px]"
          style={{
            height: 32,
            backgroundImage: ROLL,
            borderRadius: "16px / 50%",
            boxShadow:
              "0 12px 16px -8px rgb(0 0 0 / 0.75), 0 2px 2px rgb(0 0 0 / 0.25)",
          }}
        >
          {/* the cut ends of the roll, a touch darker */}
          <span className="absolute inset-y-0 left-0 w-[3%] rounded-l-[inherit] bg-black/15" />
          <span className="absolute inset-y-0 right-0 w-[3%] rounded-r-[inherit] bg-black/20" />
        </div>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="relative z-20 mt-3 w-full text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3 hover:text-ink"
      >
        {open ? "Roll it back up ↑" : "Unroll the receipt ↓"}
      </button>
      {note && (
        <p className="mt-1 text-center text-[10.5px] text-ink-3">{note}</p>
      )}
    </section>
  );
}
