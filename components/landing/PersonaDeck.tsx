"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { KIND_ICON, KIND_LABEL } from "@/components/SeedPicker";
import { PERSONAS, personaRequest, type Persona } from "@/lib/personas";
import type { AgentRequest } from "@/lib/types";
import { EASE, MaskedWords, Reveal } from "./primitives";
import { lookOf } from "./personaStyle";
import s from "./landing.module.css";

export function PersonaDeck({ onStart }: { onStart: (req: AgentRequest) => void }) {
  const [picked, setPicked] = useState<string | null>(null);

  const pick = (p: Persona) => {
    if (picked) return;
    setPicked(p.key);
    // let the press land before handing off
    setTimeout(() => {
      onStart(personaRequest(p));
      setPicked(null);
    }, 420);
  };

  return (
    <section id="pick" className="relative scroll-mt-10 py-20 sm:py-28">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8 lg:px-12">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h2 className="font-display text-[clamp(2.6rem,9vw,5.6rem)] font-bold leading-[0.9] tracking-[-0.045em]">
              <MaskedWords text="Not ready to type?" inView className="block" />
              <MaskedWords text="Borrow a stranger's taste." inView delay={0.12} wordClassName="font-serif font-normal italic text-ink-2" />
            </h2>
          </div>
          <Reveal delay={0.1} className="max-w-sm text-[15px] leading-relaxed text-ink-3">
            Three made-up people with very real favorites. Tap one and the agent builds their card from scratch, live, so you can see how it works before you hand over your own.
          </Reveal>
        </div>

        <div
          className={`${s.snap} -mx-4 mt-12 flex gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:gap-6`}
          role="list"
        >
          {PERSONAS.map((p, i) => (
            <PersonaCard key={p.key} p={p} i={i} total={PERSONAS.length} onPick={() => pick(p)} picked={picked === p.key} dim={!!picked && picked !== p.key} />
          ))}
        </div>
        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3 sm:hidden">← swipe the deck →</p>
      </div>
    </section>
  );
}

function PersonaCard({ p, i, total, onPick, picked, dim }: { p: Persona; i: number; total: number; onPick: () => void; picked: boolean; dim: boolean }) {
  const look = lookOf(p);
  const [first, ...rest] = p.name.split(" ");
  const hasArticle = first.toLowerCase() === "the";

  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ty", `${(px - 0.5) * 10}deg`);
    el.style.setProperty("--tx", `${(0.5 - py) * 8}deg`);
    el.style.setProperty("--px", `${px * 100}%`);
    el.style.setProperty("--py", `${py * 100}%`);
  };
  const leave = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty("--ty", "0deg");
    e.currentTarget.style.setProperty("--tx", "0deg");
  };

  return (
    <motion.div
      role="listitem"
      className="w-[80%] shrink-0 sm:w-auto"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "200px" }}
      transition={{ duration: 1, ease: EASE, delay: i * 0.12 }}
    >
      <motion.div className="h-full" animate={{ opacity: dim ? 0.35 : 1, scale: picked ? 0.97 : 1 }} transition={{ duration: 0.35, ease: EASE }}>
      <button
        onClick={onPick}
        onPointerMove={move}
        onPointerLeave={leave}
        aria-label={`Mint ${p.name}: ${p.blurb}`}
        className={`${s.persona} group flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-line bg-card p-6 text-left outline-none sm:min-h-[500px] sm:p-7`}
        style={{
          backgroundImage: `radial-gradient(120% 70% at 100% 0%, ${look.a}33 0%, transparent 55%), radial-gradient(90% 60% at 0% 100%, ${look.b}26 0%, transparent 60%)`,
        }}
      >
        <span className={s.personaSheen} aria-hidden />

        <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
          <span>
            No. {String(i + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> pre-read
          </span>
        </span>

        <span className="relative mt-6 grid h-20 w-20 place-items-center sm:mt-8 sm:h-28 sm:w-28">
          <span
            className="absolute inset-0 rounded-full opacity-80 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
            style={{ background: `radial-gradient(circle, ${look.a}, transparent 70%)` }}
          />
          <span
            className="relative grid h-full w-full place-items-center rounded-full border border-white/15 font-serif text-paper transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:rotate-[20deg] group-hover:scale-105 text-4xl sm:text-6xl"
            style={{ background: `linear-gradient(135deg, ${look.a}, ${look.b})` }}
          >
            {look.glyph}
          </span>
        </span>

        <span className="mt-6 block font-display sm:mt-8 text-[clamp(1.9rem,4.2vw,2.5rem)] font-bold leading-[0.95] tracking-[-0.035em] text-ink">
          {hasArticle && <span className="mb-1 block font-serif text-[0.62em] font-normal italic tracking-normal text-ink-3">The</span>}
          {hasArticle ? rest.join(" ") : p.name}
        </span>
        <span className="mt-3 block font-serif text-lg italic leading-snug text-ink-2">&ldquo;{look.sign}&rdquo;</span>

        <span className="mt-6 flex flex-wrap gap-1.5">
          {p.seeds.map((sd) => (
            <span key={sd.name} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[12px] text-ink-2" title={KIND_LABEL[sd.kind]}>
              <span className="text-ink-3">{KIND_ICON[sd.kind]}</span>
              {sd.name}
            </span>
          ))}
        </span>

        <span className="mt-auto flex items-center justify-between pt-6 sm:pt-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-2 transition-colors group-hover:text-ink">
            {picked ? "Minting…" : "Mint this sign"}
          </span>
          <span className="grid h-12 w-12 place-items-center rounded-full border border-line text-lg text-ink transition-all duration-500 group-hover:-rotate-45 group-hover:border-accent group-hover:bg-accent group-hover:text-paper">
            →
          </span>
        </span>
      </button>
      </motion.div>
    </motion.div>
  );
}
