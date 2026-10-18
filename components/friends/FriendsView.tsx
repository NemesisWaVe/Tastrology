"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { qr, qrPath } from "@/components/card/qr";
import { whenAuthReady } from "@/lib/authBridge";
import { loadDeck, type DeckEntry } from "@/lib/deck";
import { levelOf } from "@/lib/friendLevels";
import type { Bout, Friend, Player } from "@/lib/friends";
import { rememberPlayerCode } from "@/lib/player";

type Data = {
  on: boolean;
  signedIn?: boolean;
  me?: Player;
  friends?: Friend[];
  requests?: { incoming: Friend[]; sent: Friend[] };
  bouts?: Bout[];
  dustOn?: boolean;
  dust?: number | null;
  stakes?: number[];
  /** What a username change costs now (0 while the free one is unused). */
  rename?: { fee: number; free: number; cost: number };
  inbox?: number | null;
  error?: string;
};

/**
 * Live pacing: right after anything happens (you act, or the counter moves) the page checks every 1.5s for a minute,
 * so a fight lands on both screens at once; then the gap stretches x1.5 per check up to 30s while nothing happens.
 */
const HOT_MS = 1500;
const HOT_FOR_MS = 60_000;
const COOL_MAX_MS = 30_000;

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
const lime = "rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-40";
const OUTCOME = { won: "Won", lost: "Lost", tied: "Tied" } as const;
const ADDED = { sent: "Request sent. You're friends once they accept.", added: "You're friends now.", pending: "Already asked. Waiting on them.", exists: "Already friends." } as const;
const who = (b: { user?: string; name: string; pc: string }) => (b.user ? `@${b.user}` : b.name || b.pc);

function InviteQr({ url }: { url: string }) {
  const code = useMemo(() => {
    const m = qr(url);
    return { q: m.length + 8, d: qrPath(m) };
  }, [url]);
  return (
    <svg viewBox={`-4 -4 ${code.q} ${code.q}`} shapeRendering="crispEdges" className="h-[168px] w-[168px] rounded-xl" role="img" aria-label="QR code: your friend invite">
      <rect x="-4" y="-4" width={code.q} height={code.q} fill="#fff" />
      <path d={code.d} />
    </svg>
  );
}

