import { clerkOn, clerkUsername, currentUserId, setClerkUsername } from "@/lib/auth";
import { ddbConfigured } from "@/lib/ddb";
import { acceptBout, acceptFriend, addFriend, BOUT_SK, chargeRename, closeBout, FREE_RENAMES, nameFree, normUser, renameFee, RENAME_DUST, type Player, dropRequest, alerts, ensurePlayer, inboxCount, markSeen, indexCards, playerForCard, listBouts, listFriends, listRequests, lookupPlayer, lookupUser, openBout, setUsername, PLAYER_CODE, removeFriend, setFighter, STAKES } from "@/lib/friends";
import { allow } from "@/lib/ratelimit";
import { dustOn, dustStatus } from "@/lib/stardust";
import { TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

/**
 * GET              your code, fighter, friends, bouts and dust
 * GET ?pc=XXXXXX   the public face of a player code (invite page), no sign-in needed
 * GET ?whoami=1    just your player code (share links carry it)
 * GET ?ping=1      your change counter, for live updates (also your presence heartbeat)
 * GET ?alerts=1    open challenges to you and pending requests, for the site-wide alert
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const on = clerkOn() && ddbConfigured();
  const pc = q.get("pc")?.toUpperCase();
  if (pc) {
    const p = on ? await lookupPlayer(pc) : null;
    return p ? json({ player: { pc: p.pc, user: p.user, name: p.name, card: p.card, rarity: p.rarity } }) : json({ error: "unknown player" }, 404);
  }
  const card = q.get("card")?.toUpperCase();
  if (card) {
    const p = on && TWIN_CODE.test(card) ? await playerForCard(card) : null;
    return p ? json({ player: { pc: p.pc, user: p.user, name: p.name, card: p.card, rarity: p.rarity } }) : json({ error: "unknown card" }, 404);
  }
  if (!on) return json({ on: false });
  const uid = await currentUserId();
  if (!uid) return json({ on: true, signedIn: false });
  // Live updates: the page polls this one counter and reloads only when it moves.
  if (q.get("ping")) {
    const [n] = await Promise.all([inboxCount(uid), markSeen(uid)]);
    return json({ n });
  }
  if (q.get("alerts")) return json((await alerts(uid)) ?? { bouts: [], requests: 0 });
  const me0 = await ensurePlayer(uid);
  if (!me0) return json({ error: "Couldn't reach the server." }, 503);
  if (q.get("whoami")) return json({ on: true, signedIn: true, me: me0 });
  const me = await syncName(uid, me0);
  const dOn = dustOn();
  const [[inbox], friends, requests, bouts, ds] = await Promise.all([Promise.all([inboxCount(uid), indexCards(uid, me.pc)]), listFriends(uid), listRequests(uid), listBouts(uid), dOn ? dustStatus(uid).catch(() => null) : null]);
  return json({ on: true, signedIn: true, inbox, me, friends: friends ?? [], requests: requests ?? { incoming: [], sent: [] }, bouts: bouts ?? [], dustOn: dOn, dust: ds?.dust ?? null, stakes: STAKES, rename: { fee: renameFee(me), free: FREE_RENAMES, cost: RENAME_DUST } });
}

/**
 * Clerk holds the username people pick at sign-up; this table holds the copy friends look up. A first visit claims
 * the Clerk name here, an older name picked here is written back to Clerk, and a change made outside our rename flow
 * (which charges after the free one) is put back.
 */
async function syncName(uid: string, me: Player): Promise<Player> {
  const cu = await clerkUsername(uid);
  if (cu === undefined || cu === me.user) return me;
  if (cu && !me.user) {
    const r = await setUsername(uid, me, cu);
    return r.ok ? r.me : me;
  }
  if (me.user) await setClerkUsername(uid, me.user);
  return me;
}

type Body = { op?: string; pc?: string; card?: string; stake?: number; id?: string; user?: string };

export async function POST(request: Request) {
  if (!clerkOn() || !ddbConfigured()) return json({ error: "Friends aren't on." }, 404);
  const uid = await currentUserId();
  if (!uid) return json({ error: "Sign in first." }, 401);
  if (!(await allow(`friends:${uid}`, 60, 10 * 60 * 1000))) return json({ error: "Slow down a little." }, 429);
  const b = ((await request.json().catch(() => null)) ?? {}) as Body;
  const me = await ensurePlayer(uid);
  if (!me) return json({ error: "Couldn't reach the server." }, 503);
  const raw = String(b.pc ?? "").trim();
  let pc = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");

  switch (b.op) {
    case "username": {
      // Clerk first (it guards uniqueness across every account), then our copy; the fee is taken last, once it worked.
      const u = normUser(String(b.user ?? ""));
      const msg = { bad: "3 to 20 letters, numbers or _, and nothing rude.", taken: "That username is taken.", error: "Couldn't reach the server." } as const;
      if (u === me.user) return json({ ok: true, me });
      const fee = renameFee(me);
      if (fee) {
        if (!dustOn()) return json({ error: "You've used your one change." }, 400);
        if (((await dustStatus(uid).catch(() => null))?.dust ?? 0) < fee) return json({ error: `Changing again costs ${fee} Stardust.` }, 400);
      }
      const free = await nameFree(uid, u);
      if (free !== "ok") return json({ error: msg[free] }, free === "error" ? 503 : 400);
      const c = await setClerkUsername(uid, u);
      if (c === "taken") return json({ error: msg.taken }, 400);
      if (c === "error") return json({ error: msg.error }, 503);
      const r = await setUsername(uid, me, u);
      if (!r.ok) {
        if (c === "ok" && me.user) await setClerkUsername(uid, me.user);
        return json({ error: msg[r.why] }, r.why === "error" ? 503 : 400);
      }
      if (!me.user) return json({ ok: true, me: r.me });
      await chargeRename(uid, fee);
      return json({ ok: true, me: { ...r.me, renames: (me.renames ?? 0) + 1 } });
    }
    case "add": {
      if (!me.user) return json({ error: "Pick your username first." }, 400);
      // A player code, or an @username: codes are tried first, so "@" forces a name.
      const byCode = !raw.startsWith("@") && PLAYER_CODE.test(pc) ? await lookupPlayer(pc) : null;
      const found = byCode ?? (await lookupUser(raw));
      if (!found) return json({ error: "No player with that code or username." }, 400);
      pc = found.pc;
      const r = await addFriend(uid, me, pc);
      const msg = { self: "That's your own code.", unknown: "No player with that code.", full: "Your friends list is full.", error: "Couldn't reach the server." } as const;
      return r in msg ? json({ error: msg[r as keyof typeof msg] }, r === "error" ? 503 : 400) : json({ ok: true, status: r });
    }
    case "accept-friend": {
      const r = await acceptFriend(uid, me, pc);
      const msg = { unknown: "That request is gone.", full: "Your friends list is full.", error: "Couldn't reach the server." } as const;
      return r in msg ? json({ error: msg[r as keyof typeof msg] }, r === "error" ? 503 : 400) : json({ ok: true, status: r });
    }
    case "drop-request":
      return (await dropRequest(uid, me, pc)) ? json({ ok: true }) : json({ error: "Couldn't reach the server." }, 503);
    case "remove":
      return (await removeFriend(uid, me, pc)) ? json({ ok: true }) : json({ error: "Couldn't reach the server." }, 503);
    case "card": {
      const code = String(b.card ?? "").toUpperCase();
      if (!TWIN_CODE.test(code)) return json({ error: "bad card" }, 400);
      const p = await setFighter(uid, me, code);
      return p ? json({ ok: true, me: p }) : json({ error: "You can fight only with cards you minted." }, 400);
    }
    case "challenge": {
      if (!me.user) return json({ error: "Pick your username first." }, 400);
      const stake = Number(b.stake) || 0;
      if (stake && !dustOn()) return json({ error: "Stardust is off." }, 404);
      const r = await openBout(uid, me, pc, stake);
      const msg = { "friends-only": "You can only challenge friends.", stake: "Pick a stake.", empty: "Not enough Stardust.", daily: "That's today's five bouts. More tomorrow.", error: "Couldn't reach the server." } as const;
      return r === "open" ? json({ ok: true }) : json({ error: msg[r] }, r === "error" ? 503 : 400);
    }
    case "accept":
    case "decline": {
      const id = String(b.id ?? "");
      if (!BOUT_SK.test(id)) return json({ error: "bad bout" }, 400);
      if (b.op === "decline") {
        const r = await closeBout(uid, id);
        return r === "error" ? json({ error: "Couldn't reach the server." }, 503) : json({ ok: true, status: r });
      }
      const r = await acceptBout(uid, me, id);
      if (r.ok) return json({ ok: true, a: r.a, b: r.b, outcome: r.outcome });
      const msg = { gone: "That bout is already settled.", empty: "You need the stake in Stardust to accept.", "no-cards": "One of you has no card that can fight.", error: "Couldn't reach the server." } as const;
      return json({ error: msg[r.why] }, r.why === "error" ? 503 : 400);
    }
  }
  return json({ error: "unknown op" }, 400);
}
