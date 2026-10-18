"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { CardData } from "@/lib/card";
import { sfx } from "@/lib/sound";
import type { StyleResult } from "@/lib/types";
import { ReceiptBody, ReceiptPaper } from "./Receipt";

/** How much paper shows while it's rolled: the shop header, the order line and the first loves. */
const ROLLED = 172;

/**
 * Creases from being rolled: a fold every ~64px (a dark line under a light one, like a real crease catching the
 * light) plus two faint diagonal wrinkles. They soften once the paper has been unrolled for a moment.
 */
const CREASES = [
  "repeating-linear-gradient(180deg, transparent 0 62px, rgb(0 0 0 / 0.07) 63px, rgb(255 255 255 / 0.5) 64.5px, transparent 66px 128px)",
  "linear-gradient(97deg, transparent 28%, rgb(0 0 0 / 0.045) 29%, transparent 31.5%)",
  "linear-gradient(81deg, transparent 63%, rgb(255 255 255 / 0.4) 64%, transparent 65.5%)",
  "linear-gradient(176deg, transparent 47%, rgb(0 0 0 / 0.035) 48%, transparent 50%)",
].join(", ");

/**
 * The card's receipt, kept like the real thing: rolled up, and unrolled downward on request. The first mint prints it;
 * this is the copy you keep (components/deck/BrandSheet.tsx). No printing show here.
 */
export function ReceiptRoll({ card, result, note }: { card: CardData; result: StyleResult; note?: string }) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [settled, setSettled] = useState(false);

  const toggle = () => {
    sfx("rustle");
    setSettled(false);
    setOpen((o) => !o);
  };

  return (
    <section className="mt-5">
      <motion.div
        className="relative overflow-hidden"
        initial={false}
        animate={{ height: open ? "auto" : ROLLED }}
        transition={{ duration: reduce ? 0 : open ? 1.25 : 0.7, ease: open ? [0.3, 0.75, 0.2, 1] : [0.6, 0, 0.4, 1] }}
        onAnimationComplete={() => setSettled(open)}
      >
        <ReceiptPaper curl>
          <ReceiptBody card={card} result={result} stagger={false} />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 transition-opacity duration-[1600ms]"
            style={{ backgroundImage: CREASES, opacity: settled ? 0.35 : 0.9 }}
          />
        </ReceiptPaper>
        {/* The paper curling into the roll: darker toward the bottom edge while it's still wound. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 transition-opacity duration-500"
          style={{ background: "linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.08) 45%, rgb(0 0 0 / 0.38))", opacity: settled ? 0 : 1 }}
        />
      </motion.div>

      {/* The roll itself rides the bottom edge as the paper comes down, then flattens away. */}
      <motion.div
        aria-hidden
        className="relative z-10 mx-[-3px] -mt-4 h-8 rounded-full"
        style={{
          background: "linear-gradient(180deg, #8f8b80 0%, #e9e5da 22%, #fffdf6 42%, #d8d3c6 70%, #9d988b 100%)",
          boxShadow: "0 10px 18px -6px rgb(0 0 0 / 0.7), inset 0 -2px 3px rgb(0 0 0 / 0.25)",
        }}
        initial={false}
        animate={settled ? { scaleY: 0, opacity: 0 } : { scaleY: 1, opacity: 1, rotateX: open && !reduce ? [0, 360, 720] : 0 }}
        transition={{ duration: reduce ? 0 : settled ? 0.35 : 1.25, ease: "easeOut" }}
      >
        <span className="absolute inset-y-[30%] left-1/2 w-[38%] -translate-x-1/2 rounded-full bg-white/40 blur-[2px]" />
      </motion.div>

      <button type="button" onClick={toggle} aria-expanded={open} className="mt-3 w-full text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3 hover:text-ink">
        {open ? "Roll it back up ↑" : "Unroll the receipt ↓"}
      </button>
      {note && <p className="mt-1 text-center text-[10.5px] text-ink-3">{note}</p>}
    </section>
  );
}
