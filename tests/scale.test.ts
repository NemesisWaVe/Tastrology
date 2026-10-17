import { afterEach, describe, expect, it } from "vitest";
import { ddbRequest, marshal, unmarshal } from "@/lib/ddb";
import { deviceId, newDevice } from "@/lib/device";
import { hasHumanCookie, humanCookie } from "@/lib/human";
import { isPersonaRequest, PERSONAS, personaRequest } from "@/lib/personas";
import { acquireSlot } from "@/lib/ratelimit";
import { EMPTY_SHA256 } from "@/lib/s3";
import { signV4 } from "@/lib/sigv4";
import { percentileBelow } from "@/lib/stats";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});
const cookieHeaders = (setCookie: string) => new Headers({ cookie: setCookie.split(";")[0] });

describe("generic SigV4 signer", () => {
  it("matches AWS's published S3 GET Object example", () => {
    const h = signV4(
      {
        service: "s3",
        region: "us-east-1",
        host: "examplebucket.s3.amazonaws.com",
        method: "GET",
        path: "/test.txt",
        headers: { Range: "bytes=0-9", "x-amz-content-sha256": EMPTY_SHA256 },
        payloadHash: EMPTY_SHA256,
        amzDate: "20130524T000000Z",
      },
      { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" },
    );
    expect(h.authorization).toContain("Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    expect(h).not.toHaveProperty("host");
  });

  it("signs DynamoDB calls with the JSON target header", () => {
    const r = ddbRequest({ table: "t", region: "us-east-1", accessKeyId: "AK", secretAccessKey: "SK" }, "GetItem", { TableName: "t" }, "20261017T000000Z");
    expect(r.url).toBe("https://dynamodb.us-east-1.amazonaws.com/");
    expect(r.headers["x-amz-target"]).toBe("DynamoDB_20120810.GetItem");
    expect(r.headers.authorization).toMatch(/Credential=AK\/20261017\/us-east-1\/dynamodb\/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-target,/);
  });
});

describe("DynamoDB marshalling", () => {
  it("round-trips flat items", () => {
    const item = { PK: "CARD#1234-ABCD", SK: "META", rarityScore: 61.5, card: "{}" };
    expect(marshal(item)).toEqual({ PK: { S: "CARD#1234-ABCD" }, SK: { S: "META" }, rarityScore: { N: "61.5" }, card: { S: "{}" } });
    expect(unmarshal(marshal(item))).toEqual(item);
  });
});

describe("device cookie", () => {
  it("is off without a long enough secret", () => {
    delete process.env.DECK_SECRET;
    delete process.env.RL_SALT;
    expect(deviceId(new Headers({ cookie: "tm_d=x.y" }))).toBeNull();
  });

  it("round-trips and rejects tampering", () => {
    process.env.DECK_SECRET = "a-test-secret-of-some-length";
    const { id, cookie } = newDevice();
    expect(deviceId(cookieHeaders(cookie))).toBe(id);
    const forged = cookie.replace(id, "00000000-0000-0000-0000-000000000000");
    expect(deviceId(cookieHeaders(forged))).toBeNull();
    process.env.DECK_SECRET = "another-secret-of-some-length";
    expect(deviceId(cookieHeaders(cookie))).toBeNull();
  });
});

describe("human cookie (after a Turnstile pass)", () => {
  it("verifies only our own signature", () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const c = humanCookie();
    expect(hasHumanCookie(cookieHeaders(c))).toBe(true);
    expect(hasHumanCookie(cookieHeaders(c.replace(/\.[^.;]+;/, ".AAAA;")))).toBe(false);
    expect(hasHumanCookie(new Headers())).toBe(false);
  });
});

describe("global run slots (memory fallback)", () => {
  it("hands out at most `max` slots and frees them on release", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    const a = await acquireSlot("test-slots", 2, 10_000);
    const b = await acquireSlot("test-slots", 2, 10_000);
    expect(a && b).toBeTruthy();
    expect(await acquireSlot("test-slots", 2, 10_000)).toBeNull();
    await a!();
    await a!(); // releasing twice frees one slot, not two
    const c = await acquireSlot("test-slots", 2, 10_000);
    expect(c).toBeTruthy();
    expect(await acquireSlot("test-slots", 2, 10_000)).toBeNull();
  });
});

describe("rarity percentile", () => {
  it("stays silent below the minimum and counts strictly-below otherwise", () => {
    const hist = Array<number>(101).fill(0);
    hist[40] = 150;
    hist[70] = 49;
    expect(percentileBelow(hist, 70)).toBeNull();
    hist[90] = 1;
    expect(percentileBelow(hist, 70)).toBeCloseTo(0.75);
    expect(percentileBelow(hist, 95)).toBeCloseTo(1);
  });
});

describe("demo personas stay out of decks", () => {
  it("recognises persona requests, not real picks", () => {
    const p = personaRequest(PERSONAS[0]);
    expect(isPersonaRequest(p)).toBe(true);
    expect(isPersonaRequest({ ...p, seeds: p.seeds.map((s, i) => ({ ...s, id: `id-${i}` })) })).toBe(false);
    expect(isPersonaRequest({ seeds: [{ name: "Daft Punk", kind: "artist" }, { name: "Dune", kind: "movie" }] })).toBe(false);
  });
});
