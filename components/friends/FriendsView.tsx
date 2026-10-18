"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { whenAuthReady } from "@/lib/authBridge";
import { loadDeck, type DeckEntry } from "@/lib/deck";
import type { Bout, Friend, Player } from "@/lib/friends";
import { rememberPlayerCode } from "@/lib/player";

type Data = {
  on: boolean;
  signedIn?: boolean;
  me?: Player;
  friends?: Friend[];
  bouts?: Bout[];
  dustOn?: boolean;
  dust?: number | null;
  stakes?: number[];
  error?: string;
};

export async function friendsOp(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; a?: string; b?: string; outcome?: string; status?: string }> {
  try {
    const r = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ error: "Couldn't reach the server." }));
  } catch {
    return { error: "Couldn't reach the server." };
  }
}

const mono = "font-mono text-[10.5px] uppercase tracking-[0.2em]";
const pill = "rounded-full border border-line px-4 py-1.5 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink disabled:opacity-40";
const OUTCOME = { won: "Won", lost: "Lost", tied: "Tied" } as const;

export function FriendsView({ prefill = "" }: { prefill?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [deck, setDeck] = useState<DeckEntry[]>([]);
  const [code, setCode] = useState(prefill);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [betFor, setBetFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const j = (await fetch("/api/friends", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ on: true, error: "Couldn't reach the server." }))) as Data;
    if (j.me?.pc) rememberPlayerCode(j.me.pc);
    setD(j);
  }, []);

  useEffect(() => {
    void (async () => {
      await whenAuthReady();
      await load();
    })();
    void loadDeck().then((x) => setDeck(x.cards));
    let off: (() => void) | undefined;
    void whenAuthReady().then((b) => (off = b?.onChange(() => void load())));
    return () => off?.();
  }, [load]);

  const run = async (key: string, body: Record<string, unknown>, done?: (j: Awaited<ReturnType<typeof friendsOp>>) => void) => {
    setBusy(key);
    setNote(null);
    const j = await friendsOp(body);
    setBusy(null);
    if (j.error) setNote(j.error);
    else done?.(j);
    await load();
  };

  if (!d) return <p className={`${mono} text-ink-3`}>Loading your circle…</p>;
  if (!d.on)
    return <p className="text-ink-2">Friends aren&apos;t switched on here yet.</p>;
  if (!d.signedIn)
    return (
      <div className="max-w-md">
        <p className="text-ink-2">Friends live on your account, so your circle follows you to every device.</p>
        <button type="button" onClick={() => void whenAuthReady().then((b) => b?.openSignIn())} className="mt-5 rounded-full bg-accent px-6 py-3 font-semibold text-paper">
          Sign in to add friends
        </button>
      </div>
    );
  if (!d.me) return <p className="text-ink-2">{d.error ?? "Couldn't load your circle."}</p>;

  const me = d.me;
  const invite = typeof window === "undefined" ? "" : `${location.origin}/f/${me.pc}`;
  const shareInvite = async () => {
    const text = `Add me on Tastrology and fight my card: ${invite}`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url: invite });
        return;
      } catch {}
    }
    await navigator.clipboard?.writeText(invite).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const open = (d.bouts ?? []).filter((b) => b.status === "open");
  const past = (d.bouts ?? []).filter((b) => b.status !== "open").slice(0, 8);
  const mine = deck;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col gap-6">
        <section className="rounded-[22px] border border-line bg-paper/60 p-5 sm:p-6">
          <p className={`${mono} text-ink-3`}>Your player code</p>
          <p className="mt-2 font-mono text-4xl tracking-[0.18em] text-accent">{me.pc}</p>
          <p className="mt-2 text-sm text-ink-2">Anyone with this code, or any card you share, can add you.</p>
          <button type="button" onClick={() => void shareInvite()} className="mt-4 rounded-full bg-accent px-5 py-2.5 font-semibold text-paper">
            {copied ? "Invite link copied" : "Invite a friend"}
          </button>
          <div className="mt-6 border-t border-line/70 pt-5">
            <p className={`${mono} text-ink-3`}>You fight with</p>
            {me.card ? (
              <p className="mt-1.5 font-serif text-2xl italic">{me.name}</p>
            ) : (
              <p className="mt-1.5 text-sm text-ink-2">
                No card yet. <Link href="/?new=1" className="text-accent underline underline-offset-4">Mint one</Link> to fight.
              </p>
            )}
            {mine.length > 1 && (
              <select
                value={me.card}
                disabled={busy === "card"}
                onChange={(e) => void run("card", { op: "card", card: e.target.value })}
                className="mt-3 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink"
              >
                {mine.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.card.archetype} · {c.card.rarityLabel}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        <section className="rounded-[22px] border border-line p-5 sm:p-6">
          <p className={`${mono} text-ink-3`}>Add a friend</p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run("add", { op: "add", pc: code }, (j) => {
                setCode("");
                setNote(j.status === "exists" ? "Already friends." : "Added.");
              });
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6))}
              placeholder="6-letter code"
              aria-label="Friend's player code"
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 font-mono tracking-[0.2em] text-ink placeholder:tracking-normal placeholder:text-ink-3"
            />
            <button type="submit" disabled={code.length !== 6 || busy === "add"} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-paper disabled:opacity-40">
              Add
            </button>
          </form>
        </section>
        {note && <p className="text-sm text-ink-2" role="status">{note}</p>}
      </div>

      <div className="flex flex-col gap-6">
        {d.dustOn && (open.length > 0 || past.length > 0) && (
          <section className="rounded-[22px] border border-accent/40 p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <p className={`${mono} text-accent`}>Stardust bouts</p>
              {d.dust !== null && <p className="font-mono text-xs tabular-nums text-ink-2">{d.dust} dust</p>}
            </div>
            <ul className="mt-3 flex flex-col divide-y divide-line/70">
              {open.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <p className="text-sm">
                    {b.role === "in" ? (
                      <>
                        <b className="font-semibold">{b.name || b.pc}</b> bet <span className="text-accent">{b.stake} dust</span> on a blind draw
                      </>
                    ) : (
                      <>
                        You bet <span className="text-accent">{b.stake}</span> against <b className="font-semibold">{b.name || b.pc}</b> · waiting
                      </>
                    )}
                  </p>
                  <span className="flex gap-2">
                    {b.role === "in" && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void run(b.id, { op: "accept", id: b.id }, (j) => j.a && j.b && (location.href = `/vs/${j.a}?vs=${j.b}`))}
                        className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-40"
                      >
                        {busy === b.id ? "Drawing…" : "Accept"}
                      </button>
                    )}
                    <button type="button" disabled={busy !== null} onClick={() => void run(b.id + "x", { op: "decline", id: b.id })} className={pill}>
                      {b.role === "in" ? "Decline" : "Cancel"}
                    </button>
                  </span>
                </li>
              ))}
              {past.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm text-ink-2">
                  <span className="min-w-0 truncate">
                    {b.status === "done" && b.outcome ? (
                      <>
                        <b className={b.outcome === "won" ? "text-accent" : "text-ink"}>
                          {OUTCOME[b.outcome]} {b.outcome === "won" ? `+${b.stake}` : b.outcome === "lost" ? `−${b.stake}` : "±0"}
                        </b>{" "}
                        vs {b.name || b.pc}
                      </>
                    ) : (
                      <>
                        {b.status === "declined" ? "Declined" : "Cancelled"} · {b.name || b.pc} · {b.stake} back to the challenger
                      </>
                    )}
                  </span>
                  {b.a && b.b && (
                    <Link href={`/vs/${b.a}?vs=${b.b}`} className={`${mono} shrink-0 text-ink-3 underline decoration-dotted underline-offset-4 hover:text-accent`}>
                      Watch
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className={`${mono} text-ink-3`}>Friends · {d.friends?.length ?? 0}</p>
          {!d.friends?.length ? (
            <p className="mt-3 max-w-md text-ink-2">No one yet. Send your invite or share a card: whoever opens it can add you, and then you can fight.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {d.friends.map((f) => (
                <li key={f.pc} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-serif text-xl italic">{f.name || "No card yet"}</p>
                      <p className={`${mono} mt-1 text-ink-3`}>
                        {f.rarity} · {f.pc}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name || f.pc}`}
                      onClick={() => confirm(`Remove ${f.name || f.pc} from your friends?`) && void run("rm" + f.pc, { op: "remove", pc: f.pc })}
                      className="px-1 text-lg leading-none text-ink-3 hover:text-ink"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {me.card && f.card ? (
                      <Link href={`/vs/${me.card}?vs=${f.card}`} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-paper">
                        Fight free
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-3">{me.card ? "They need a card to fight." : "Mint a card to fight."}</span>
                    )}
                    {d.dustOn && (
                      <button type="button" onClick={() => setBetFor(betFor === f.pc ? null : f.pc)} className={pill}>
                        Bet Stardust
                      </button>
                    )}
                  </div>
                  {betFor === f.pc && (
                    <div className="mt-3 rounded-xl bg-paper/70 p-3">
                      <p className="text-xs text-ink-2">One card drawn at random from each deck. Winner takes both stakes; a tie refunds.</p>
                      <div className="mt-2 flex gap-2">
                        {(d.stakes ?? []).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={busy !== null || (d.dust ?? 0) < s}
                            onClick={() => void run("bet" + f.pc, { op: "challenge", pc: f.pc, stake: s }, () => (setBetFor(null), setNote(`Challenge sent: ${s} dust.`)))}
                            className={pill}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
