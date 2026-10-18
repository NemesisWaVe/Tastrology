"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { CardData } from "@/lib/card";
import { sfx } from "@/lib/sound";
import type { StyleResult } from "@/lib/types";
import { ReceiptBody, ReceiptPaper } from "./Receipt";

/** How much paper shows while it's rolled: the shop header, the order line and the first loves. */
const ROLLED = 176;
const PAPER = "#f3f0e8";

/**
 * Memory of being rolled: soft bands every ~58px where the paper bowed, a shadow side and a lit side, never a hard
 * line. They relax (fade) once the paper has hung open for a moment.
 */
const SET = [
  "repeating-linear-gradient(180deg, rgb(0 0 0 / 0) 0 30px, rgb(0 0 0 / 0.045) 44px, rgb(255 255 255 / 0.32) 50px, rgb(0 0 0 / 0) 58px)",
  "linear-gradient(90deg, rgb(0 0 0 / 0.06), transparent 6%, transparent 94%, rgb(0 0 0 / 0.07))",
].join(", ");

/** The printed underside of the curl: faint rows of ink seen through thin thermal paper. */
const UNDERSIDE = `repeating-linear-gradient(180deg, rgb(40 32 24 / 0.1) 0 1px, transparent 1px 5px), linear-gradient(180deg, ${PAPER} 0%, #ddd8cb 55%, #b9b3a4 100%)`;

/** The roll: a paper cylinder, lit from above, with the wound layers showing as fine bands that slide as it turns. */
const ROLL = `repeating-linear-gradient(180deg, rgb(0 0 0 / 0.05) 0 1px, transparent 1px 3px), linear-gradient(180deg, #9a9588 0%, #e4dfd2 18%, ${PAPER} 38%, #e9e4d7 58%, #b3ad9f 84%, #7f7a6f 100%)`;

/**
 * The card's receipt, kept like the real thing: rolled up under the header, unrolled downward on request. The
 * unrolled part is flat paper; below it the paper bends back over a roll that turns while it unwinds, and the roll
 * is gone once it's fully out (just the torn edge left). The first mint prints it; this is the copy you keep.
 */
export function ReceiptRoll({ card, result, note }: { card: CardData; result: StyleResult; note?: string }) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  // "rolled" | "moving" | "out": the curl and roll show in the first two.
  const [phase, setPhase] = useState<"rolled" | "moving" | "out">("rolled");
  const wound = phase !== "out";
  const dur = reduce ? 0 : open ? 1.5 : 0.85;

  const toggle = () => {
    sfx("rustle");
    setPhase("moving");
    setOpen((o) => !o);
  };

  return (
    <section className="mt-5" style={{ perspective: 700 }}>
      <motion.div
        className="relative overflow-hidden"
        initial={false}
        animate={{ height: open ? "auto" : ROLLED }}
        transition={{ duration: dur, ease: open ? [0.22, 0.61, 0.36, 1] : [0.55, 0.06, 0.45, 0.94] }}
        onAnimationComplete={() => setPhase(open ? "out" : "rolled")}
      >
        <ReceiptPaper curl>
          <ReceiptBody card={card} result={result} stagger={false} />
          <div aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-[2200ms]" style={{ backgroundImage: SET, opacity: wound ? 1 : 0.45 }} />
        </ReceiptPaper>
        {/* Where the paper starts to bow toward the roll: it darkens as it turns away from the light. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 transition-opacity duration-500"
          style={{ background: "linear-gradient(to bottom, transparent, rgb(60 50 35 / 0.12) 55%, rgb(30 24 16 / 0.32))", opacity: wound ? 1 : 0 }}
        />
      </motion.div>

      {/* The curl and the roll ride the bottom edge of the paper as it comes down, and are gone once it's all out. */}
      <motion.div
        aria-hidden
        className="relative z-10"
        initial={false}
        animate={{ opacity: wound ? 1 : 0, height: wound ? 44 : 0 }}
        transition={{ duration: reduce ? 0 : wound ? 0.2 : 0.45, ease: "easeOut" }}
      >
        {/* the paper bending back and under, toward the roll */}
        <div
          className="absolute inset-x-[3px] top-0 h-[22px] origin-top"
          style={{ background: UNDERSIDE, transform: "rotateX(-62deg)", boxShadow: "inset 0 -6px 8px -4px rgb(0 0 0 / 0.35)" }}
        />
        {/* the roll, turning while it unwinds: its wound layers slide past */}
        <motion.div
          className="absolute inset-x-[-2px] top-[10px] h-[30px] rounded-[15px/50%]"
          style={{ backgroundImage: ROLL, boxShadow: "0 12px 16px -8px rgb(0 0 0 / 0.75), 0 2px 2px rgb(0 0 0 / 0.25)" }}
          initial={false}
          animate={{ backgroundPositionY: open ? ["0px", "-180px"] : ["-180px", "0px"] }}
          transition={{ duration: dur, ease: "linear" }}
        >
          {/* the cut ends of the roll, a touch darker */}
          <span className="absolute inset-y-0 left-0 w-[3%] rounded-l-[15px/50%] bg-black/15" />
          <span className="absolute inset-y-0 right-0 w-[3%] rounded-r-[15px/50%] bg-black/20" />
        </motion.div>
      </motion.div>

      <button type="button" onClick={toggle} aria-expanded={open} className="mt-3 w-full text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3 hover:text-ink">
        {open ? "Roll it back up ↑" : "Unroll the receipt ↓"}
      </button>
      {note && <p className="mt-1 text-center text-[10.5px] text-ink-3">{note}</p>}
    </section>
  );
}
