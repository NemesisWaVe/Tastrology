import type { Rarity } from "./card";
import { REGRET_DUST, regretOn } from "./burn";
import { DIVIDEND_MAX, HOLO_DIVIDEND, SECRET_DIVIDEND } from "./dividend";
import { PACK_DUST, packsOn } from "./packs";
import { dustSaleOn } from "./products";
import { LIVING_DUST, RECAST_DUST, recastOn } from "./recast";
import { DUST_RATES, dustOn, READING_DUST, WEEKLY_DUST_CAP } from "./stardust";

/**
 * The Stardust economy in one place, for the table on the deck and account pages.
 * Earning: retiring a card you minted with a credit (by tier), or the last regret. Second draws and Stardust-paid
 * cards retire for nothing, so a regret can't be turned into dust twice. Spending: Battle Packs, and a reading only
 * when DUST_BUYS_READING=1. Every retire pays less than a reading costs (legal rule 1).
 */
export interface Economy {
  retire: { tier: Rarity; dust: number }[];
  regretDust: number | null;
  /** Paid monthly for each Holo / Secret you hold. */
  dividend: { holo: number; secret: number; max: number };
  /** Stardust prices in the shop. */
  recast: number | null;
  living: number | null;
  weeklyCap: number;
  pack: number | null;
  reading: number | null;
  /** Whether Stardust bundles are on sale (payments live and DUST_SALE=1). */
  sale: boolean;
}

export const economy = (): Economy => ({
  retire: (["common", "rare", "holo", "secret"] as Rarity[]).map((tier) => ({ tier, dust: DUST_RATES[tier] })),
  regretDust: regretOn() ? REGRET_DUST : null,
  dividend: { holo: HOLO_DIVIDEND, secret: SECRET_DIVIDEND, max: DIVIDEND_MAX },
  recast: recastOn() ? RECAST_DUST : null,
  living: dustOn() ? LIVING_DUST : null,
  weeklyCap: WEEKLY_DUST_CAP,
  pack: packsOn() ? PACK_DUST : null,
  reading: process.env.DUST_BUYS_READING === "1" ? READING_DUST : null,
  sale: dustSaleOn(),
});
