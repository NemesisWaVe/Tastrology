"use client";

import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { CursorArrow } from "@/components/CursorArrow";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import s from "./lost.module.css";

const OPEN_SKY = skyState([], "");

/**
 * Every "nothing here" state (404, a card, fighter or player code that isn't on file): the night sky, an empty card
 * frame drifting where the card would be with the code it was looking for stamped on it, then one way forward.
 */
export function LostCard({
  kicker,
  title,
  body,
  stamp,
  cta = { href: "/", label: "Mint your card" },
  more,
}: {
  kicker: string;
  title: string;
  body: string;
  /** What was looked up (a code or "404"), printed on the empty card. */
  stamp: string;
  cta?: { href: string; label: string };
  more?: { href: string; label: string };
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className={s.wrap}>
      <Sky f={OPEN_SKY} reduce={reduce} fixed quiet drawn dim={0.55} />
      <div className={s.frame} aria-hidden>
        <span className={s.ring} />
        <span className={s.q}>?</span>
        <span className={s.stamp}>{stamp}</span>
        <i className={s.mote} style={{ left: "18%", top: "22%" }} />
        <i className={s.mote} style={{ left: "78%", top: "34%", animationDelay: "-1.6s" }} />
        <i className={s.mote} style={{ left: "30%", top: "74%", animationDelay: "-3.1s" }} />
      </div>
      <p className={s.kicker}>{kicker}</p>
      <h1 className={s.title}>{title}</h1>
      <p className={s.body}>{body}</p>
      <Link href={cta.href} className="group mt-7 inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 font-semibold text-paper">
        {cta.label}
        <CursorArrow className="h-9 w-9 bg-paper text-accent" />
      </Link>
      {more && (
        <Link href={more.href} className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3 transition hover:text-ink">
          {more.label}
        </Link>
      )}
    </div>
  );
}
