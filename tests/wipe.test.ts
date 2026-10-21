import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimDevice } from "@/lib/claim";
import { ddbGet, ddbPutIfAbsent } from "@/lib/ddb";
import { wipeAccount } from "@/lib/wipe";
import { POST as webhookPOST } from "@/app/api/clerk-webhook/route";
import { FakeDynamo, useFakeDynamo } from "./fakeDynamo";

let db: FakeDynamo;
const keys = () => [...db.items.keys()];

/** A card in someone's deck, plus the card-level rows a minted card picks up over its life. */
async function card(owner: string, code: string, row: Record<string, string | number>) {
  await ddbPutIfAbsent({ PK: `OWNER#${owner}`, SK: `CARD#${code}`, code, card: "{}", rarityScore: 50, addedAt: 1, ...row });
  await ddbPutIfAbsent({ PK: `CARD#${code}`, SK: "META", card: "{}" });
  await ddbPutIfAbsent({ PK: `CARD#${code}`, SK: "RECAST#fashion", json: "{}", by: owner });
  await ddbPutIfAbsent({ PK: `POOL#rare`, SK: `CARD#${code}`, code });
  await ddbPutIfAbsent({ PK: `CARDPC#${code}`, SK: "META", pc: "PC1" });
}

beforeEach(() => {
  db = useFakeDynamo();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("wipeAccount", () => {
  it("erases the account, its minted cards and claimed devices, and keeps collected cards", async () => {
    await card("user_a", "1111-AAAA", { minted: 1, source: "mint" });
    await card("other", "2222-BBBB", { minted: 1, source: "mint" });
    // user_a collected other's card
    await ddbPutIfAbsent({ PK: "OWNER#user_a", SK: "CARD#2222-BBBB", code: "2222-BBBB", card: "{}", minted: 0, source: "collect" });
    // a fight between the two cards stamped both passports
    await ddbPutIfAbsent({ PK: "STAMPS#1111-AAAA", SK: "VS#2222-BBBB", code: "2222-BBBB", name: "B", outcome: "won", at: 1 });
    await ddbPutIfAbsent({ PK: "STAMPS#2222-BBBB", SK: "VS#1111-AAAA", code: "1111-AAAA", name: "A", outcome: "lost", at: 1 });
    await ddbPutIfAbsent({ PK: "STAMPS#2222-BBBB", SK: "TALLY", lost: 1 });
    await ddbPutIfAbsent({ PK: "USER#user_a", SK: "WALLET", dust: 40 });
    // a device mint, then the device claimed into the account
    await card("dev1", "3333-CCCC", { minted: 1, source: "mint" });
    expect(await claimDevice("user_a", "dev1")).toMatchObject({ ok: true });

    expect(await wipeAccount("user_a")).toBe(true);

    const left = keys();
    for (const pk of ["USER#user_a|", "OWNER#user_a|", "OWNER#dev1|", "DEVICE#dev1|", "CARD#1111-AAAA|", "CARD#3333-CCCC|", "STAMPS#1111-AAAA|", "CARDPC#1111-AAAA|"])
      expect(left.filter((k) => k.startsWith(pk))).toEqual([]);
    expect(left).not.toContain("POOL#rare|CARD#1111-AAAA");
    expect(left).not.toContain("STAMPS#2222-BBBB|VS#1111-AAAA");
    // someone else's card survives, with its own tally
    expect(await ddbGet("CARD#2222-BBBB", "META")).not.toBeNull();
    expect(left).toContain("POOL#rare|CARD#2222-BBBB");
    expect(left).toContain("STAMPS#2222-BBBB|TALLY");
    expect(left).toContain("OWNER#other|CARD#2222-BBBB");
    // nothing anywhere still names the user
    expect(JSON.stringify([...db.items.values()])).not.toContain("user_a");
  });

  it("is idempotent", async () => {
    await card("user_b", "4444-DDDD", { minted: 1, source: "mint" });
    expect(await wipeAccount("user_b")).toBe(true);
    expect(await wipeAccount("user_b")).toBe(true);
  });
});

describe("Clerk webhook", () => {
  const secret = `whsec_${Buffer.from("test-secret-key-0123456789").toString("base64")}`;
  const signed = (body: string, opts: { ts?: number; key?: string } = {}) => {
    const id = "msg_1";
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    const key = Buffer.from((opts.key ?? secret).replace(/^whsec_/, ""), "base64");
    const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
    return new Request("http://x/api/clerk-webhook", { method: "POST", body, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } });
  };

  it("wipes the user on a signed user.deleted", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", secret);
    await card("user_c", "5555-EEEE", { minted: 1, source: "mint" });
    const res = await webhookPOST(signed(JSON.stringify({ type: "user.deleted", data: { id: "user_c" } })));
    expect(res.status).toBe(200);
    expect(keys().filter((k) => k.startsWith("CARD#5555-EEEE") || k.startsWith("OWNER#user_c"))).toEqual([]);
  });

  it("rejects a bad or stale signature and ignores other events", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", secret);
    await card("user_d", "6666-FFFF", { minted: 1, source: "mint" });
    const body = JSON.stringify({ type: "user.deleted", data: { id: "user_d" } });
    expect((await webhookPOST(signed(body, { key: `whsec_${Buffer.from("wrong").toString("base64")}` }))).status).toBe(401);
    expect((await webhookPOST(signed(body, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect((await webhookPOST(signed(JSON.stringify({ type: "user.created", data: { id: "user_d" } })))).status).toBe(200);
    expect(await ddbGet("CARD#6666-FFFF", "META")).not.toBeNull();
  });

  it("is off without a secret", async () => {
    expect((await webhookPOST(signed("{}"))).status).toBe(404);
  });
});
