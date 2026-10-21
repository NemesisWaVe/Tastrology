import { clerkImage, clerkOn, clerkUserGone, clerkUsername, currentUserId, setClerkUsername } from "@/lib/auth";
import { ddbConfigured } from "@/lib/ddb";
import { acceptBout, acceptFriend, addFriend, BOUT_SK, chargeRename, stampImage, refundRename, closeBout, GENDERS, setProfile, FREE_RENAMES, nameFree, normUser, renameFee, RENAME_DUST, type Player, dropRequest, alerts, ensurePlayer, inboxCount, markSeen, indexCards, playerForCard, listBouts, listFriends, listRequests, lookupPlayer, lookupUser, openBout, setUsername, PLAYER_CODE, removeFriend, setFighter, STAKES } from "@/lib/friends";
import { allow, clientId } from "@/lib/ratelimit";
import { dustOn, dustStatus } from "@/lib/stardust";
import { blocked } from "@/lib/guard";
import { cleanBio, tagline } from "@/lib/tagline";
import { TWIN_CODE } from "@/lib/twins";
import type { Audience } from "@/lib/types";
import { countEvent } from "@/lib/metrics";
import { after } from "next/server";
import { sweepGhosts } from "@/lib/wipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const json = (body: unknown, status = 200) => {
  if (status >= 500) console.warn(JSON.stringify({ evt: "friends_5xx", status, body, at: new Error().stack?.split(/\n/)[2]?.trim() }));
  return Response.json(body, { status, headers: NO_STORE });
};

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
  const card = q.get("card")?.toUpperCase();
  if ((pc || card) && !(await allow(`friends-look:${clientId(request.headers)}`, 120, 10 * 60 * 1000))) return json({ error: "slow down" }, 429);
  if (pc) {
    const p = on ? await lookupPlayer(pc) : null;
    return p ? json({ player: { pc: p.pc, user: p.user, name: p.name, card: p.card, rarity: p.rarity } }) : json({ error: "unknown player" }, 404);
  }
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
  // Over the limit: a 429, never an empty answer, so a waiting challenge isn't wiped from the bar.
  if (q.get("alerts") && !(await allow(`alerts:${uid}`, 200, 10 * 60 * 1000))) return json({ error: "slow down" }, 429);
  // `now` lets the page set its countdowns by the server's clock, not a phone's that may be minutes off.
  if (q.get("alerts")) return json({ ...((await alerts(uid)) ?? { bouts: [], requests: 0 }), now: Date.now() });
  const me0 = await ensurePlayer(uid);
  if (!me0) return json({ error: "Couldn't reach the server." }, 503);
  if (q.get("whoami")) return json({ on: true, signedIn: true, me: me0 });
  const me = await syncName(uid, me0);
  // Accounts deleted where our own close-account flow never saw it leave ghosts on lists: tidy them after answering.
  after(sweepGhosts(uid, clerkUserGone).catch(() => 0));
  const dOn = dustOn();
  const [[inbox], friends, requests, bouts, ds] = await Promise.all([Promise.all([inboxCount(uid), indexCards(uid, me.pc)]), listFriends(uid), listRequests(uid), listBouts(uid), dOn ? dustStatus(uid).catch(() => null) : null]);
  return json({ on: true, signedIn: true, now: Date.now(), inbox, me, friends: friends ?? [], requests: requests ?? { incoming: [], sent: [] }, bouts: bouts ?? [], dustOn: dOn, dust: ds?.dust ?? null, stakes: STAKES, rename: { fee: renameFee(me), free: FREE_RENAMES, cost: RENAME_DUST } });
}

/**
 * Clerk holds the username people pick at sign-up; this table holds the copy friends look up. A first visit claims
 * the Clerk name here, an older name picked here is written back to Clerk, and a change made outside our rename flow
 * (which charges after the free one) is put back.
 */
async function syncName(uid: string, me: Player): Promise<Player> {
  const cu = await clerkUsername(uid);
  const img = await clerkImage(uid);
  if (img !== undefined) await stampImage(uid, me, img).catch(() => {});
  if (cu === undefined || cu === me.user) return me;
  if (cu && !me.user) {
    const r = await setUsername(uid, me, cu);
    return r.ok ? r.me : me;
  }
  if (me.user) await setClerkUsername(uid, me.user);
  return me;
}

