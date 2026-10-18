import { clerkOn, currentUserId } from "@/lib/auth";
import { ddbConfigured } from "@/lib/ddb";
import { acceptBout, addFriend, BOUT_SK, closeBout, ensurePlayer, listBouts, listFriends, lookupPlayer, openBout, PLAYER_CODE, removeFriend, setFighter, STAKES } from "@/lib/friends";
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
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const on = clerkOn() && ddbConfigured();
  const pc = q.get("pc")?.toUpperCase();
  if (pc) {
    const p = on ? await lookupPlayer(pc) : null;
    return p ? json({ player: { pc: p.pc, name: p.name, card: p.card, rarity: p.rarity } }) : json({ error: "unknown player" }, 404);
  }
  if (!on) return json({ on: false });
  const uid = await currentUserId();
  if (!uid) return json({ on: true, signedIn: false });
  const me = await ensurePlayer(uid);
  if (!me) return json({ error: "Couldn't reach the server." }, 503);
  if (q.get("whoami")) return json({ on: true, signedIn: true, me });
  const dOn = dustOn();
  const [friends, bouts, ds] = await Promise.all([listFriends(uid), dOn ? listBouts(uid) : [], dOn ? dustStatus(uid).catch(() => null) : null]);
  return json({ on: true, signedIn: true, me, friends: friends ?? [], bouts: bouts ?? [], dustOn: dOn, dust: ds?.dust ?? null, stakes: STAKES });
}

type Body = { op?: string; pc?: string; card?: string; stake?: number; id?: string };

export async function POST(request: Request) {
  if (!clerkOn() || !ddbConfigured()) return json({ error: "Friends aren't on." }, 404);
  const uid = await currentUserId();
  if (!uid) return json({ error: "Sign in first." }, 401);
  if (!(await allow(`friends:${uid}`, 60, 10 * 60 * 1000))) return json({ error: "Slow down a little." }, 429);
  const b = ((await request.json().catch(() => null)) ?? {}) as Body;
  const me = await ensurePlayer(uid);
  if (!me) return json({ error: "Couldn't reach the server." }, 503);
  const pc = String(b.pc ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

  switch (b.op) {
    case "add": {
      if (!PLAYER_CODE.test(pc)) return json({ error: "That code doesn't look right. It's 6 letters and numbers." }, 400);
      const r = await addFriend(uid, me, pc);
      const msg = { self: "That's your own code.", unknown: "No player with that code.", full: "Your friends list is full.", error: "Couldn't reach the server." } as const;
      return r === "added" || r === "exists" ? json({ ok: true, status: r }) : json({ error: msg[r] }, r === "error" ? 503 : 400);
    }
    case "remove":
      return (await removeFriend(uid, me, pc)) ? json({ ok: true }) : json({ error: "Couldn't reach the server." }, 503);
    case "card": {
      const code = String(b.card ?? "").toUpperCase();
      if (!TWIN_CODE.test(code)) return json({ error: "bad card" }, 400);
      const p = await setFighter(uid, me, code);
      return p ? json({ ok: true, me: p }) : json({ error: "You can fight only with cards you minted." }, 400);
    }
    case "challenge": {
      if (!dustOn()) return json({ error: "Stardust is off." }, 404);
      const r = await openBout(uid, me, pc, Number(b.stake));
      const msg = { "friends-only": "You can only challenge friends.", stake: "Pick a stake.", empty: "Not enough Stardust.", daily: "That's today's five bouts. More tomorrow.", error: "Couldn't reach the server." } as const;
      return r === "open" ? json({ ok: true }) : json({ error: msg[r] }, r === "error" ? 503 : 400);
    }
    case "accept":
    case "decline": {
      if (!dustOn()) return json({ error: "Stardust is off." }, 404);
      const id = String(b.id ?? "");
      if (!BOUT_SK.test(id)) return json({ error: "bad bout" }, 400);
      if (b.op === "decline") {
        const r = await closeBout(uid, id);
        return r === "error" ? json({ error: "Couldn't reach the server." }, 503) : json({ ok: true, status: r });
      }
      const r = await acceptBout(uid, id);
      if (r.ok) return json({ ok: true, a: r.a, b: r.b, outcome: r.outcome });
      const msg = { gone: "That bout is already settled.", empty: "You need the stake in Stardust to accept.", "no-cards": "One of you has no card that can fight.", error: "Couldn't reach the server." } as const;
      return json({ error: msg[r.why] }, r.why === "error" ? 503 : 400);
    }
  }
  return json({ error: "unknown op" }, 400);
}
