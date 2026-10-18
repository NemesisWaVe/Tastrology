"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { authOn, whenAuthReady } from "@/lib/authBridge";
import type { CardData } from "@/lib/card";
import type { Player } from "@/lib/friends";
import { friendsOp } from "./FriendsView";

/** The landing for an invite link (/f/<code>) or a shared card's `?f=`: who it is, their card, one button. */
export function Invite({ pc }: { pc: string }) {
  const router = useRouter();
  const [p, setP] = useState<Player | null | undefined>(undefined);
  const [card, setCard] = useState<CardData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    void (async () => {
      const j = (await fetch(`/api/friends?pc=${encodeURIComponent(pc)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { player?: Player } | null;
      if (off) return;
      setP(j?.player ?? null);
      if (j?.player?.card) {
        const c = (await fetch(`/api/card?code=${j.player.card}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as { card?: CardData } | null;
        if (!off && c?.card) setCard(c.card);
      }
    })();
    return () => {
      off = true;
    };
  }, [pc]);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    const b = await whenAuthReady();
    if (!b) {
      setBusy(false);
      return setMsg("Accounts aren't on here yet.");
    }
    const go = async () => {
      const j = await friendsOp({ op: "add", pc });
      // No username yet: the friends page asks for one, then sends this request.
      if (j.error && /username first/.test(j.error)) return router.push(`/friends?add=${pc}`);
      if (j.error && !/own code/.test(j.error)) {
        setBusy(false);
        return setMsg(j.error);
      }
      router.push("/friends");
    };
    if (b.signedIn()) return void go();
    const off = b.onChange((inNow) => {
      if (!inNow) return;
      off();
      void go();
    });
    b.openSignIn(() => {
      off();
      setBusy(false);
    });
  };

  if (p === undefined) return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Looking them up…</p>;
  if (!p)
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-serif text-4xl italic">No player with code {pc}</h1>
        <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-semibold text-paper">Mint your card</Link>
      </div>
    );

  return (
    <div className="mx-auto flex max-w-md flex-col items-center text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Friend invite</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95]">{p.user ? `@${p.user} wants a rival.` : p.name ? `${p.name} wants a rival.` : "You've been invited."}</h1>
      {card && (
        <div className="mt-8">
          <HoloCard card={card} width={260} />
        </div>
      )}
      <button type="button" disabled={busy || !authOn} onClick={() => void add()} className="mt-8 rounded-full bg-accent px-7 py-3.5 font-semibold text-paper disabled:opacity-50">
        {busy ? "Sending…" : "Send friend request"}
      </button>
      <p className="mt-3 text-sm text-ink-3">Once they accept, you can challenge each other. No card yet? Minting one takes a minute.</p>
      {msg && <p className="mt-4 text-sm text-ink-2" role="status">{msg}</p>}
      {p.card && (
        <Link href={`/vs/${p.card}`} className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 underline decoration-dotted underline-offset-4 hover:text-accent">
          Just fight this card
        </Link>
      )}
    </div>
  );
}
