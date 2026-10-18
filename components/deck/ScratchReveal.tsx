"use client";

import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sound";

/** Silver scratch-off foil: brushed metal with a little grain. */
const FOIL =
  "repeating-linear-gradient(115deg, rgb(255 255 255 / .18) 0 2px, transparent 2px 5px), linear-gradient(135deg, #8d9099, #d9dce3 35%, #9a9ea8 55%, #e7e9ee 75%, #7f838c)";

/**
 * A sealed brand scratched open: a small stylus works across the logo, then letter by letter across the name; each
 * letter comes up out of the foil with a few flakes, and once it's all clear a shine runs over the row. Tap again to
 * finish at once. Calls onDone when the shine has passed.
 */
export function ScratchReveal({
  name,
  image,
  reduce,
  onDone,
}: {
  name: string;
  image?: string;
  reduce: boolean;
  onDone: () => void;
}) {
  const chars = [...name];
  // step -1: the logo; 0..n-1: letters; n: the shine
  const [step, setStep] = useState(reduce ? chars.length : -1);
  const [logo, setLogo] = useState(reduce ? 100 : 0);
  const finished = useRef(false);
  const per = Math.round(
    Math.min(110, Math.max(50, 1300 / Math.max(1, chars.length))),
  );

  useEffect(() => {
    if (reduce) return;
    if (step === -1) {
      // the foil comes off the logo left to right
      const t0 = performance.now();
      let id = 0;
      const f = (now: number) => {
        const k = Math.min(1, (now - t0) / 380);
        setLogo(k * 100);
        if (k < 1) id = requestAnimationFrame(f);
        else setStep(0);
      };
      id = requestAnimationFrame(f);
      return () => cancelAnimationFrame(id);
    }
    if (step < chars.length) {
      if (chars[step] !== " ") sfx("tick", { i: step, gain: 0.5 });
      const id = setTimeout(
        () => setStep((s) => s + 1),
        chars[step] === " " ? per / 2 : per,
      );
      return () => clearTimeout(id);
    }
  }, [step, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step < chars.length || finished.current) return;
    sfx("reveal");
    const id = setTimeout(
      () => {
        finished.current = true;
        onDone();
      },
      reduce ? 200 : 900,
    );
    return () => clearTimeout(id);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    setLogo(100);
    setStep(chars.length);
  };
  const shine = step >= chars.length;

  return (
    <button
      type="button"
      onClick={skip}
      aria-label={`Scratching off ${name}`}
      className="relative flex w-full items-center gap-4 overflow-hidden rounded-2xl py-1 text-left"
    >
      {/* logo under foil */}
      <span
        className={`relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white transition-shadow duration-500 ${shine ? "shadow-[0_0_0_2px_rgba(198,255,61,.8),0_0_24px_rgba(198,255,61,.55)]" : ""}`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-display text-lg font-bold text-paper">
            {name[0]}
          </span>
        )}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: FOIL, clipPath: `inset(0 0 0 ${logo}%)` }}
        />
        {step === -1 && (
          <Stylus style={{ left: `${Math.min(80, logo)}%`, top: "40%" }} />
        )}
      </span>

      <span className="relative min-w-0 flex-1">
        <span className="block whitespace-nowrap font-display text-lg font-semibold">
          {chars.map((c, i) => {
            const open = i < step || shine;
            const now = i === step && !shine;
            return (
              <span key={i} className="relative inline-block">
                <span
                  className={
                    open
                      ? "text-ink [animation:scratchUp_.35s_ease-out]"
                      : "text-transparent"
                  }
                >
                  {c === " " ? " " : c}
                </span>
                {!open && c !== " " && (
                  <span
                    aria-hidden
                    className="absolute inset-x-[-1px] inset-y-[3px] rounded-[2px]"
                    style={{ background: FOIL }}
                  />
                )}
                {open && !reduce && c !== " " && i >= step - 2 && !shine && (
                  <Flakes />
                )}
                {now && c !== " " && (
                  <Stylus style={{ left: "55%", top: "45%" }} />
                )}
              </span>
            );
          })}
        </span>
        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          {shine ? "Decoded" : "Scratching…"}
        </span>
      </span>

      {shine && !reduce && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-2 w-14 -skew-x-[18deg] blur-[6px] mix-blend-screen [animation:scratchShine_.8s_ease-out_forwards]"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgb(198 255 61 / .35) 30%, rgb(255 255 255 / .7) 50%, rgb(198 255 61 / .35) 70%, transparent)",
          }}
        />
      )}
    </button>
  );
}

/** The scratching tool: a small arrowhead, jittering as it works. */
function Stylus({ style }: { style: React.CSSProperties }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="pointer-events-none absolute z-10 h-4 w-4 [animation:scratchJitter_.12s_linear_infinite_alternate]"
      style={{ ...style, filter: "drop-shadow(0 1px 1px rgb(0 0 0 / .7))" }}
    >
      <path
        d="M1 1 L14 6 L8 8 L6 14 Z"
        fill="#c6ff3d"
        stroke="#0d0d12"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Three flecks of foil falling off a freshly scratched letter. */
function Flakes() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-1"
    >
      {[0, 1, 2].map((k) => (
        <span
          key={k}
          className="absolute h-[3px] w-[3px] rounded-[1px] bg-[#c9ccd4] [animation:scratchFlake_.5s_ease-in_forwards]"
          style={{
            left: `${20 + k * 28}%`,
            animationDelay: `${k * 40}ms`,
            ["--fx" as string]: `${(k - 1) * 6}px`,
          }}
        />
      ))}
    </span>
  );
}
