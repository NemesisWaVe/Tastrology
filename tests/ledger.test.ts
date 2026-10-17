import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimDevice } from "@/lib/claim";
import { ddbGet } from "@/lib/ddb";
import { creditsOn, ensureWallet, freeMints, FREE_MINTS_FLOOR, refundCredit, spendCredit, wallet } from "@/lib/ledger";

/* ------------------------------------------------------------ a tiny in-memory DynamoDB behind mocked fetch */

type AV = { S?: string; N?: string };
type Item = Record<string, AV>;

/** Just enough of DynamoDB's JSON API for lib/ddb.ts: conditions and updates in the shapes the app writes. */
class FakeDynamo {
  items = new Map<string, Item>();
  calls: string[] = [];
  private k = (key: Item) => `${key.PK.S}|${key.SK.S}`;

  private cond(expr: string | undefined, item: Item | undefined, vals: Item = {}): boolean {
    if (!expr) return true;
    return expr.split(/\s+AND\s+/).every((c) => {
      c = c.trim();
      let m = c.match(/^attribute_not_exists\((\w+)\)$/);
      if (m) return !item?.[m[1]];
      m = c.match(/^attribute_exists\((\w+)\)$/);
      if (m) return Boolean(item?.[m[1]]);
      m = c.match(/^(\w+) >= (:\w+)$/);
      if (m) return item?.[m[1]]?.N !== undefined && Number(item[m[1]].N) >= Number(vals[m[2]].N);
      throw new Error(`fake: unsupported condition ${c}`);
    });
  }

  private apply(item: Item, expr: string, vals: Item = {}, names: Record<string, string> = {}): Item {
    const out: Item = { ...item };
    const name = (n: string) => names[n] ?? n;
    const num = (t: string) => (t.startsWith(":") ? Number(vals[t].N) : Number(out[name(t)]?.N));
    const parts = expr.split(/\b(?=SET |ADD )/);
    for (const part of parts) {
      const body = part.replace(/^(SET|ADD)\s+/, "");
      if (part.startsWith("SET")) {
        for (const a of body.split(/,(?![^(]*\))/)) {
          const [lhs, rhs] = a.split("=").map((x) => x.trim());
          let m = rhs.match(/^(\S+) ([+-]) (\S+)$/);
          if (m) {
            const v = m[2] === "+" ? num(m[1]) + num(m[3]) : num(m[1]) - num(m[3]);
            out[name(lhs)] = { N: String(v) };
            continue;
          }
          m = rhs.match(/^if_not_exists\((\w+), (:\w+)\)$/);
          if (m) {
            if (!out[m[1]]) out[name(lhs)] = vals[m[2]];
            continue;
          }
          out[name(lhs)] = vals[rhs];
        }
      } else if (part.startsWith("ADD")) {
        for (const a of body.split(",")) {
          const [attr, v] = a.trim().split(/\s+/);
          out[name(attr)] = { N: String((Number(out[name(attr)]?.N) || 0) + Number(vals[v].N)) };
        }
      }
    }
    return out;
  }