type Body = { op?: string; pc?: string; card?: string; stake?: number; id?: string; user?: string; gender?: string; bio?: string; terms?: boolean };

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
      // A rename is paid (and counted) before anything changes, so two at once can't both ride the free one, and
      // a failed change gives it back.
      const rename = Boolean(me.user);
      if (rename) {
        const paid = await chargeRename(uid, fee, me.renames ?? 0);
        if (paid === "empty") return json({ error: `Changing again costs ${fee} Stardust.` }, 400);
        if (paid === "raced") return json({ error: "Your name just changed. Reload and try again." }, 409);
        if (paid === "error") return json({ error: msg.error }, 503);
      }
      const undo = async () => {
        if (rename) await refundRename(uid, fee);
      };
      const c = await setClerkUsername(uid, u);
      if (c === "taken" || c === "error") {
        await undo();
        return c === "taken" ? json({ error: msg.taken }, 400) : json({ error: msg.error }, 503);
      }
      const r = await setUsername(uid, me, u);
      if (!r.ok) {
        if (c === "ok" && me.user) await setClerkUsername(uid, me.user);
        await undo();
        return json({ error: msg[r.why] }, r.why === "error" ? 503 : 400);
      }
      return json({ ok: true, me: rename ? { ...r.me, renames: (me.renames ?? 0) + 1 } : r.me });
    }
    case "profile": {
      // Gender only steers your own readings and is never shown to anyone; the bio becomes a short line friends see.
      const p: { gender?: Audience; bio?: string; tag?: string; terms?: number } = {};
      if (b.terms === true) p.terms = Date.now();
      if (b.gender !== undefined) {
        if (!GENDERS.includes(String(b.gender) as Audience)) return json({ error: "Pick one of the options." }, 400);
        p.gender = String(b.gender) as Audience;
      }
      if (b.bio !== undefined) {
        const bio = cleanBio(String(b.bio));
        if (bio && blocked(bio)) return json({ error: "Keep the bio friendly." }, 400);
        if (bio !== (me.bio ?? "")) {
          if (!(await allow(`bio:${uid}`, 8, 60 * 60 * 1000))) return json({ error: "That's a lot of bios. Try again in a bit." }, 429);
          p.bio = bio;
          p.tag = bio ? await tagline(bio) : "";
        }
      }
      if (!(await setProfile(uid, p))) return json({ error: "Couldn't reach the server." }, 503);
      return json({ ok: true, me: { ...me, ...p, terms: Boolean(me.terms || p.terms) } });
    }
    case "add": {
      if (!me.user) return json({ error: "Pick your username first." }, 400);
      // A player code, or an @username: codes are tried first, so "@" forces a name.
      const byCode = !raw.startsWith("@") && PLAYER_CODE.test(pc) ? await lookupPlayer(pc) : null;
      const found = byCode ?? (await lookupUser(raw));
      if (!found) return json({ error: "No player with that code or username." }, 400);
      pc = found.pc;
      const r = await addFriend(uid, me, pc);
      if (r === "added") after(countEvent("friend_added"));
      const msg = { self: "That's your own code.", unknown: "No player with that code.", full: "Your friends list is full.", error: "Couldn't reach the server." } as const;
      return r in msg ? json({ error: msg[r as keyof typeof msg] }, r === "error" ? 503 : 400) : json({ ok: true, status: r });
    }
    case "accept-friend": {
      const r = await acceptFriend(uid, me, pc);
      if (!(r in { unknown: 1, full: 1, error: 1 })) after(countEvent("friend_added"));
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
      const msg = { "friends-only": "You can only challenge friends.", stake: "Pick a stake.", empty: "Not enough Stardust.", daily: "That's today's five bouts. More tomorrow.", already: "You've already challenged them. It's on once they accept.", theirs: "They've already challenged you. Accept it above.", error: "Couldn't reach the server." } as const;
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
      const msg = { gone: "That bout is already settled.", lapsed: "That challenge ran out of time. Send one back.", empty: "You need the stake in Stardust to accept.", "no-cards": "One of you has no card that can fight.", error: "Couldn't reach the server." } as const;
      return json({ error: msg[r.why] }, r.why === "error" ? 503 : 400);
    }
  }
  return json({ error: "unknown op" }, 400);
}
