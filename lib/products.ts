/**
 * The shop catalogue, in code. Prices in paise (₹1 = 100 paise). Nothing here is random: every product is a
 * deterministic reading or a derived variant of your loves, never a re-roll.
 * Payments: PAYMENTS_PROVIDER=razorpay|none (default none, so the shop shows "Free during beta").
 */
export interface Product {
  id: "reading" | "shadow-pack" | "domain-deck" | "print";
  name: string;
  /** One line, what you actually get. */
  blurb: string;
  pricePaise: number;
  /** Reading credits this product grants (0 for physical goods). */
  credits: number;
  /** Physical goods: needs fulfilment, so it stays "coming soon" unless PRINTS_ENABLED=1. */
  physical?: boolean;
}

export const PRODUCTS: Product[] = [
  { id: "reading", name: "Extra reading", blurb: "Don't want to wait for the new moon? One more card, from new loves.", pricePaise: 4900, credits: 1 },
  { id: "shadow-pack", name: "Shadow Pack", blurb: "One card per love removed: the you without each of them.", pricePaise: 19900, credits: 5 },
  { id: "domain-deck", name: "Domain Deck", blurb: "Your sign from one shelf only. Just films, just music, just food.", pricePaise: 14900, credits: 3 },
  { id: "print", name: "Physical print", blurb: "Your card on 350 gsm holo stock, posted to your door.", pricePaise: 49900, credits: 0, physical: true },
];

export type PaymentsProvider = "razorpay" | "none";

export function paymentsProvider(): PaymentsProvider {
  return process.env.PAYMENTS_PROVIDER === "razorpay" ? "razorpay" : "none";
}

/**
 * Stardust bundles, sold for money once payments are live and DUST_SALE=1. Off by default: until both are on the
 * shop shows no bundles and every page keeps saying Stardust can't be bought. Bigger bundles carry a small bonus.
 */
export interface DustBundle {
  id: "dust-s" | "dust-m" | "dust-l";
  name: string;
  dust: number;
  pricePaise: number;
}
export const DUST_BUNDLES: DustBundle[] = [
  { id: "dust-s", name: "Pinch", dust: 100, pricePaise: 4900 },
  { id: "dust-m", name: "Pouch", dust: 220, pricePaise: 9900 },
  { id: "dust-l", name: "Nebula", dust: 480, pricePaise: 19900 },
];
export const dustSaleOn = () => paymentsProvider() !== "none" && process.env.DUST_SALE === "1";

/** Prints stay off (no claim, no address capture) until fulfilment is funded. */
export const printsEnabled = () => process.env.PRINTS_ENABLED === "1";

/** ₹49, ₹199, ₹1,499. */
export function formatPaise(p: number): string {
  const r = p / 100;
  return `₹${r.toLocaleString("en-IN", { maximumFractionDigits: r % 1 ? 2 : 0 })}`;
}
