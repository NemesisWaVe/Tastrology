"use client";

import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { MotionConfig, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { buildCard } from "@/lib/card";
import { PERSONAS, personaRequest } from "@/lib/personas";
import type { AgentRequest } from "@/lib/types";
import { useAgentRun } from "@/lib/useAgentRun";
import { Intro } from "@/components/intro/Intro";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { BringYourOwn } from "./BringYourOwn";
import { AuthNav } from "@/components/auth/AuthNav";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { Marquee } from "./Marquee";
import { PersonaDeck } from "./PersonaDeck";
import { Receipts } from "./Receipts";
import { Specimen } from "./Specimen";
import { SPECIMEN_SNAPSHOT } from "./specimenSnapshot";
import s from "./landing.module.css";

const SPECIMEN_DEFAULT = "neon";

/**
 * The landing experience. `onStart` receives a ready-to-run AgentRequest:
 * a persona (one tap, zero typing) or the visitor's own Qloo-resolved seeds.
 */
export function Landing({ onStart }: { onStart: (req: AgentRequest) => void }) {
  const reduce = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user">
      <ReactLenis root options={{ lerp: 0.11, smoothWheel: !reduce }}>
        <LandingBody onStart={onStart} />
      </ReactLenis>
    </MotionConfig>
  );
}

function LandingBody({ onStart }: { onStart: (req: AgentRequest) => void }) {
  const { result, events, running, error, run } = useAgentRun();
  const [specKey, setSpecKey] = useState(SPECIMEN_DEFAULT);
  const [retried, setRetried] = useState(false);
  const lenis = useLenis();
  const [introOn, setIntroOn] = useState(true);

  useEffect(() => {
    const p = PERSONAS.find((x) => x.key === specKey) ?? PERSONAS[0];
    setRetried(false);
    if (p) run(personaRequest(p));
  }, [specKey, run]);

  // One quiet retry if the specimen run fails (e.g. a cold server); the placeholder covers the wait.
  useEffect(() => {
    if (!error || retried || result) return;
    const t = setTimeout(() => {
      setRetried(true);
      const p = PERSONAS.find((x) => x.key === specKey) ?? PERSONAS[0];
      if (p) run(personaRequest(p));
    }, 2500);
    return () => clearTimeout(t);
  }, [error, retried, result, specKey, run]);

  // If the live run still fails after the retry (rate limit, Qloo down), fall back to a real archived run.
  const archived = !result && !!error && retried && !running;
  const shown = result ?? (archived ? SPECIMEN_SNAPSHOT : null);
  const card = useMemo(() => {
    try {
      return shown ? buildCard(shown) : null;
    } catch {
      return null;
    }
  }, [shown]);

  const go = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (lenis) lenis.scrollTo(el, { offset: -24, duration: 1.4 });
      else el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [lenis],
  );

  // The specimen's sky sits far back behind the whole landing: quiet (no captions), like art on a wall.
  const reduce = Boolean(useReducedMotion());
  const sky = useMemo(
    () => (shown ? skyState(shown.seeds, shown.dna.name, shown.dna.lobes.map((l) => l.seedIds), (shown.inert ?? []).map((x) => x.id)) : skyState([], "")),
    [shown],
  );

  return (
    <div className={`${s.root} relative isolate min-h-screen text-ink`}>
      <Sky f={sky} reduce={reduce} drawn fixed quiet dim={0.45} />
      <div className={s.grain} aria-hidden />
      <Nav onPick={() => go("pick")} hidden={introOn} />
      <Intro onActive={setIntroOn} />

      <main>
        <Hero
          onPick={() => go("pick")}
          onCustom={() => go("byo")}
          specimen={
            <Specimen
              card={card}
              runId={shown?.runId}
              archived={archived}
              events={events}
              error={error}
              running={running}
              personas={PERSONAS}
              active={specKey}
              onSwap={setSpecKey}
            />
          }
        />
        <Marquee />
        <PersonaDeck onStart={onStart} />
        <BringYourOwn onStart={onStart} />
        <Receipts result={shown} />
      </main>

      <Footer onPick={() => go("pick")} />
    </div>
  );
}

function Nav({ onPick, hidden }: { onPick: () => void; hidden?: boolean }) {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 40));

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={hidden ? { y: -20, opacity: 0 } : { y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: hidden ? 0 : 0.1 }}
      className={`fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4 ${hidden ? "pointer-events-none" : ""}`}
      inert={hidden}
    >
      <div
        className={`mx-auto flex h-12 max-w-[1320px] items-center justify-between rounded-full border px-4 transition-all duration-500 sm:h-14 sm:px-5 ${
          solid ? "border-line bg-paper/95" : "border-transparent bg-transparent"
        }`}
      >
        <a href="#" className="flex items-center gap-2.5" aria-label={`${BRAND.name} home`}>
          <span className="relative h-5 w-5 rounded-full" style={{ background: "var(--holo)" }}>
            <span className="absolute inset-[3px] rounded-full bg-paper" />
            <span className="absolute inset-[6px] rounded-full bg-accent" />
          </span>
          <span className="font-display text-[17px] font-bold tracking-[-0.03em]">{BRAND.name}</span>
        </a>
        <div className="flex items-center gap-2 sm:gap-5">
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3 md:inline">Powered by Qloo</span>
          <a href="/shop" className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink sm:inline">Shop</a>
          <a href="/deck" className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink">My deck</a>
          <AuthNav />
          <button
            onClick={onPick}
            className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-semibold text-paper transition hover:bg-accent sm:py-2"
          >
            Get your sign
          </button>
        </div>
      </div>
    </motion.header>
  );
}
