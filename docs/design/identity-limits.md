# Identity limits (design, 2026-10-18)

Not built. Goal: a taste card is your identity, not a loot box. Few cards, slow growth, nothing to farm.

## 1. Rules

- **First card:** one free fresh reading per account (`FREE_MINTS=1`). Sign-in is already required.
- **Refill:** one free reading every 30 days, held one at a time, never stacking. This is `refill.md` with one change: the 30-day account-age lock is dropped for the first refill, because it would leave the first card as the only one for a month. The refill is due 30 days after the last fresh mint, not 30 days after sign-up.
  - Monthly beats weekly. Weekly costs about 36% of the daily run cap per 1,000 accounts; monthly about 8%. A rarer card also feels more like an identity.
- **Deck cap:** 12 cards in total (own mints plus collected or claimed). Past that, a new card replaces nothing; the user must burn one first. Persona cards are free and cached, so they still cost nothing.
- **Re-rolling:** rarity is a function of Qloo popularity and overlap for the picked loves, and the same picks give the same code and the same cached card. A re-roll with the same picks returns the same card at no cost. Changing the picks makes a different card, and each one needs a reading. No change to the scoring is needed. Do not add randomness.
- **Burn:** burning never gives a reading back. Dust can no longer buy readings (`DUST_BUYS_READING=0`). The burn ritual and the dust counter stay as a keepsake and for later cosmetics, so there is no legal change (dust stays closed-loop, non-cash).
- **Rebirth (optional):** burning your newest minted card does not skip the wait. The next reading comes from the refill, nothing else. Simple, and there is nothing to exploit.
- **Judges and admins:** give judges the Clerk `role: admin` metadata (already supported in `lib/auth.ts`). They skip limits and credits. Remove it after judging. Nobody else gets extra readings.

## 2. Anti-abuse at $0

| Layer | Stops | Does not stop |
|---|---|---|
| Clerk email verification (required) | Typo and fake addresses | Real throwaway inboxes |
| Disposable-email blocklist | Most mail.tm-style one-off accounts | New domains not on the list |
| Turnstile at sign-up and on first fresh mint | Scripted sign-ups | Human-driven farms, paid solver services |
| Device cookie (`lib/device.ts`, `tm_d`) | Many accounts from one browser: cap fresh mints per device | Cleared cookies, incognito, other browsers |
| IP limit (existing `fresh:` and `agent:` buckets) | One bot from one address | Rotating mobile or proxy IPs |
| `DAILY_RUNS_MAX` and 12 run slots | Cost. Total spend stays bounded whatever else fails | Crowding out real users on a bad day |

No single layer is strong. Together they make a farm cost more effort than a card is worth. The daily cap is the real backstop.

Add one rule: a device may fund at most 2 first-card grants per 30 days. After that, a new account on that device gets no free reading, only persona cards.

## 3. Implementation

Env vars in Vercel (Production):

| Name | Value |
|---|---|
| `CREDITS_ON` | `1` |
| `FREE_MINTS` | `1` |
| `DAILY_RUNS_MAX` | `400` (keep) |
| `REFILL_DAYS` | `30` (new) |
| `DUST_BUYS_READING` | `0` (new) |
| `DECK_MAX` | `12` (new) |
| `DECK_SECRET` | 32+ random chars, if not set |
| `BLOCK_DISPOSABLE` | `1` (new) |

Code changes, by priority. "Before Oct 30" = needed.

1. `lib/ledger.ts`: add `grantRefill()` and call it from `spendCredit`'s empty path (lazy, no cron; `refill.md` data model). **Before Oct 30.**
2. `app/api/agent/route.ts`: when `DUST_BUYS_READING=0`, skip the `spendDust` branch (about line 247). One line. **Before Oct 30.**
3. Set `CREDITS_ON=1`, `FREE_MINTS=1` (env only). **Before Oct 30.** This alone closes the tester's mint, burn, mint loop.
4. `lib/device.ts` + `lib/ledger.ts`: record `DEVICE#<id>/GRANTS`; `ensureWallet` grants 0 free readings past 2 per 30 days. **Before Oct 30.**
5. `app/api/deck/route.ts` (POST): refuse with a clear message at `DECK_MAX`. **Before Oct 30** (cheap, protects storage).
6. `lib/auth.ts` or Clerk dashboard: disposable-email check on `user.created` (Clerk webhook, or allowlist in sign-up restrictions). Clerk's dashboard has a block-disposable toggle: use it first, no code. **Before Oct 30.**
7. `lib/burn.ts`: with `DUST_BUYS_READING=0`, still pay dust, but copy changes ("keepsake"). Later.
8. `/account` and `/deck`: "Next free reading in N days" line. Later.
9. Turnstile on the sign-up page (Clerk bot protection toggle). Later if sign-ups show abuse.

## 4. Risks and open decisions

1. **Judges see one card.** A judge testing after the first mint hits the wall. Fix: give them `role: admin`, and say so in the submission notes. Decide who gets it.
2. **Cadence.** Monthly is recommended. If the founder wants weekly, set `REFILL_DAYS=7` and expect about 36% of the daily cap at 1,000 active accounts. Revisit once real traffic is known.
3. **Dust purpose.** With dust unable to buy readings, it has no use yet. Decide whether to keep burn as a ritual only, or add a cosmetic sink (frames, foils) after the hackathon.
