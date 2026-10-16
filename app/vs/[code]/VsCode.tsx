"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BattleStage } from "@/components/battle/BattleArena";
import { HoloCard } from "@/components/card/HoloCard";
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

  if (st.kind === "fight") return <BattleStage out={st.out} />;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
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
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{st.card.archetype} wants a fight</p>
          <HoloCard card={st.card} width={300} idle />
          <Link href={`/?vs=${code}`} className="rounded-full bg-accent px-6 py-3.5 font-semibold text-paper">Mint yours to answer</Link>
          <p className="text-[13px] text-ink-3">Takes a minute. Four rounds, no mercy.</p>
        </>
      )}
    </main>
  );
}
