import { sharedCache } from "@/lib/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RASTER_TYPES } from "@/app/api/img/allow";
import { buildCard, cardCode, type CardData } from "@/lib/card";
import { runAgent } from "@/lib/agent";
import { PERSONAS } from "@/lib/personas";
import { bumpDaily, clientId, clientIp, peekDaily } from "@/lib/ratelimit";
import { getTwin, registerTwin } from "@/lib/twins";

const h = (o: Record<string, string>) => new Headers(o);
afterEach(() => vi.unstubAllEnvs());

describe("clientIp / clientId", () => {
  it("trusts only x-real-ip on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIp(h({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-forwarded-for": "9.9.9.9" }))).toBe("local");
  });
  it("falls back to forwarded headers elsewhere", () => {
    vi.stubEnv("VERCEL", "");
    expect(clientIp(h({ "x-forwarded-for": "9.9.9.9, 1.1.1.1" }))).toBe("9.9.9.9");
  });
  it("groups IPv6 into its /64", () => {
    vi.stubEnv("VERCEL", "1");
    const a = clientIp(h({ "x-real-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" }));
    expect(a).toBe(clientIp(h({ "x-real-ip": "2001:DB8:1:2::1" })));
    expect(a).not.toBe(clientIp(h({ "x-real-ip": "2001:db8:1:3::1" })));
    expect(clientIp(h({ "x-real-ip": "::ffff:1.2.3.4" }))).toBe("1.2.3.4");
  });
  it("hashes with the salt to 16 hex", () => {
    vi.stubEnv("VERCEL", "1");
    const req = h({ "x-real-ip": "1.2.3.4" });
    const a = clientId(req);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    vi.stubEnv("RL_SALT", "pepper");
    expect(clientId(req)).not.toBe(a);
  });
});

describe("daily counter", () => {
  it("counts in memory without Upstash", async () => {
    const n = peekDaily("t-ctr");
    expect(await bumpDaily("t-ctr")).toBe(n + 1);
    expect(peekDaily("t-ctr")).toBe(n + 1);
  });
});

describe("twins + card code v2", () => {
  const live = async (i = 0) => {
    const p = PERSONAS[i];
    const r = await runAgent({ seeds: p.seeds.map((x) => ({ id: "", ...x })) }, () => {});
    return buildCard(r);
  };
  it("code keeps NNNN-XXXX and depends on moves and archetype", async () => {
    const c = await live();
    expect(cardCode(c)).toMatch(/^\d{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(cardCode({ ...c, archetype: c.archetype + "!" })).not.toBe(cardCode(c));
    expect(cardCode({ ...c, moves: c.moves.map((m) => ({ ...m, value: m.value + 1 })) })).not.toBe(cardCode(c));
  });
  it("registers and reads back; never throws without storage", async () => {
    const c = await live();
    const code = await registerTwin(c);
    expect(code).toBe(cardCode(c));
    expect(await getTwin(code)).toEqual(c);
    expect(await getTwin("0000-0000")).toBeNull();
    expect(await getTwin("nope")).toBeNull();
  });
  it("rejects a stored card whose fields don't match its code", async () => {
    const c = await live(1);
    const code = cardCode(c);
    sharedCache<string>("twins").set(code, JSON.stringify({ ...c, archetype: "Forged" }), 60_000);
    expect(await getTwin(code)).toBeNull();
  });
});

describe("/api/img types", () => {
  it("allows raster only", () => {
    expect(RASTER_TYPES).not.toContain("image/svg+xml");
    expect(RASTER_TYPES).toEqual(expect.arrayContaining(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]));
  });
});
