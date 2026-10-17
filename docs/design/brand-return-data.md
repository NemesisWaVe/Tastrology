# Brand return: data side

## What exists today
- Full reading = `StyleResult` (lib/types.ts): seeds, brands (`BrandMatch`: entity, affinity, category, `explain`, `ablation`, `because`, `why`), `rejected` (voids), dna, critique. Receipt and Brands need exactly this.
- Persisted: `CardData` only (lib/card.ts; twin in S3 `twins/v1/<code>.json`, DynamoDB `CARD#<code>/META`, Upstash `tm:twin:`; 180 d, write-once, burn tombstones). `buildCard` keeps top-3 moves, stars, evolvesFrom (names/kinds/images) but no brand ids, images, links or voids.
- Deck (lib/deck.ts, DynamoDB) holds the same CardData. Full result lives only in the browser (lib/saved.ts `trimResult`, ~few KB) and the server run cache. Qloo responses are capped at 6 h (`MAX_TTL_MS`), so older runs are gone server-side.
- Rule: no Qloo data in git; NOTES says Qloo terms forbid charging for access. Prudent reading: do not archive raw Qloo responses; keep a small derived summary with a TTL and refresh from Qloo for anything shown long-term.

## 1. Receipt snapshot (`ReceiptSnap`)
Derived, trimmed record per code:
```
{ v:1, code, at, loves:[{id,name,kind}],
  brands:[{id,name,img,cat,aff,site?,side?,because:[id],explain:{id:0-1},abl:{id:pts},why?}] (max 8),
  voids:[{id,name,aff,reason}] (max 6), tagline }
```
Whole-number scores, explain/abl keep top 3 drivers per brand, `why` cut to 160 chars. About 3-4 KB; cap 12 KB.
- Store: S3 `receipts/v1/<code>.json`, `PutIfAbsent` beside the twin, written in `registerTwin` from the same `StyleResult`. DynamoDB META gets a `receipt` string only as fallback (400 KB item limit is safe). No Upstash copy.
- TTL: 90 d "fresh" window. S3 lifecycle rule expires at 180 d (match the twin). Burn also deletes it (`purgeTwin`). Image URLs are stored as Qloo URLs and served via the existing `/api/img` proxy, never copied.
- Same code = same loves = same receipt, so write-once is correct; collected/claimed cards read the minter's snapshot.
- Backfill of old cards: (a) none server-side after 6 h, so (b) the minter's browser still has the full result in localStorage: on deck load, a client POSTs it to `/api/card/<code>/receipt` once; the server rebuilds the code via `buildCard`+`cardCode` and rejects mismatches (as twins do), trims and stores. (c) otherwise state `faded`: show the card's own loves and a "Re-read brands" action (re-run brand step only, 1 agent run, existing rate limit). Rendering never blocks on any of this.

## 2. Endpoints
- `GET /api/card/<code>/receipt` returns `{status:"fresh"|"stale"|"faded"|"burned", snap?, drift?}`. Public like the twin (the share page needs it; it holds nothing private). Reuse `TWIN_CODE`, burn check, and 404/410 handling. Headers: `s-maxage=3600, stale-while-revalidate=86400` for found; `no-store` for `error`; short for `faded`.
- `POST /api/card/<code>/receipt` accepts a client-held result for backfill; auth: same device or user as the deck item, 1/code/day, 30/h/IP via lib/ratelimit.ts.
- `POST /api/card/<code>/click` for click-outs (below).
- Deck GET stays light: add `hasReceipt` boolean only; the UI fetches the receipt when a card opens.

## 3. Brand drift (recommended, bounded)
Taste is fixed; Qloo's brand ranking moves. On open, if the snapshot is older than 7 days, the receipt endpoint refreshes brands only: one insights call per card (same seed signals, top 8, no ablation or LLM), cached as Upstash `tm:drift:<code>` for 7 d. Returns `drift:{asOf, entered:[brand], left:[brand], moved:[{id,delta}]}`; explain lines for new entries use the one call's explainability (ablation shown only when the stored value exists). Cost: <=1 Qloo call per card per week; at 500 active cards that is about 70 calls/day. Global guard: Upstash counter `tm:driftday:<date>` max 200; over it, serve the stale snapshot. Make it opt-in on revisit of owned cards, and never refresh burned cards. Snapshot itself is not overwritten, so the receipt stays honest ("as minted" vs "this week").

## 4. Analytics (Upstash, free tier safe)
`/api/card/<code>/click` body `{brand}` (brand id must exist in the snapshot, else ignored). Pipeline INCR: `tm:ck:total`, `tm:ck:d:<yyyymmdd>`, `tm:ck:brand:<id>` (ZINCRBY set `tm:ck:brands`), `tm:ck:card:<code>`, plus `tm:ck:src:<deck|share|receipt>`. No user ids or IPs. 3 commands per click; dedupe by one SET NX per device+brand per hour. Also count `tm:rv:<yyyymmdd>` for receipt opens and `tm:rv:ret` for opens of cards older than 1 day (return rate). Expose in the existing stats route.

## 5. Change list (before Oct 30 unless noted)
1. lib/receipt.ts (new): `ReceiptSnap`, `snapFrom(result)`, `getReceipt`, `putReceipt`. MUST
2. lib/s3.ts, lib/twins.ts: write snapshot in `registerTwin`; delete in `purgeTwin`. MUST
3. lib/types.ts or lib/card.ts: pass result into registerTwin callers (app/api/agent/route.ts, battle). MUST
4. app/api/card/[code]/receipt/route.ts: GET and backfill POST. MUST
5. components/card/Receipt.tsx, results/Brands.tsx: accept `ReceiptSnap` via an adapter to the current props; faded state. MUST
6. app/deck/page.tsx, lib/deck.ts: fetch on open, one-time backfill from localStorage. MUST
7. app/api/card/[code]/click/route.ts + stats counters. MUST (evidence for judges)
8. Drift refresh + guard counter. SHOULD
9. S3 lifecycle rule (console, $0). SHOULD