export function FriendsView({ prefill = "" }: { prefill?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [deck, setDeck] = useState<DeckEntry[]>([]);
  const [code, setCode] = useState(prefill);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [betFor, setBetFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [uname, setUname] = useState("");
  const [editName, setEditName] = useState(false);
  const hotUntil = useRef(Date.now() + HOT_FOR_MS);
  const heat = () => (hotUntil.current = Date.now() + HOT_FOR_MS);
  /** Challenges you sent that were still open: when one settles, its fight opens here straight away. */
  const waiting = useRef(new Set<string>());

  const load = useCallback(async () => {
    const j = (await fetch("/api/friends", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ on: true, error: "Couldn't reach the server." }))) as Data;
    if (j.me?.pc) rememberPlayerCode(j.me.pc);
    const done = (j.bouts ?? []).find((b) => b.role === "out" && b.status === "done" && waiting.current.has(b.id) && b.a && b.b);
    waiting.current = new Set((j.bouts ?? []).filter((b) => b.role === "out" && b.status === "open").map((b) => b.id));
    if (done && !document.hidden) {
      location.href = `/vs/${done.a}?vs=${done.b}`;
      return;
    }
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

  // Live: poll the one-number change counter while the tab is visible (hot, then cooling); reload only when it moves.
  const seen = useRef<number | null | undefined>(undefined);
  seen.current = d?.inbox;
  const signedIn = Boolean(d?.signedIn);
  useEffect(() => {
    if (!signedIn) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    let gap = HOT_MS;
    const next = () => {
      if (stop) return;
      gap = Date.now() < hotUntil.current ? HOT_MS : Math.min(COOL_MAX_MS, Math.max(HOT_MS, gap) * 1.5);
      t = setTimeout(() => void tick(), gap);
    };
    const tick = async () => {
      if (stop) return;
      if (document.hidden) return next();
      const j = (await fetch("/api/friends?ping=1", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { n?: number | null } | null;
      if (!stop && typeof j?.n === "number" && j.n !== seen.current) {
        heat();
        await load();
      }
      next();
    };
    const wake = () => {
      if (document.hidden) return;
      heat();
      clearTimeout(t);
      void tick();
    };
    next();
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [signedIn, load]);

  const run = async (key: string, body: Record<string, unknown>, done?: (j: Awaited<ReturnType<typeof friendsOp>>) => void) => {
    setBusy(key);
    setNote(null);
    heat();
    const j = await friendsOp(body);
    setBusy(null);
    if (j.error) setNote(j.error);
    else done?.(j);
    await load();
  };

  if (!d) return <p className={`${mono} text-ink-3`}>Loading your circle…</p>;
  if (!d.on) return <p className="text-ink-2">Friends aren&apos;t switched on here yet.</p>;
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
  const saveName = () =>
    run("name", { op: "username", user: uname }, () => {
      setEditName(false);
      setUname("");
      if (code) setNote("Username saved. Now send that request.");
    });
  const naming = !me.user || editName;
  const invite = typeof window === "undefined" ? "" : `${location.origin}/f/${me.pc}`;
  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: "Add me on Tastrology and fight my card:", url: invite });
        return;
      } catch {}
    }
    await navigator.clipboard?.writeText(invite).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const challenge = (pc: string, stake: number) =>
    run(`bet${pc}`, { op: "challenge", pc, stake }, () => {
      setBetFor(null);
      setNote(stake ? `Challenge sent: ${stake} dust. It's on once they accept.` : "Challenge sent. It's on once they accept.");
    });
  const incoming = d.requests?.incoming ?? [];
  const sent = d.requests?.sent ?? [];
  const open = (d.bouts ?? []).filter((b) => b.status === "open" || (b.status === "expired" && b.role === "out"));
  const past = (d.bouts ?? []).filter((b) => b.status === "done" || b.status === "declined" || b.status === "cancelled").slice(0, 8);
  const friendPcs = new Set((d.friends ?? []).map((f) => f.pc));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col gap-6">
        {naming && (
          <section className="rounded-[22px] border border-accent/50 bg-accent/5 p-5 sm:p-6">
            <p className={`${mono} text-accent`}>{me.user ? "Change your username" : "Pick your username"}</p>
            <p className="mt-2 text-sm text-ink-2">
              {me.user
                ? d.rename?.fee
                  ? `This change costs ${d.rename.fee} Stardust. Friends see the new name right away.`
                  : `Your first change is free. After that each one costs ${d.rename?.cost ?? 50} Stardust.`
                : "It's how friends find you and see you. Letters, numbers and _. Your email never shows."}
            </p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
            >
              <span className="flex min-w-0 flex-1 items-center rounded-full border border-line bg-paper px-4">
                <span className="text-ink-3">@</span>
                <input
                  value={uname}
                  onChange={(e) => setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
                  placeholder="yourname"
                  aria-label="Username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="min-w-0 flex-1 bg-transparent py-2.5 pl-1 text-ink outline-none placeholder:text-ink-3"
                />
              </span>
              <button type="submit" disabled={uname.length < 3 || busy === "name"} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-paper disabled:opacity-40">
                Save
              </button>
            </form>
            {me.user && (
              <button type="button" onClick={() => setEditName(false)} className={`${mono} mt-3 text-ink-3 hover:text-ink`}>
                Keep @{me.user}
              </button>
            )}
          </section>
        )}
        <section className="rounded-[22px] border border-line bg-paper/60 p-5 sm:p-6">
          {me.user && (
            <p className="mb-4 flex items-baseline gap-3">
              <span className="font-serif text-3xl italic">@{me.user}</span>
              {!editName && (
                <button type="button" onClick={() => setEditName(true)} className={`${mono} text-ink-3 hover:text-ink`}>
                  {d.rename?.fee ? `Change · ${d.rename.fee} dust` : "Change · free once"}
                </button>
              )}
            </p>
          )}
          <p className={`${mono} text-ink-3`}>Your player code</p>
          <p className="mt-2 font-mono text-4xl tracking-[0.18em] text-accent">{me.pc}</p>
          <p className="mt-2 text-sm text-ink-2">Share it, or let them scan. They send a request; you accept.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void shareInvite()} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-paper">
              {copied ? "Invite link copied" : "Invite a friend"}
            </button>
            <button type="button" onClick={() => setShowQr((v) => !v)} className={pill}>
              {showQr ? "Hide QR" : "Show QR"}
            </button>
          </div>
          {showQr && invite && (
            <div className="mt-4 flex justify-center">
              <InviteQr url={invite} />
            </div>
          )}
          <div className="mt-6 border-t border-line/70 pt-5">
            <p className={`${mono} text-ink-3`}>You fight with</p>
            {me.card ? (
              <p className="mt-1.5 font-serif text-2xl italic">{me.name}</p>
            ) : (
              <p className="mt-1.5 text-sm text-ink-2">
                No card yet. <Link href="/?new=1" className="text-accent underline underline-offset-4">Mint one</Link> to fight.
              </p>
            )}
            {deck.length > 1 && (
              <select
                value={me.card}
                disabled={busy === "card"}
                onChange={(e) => void run("card", { op: "card", card: e.target.value })}
                className="mt-3 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink"
              >
                {deck.map((c) => (
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
                setNote(ADDED[j.status as keyof typeof ADDED] ?? "Done.");
              });
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z_@]/g, "").slice(0, 21))}
              placeholder="@username or code"
              aria-label="Friend's username or player code"
              autoCapitalize="none"
              autoCorrect="off"
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 font-mono text-ink placeholder:text-ink-3"
            />
            <button type="submit" disabled={code.replace("@", "").length < 3 || busy === "add" || !me.user} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-paper disabled:opacity-40">
              Ask
            </button>
          </form>
          {sent.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {sent.map((r) => (
                <li key={r.pc} className="flex items-center justify-between gap-3 text-sm text-ink-2">
                  <span className="min-w-0 truncate">Asked {who(r)} · waiting</span>
                  <button type="button" disabled={busy !== null} onClick={() => void run(`rq${r.pc}`, { op: "drop-request", pc: r.pc })} className={`${mono} text-ink-3 hover:text-ink`}>
                    Withdraw
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {note && (
          <p className="text-sm text-ink-2" role="status">
            {note}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {(incoming.length > 0 || open.length > 0) && (
          <section className="rounded-[22px] border border-accent/50 bg-accent/5 p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <p className={`${mono} text-accent`}>Waiting on you</p>
              {d.dustOn && d.dust !== null && <p className="font-mono text-xs tabular-nums text-ink-2">{d.dust} dust</p>}
            </div>
            <ul className="mt-3 flex flex-col divide-y divide-line/70">
              {incoming.map((r) => (
                <li key={r.pc} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <p className="text-sm">
                    <b className="font-semibold">{who(r)}</b> wants to be friends
                  </p>
                  <span className="flex gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => void run(`ok${r.pc}`, { op: "accept-friend", pc: r.pc }, () => setNote(`You and ${who(r)} are friends now.`))} className={lime}>
                      Accept
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => void run(`rq${r.pc}`, { op: "drop-request", pc: r.pc })} className={pill}>
                      Decline
                    </button>
                  </span>
                </li>
              ))}
              {open.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <p className="text-sm">
                    {b.role === "in" ? (
                      <>
                        <b className="font-semibold">{who(b)}</b> challenged you{b.stake ? <> for <span className="text-accent">{b.stake} dust</span>, blind draw</> : " to a friendly fight"}
                      </>
                    ) : b.status === "expired" ? (
                      <>Your challenge to {who(b)} expired{b.stake ? `. Take your ${b.stake} dust back.` : "."}</>
                    ) : (
                      <>
                        You challenged <b className="font-semibold">{who(b)}</b>
                        {b.stake ? <> for <span className="text-accent">{b.stake}</span></> : ""} · waiting
                      </>
                    )}
                  </p>
                  <span className="flex gap-2">
                    {b.role === "in" && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void run(b.id, { op: "accept", id: b.id }, (j) => j.a && j.b && (location.href = `/vs/${j.a}?vs=${j.b}`))}
                        className={lime}
                      >
                        {busy === b.id ? "Fighting…" : "Fight"}
                      </button>
                    )}
                    <button type="button" disabled={busy !== null} onClick={() => void run(`${b.id}x`, { op: "decline", id: b.id })} className={pill}>
                      {b.role === "in" ? "Decline" : b.status === "expired" ? "Close" : "Cancel"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className={`${mono} text-ink-3`}>Friends · {d.friends?.length ?? 0}</p>
          {!d.friends?.length ? (
            <p className="mt-3 max-w-md text-ink-2">No one yet. Send your invite or share a card. When they ask and you accept, you can fight.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {d.friends.map((f) => (
                <li key={f.pc} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-serif text-xl italic">{who(f)}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-3">{f.name ? `Fights with ${f.name}` : "No card yet"}</p>
                      <p className={`${mono} mt-1 text-ink-3`}>
                        <span className={f.days ? "text-accent" : ""}>{levelOf(f.days ?? 0)} friend</span> · {f.days ?? 0} day{f.days === 1 ? "" : "s"} fought · {f.pc}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${who(f)}`}
                      onClick={() => confirm(`Remove ${who(f)} from your friends?`) && void run(`rm${f.pc}`, { op: "remove", pc: f.pc })}
                      className="px-1 text-lg leading-none text-ink-3 hover:text-ink"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {me.card && f.card ? (
                      <button type="button" disabled={busy !== null} onClick={() => void challenge(f.pc, 0)} className={lime}>
                        Challenge
                      </button>
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
                      <p className="text-xs text-ink-2">They have to accept. Then one card is drawn at random from each deck; the winner takes both stakes, a tie refunds.</p>
                      <div className="mt-2 flex gap-2">
                        {(d.stakes ?? []).map((s) => (
                          <button key={s} type="button" disabled={busy !== null || (d.dust ?? 0) < s} onClick={() => void challenge(f.pc, s)} className={pill}>
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

        {past.length > 0 && (
          <section>
            <p className={`${mono} text-ink-3`}>Recent fights</p>
            <ul className="mt-2 flex flex-col divide-y divide-line/70">
              {past.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm text-ink-2">
                  <span className="min-w-0 truncate">
                    {b.status === "done" && b.outcome ? (
                      <>
                        <b className={b.outcome === "won" ? "text-accent" : "text-ink"}>
                          {OUTCOME[b.outcome]}
                          {b.stake ? ` ${b.outcome === "won" ? `+${b.stake}` : b.outcome === "lost" ? `−${b.stake}` : "±0"}` : ""}
                        </b>{" "}
                        vs {who(b)}
                      </>
                    ) : (
                      <>
                        {b.status === "declined" ? "Declined" : "Cancelled"} · {who(b)}
                      </>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-4">
                    {b.a && b.b && (
                      <Link href={`/vs/${b.a}?vs=${b.b}`} className={`${mono} text-ink-3 underline decoration-dotted underline-offset-4 hover:text-accent`}>
                        Watch
                      </Link>
                    )}
                    {b.status === "done" && friendPcs.has(b.pc) && (
                      <button type="button" disabled={busy !== null || (b.stake > 0 && (d.dust ?? 0) < b.stake)} onClick={() => void challenge(b.pc, b.stake)} className={`${mono} text-accent hover:underline disabled:opacity-40`}>
                        Rematch
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
