# Free refill (brainstorm, 2026-10-17)

Not built. The idea: every so often, an account gets one free fresh reading.

## Taglines

Draft: "Your taste is ever evolving." Sharper options:
1. "New month, new sign."
2. "Your taste moved. Read it again."
3. "One free reading. Every month. On us."
4. "The stars refilled."
5. "Changed your mind? So did your sign."

Pick **1** if the cadence is monthly.

## Cadence and cost

Each used refill is one fresh run: Qloo + LLM calls, counted against `DAILY_RUNS_MAX` (400).

| Cadence | Worst case per 1,000 active accounts | Share of the daily cap |
|---|---|---|
| Weekly | ~143 runs/day | ~36 % of 400. Crowds out new users. |
| Monthly | ~33 runs/day | ~8 %. Comfortable. |

**Monthly** leaves room for first-time readers.

## Interactions

- **FREE_MINTS:** the refill starts only after the lifetime free readings are used or 30 days have passed, whichever comes later.
- **Credits:** the refill is spent first and is never stored as a credit. At most one held; it doesn't roll over.
- **Stardust:** a reading paid by the refill is `funding:"refill"`. It burns for 0 dust, the same as dust-paid mints. Otherwise the loop "free reading → burn → dust → reading" quietly mints value.
- **Referral unlocks:** these are separate and stack. The +1 reading for a qualified friend stays a credit. Genesis isn't affected.

## Abuse: throwaway accounts

- Countermeasures:
  - The first refill unlocks only for accounts at least 30 days old with at least one earlier mint.
  - Clerk's verified email plus the existing bot gate.
  - The per-device and per-IP fresh-run limits still apply.
- Worst case, the daily cap bounds the cost.

## UX

- **/account:** in the "Readings left" card, a small mono line: "Next free reading in 12 days" when one is pending, and "1 free reading ready" (in lime) when one is available.
- **/deck:** the same line under the title, shown only when the refill is ready.
- **Nudge:** one dismissible toast on the next visit after it unlocks, remembered per refill in localStorage. No email, no push, and nothing repeated.

## Data model (lazy, no cron)

- `USER#id/PROFILE` gains `refillAt`, the time the next refill is due.
- **On read** (`/api/me` or a mint), if `now >= refillAt` and no refill is held:
  - `Update WALLET SET refill = 1`;
  - `Update PROFILE SET refillAt = :next`, on condition `refillAt = :seen` (a race-safe advance);
  - `Put LEDGER#refill#<yyyy-mm>`, on condition not-exists.
- **Spend:** `SET refill = 0` on condition `refill = 1`, plus `LEDGER#run#<runId>` with `funding:"refill"`. This runs before `spendCredit`, and a failed run refunds the refill.
- The next due date is `max(refillAt + 30 days, now)`, so missed months don't stack.

## Recommendation

**Monthly, one held at a time, never stacking.** Unlock it only for accounts 30+ days old that have minted at least once. It pays 0 dust when burned. Show a countdown and a single nudge. Ship it after the beta's daily cap is reviewed.
