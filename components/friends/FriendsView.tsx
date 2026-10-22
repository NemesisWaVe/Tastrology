"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { qr, qrPath } from "@/components/card/qr";
import { whenAuthReady } from "@/lib/authBridge";
import { loadDeck, type DeckEntry } from "@/lib/deck";
import { LEVELS, levelOf } from "@/lib/friendLevels";
import { useReducedMotion } from "motion/react";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { Countdown } from "./Countdown";
import { FriendSky, SKY_TINT } from "./FriendSky";
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
  /** Server clock when this was read, to set countdowns by. */
  now?: number;
  error?: string;
};

/**
 * Live pacing: right after anything happens (you act, or the counter moves) the page checks every 1.5s for five
 * minutes (a challenge's whole life), so a fight lands on both screens at once; then it eases out to every 4s.
 * Each check is one tiny counter read.
 */
const HOT_MS = 1500;
const HOT_FOR_MS = 5 * 60_000;
const COOL_MAX_MS = 4000;

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
const ADDED = { sent: "Request sent. You're friends once they accept.", added: "You're friends now.", pending: "Already asked. Waiting on them.", exists: "Already friends." } as const;
const who = (b: { user?: string; name: string; pc: string }) => (b.user ? `@${b.user}` : b.name || b.pc);
/** Panels: a faint glass sheet over the sky, and a lime-washed one for what needs you. */
const glass = "rounded-[22px] border border-white/[0.07] bg-paper/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.012)_60%)] backdrop-blur-sm";
const lit = "rounded-[22px] border border-accent/35 bg-paper/70 bg-[linear-gradient(160deg,rgba(198,255,61,0.10),rgba(198,255,61,0.02)_60%)] backdrop-blur-sm";
/** The page's night sky, the same calm one the Hall and battles sit on. */
const OPEN_SKY = skyState([], "");
/** Scrolls to a friend or request row and makes it glow, from a tap on the sky. */
function pick(pc: string) {
  const el = document.getElementById(`fr-${pc}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate([{ boxShadow: "0 0 0 0 rgba(198,255,61,0)" }, { boxShadow: "0 0 0 2px rgba(198,255,61,0.7), 0 0 40px rgba(198,255,61,0.25)" }, { boxShadow: "0 0 0 0 rgba(198,255,61,0)" }], { duration: 1600, delay: 300 });
}
/** Days fought toward the next friendship level. */
function bond(days: number) {
  const next = [...LEVELS].reverse().find((l) => days < l.days);
  const prev = [...LEVELS].find((l) => days >= l.days)?.days ?? 0;
  return next ? { pct: Math.max(0.04, (days - prev) / (next.days - prev)), left: next.days - days, next: next.name } : { pct: 1, left: 0, next: null };
}

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
  const reduce = useReducedMotion() ?? false;
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
  const [logAll, setLogAll] = useState(false);
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
    // Countdowns run on this device's clock, shifted by how far it is from the server's.
    if (j.now) j.bouts = j.bouts?.map((b) => ({ ...b, ends: b.ends + (Date.now() - j.now!) }));
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
    // The username step after sign-in saved a name: show it here straight away.
    const named = () => void load();
    window.addEventListener("tastrology:username", named);
    // Online dots don't move the change counter, so the list refreshes once a minute while you're looking.
    const fresh = setInterval(() => !document.hidden && void load(), 60_000);
    return () => {
      off?.();
      window.removeEventListener("tastrology:username", named);
      clearInterval(fresh);
    };
  }, [load]);

  // A friend minting their first card doesn't move your counter, so while anyone can't fight yet, look every 15s.
  const cardless = Boolean(d?.friends?.some((f) => !f.card));
  useEffect(() => {
    if (!cardless) return;
    const t = setInterval(() => !document.hidden && void load(), 15_000);
    return () => clearInterval(t);
  }, [cardless, load]);

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
  // Live challenges only: a lapsed one just goes (a bet you put up comes back to you on its own).
  const open = (d.bouts ?? []).filter((b) => b.status === "open");
  // Fights that happened, with the running record; challenges that never happened collapse into one count.
  const fights = (d.bouts ?? []).filter((b) => b.status === "done" && b.outcome);
  const skipped = (d.bouts ?? []).filter((b) => b.status === "declined" || b.status === "cancelled" || b.status === "expired").length;
  const record = { won: fights.filter((b) => b.outcome === "won").length, lost: fights.filter((b) => b.outcome === "lost").length, tied: fights.filter((b) => b.outcome === "tied").length };
  // Current run (newest first) and per-rival tallies, so the log reads at a glance instead of growing forever.
  const streak = { w: fights[0]?.outcome, n: fights.findIndex((b) => b.outcome !== fights[0]?.outcome) };
  if (streak.n < 0) streak.n = fights.length;
  const rivals = [...fights.reduce((m, b) => {
    const r = m.get(b.pc) ?? { pc: b.pc, name: who(b), w: 0, l: 0, n: 0 };
    r.n++;
    if (b.outcome === "won") r.w++;
    else if (b.outcome === "lost") r.l++;
    return m.set(b.pc, r);
  }, new Map<string, { pc: string; name: string; w: number; l: number; n: number }>()).values()].sort((x, y) => y.n - x.n);
  const friendPcs = new Set((d.friends ?? []).map((f) => f.pc));
  const fighting = new Set(open.map((b) => b.pc));
  const live = new Map(open.map((b) => [b.pc, b.ends]));

  return (
    <div className="relative flex flex-col gap-6">
      {/* The whole page is night sky; the friend stars below are its bright band. */}
      <Sky f={OPEN_SKY} reduce={reduce} fixed quiet drawn dim={0.5} />
      <FriendSky me={me} friends={d.friends ?? []} incoming={incoming} sent={sent} fighting={fighting} onPick={pick} />
      {(incoming.length > 0 || open.length > 0) && (
        <section className={`${lit} p-5 sm:p-6`}>
          <div className="flex items-baseline justify-between">
            <p className={`${mono} text-accent`}>
              {/* only your own outgoing challenges open: the move is theirs */}
              {incoming.length > 0 || open.some((b) => b.role === "in") ? "Waiting on you" : "Waiting on them"}
            </p>
            {d.dustOn && d.dust !== null && <p className="font-mono text-xs tabular-nums text-ink-2">{d.dust} dust</p>}
          </div>
          <ul className="mt-3 flex flex-col divide-y divide-line/70">
            {incoming.map((r) => (
              <li key={r.pc} id={`fr-${r.pc}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl py-3">
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
                  ) : (
                    <>
                      You challenged <b className="font-semibold">{who(b)}</b>
                      {b.stake ? <> for <span className="text-accent">{b.stake}</span></> : ""} · waiting for them
                    </>
                  )}
                  <span className="mt-1 flex items-center gap-2 text-xs text-ink-3">
                    <Countdown ends={b.ends} onEnd={() => void load()} />
                    {b.role === "in" ? "to answer, then it's gone" : b.stake ? "then your dust comes back" : "then it lapses"}
                  </span>
                </p>
                <span className="flex gap-2">
                  {b.role === "in" && (
                    <button type="button" disabled={busy !== null} onClick={() => void run(b.id, { op: "accept", id: b.id }, (j) => j.a && j.b && (location.href = `/vs/${j.a}?vs=${j.b}`))} className={lime}>
                      {busy === b.id ? "Fighting…" : "Fight"}
                    </button>
                  )}
                  <button type="button" disabled={busy !== null} onClick={() => void run(`${b.id}x`, { op: "decline", id: b.id })} className={pill}>
                    {b.role === "in" ? "Decline" : "Cancel"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-6">
          {naming && (
            <section className={`${lit} p-5 sm:p-6`}>
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

          {/* Your pass: who you are, the code friends need, and the card you fight with, torn off into a stub for adding people. */}
          <section className="relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[linear-gradient(155deg,#17171e,#0b0b0f_70%)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[conic-gradient(from_200deg,rgba(198,255,61,0.18),rgba(131,255,247,0.12),rgba(216,117,255,0.14),rgba(198,255,61,0.18))] opacity-60 blur-3xl" />
            <div className="relative p-6">
              <div className="flex items-center justify-between">
                <p className={`${mono} text-accent`}>Player pass</p>
                <p className={`${mono} text-ink-3`}>Set 01</p>
              </div>
              <div className="mt-4 flex items-baseline gap-3">
                <p className="min-w-0 truncate font-serif text-[34px] italic leading-none text-ink">{me.user ? `@${me.user}` : "No name yet"}</p>
                {me.user && !editName && (
                  <button type="button" onClick={() => setEditName(true)} className={`${mono} shrink-0 text-ink-3 transition hover:text-ink`}>
                    {d.rename?.fee ? `Rename · ${d.rename.fee} dust` : "Rename · free once"}
                  </button>
                )}
              </div>
              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <p className={`${mono} text-ink-3`}>Code</p>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(me.pc).catch(() => {});
                      setNote("Code copied.");
                    }}
                    title="Copy code"
                    className="mt-1 font-mono text-[40px] leading-none tracking-[0.16em] text-accent transition hover:brightness-110"
                  >
                    {me.pc}
                  </button>
                </div>
                <button type="button" onClick={() => setShowQr((v) => !v)} aria-pressed={showQr} className={`${mono} shrink-0 rounded-full border border-line px-3 py-1.5 text-ink-2 transition hover:text-ink`}>
                  {showQr ? "Hide QR" : "QR"}
                </button>
              </div>
              {showQr && invite && (
                <div className="mt-5 flex justify-center">
                  <InviteQr url={invite} />
                </div>
              )}
              <button type="button" onClick={() => void shareInvite()} className="mt-6 w-full rounded-full bg-accent py-3 font-semibold text-paper transition hover:brightness-105">
                {copied ? "Invite link copied" : "Invite a friend"}
              </button>
            </div>

            {/* The tear line. */}
            <div aria-hidden className="relative h-0 border-t border-dashed border-white/[0.12]">
              <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-paper" />
              <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-paper" />
            </div>

            <div className="relative p-6">
              <p className={`${mono} text-ink-3`}>Fights as</p>
              {me.card ? (
                <p className="mt-1.5 font-serif text-[22px] italic leading-snug text-ink">{me.name}</p>
              ) : (
                <p className="mt-1.5 text-sm text-ink-2">
                  No card yet. <Link href="/?new=1" className="text-accent underline underline-offset-4">Mint one</Link> to fight.
                </p>
              )}
              {deck.length > 1 && (
                <label className="mt-3 flex items-center gap-2 text-xs text-ink-3">
                  Swap
                  <select
                    value={me.card}
                    disabled={busy === "card"}
                    onChange={(e) => void run("card", { op: "card", card: e.target.value })}
                    className="min-w-0 flex-1 rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink-2"
                  >
                    {deck.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.card.archetype} · {c.card.rarityLabel}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <form
                className="mt-6 flex items-center gap-2 rounded-full border border-line bg-paper/70 p-1 pl-4 focus-within:border-accent/50"
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
                  placeholder="Add by @username or code"
                  aria-label="Friend's username or player code"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-ink-3"
                />
                <button type="submit" disabled={code.replace("@", "").length < 3 || busy === "add" || !me.user} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-30">
                  Ask
                </button>
              </form>
              {note && (
                <p className="mt-3 text-sm text-ink-2" role="status">
                  {note}
                </p>
              )}
              {sent.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2">
                  {sent.map((r) => (
                    <li key={r.pc} id={`fr-${r.pc}`} className="flex items-center justify-between gap-3 text-sm text-ink-2">
                      <span className="min-w-0 truncate">
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#d875ff] align-middle shadow-[0_0_8px_#d875ff]" />
                        {who(r)} · forming
                      </span>
                      <button type="button" disabled={busy !== null} onClick={() => void run(`rq${r.pc}`, { op: "drop-request", pc: r.pc })} className={`${mono} text-ink-3 hover:text-ink`}>
                        Withdraw
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className={`${glass} p-2`}>
            <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
              <p className={`${mono} text-ink-3`}>
                Your stars <span className="text-ink-2">· {d.friends?.length ?? 0}</span>
              </p>
              {d.dustOn && d.dust !== null && <p className="font-mono text-xs tabular-nums text-ink-2">{d.dust} dust</p>}
            </div>
            {!d.friends?.length ? (
              <p className="px-4 pb-5 pt-2 text-sm text-ink-2">No one yet. Send your invite or share a card; every friend you add is born in the sky above.</p>
            ) : (
              <ul className="flex flex-col">
                {d.friends.map((f) => {
                  const lvl = levelOf(f.days ?? 0);
                  const tint = SKY_TINT[lvl];
                  const bd = bond(f.days ?? 0);
                  return (
                    <li key={f.pc} id={`fr-${f.pc}`} className="group rounded-2xl px-3 py-3 transition hover:bg-white/[0.03]">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Avatar f={f} tint={tint} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2">
                            <span className="truncate font-serif text-[19px] italic leading-tight">{who(f)}</span>
                            <Presence seen={f.seen} />
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-ink-3">
                            <span style={{ color: tint }}>{lvl}</span> · {f.days ?? 0}d fought{f.cards !== undefined ? ` · ${f.cards} card${f.cards === 1 ? "" : "s"}` : ""}
                          </p>
                          <span className="mt-1.5 block h-[2px] w-full max-w-[9rem] overflow-hidden rounded-full bg-white/[0.07]" title={bd.next ? `${bd.left} more day${bd.left === 1 ? "" : "s"} to ${bd.next}` : "As close as it gets"}>
                            <span className="block h-full rounded-full" style={{ width: `${bd.pct * 100}%`, background: tint, boxShadow: `0 0 6px ${tint}` }} />
                          </span>
                        </div>
                        <div className="flex w-full shrink-0 items-center gap-1.5 pl-[52px] sm:w-auto sm:pl-0">
                          {me.card && f.card ? (
                            fighting.has(f.pc) ? (
                              <span className="inline-flex items-center rounded-full border border-accent/30 px-3 py-1">
                                <Countdown ends={live.get(f.pc) ?? 0} bar={false} />
                              </span>
                            ) : (
                              <button type="button" disabled={busy !== null} onClick={() => void challenge(f.pc, 0)} className={lime}>
                                Fight
                              </button>
                            )
                          ) : null}
                          {d.dustOn && me.card && f.card && (
                            <button type="button" onClick={() => setBetFor(betFor === f.pc ? null : f.pc)} aria-pressed={betFor === f.pc} className={pill}>
                              Bet
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Remove ${who(f)}`}
                            onClick={() => confirm(`Remove ${who(f)} from your friends?`) && void run(`rm${f.pc}`, { op: "remove", pc: f.pc })}
                            className="ml-auto px-1.5 text-lg leading-none text-ink-3 transition hover:text-ink sm:ml-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {!(me.card && f.card) && <p className="mt-2 pl-[52px] text-xs text-ink-3">{me.card ? "No card yet. This updates the moment they mint." : "Mint a card to fight."}</p>}
                      {betFor === f.pc && (
                        <div className="mt-3 ml-[52px] rounded-xl bg-paper/70 p-3">
                          <p className="text-xs text-ink-2">Blind draw: one random card from each deck. Winner gets their stake back plus yours, up to their weekly Stardust cap; a tie refunds. One bet per friend a day. They have to accept.</p>
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
                  );
                })}
              </ul>
            )}
          </section>

          {(fights.length > 0 || skipped > 0) && (
            <section className={`${glass} p-5`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={`${mono} text-ink-3`}>Fight log</p>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em]">
                  <span className="text-accent">{record.won}W</span> <span className="text-ink-2">{record.lost}L</span> <span className="text-ink-3">{record.tied}T</span>
                </p>
              </div>
              {/* Form strip: the last fights as one line of chips, newest on the right, each a replay. */}
              <div className="mt-3 flex items-center gap-1 overflow-hidden" aria-label="Recent form">
                {fights
                  .slice(0, 24)
                  .reverse()
                  .map((b) => {
                    const c = `h-5 w-2.5 shrink-0 rounded-[3px] ${b.outcome === "won" ? "bg-accent shadow-[0_0_8px_rgba(198,255,61,0.5)]" : b.outcome === "lost" ? "bg-white/[0.14]" : "border border-line"}`;
                    const t = `${b.outcome} vs ${who(b)}`;
                    return b.a && b.b ? <Link key={b.id} href={`/vs/${b.a}?vs=${b.b}`} title={t} className={`${c} transition hover:scale-y-125`} /> : <span key={b.id} title={t} className={c} />;
                  })}
                {streak.n > 1 && <span className={`${mono} ml-2 shrink-0 text-ink-3`}>{streak.n} {streak.w === "won" ? "wins" : streak.w === "lost" ? "losses" : "ties"} in a row</span>}
              </div>
              {/* Head to head: one line per rival, so the log stays short however many fights pile up. */}
              {rivals.length > 1 && (
                <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {rivals.map((r) => (
                    <span key={r.pc} className="shrink-0 rounded-full border border-white/[0.08] px-2.5 py-1 font-mono text-[10.5px] tabular-nums text-ink-2">
                      {r.name} <span className="text-accent">{r.w}</span>–{r.l}
                    </span>
                  ))}
                </div>
              )}
              <ul className={`mt-3 flex flex-col gap-1.5 ${logAll ? "max-h-[22rem] overflow-y-auto pr-1 [scrollbar-width:thin]" : ""}`}>
                {fights.slice(0, logAll ? fights.length : 3).map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5 text-sm">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold ${b.outcome === "won" ? "bg-accent text-paper" : b.outcome === "lost" ? "bg-white/[0.06] text-ink-2" : "border border-line text-ink-3"}`}
                    >
                      {b.outcome === "won" ? "W" : b.outcome === "lost" ? "L" : "T"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      vs <span className="text-ink">{who(b)}</span>
                      {b.stake ? <span className={`ml-2 font-mono text-xs ${b.outcome === "won" ? "text-accent" : "text-ink-3"}`}>{b.outcome === "won" ? `+${b.stake}` : b.outcome === "lost" ? `−${b.stake}` : "±0"}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {b.a && b.b && (
                        <Link href={`/vs/${b.a}?vs=${b.b}`} className={`${mono} text-ink-3 transition hover:text-ink`}>
                          Replay
                        </Link>
                      )}
                      {friendPcs.has(b.pc) && (
                        <button type="button" disabled={busy !== null || (b.stake > 0 && (d.dust ?? 0) < b.stake)} onClick={() => void challenge(b.pc, b.stake)} className={`${mono} text-accent hover:underline disabled:opacity-40`}>
                          Rematch
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {fights.length > 3 && (
                <button type="button" onClick={() => setLogAll((v) => !v)} className={`${mono} mt-2 text-ink-3 transition hover:text-ink`}>
                  {logAll ? "Show less" : `All ${fights.length} fights`}
                </button>
              )}
              {skipped > 0 && <p className="mt-3 text-xs text-ink-3">{skipped} challenge{skipped === 1 ? "" : "s"} declined or cancelled</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Their account photo, or their initial, ringed in the colour of how close you are. */
function Avatar({ f, tint }: { f: Friend; tint: string }) {
  return (
    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-[1.5px]" style={{ borderColor: tint, boxShadow: `0 0 14px -4px ${tint}` }}>
      {f.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${f.img}?width=80`} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-paper font-serif text-lg italic" style={{ color: tint }}>
          {who(f).replace(/^@/, "").slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/** Online now (heartbeat within 2.5 min), or when they were last around. */
function Presence({ seen }: { seen?: number }) {
  const ago = seen ? Date.now() - seen : Infinity;
  if (ago < 150_000)
    return (
      <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-good">
        <span className="h-1.5 w-1.5 rounded-full bg-good shadow-[0_0_8px_var(--good)]" />
        Online
      </span>
    );
  const t = !seen ? null : ago < 3_600_000 ? `${Math.round(ago / 60_000)}m` : ago < 86_400_000 ? `${Math.round(ago / 3_600_000)}h` : `${Math.round(ago / 86_400_000)}d`;
  return t ? <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3" title={`Seen ${t} ago`}>{t}</span> : null;
}
