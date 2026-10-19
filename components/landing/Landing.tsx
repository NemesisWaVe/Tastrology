"use client";

import { HallOfRares } from "./HallOfRares";
import { AfterFirstCard } from "@/components/site/AfterFirstCard";
import { Mark } from "@/components/site/Mark";
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
import { SoundToggle } from "@/components/site/SoundToggle";
import { SoundOrb } from "@/components/site/SoundOrb";
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
  const touch = useTouch();
  return (
    <MotionConfig reducedMotion="user">
      {touch ? (
        // phones scroll natively: iOS momentum is already smooth, and a JS scroll loop on top of it stutters
        <LandingBody onStart={onStart} touch />
      ) : (
        <ReactLenis root options={{ lerp: 0.075, wheelMultiplier: 0.9, smoothWheel: !reduce, virtualScroll: paceIntro }}>
          <LandingBody onStart={onStart} />
        </ReactLenis>
      )}
    </MotionConfig>
  );
}

/**
 * Desktop pacing for the intro. One trackpad fling or a few wheel notches used to carry the whole story (drop, ripples,
 * the card forming) off screen in a second; a thumb on a phone moves far less per swipe, which is why it felt right
 * there. While the intro is on screen, each wheel event moves it a little less and a fling is capped (about 30 wheel notches end to end), so every
 * beat gets its moment. Past the intro, scrolling is untouched.
 */
const INTRO_PACE = 0.8;
const INTRO_MAX_DELTA = 110;
function paceIntro(e: { deltaY: number }): boolean {
  const el = document.querySelector<HTMLElement>("section[aria-label=Intro]");
  if (!el) return true;
  const end = el.offsetTop + el.offsetHeight - window.innerHeight;
  if (window.scrollY < end - 4 || (e.deltaY < 0 && window.scrollY <= end + window.innerHeight * 0.2)) {
    // ease back to normal speed over the last screen, so leaving the intro never lurches mid-scroll
    const left = (end - window.scrollY) / (window.innerHeight * 0.8);
    const b = left > 0 ? Math.min(1, left) : 0;
    const k = b * b * (3 - 2 * b);
    const d = e.deltaY * (1 - (1 - INTRO_PACE) * k);
    const cap = INTRO_MAX_DELTA + (1 - k) * 400;
    e.deltaY = Math.max(-cap, Math.min(cap, d));
  }
  return true;
}

/** Coarse pointer (phones, tablets): decided once on mount. */
function useTouch() {
  const [t, setT] = useState(false);
  useEffect(() => {
    setT(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return t;
}

function LandingBody({ onStart, touch = false }: { onStart: (req: AgentRequest) => void; touch?: boolean }) {
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
      {/* phones: a still sky (drawn once) so scrolling never fights a full-screen animation */}
      <Sky f={sky} reduce={reduce || touch} drawn fixed quiet dim={0.45} />
      <div className={s.grain} aria-hidden />
      <Nav onPick={() => go("pick")} hidden={introOn} />
      <Intro onActive={setIntroOn} />
      {introOn && <SoundOrb />}

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
        <HallOfRares />
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
          <Mark size={34} />
          <span className="whitespace-nowrap font-display text-[17px] font-bold tracking-[-0.03em]">{BRAND.name}</span>
        </a>
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3 md:inline">Powered by Qloo</span>
          <AfterFirstCard>
          <a href="/shop" className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink sm:inline">Shop</a>
          <a href="/deck" className="whitespace-nowrap py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink"><span className="hidden sm:inline">My </span>Deck</a>
          <a href="/friends" className="whitespace-nowrap py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink">Friends</a>
          </AfterFirstCard>
          <SoundToggle />
          <AuthNav />
          <button
            onClick={onPick}
            className="hidden shrink-0 whitespace-nowrap rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-paper transition hover:bg-accent sm:inline-block sm:px-4 sm:py-2"
          >
            Get your sign
          </button>
        </div>
      </div>
    </motion.header>
  );
}