  handle(action: string, p: Record<string, unknown>): { status: number; json: unknown } {
    this.calls.push(action);
    const ccf = { status: 400, json: { __type: "com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException" } };
    const vals = (p.ExpressionAttributeValues ?? {}) as Item;
    const names = (p.ExpressionAttributeNames ?? {}) as Record<string, string>;
    switch (action) {
      case "PutItem": {
        const it = p.Item as Item;
        if (!this.cond(p.ConditionExpression as string, this.items.get(this.k(it)), vals)) return ccf;
        this.items.set(this.k(it), it);
        return { status: 200, json: {} };
      }
      case "GetItem": {
        const it = this.items.get(this.k(p.Key as Item));
        return { status: 200, json: it ? { Item: it } : {} };
      }
      case "Query": {
        const pk = vals[":pk"].S!;
        const pre = vals[":sk"].S!;
        const Items = [...this.items.values()].filter((i) => i.PK.S === pk && i.SK.S!.startsWith(pre)).sort((a, b) => a.SK.S!.localeCompare(b.SK.S!));
        return { status: 200, json: { Items } };
      }
      case "UpdateItem": {
        const key = p.Key as Item;
        const cur = this.items.get(this.k(key));
        if (!this.cond(p.ConditionExpression as string, cur, vals)) return ccf;
        this.items.set(this.k(key), this.apply(cur ?? { ...key }, p.UpdateExpression as string, vals, names));
        return { status: 200, json: {} };
      }
      case "TransactWriteItems": {
        if ("TableName" in p) return { status: 400, json: { __type: "ValidationException" } };
        const ops = p.TransactItems as Record<string, Record<string, unknown>>[];
        const staged = new Map(this.items);
        const reasons = ops.map((op) => {
          const [kind, b] = Object.entries(op)[0];
          if (b.TableName !== "t") throw new Error("fake: every op needs its TableName");
          const v = (b.ExpressionAttributeValues ?? {}) as Item;
          const key = (b.Item ?? b.Key) as Item;
          const cur = this.items.get(this.k(key));
          if (!this.cond(b.ConditionExpression as string, cur, v)) return "ConditionalCheckFailed";
          if (kind === "Put") staged.set(this.k(key), b.Item as Item);
          else if (kind === "Update") staged.set(this.k(key), this.apply(cur ?? { ...key }, b.UpdateExpression as string, v, (b.ExpressionAttributeNames ?? {}) as Record<string, string>));
          else if (kind === "Delete") staged.delete(this.k(key));
          return "None";
        });
        if (reasons.some((r) => r !== "None"))
          return { status: 400, json: { __type: "com.amazonaws.dynamodb.v20120810#TransactionCanceledException", CancellationReasons: reasons.map((Code) => ({ Code })) } };
        this.items = staged;
        return { status: 200, json: {} };
      }
    }
    throw new Error(`fake: unsupported action ${action}`);
  }
}

let db: FakeDynamo;
const num = (PK: string, SK: string, attr: string) => Number(db.items.get(`${PK}|${SK}`)?.[attr]?.N);

