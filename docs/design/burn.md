# Burn to dust (design, 2026-10-17; built 2026-10-17)

Approved and built. Fits the lawyer's "Burn rewards (2026-10-17)" verdict. Same loves give the same code (`cardCode`).

## 1. The ritual

On `/deck`, under each card you minted yourself (signed-in accounts only; with Clerk off the feature doesn't exist).

1. **Arm.** A mono "Burn to dust" link opens one plain line in Instrument Serif italic ("Secret Rare · 60 dust · permanent", or "Permanent. Its share link stops working." when Stardust is off) and `components/card/BurnButton.tsx`: a pill whose lime (#c6ff3d) ring fills over 1.6 s. Releasing early rewinds it. Keyboard: hold Space or Enter. "Keep it" backs out.
2. **Heat.** While you hold, the card's edges char inward (radial mask), the foil runs hot (sepia, saturation) and a lime glow builds. On Android, `navigator.vibrate` ticks at 25/50/75 %.
3. **Crack, burn, pull** (`components/card/dissolve.ts`, canvas + DOM, no React state). 0–280 ms: glowing lime fractures split the foil from a random impact point while the card shudders and flashes. 280–900 ms: a hot edge sweeps the card bottom-up through a mask, spitting embers with short trails; about 1,000 motes in the card's type colours and `RARITY_GLOW` lift, curl and stream into the counter.
4. **Land.** `components/deck/DustCounter.tsx` (Bricolage numerals) pulses and springs up; a lime bloom fades where the card stood and a ring bursts off the counter. With Stardust off the motes drift up and fade.
5. **Sound.** Off by default; a "Burn sound" toggle in the deck header (remembered per browser). A crack, then a falling hiss: Web Audio noise through a closing low-pass. No asset files.
6. **Reduced motion:** no shudder, particles or sound; the card greys out in 250 ms and the counter just changes. The hold confirm stays.

## 2. Economy options

| | (a) No refund | (b) Stardust | (c) Credits back | (d) Cash-equivalent |
|---|---|---|---|---|
| Farm loop | None | A per-code marker blocks mint → burn → re-mint. There is no net gain while a burn is worth less than one reading | A whole credit for a Secret is a 1:1 refund, so a mint tuned to be rare pays for itself | Rarity isn't random: obscure loves reliably hit Secret. |
| Qloo/LLM cost | 0 | At most 0.6 of a reading per eligible mint, capped weekly | Up to one reading per mint, no cap | Cash, plus the runs it funds |
| Referral / Genesis | None | Kept as a separate balance. Referrals still give +1 reading. Genesis is per account, so burns don't touch it | Blurs into referral credits | Breaks "no cash value" (§11) |
| Legal | Clean | Clean if closed-loop and readings only | Counsel bars dust that converts into refundable credits | **Rejected by counsel**: it risks being a prohibited online money game under the Online Gaming Act 2025 |

Dropping credit-back entirely (a) is safe but gives burning no purpose. (b) adds one without ever repaying a full reading.

## 3. Decision: (b) Stardust (as built)

- **Rates** (`lib/stardust.ts`): Common 10 · Rare 20 · Holo Rare 35 · Secret Rare 60 for free-credit mints; a flat 10 for paid-credit mints (none exist in the beta). Dust-paid mints earn 0.
- **Price:** a reading costs 100 dust. The best burn returns 0.6 of a reading (Rule 1, enforced by a test).
- **Cap:** 150 dust earned per account per ISO week (UTC). Over-cap burns still go through and earn the remainder, then 0.
- **Gated by `CREDITS_ON=1`.** Off: burning is a pure ritual, earns nothing, and no copy mentions dust.
- **Closed loop:** dust is never converted into credits. When credits run out, `/api/agent` takes 100 dust for the reading instead (idempotent per run id, refunded if the run fails). It can't be bought, sold, transferred, gifted or refunded.
- **Published:** rates, the reading price and the closed-loop terms are on `/account` and in `/api/me`. Still to do: the Terms §10 wording from counsel, the tier split on `/shop`, and the 12-month inactivity expiry (`WALLET.dustAt` is recorded for it). Rate changes get 14 days' notice and never reduce dust already earned.

**Guardrails**
- Only the signed-in owner of a `minted:1` deck item can burn it (`404` not in your deck, `403` claimed/collected).
- Dust only if the mint spent a credit: the OWNER item carries `runId` + `funding` (written by `/api/agent`), and `LEDGER#run#<runId>` must exist. Admin, cached and dust-paid mints earn 0.
- Dust once per code, ever: if this account has a `BURN#<code>` or anyone left a `CARD#<code>/TOMBSTONE`, the burn earns 0.
- **Share link:** the burn writes the tombstone; `/api/card` and `/api/battle` answer **410** and `/c/<code>` and `/vs/<code>` show a "Burned. Only dust left." screen. The twin's S3, DynamoDB META, Upstash and fighter copies are purged. Other owners keep their embedded deck copy.
- **Re-mint decision: a fresh reading revives the link.** If anyone (the burner included) later gets the same code from a fresh, non-cached run, `registerTwin` sets `revived=1` and rewrites the twin, so the new owner's share link works. The tombstone item stays, so that card can never earn dust again. A cached replay doesn't revive anything.
- **CDN:** `/api/card` and `/api/battle` were cached immutable for a year; they now use `s-maxage=300` so a burn reaches every viewer within about 5 minutes. Tombstone lookups are memoized per instance for 60 s and fail open if DynamoDB can't answer.
- **Undo:** none. The 1.6 s hold plus the plain line is the confirm, with no guilt-trip copy.

## 4. Data model and API

| PK | SK | Attributes |
|---|---|---|
| OWNER#id | CARD#code | + runId, funding (free/paid/dust) on own mints |
| USER#id | BURN#code | code, tier, dust, n, firstAt, lastAt, lastDust, lastCapped, runId, funding (kept forever) |
| USER#id | DUSTWEEK#yyyy-Www | earned, ttl (+21 days) |
| USER#id | WALLET | + dust, dustAt |
| USER#id | LEDGER#burn#code | delta, unit:"dust", reason:"burn" (write-once) |
| USER#id | LEDGER#dust#runId / LEDGER#dustback#runId | ∓100 dust for a reading / its refund |
| CARD#code | TOMBSTONE | burnedAt, by:"burn", revived 0/1, revivedAt |

**`POST /api/deck/[code]/burn`** (`lib/burn.ts`) runs one `TransactWriteItems`:
1. Delete `OWNER#u/CARD#code`, on condition `minted = :one`.
2. Put `BURN#code` on not-exists (or, after a re-mint, update `n`, `lastAt`, `lastDust`).
3. If dust is due: update `DUSTWEEK` `ADD earned :d` on `attribute_not_exists(PK) OR earned <= :max`; `ADD dust` on `WALLET`; put `LEDGER#burn#code`.
4. Put `CARD#code/TOMBSTONE` on not-exists (or reset `revived=0` if it exists).

Any failed condition means someone moved first (a second tab, another burner, the cap), so it re-reads and rebuilds, up to 3 times. A retry after success finds the deck item gone and answers with the stored `BURN#` result, so it's idempotent without a token. Response: `{ status, dust, balance, tier, capped, reason, dustOn }`. `GET /api/deck` adds `burn {on, dustOn, dust, weekLeft}` and per-card `earns`; `GET /api/me` adds `burnOn` and `stardust {dust, weekLeft, rates}`.

**IAM:** the app's DynamoDB policy needs `dynamodb:DeleteItem` (deck item delete and META purge, also inside `TransactWriteItems`), and the S3 policy needs `s3:DeleteObject` on `twins/v1/*` and `fighters/v1/*`. Without them, the purge quietly fails but the tombstone still hides the card. A transaction with a Delete op fails without DeleteItem, so the burn itself needs it.

## 5. Copy

| Button | Confirm line | Toast |
|---|---|---|
| **Hold to burn** (shipped) | **Secret Rare · 60 dust · permanent** (shipped) | **Ash. +60 dust.** (shipped) |
| Burn it | Deletes this sign and its link. | Burned. +20 dust. |
| Turn to dust | Gone for good. Earns 35 dust. | +35 dust. The stars took it back. |
| Let it go | Hold until it's ash. | Dust settled. 90 / 150 this week. |
| Burn this sign | Its share link stops working. | Done. Nothing left but sparkle. |

Over the cap: "Weekly dust cap reached. This burn earns 0."
