# Regret burns, random packs, paid Stardust: legal read (2026-10-18)

Practical risk read, not formal legal advice. Get a real Indian lawyer before taking any money.

## 1. Regret burn (a few per lifetime, first one refunds a reading)

**Verdict: Amber now, Green with a tweak.** It is free, so no gaming, GST or RBI issue. The problem is cost and abuse, not law: it undoes `identity-limits.md` ("burning never gives a reading back") and reopens the mint, burn, re-mint loop. Tweak: refund only if the card was minted in the last 24 hours, never shared or collected, and only once per account. Say "2-3 chances" as a hard lifetime cap, in the terms.

## 2. Random assorted packs for Stardust

**Verdict: Green if Stardust is earned only; Red if Stardust is ever bought.** With free Stardust and no cash in, nothing is "paid", so it is not a stake. Randomness alone is not illegal in India; loot boxes have no specific statute.

## 3. Buying Stardust with real money

**Verdict: Red today.**
- **Qloo clause 5:** charging for Qloo-powered features is barred without written consent. Cards and readings are Qloo-powered. Nothing paid until Qloo says yes in writing.
- **Online Gaming Act 2025:** an "online money game" is one where you pay fees or deposits expecting money or other enrichment, in cash or kind, whether skill or chance. Paying real money for a random draw of items is the exact shape regulators look at. If the cards have any outside value (tradable, sellable, ranked prizes), that "enrichment in kind" argument gets stronger. The penalties are criminal and the ban includes advertising, so the downside is severe.
- **RBI/PPI:** a closed-system balance used only at your own shop is exempt from PPI authorisation, but only while it cannot be cashed out, transferred or used elsewhere. Any resale, gifting or withdrawal makes it a regulated instrument.
- **GST:** a digital sale is taxable (18% typical). Registration thresholds and Uttarakhand rules apply; ask a CA before the first rupee.
- **Consumer law:** CPA 2019 and the 2023 dark-pattern guidelines apply: no false urgency, no drip pricing, no pre-ticked upsells, no "confirmshaming", clear refund terms. Show odds even if not required.
- **Minors:** under-18s cannot contract in India, and the DPDP Act wants verifiable parental consent for children's data. Random paid mechanics aimed at minors are the worst combination.
- **App stores:** if ever wrapped, digital goods must use Apple/Google in-app purchase (15-30% fee), and both require disclosed odds for paid random items.

## 4. Options table

| Option | Rating | Why |
|---|---|---|
| (a) Free earned Stardust + free random packs | **Green** | No payment, no stake. Keep it non-cash, non-transferable. |
| (a2) Same, odds disclosed, cosmetic items only | **Green** | Best "game" feel at no legal cost. |
| (b) Paid Stardust, deterministic items only (you see what you buy) | **Amber** | Ordinary digital sale. Needs Qloo's written OK, GST, refund terms, adult-only checkout. |
| (c) Paid Stardust buying random packs | **Red** | Paid chance with outcomes; closest to the Gaming Act and loot-box scrutiny. |
| Any cash-out, trading, gifting or buying cards from other users | **Red, never** | Turns it into value-bearing, possibly a money game and a PPI. |
| Paying real money for a "regret burn" or retry | **Amber/Red** | Paid re-roll of a chance outcome. Avoid. |

## 5. Timeline

- **Safe now:** free regret burn (limited), earned-only Stardust, free random packs with disclosed odds and cosmetic or already-owned-type contents.
- **After Qloo agrees in writing:** (b) deterministic paid items, with GST sorted, a refund policy, an adult-only checkout and a plain price. Still no random paid packs without a lawyer's sign-off.
- **Never:** cash-out, transfers, a marketplace, prizes with money value, odds hidden, paid random packs aimed at minors, or any ₹ amount tied to a draw outcome.

## 6. Safest design that keeps the game feel

1. Stardust is earned only (burns, streaks, first-time actions). Never sold.
2. Shop sells "assorted packs" for Stardust: cosmetic frames and foils plus a lore or blank-card slot. Show the odds in a plain table next to the buy button.
3. Duplicates convert to a few Stardust (no cash value, no dead ends).
4. A pity counter guarantees a rarer cosmetic by the Nth pack.
5. Regret burn: once per account, within 24 hours, unshared cards only.
6. Terms: Stardust has no cash value, cannot be sold or transferred, expires after 12 months idle, and may change on 14 days' notice.
7. If money is ever added: sell deterministic cosmetics directly in rupees, not Stardust, and keep randomness for the free path only.

## 7. Open items

Update `app/terms/page.tsx` §10 with the points in item 6. Wait for Qloo's reply before any price page exists. Do not mention "buy", "price" or "win" in marketing until then.
