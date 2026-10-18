# Rarity roll

Taste is deterministic; rarity is luck. Decided 2026-10-19.

- **What rolls:** a real mint (signed-in minter, live Qloo), in `app/api/agent/route.ts` before the card is built.
- **How:** `lib/roll.ts`. `u = HMAC(HMAC(ROLL_SECRET, "season|S"), ownerId|runId)` → first 32 bits / 2^32, 6 decimals. The tier comes from `lib/odds.ts` (70/22/6/2, the same table as Battle Packs). A low `u` is lucky.
- **No free re-roll:**
  - The roll is stored in the result, which is cached under the picks' key. A reload or a replay of the same picks gets the same card.
  - A new roll needs a new paid run (the monthly card).
  - A run that fails is refunded and never showed a tier.
- **Regrets:** a regret rolls again under `redrawCap` (the replaced tier; Common may reach Rare) and keeps the Second draw mark.
- **Checkable:**
  - /odds shows `sha256(season key)` before the season.
  - Reveal the season key when the season ends (`SEASON` in lib/card.ts).
- **Off switch:** with no `ROLL_SECRET`, there is no roll, and rarity is the taste score as before.
- **Unchanged:** older cards, demo personas and anonymous runs keep their taste-scored tier.
- **Taste score after the switch:** it stays on the card as "Taste marks" (obscurity, pairing, spread, tension). It is no longer a tier.
- **Known edge case:** two people starting the same picks at the same instant share one in-flight run, and so one roll. Only the first person is filed as the minter.
