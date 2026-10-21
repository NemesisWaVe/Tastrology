"use client";

import { HallOfRares } from "./HallOfRares";
import { PhoneMenu } from "@/components/site/PhoneMenu";
import { AfterEconomy, AfterFirstCard } from "@/components/site/AfterFirstCard";
import { Mark } from "@/components/site/Mark";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { MotionConfig, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { buildCard } from "@/lib/card";
import { PERSONAS, personaRequest } from "@/lib/personas";
import type { AgentRequest, StyleResult } from "@/lib/types";
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
        <ReactLenis root options={{ lerp: 0.075, wheelMultiplier: 0.9, smoothWheel: !reduce }}>
          <LandingBody onStart={onStart} />
        </ReactLenis>
      )}
    </MotionConfig>
  );
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
  const { events, running, run } = useAgentRun();
  const [specKey, setSpecKey] = useState(SPECIMEN_DEFAULT);
  const lenis = useLenis();
  const [introOn, setIntroOn] = useState(true);

  // Every specimen is read once, in the background, and kept: the one on show first, then the rest, so the shuffle
  // swaps instantly (it used to start a fresh run per tap, which took seconds). A failed read gets one more try.
  const [specs, setSpecs] = useState<Record<string, StyleResult>>({});
  const [fails, setFails] = useState<Record<string, number>>({});
  const want = useRef(specKey);
  want.current = specKey;
  const [kick, setKick] = useState(0);
  useEffect(() => setKick((n) => n + 1), [specKey]);
  const loading = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  useEffect(() => {
    if (loading.current) return;
    const next = [want.current, ...PERSONAS.map((p) => p.key)].find((k) => !specs[k] && (fails[k] ?? 0) < 2);
    const p = PERSONAS.find((x) => x.key === next);
    if (!p) return;
    loading.current = true;
    (async () => {
      const r = await run(personaRequest(p)).catch(() => null);
      if (!r && (fails[p.key] ?? 0) === 0) await new Promise((ok) => setTimeout(ok, 2500)); // a cold server: one quiet retry
      loading.current = false;
      if (!alive.current) return;
      if (r) {
        setSpecs((m) => ({ ...m, [p.key]: r }));
        try {
          buildCard(r).art.forEach((src) => void (new Image().src = src)); // the art is ready before the swap too
        } catch {}
      } else setFails((m) => ({ ...m, [p.key]: (m[p.key] ?? 0) + 1 }));
      setKick((n) => n + 1); // and on to the next one
    })();
  }, [specs, fails, kick, run]);

  // If the live read still fails after the retry (rate limit, Qloo down), fall back to a real archived run.
  const archived = !specs[specKey] && (fails[specKey] ?? 0) >= 2;
  const shown = specs[specKey] ?? (archived ? SPECIMEN_SNAPSHOT : null);
  const error = (fails[specKey] ?? 0) > 0 && !specs[specKey] ? "slow" : null;
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
    () => (shown ? skyState(shown.seeds, shown.dna.name, shown.dna.lobes.map((l) => l.seedIds), (shown.inert ?? []).map((x) => x.id), shown.vibes) : skyState([], "")),
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
          onCustom={() => {
            go("byo");
            // once the scroll lands, the cursor waits in the search box (desktop; phones keep the keyboard down)
            setTimeout(() => window.dispatchEvent(new Event("tastrology:focus-picker")), 1450);
          }}
          specimen={
            <Specimen
              card={card}
              runId={shown?.runId}
              archived={archived}
              events={events}
              error={error}
              running={running && !shown}
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
          <span className="hidden items-center gap-5 sm:flex">
          <AfterEconomy>
          <a href="/shop" className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink">Shop</a>
          </AfterEconomy>
          <AfterFirstCard>
          <a href="/deck" className="whitespace-nowrap py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink">My Deck</a>
          <a href="/friends" className="whitespace-nowrap py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink">Friends</a>
          </AfterFirstCard>
          </span>
          <SoundToggle />
          <AuthNav />
          <button
            onClick={onPick}
            className="hidden shrink-0 whitespace-nowrap rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-paper transition hover:bg-accent sm:inline-block sm:px-4 sm:py-2"
          >
            Get your sign
          </button>
          <PhoneMenu onNew={onPick} />
        </div>
      </div>
    </motion.header>
  );
}
