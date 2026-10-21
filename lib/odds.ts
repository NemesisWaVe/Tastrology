import type { Rarity } from "./card";

/**
 * Secret Rares per edition, at most (lib/supply.ts). Past the last one a Secret roll lands as a Holo Rare, so an
 * edition's Secrets stay a fixed, printed number ("037 / 100") however big the game gets.
 */
export const SECRET_SUPPLY = 100;

/** Version of ROLL_ODDS. Bump whenever the table changes: every roll records the version it was drawn under. */
export const ODDS_V = "1";

/** One odds table for the whole product: the mint roll and Battle Packs. Published on /odds. */
export const ROLL_ODDS: { tier: Rarity; p: number }[] = [
  { tier: "common", p: 0.7 },
  { tier: "rare", p: 0.22 },
  { tier: "holo", p: 0.06 },
  { tier: "secret", p: 0.02 },
];

/** The tier a number in [0, 1) lands on, walking the table from the rarest end (so a low roll is a lucky one). */
export function tierAt(u: number): Rarity {
  let acc = 0;
  for (const o of [...ROLL_ODDS].reverse()) {
    acc += o.p;
    if (u < acc) return o.tier;
  }
  return "common";
}
