"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BattleStage } from "@/components/battle/BattleArena";
import { FlipCard } from "@/components/card/FlipCard";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import type { BattleResult } from "@/lib/battle";
import type { CardData } from "@/lib/card";
import { TWIN_CODE } from "@/lib/twins";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "card"; card: CardData } | { kind: "fight"; out: BattleResult };

export function VsCode({ code }: { code: string }) {
  const b = useSearchParams().get("vs")?.toUpperCase() ?? "";
  const [st, setSt] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let off = false;
    const set = (s: State) => !off && setSt(s);
    (async () => {
      if (!TWIN_CODE.test(code)) return set({ kind: "missing" });
      if (TWIN_CODE.test(b) && b !== code) {
        const r = await fetch(`/api/battle?a=${code}&b=${b}`).catch(() => null);
        const j = r?.ok ? ((await r.json()) as { result: BattleResult }) : null;
        if (j?.result) return set({ kind: "fight", out: j.result });
      }
      const r = await fetch(`/api/card?code=${code}`).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { card: CardData | null }) : null;
      set(j?.card ? { kind: "card", card: j.card } : { kind: "missing" });
    })();
    return () => {
      off = true;
    };
  }, [code, b]);

  // The challenger's card hangs in their sky.
  const reduce = Boolean(useReducedMotion());
  const cardRef = useRef<HTMLDivElement>(null);
  const challenger = st.kind === "card" ? st.card : null;
  const sky = useMemo(() => (challenger ? skyState(challenger.evolvesFrom, challenger.archetype) : null), [challenger]);

  if (st.kind === "fight") return <BattleStage out={st.out} />;

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {sky && <Sky f={sky} anchor={cardRef} reduce={reduce} drawn fixed dim={0.8} />}
      {st.kind === "loading" && <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Finding the challenger…</p>}
      {st.kind === "missing" && (
        <>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bad">Not found</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">No fighter with code {code}</h1>
          <p className="text-ink-2">That card isn&apos;t on file, or the code has a typo. Mint your own and pick someone else.</p>
          <Link href="/" className="rounded-full bg-accent px-6 py-3.5 font-semibold text-paper">Mint yours</Link>
        </>
      )}
      {st.kind === "card" && (
        <>
          <p className="relative font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{st.card.archetype} wants a fight</p>
          <div ref={cardRef} className="relative">
            <FlipCard card={st.card} width={300} idle flipButton />
          </div>
          <Link href={`/?vs=${code}`} className="relative rounded-full bg-accent px-6 py-3.5 font-semibold text-paper">Mint yours to answer</Link>
          <p className="relative text-[13px] text-ink-3">Takes a minute. Four rounds, no mercy.</p>
        </>
      )}
    </main>
  );
}