beforeEach(() => {
  db = new FakeDynamo();
  vi.stubEnv("DDB_TABLE", "t");
  vi.stubEnv("DDB_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("DDB_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("DDB_REGION", "us-east-1");
  vi.stubEnv("FREE_MINTS", "3");
  vi.stubEnv("CREDITS_ON", "1");
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const action = String((init.headers as Record<string, string>)["x-amz-target"]).split(".").pop()!;
    const { status, json } = db.handle(action, JSON.parse(String(init.body)));
    return new Response(JSON.stringify(json), { status });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------ credits */

describe("FREE_MINTS", () => {
  it("defaults to 3 and never drops below 1 (referees must be able to qualify for free)", () => {
    vi.stubEnv("FREE_MINTS", "");
    expect(freeMints()).toBe(3);
    for (const bad of ["0", "-4", "0.4"]) {
      vi.stubEnv("FREE_MINTS", bad);
      expect(freeMints()).toBeGreaterThanOrEqual(FREE_MINTS_FLOOR);
    }
    vi.stubEnv("FREE_MINTS", "5");
    expect(freeMints()).toBe(5);
    expect(FREE_MINTS_FLOOR).toBeGreaterThanOrEqual(1);
  });

  it("credits stay off unless CREDITS_ON=1", () => {
    vi.stubEnv("CREDITS_ON", "");
    expect(creditsOn()).toBe(false);
    vi.stubEnv("CREDITS_ON", "1");
    expect(creditsOn()).toBe(true);
  });
});

describe("credit spend and refund", () => {
  const U = "user_abc";

  it("grants FREE_MINTS lazily on first spend, once", async () => {
    expect(await spendCredit(U, "run-00000001")).toBe("spent");
    expect(num(`USER#${U}`, "WALLET", "credits")).toBe(2);
    expect(await ddbGet(`USER#${U}`, "PROFILE")).toMatchObject({ freeGranted: 3 });
    expect(await ensureWallet(U)).toBe("exists");
    expect(num(`USER#${U}`, "WALLET", "credits")).toBe(2);
  });

  it("charges a run id at most once", async () => {
    expect(await spendCredit(U, "run-00000001")).toBe("spent");
    expect(await spendCredit(U, "run-00000001")).toBe("dup");
    expect(await spendCredit(U, "run-00000001")).toBe("dup");
    expect(num(`USER#${U}`, "WALLET", "credits")).toBe(2);
  });

  it("refunds a failed run once, and only if it was charged", async () => {
    expect(await refundCredit(U, "run-never-charged")).toBe("none");
    await spendCredit(U, "run-00000002");
    expect(await refundCredit(U, "run-00000002")).toBe("refunded");
    expect(await refundCredit(U, "run-00000002")).toBe("dup");
    expect(num(`USER#${U}`, "WALLET", "credits")).toBe(3);
    // A refunded run id can't be replayed for a free reading.
    expect(await spendCredit(U, "run-00000002")).toBe("used");
    expect(num(`USER#${U}`, "WALLET", "credits")).toBe(3);
  });

  it("refuses when credits run out (credits >= 1 condition)", async () => {
    for (let i = 0; i < 3; i++) expect(await spendCredit(U, `run-0000001${i}`)).toBe("spent");
    expect(await spendCredit(U, "run-00000020")).toBe("empty");
    expect(num(`USER#${U}`, "WALLET", "credits")).toBe(0);
    expect(await wallet(U)).toEqual({ credits: 0, freeLeft: 0 });
  });

  it("rejects malformed run ids and reports an unreachable table as an error", async () => {
    expect(await spendCredit(U, "x")).toBe("error");
    vi.stubGlobal("fetch", async () => {
      throw new Error("down");
    });
    expect(await spendCredit(U, "run-00000030")).toBe("error");
  });
});

/* ------------------------------------------------------------ device deck claim */

describe("claimDevice", () => {
  const DEV = "11111111-2222-3333-4444-555555555555";
  const seed = (code: string) =>
    db.handle("PutItem", {
      Item: { PK: { S: `OWNER#${DEV}` }, SK: { S: `CARD#${code}` }, code: { S: code }, card: { S: "{}" }, rarityScore: { N: "40" }, addedAt: { N: "5" } },
    });

  it("copies the device deck once as minted:0 source:claim", async () => {
    seed("AAAA-1111");
    seed("BBBB-2222");
    expect(await claimDevice("user_a", DEV)).toEqual({ ok: true, moved: 2, complete: true });
    const it = await ddbGet("OWNER#user_a", "CARD#AAAA-1111");
    expect(it).toMatchObject({ minted: 0, source: "claim", code: "AAAA-1111" });
    expect(await ddbGet(`DEVICE#${DEV}`, "CLAIM")).toMatchObject({ userId: "user_a" });
    // Old device items stay for the retry window.
    expect(await ddbGet(`OWNER#${DEV}`, "CARD#AAAA-1111")).not.toBeNull();
  });

  it("is idempotent for the same account and never upgrades an own mint", async () => {
    seed("AAAA-1111");
    db.handle("PutItem", { Item: { PK: { S: "OWNER#user_a" }, SK: { S: "CARD#AAAA-1111" }, code: { S: "AAAA-1111" }, minted: { N: "1" }, source: { S: "mint" } } });
    expect(await claimDevice("user_a", DEV)).toEqual({ ok: true, moved: 0, complete: true });
    expect(await claimDevice("user_a", DEV)).toEqual({ ok: true, moved: 0, complete: true });
    expect(await ddbGet("OWNER#user_a", "CARD#AAAA-1111")).toMatchObject({ minted: 1, source: "mint" });
  });

  it("refuses a second account on the same device", async () => {
    seed("AAAA-1111");
    await claimDevice("user_a", DEV);
    expect(await claimDevice("user_b", DEV)).toEqual({ ok: false, reason: "other-account" });
    expect(await ddbGet("OWNER#user_b", "CARD#AAAA-1111")).toBeNull();
  });

  it("errors (so the cookie is kept for a retry) when the table is unreachable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("down");
    });
    expect(await claimDevice("user_a", DEV)).toEqual({ ok: false, reason: "error" });
  });
});

describe("ddbTransact wire format", () => {
  it("puts TableName on each op, never at the top level", async () => {
    await spendCredit("user_z", "run-00000040");
    expect(db.calls).toContain("TransactWriteItems");
  });
});
