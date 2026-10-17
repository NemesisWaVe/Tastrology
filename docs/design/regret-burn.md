# Regret burns, dust packs, paid dust (design)

Goal: a mint you regret is not a trap, but no loop turns a burn into free readings. Builds on burn.md and identity-limits.md. Everything is behind `REGRET_BURN=1` (off by default, needs `CREDITS_ON=1`).

## 1. Regret burn rules
- Lifetime allowance: 2 per account (`PROFILE.regretUsed`, 0..2). A third is an ordinary burn.
- Qualifying card: your own `minted:1` item, funded `free` or `paid` (ledger `LEDGER#run#<runId>` exists), minted within 72 h, and it is your newest mint (`item.mintedAt == PROFILE.lastMintAt`). Dust-paid, cached, admin and old cards never qualify. No stacking: a card pays either normal burn dust or a regret refund, never both.
- Refund schedule: 1st = one **regret credit** (worth a reading, 100); 2nd = 50 Stardust; no 3rd. Both skip the weekly cap and are not counted in it, so a regret never competes with ordinary burn dust.
- Why a regret credit, not 100 dust: dust still cannot buy readings (`DUST_BUYS_READING` unchanged). The credit is `WALLET.regret` (0 or 1, never more), spendable only on a mint, expires after 30 days (`regretExp`).
- Refill clock: the regret re-mint does NOT stamp `lastMintAt`. The clock keeps running from the original mint, so regret neither delays nor accelerates the monthly refill. `spendCredit` takes the regret credit first, then a normal credit; `grantRefill` only looks at `credits`, so a pending regret credit does not block a refill.
- Rarity chasing: enforce, cheaply. The regret record stores `pickHash` (hash of the burned card's request key). A mint paid by the regret credit must have a different request key, else it is refused with "change at least one pick" before anything is spent (the same picks would return the identical card anyway, so this only saves the credit). Re-picking is allowed, but the allowance (2) is the real bound: a person can reroll at most twice, ever.

## 2. Data model (DynamoDB, same table)
- `USER#id / REGRET#<code>`: `tier, refund, kind(credit|dust), at, pickHash`; write-once (idempotency: a retry hits the condition and returns the prior result).
- `USER#id / PROFILE`: `regretUsed` (ADD, condition `attribute_not_exists(regretUsed) OR regretUsed < :max`).
- `USER#id / WALLET`: `regret`, `regretExp`; `dust` for the 2nd.
- `USER#id / LEDGER#regret#<code>`: delta ledger line.
- One `TransactWrite`: delete the `OWNER#` item (condition `minted = 1 AND mintedAt = :newest`), put `BURN#` and tombstone (as burnCard), put `REGRET#<code>` (not exists), bump `regretUsed`, credit the wallet, put the ledger line. Every precondition lives in the transaction, so two tabs or a double click cannot double-pay.
- Spend: `WALLET` update `regret = regret - 1` with condition `regret >= 1 AND regretExp > :now`; ledger `LEDGER#run#<runId>` with `reason: regret`; a failed run refunds it through the existing `LEDGER#refund#` path (credit goes back to `regret`, not `credits`).

## 3. Dust shop: the pack
A mint buys identity, so a pack must not be cards of you. Instead: **Battle Pack**, 3 persona/community cards (the existing demo personas and fighter archetypes) for 60 dust, added to a separate **collection**, not the deck, so `DECK_MAX` and identity rules are untouched. They are usable as sparring opponents only; they carry no mint, no burn value, no dust, and cannot be burned for dust.
- Deterministic: contents = `hash(userId + UTC day + packNo)` over a published table; odds disclosed on the shop page (e.g. 70% common / 25% rare / 5% holo persona). The same day always yields the same pack, so re-buying cannot reroll; limit 1 pack/day, 20 packs/account.
- Storage: one item `USER#id / PACK#<yyyy-mm-dd>-<n>` with `ids:[3 slugs]` and a ledger line; the collection is a query on `PACK#`. No per-card rows, no images stored (assets are static).
- Dust only; premium packs stay display-only and unbuyable with dust. Dust for packs is spendable from the ordinary burn pool and the 50 from a regret.

## 4. Paid Stardust (later, off)
`DUST_PURCHASE=1` (default off) would sell dust into a separate `WALLET.dustPaid`, spendable only on packs, never on readings, not refundable into credits, never counted by burn, no weekly cap interplay. Ship nothing until the legal review closes; the field and UI stay absent when the flag is off.

## 5. Abuse cases
- Mint, regret, re-mint, regret, repeat: lifetime cap of 2 stops it.
- Burn an old or gifted/shared card: needs ownership, mint age and newest-mint check.
- Mint with dust, regret for refund: dust-paid mints do not qualify.
- Many accounts: `ensureWallet` already caps first-card grants per browser (2/month); regret needs a charged mint, so new accounts get at most 1 extra reading each, bounded by that cap. Add a per-device cap `DEVICE#<id>/REGRET#<yyyy-mm>` of 2.
- Regret credit hoarding or stacking: max 1, 30-day expiry.
- Burn at the weekly cap boundary: regret bypasses the cap but the ordinary dust for that card is zero.
- Same picks again: blocked by `pickHash`.
- Replay of the burn API: write-once `REGRET#<code>`.

## 6. Code changes, by priority
1. `lib/regret.ts` (new): `regretBurn(userId, code)` transaction, `regretStatus`.
2. `lib/ledger.ts`: `spendCredit` tries the regret credit first and skips the `lastMintAt` stamp; `refundCredit` returns it to `regret`.
3. `app/api/agent/route.ts` (~line 232): pickHash check when paying with regret; surface `paidWith: "regret"`.
4. Burn route and the deck UI: a "Regret this card" confirm shown only on qualifying cards.
5. `lib/burn.ts`: store `mintedAt` check helper; no change to rates.
6. `lib/packs.ts`, `app/shop/page.tsx`: pack table, odds, buy route, collection view.
7. `lib/stardust.ts`: `dustPaid` field plus `DUST_PURCHASE` gate (last, stays off).
