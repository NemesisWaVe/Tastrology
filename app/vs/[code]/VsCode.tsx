"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BattleStage } from "@/components/battle/BattleArena";
import { Burned } from "@/components/card/Burned";
import { Galaxies } from "@/components/battle/Galaxies";
import { FlipCard } from "@/components/card/FlipCard";
import { FriendChip } from "@/components/friends/FriendChip";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import type { BattleResult } from "@/lib/battle";
import type { CardData } from "@/lib/card";
import { loadDeck, type DeckEntry } from "@/lib/deck";
import { TWIN_CODE } from "@/lib/twins";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "burned"; code: string } | { kind: "unavailable" } | { kind: "card"; card: CardData } | { kind: "fight"; out: BattleResult };

export function VsCode({ code }: { code: string }) {
  const b = useSearchParams().get("vs")?.toUpperCase() ?? "";
  const [st, setSt] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let off = false;
    const set = (s: State) => !off && setSt(s);
    (async () => {
      if (!TWIN_CODE.test(code)) return set({ kind: "missing" });
      if (TWIN_CODE.test(b) && b !== code) {
        const r = await fetch(`/api/battle?a=${code}&b=${b}`, { cache: "no-store" }).catch(() => null);
        const j = r?.ok ? ((await r.json().catch(() => null)) as { result: BattleResult } | null) : null;
        if (j?.result) return set({ kind: "fight", out: j.result });
        if (r?.status === 410) return set({ kind: "burned", code: ((await r.json().catch(() => null)) as { burned?: string } | null)?.burned ?? code });
        if (!r || r.status >= 500 || r.status === 429) return set({ kind: "unavailable" });
      }
      const r = await fetch(`/api/card?code=${code}`, { cache: "no-store" }).catch(() => null);
      const j = r?.ok ? ((await r.json().catch(() => null)) as { card: CardData | null } | null) : null;
      if (j?.card) return set({ kind: "card", card: j.card });
      if (r?.status === 410) return set({ kind: "burned", code });
      set(!r || r.status >= 500 || r.status === 429 ? { kind: "unavailable" } : { kind: "missing" });
    })();
    return () => {
      off = true;
    };
  }, [code, b, attempt]);

  // Your own card: no "wants a fight" pitch. Offer your other cards (self-fight) and your friends instead.
  const [deck, setDeck] = useState<DeckEntry[] | null>(null);
  useEffect(() => {
    if (st.kind !== "card") return;
    let off = false;
    void loadDeck().then((d) => !off && setDeck(d.cards));
    return () => {
      off = true;
    };
  }, [st.kind]);
  // Whoever minted this card (when they've opened Friends since): lets a visitor add them or read the card.
  const [owner, setOwner] = useState<{ pc: string; user?: string } | null>(null);
  useEffect(() => {
    if (st.kind !== "card") return;
    let off = false;
    void fetch(`/api/friends?card=${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { player?: { pc: string; user?: string } } | null) => !off && setOwner(j?.player ?? null))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [st.kind, code]);
  let myPc = "";
  try {
    myPc = typeof window === "undefined" ? "" : (localStorage.getItem("tastrology:pc") ?? "");
  } catch {}
  const own = Boolean(deck?.some((c) => c.code === code)) || Boolean(owner && myPc && owner.pc === myPc);
  const others = (deck ?? []).filter((c) => c.code !== code);

  // The challenger's card hangs in their sky.
  const reduce = Boolean(useReducedMotion());
  const cardRef = useRef<HTMLDivElement>(null);
  const challenger = st.kind === "card" ? st.card : null;
  const sky = useMemo(() => (challenger ? skyState(challenger.evolvesFrom, challenger.archetype, [], [], challenger.vibes) : null), [challenger]);

  if (st.kind === "fight") return <BattleStage out={st.out} />;

  return (
    <main className="relative isolate mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {sky && <Sky f={sky} anchor={cardRef} reduce={reduce} drawn fixed dim={0.8} />}
      {st.kind === "loading" && <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Finding the challenger…</p>}
      {st.kind === "unavailable" && (
        <>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-warn">Temporarily unavailable</p>
          <h1 className="font-serif text-5xl italic leading-[0.95]">The ring is being swept.</h1>
          <p className="text-ink-2">We couldn&apos;t reach the card archive just now. Nothing&apos;s lost; give it a few seconds and try again.</p>
          <button
            type="button"
            onClick={() => {
              setSt({ kind: "loading" });
              setAttempt((n) => n + 1);
            }}
            className="rounded-full bg-accent px-6 py-3.5 font-semibold text-paper"
          >
            Try again
          </button>
        </>
      )}
      {st.kind === "burned" && <Burned code={st.code} what="fighter" />}
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
          <p className="relative font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{own ? "Your card" : owner?.user ? `@${owner.user} wants a fight` : `${st.card.archetype} wants a fight`}</p>
          <div className="relative">
            <Galaxies reduce={reduce} sides={[{ card: st.card, side: "a", anchor: cardRef, colour: "#c6ff3d" }]} solo className="absolute left-1/2 top-1/2 h-[820px] w-[min(100vw,900px)] -translate-x-1/2 -translate-y-1/2" />
            <div ref={cardRef} className="relative">
              <FlipCard card={st.card} width={300} idle flipButton />
            </div>
          </div>
          {own ? (
            <div className="relative flex w-full flex-col items-center gap-3">
              <Link href="/friends" className="rounded-full bg-accent px-6 py-3.5 font-semibold text-paper">Challenge a friend</Link>
              {others.length > 0 ? (
                <>
                  <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Or fight your other cards</p>
                  <ul className="flex w-full flex-col gap-2">
                    {others.slice(0, 6).map((o) => (
                      <li key={o.code}>
                        <Link href={`/vs/${code}?vs=${o.code}`} className="flex items-center justify-between gap-3 rounded-full border border-line px-5 py-2.5 text-left text-sm text-ink-2 transition hover:border-accent hover:text-ink">
                          <span className="truncate">{o.card.archetype}</span>
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{o.card.rarityLabel}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[13px] text-ink-3">Mint a second card and you can fight yourself.</p>
              )}
            </div>
          ) : (
            <>
              {others.length > 0 ? (
                <div className="relative flex w-full flex-col items-center gap-2">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Answer with one of yours</p>
                  <ul className="flex w-full flex-col gap-2">
                    {others.slice(0, 4).map((o) => (
                      <li key={o.code}>
                        <Link href={`/vs/${code}?vs=${o.code}`} className="flex items-center justify-between gap-3 rounded-full border border-line bg-paper/60 px-5 py-2.5 text-left text-sm text-ink-2 backdrop-blur-sm transition hover:border-accent hover:text-ink">
                          <span className="truncate">{o.card.archetype}</span>
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Fight</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <Link href={`/?vs=${code}`} className="relative rounded-full bg-accent px-6 py-3.5 font-semibold text-paper">Mint yours to answer</Link>
                  <p className="relative text-[13px] text-ink-3">Takes a minute. Four rounds, no mercy.</p>
                </>
              )}
              <div className="relative flex flex-wrap items-center justify-center gap-2">
                {owner ? (
                  <Link href={`/f/${owner.pc}`} className="rounded-full border border-accent/50 bg-paper/60 px-5 py-2.5 text-sm font-semibold text-accent backdrop-blur-sm transition hover:bg-accent hover:text-paper">
                    Add {owner.user ? `@${owner.user}` : "them"} as a friend
                  </Link>
                ) : (
                  <FriendChip />
                )}
                <Link href={`/c/${code}`} className="rounded-full border border-line bg-paper/60 px-5 py-2.5 text-sm text-ink-2 backdrop-blur-sm transition hover:border-ink-3 hover:text-ink">
                  Read the full card
                </Link>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
