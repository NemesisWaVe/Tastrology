# Legal Open Questions and Risk Register

> **Draft, 2026-10-17. Not yet reviewed: a qualified lawyer must review this before launch. It is not legal advice.**
> This file goes with `terms.md`, `privacy.md`, `cookies.md`, `promo-first-100.md` and `growth-schemes.md`. **Indian law is primary.** US coverage is basic (CCPA/CPRA, COPPA, FTC endorsements and sweepstakes), and EU/UK gets short sections only. Every `[[PLACEHOLDER: …]]` in those files traces back to a decision listed here.

> **The short version**
> - **Can't charge money yet:** we need Qloo's written permission to use its data commercially (paid credits and printed cards). The public Qloo terms point the other way, and I couldn't read the hackathon rules.
> - **Printing brand and artist names on cards we sell** creates trademark and personality-rights risk, especially in India. Print plain text only, with no logos or photos. Better still, keep celebrity names off the printed card.
> - **The first-100 promo is fine** if it stays first-come-first-served, India-only, 18+, with a built-in "I get a reward" disclosure and no contact uploads.
> - **The founder must decide:** legal entity and address, Grievance Officer, age floor, ship-to countries, payment provider, and whether to keep the OpenRouter fallback.

---

## A. Decisions for the founder

| # | Decision | Recommendation | Where it's used |
|---|---|---|---|
| D1 | **Legal entity.** Sole proprietor, LLP or Private Limited? | A Pvt Ltd or LLP before taking payments. It limits personal liability, and payment providers and print vendors want a registered business, PAN and GST. | All documents: "Who we are" |
| D2 | **Registered and postal address** (shown publicly) | Required by the E-Commerce Rules. A registered office or virtual office is fine. | Terms §1 and §17, Privacy §1 and §12 |
| D3 | **Grievance Officer** name, designation, email, phone | The founder, at launch. The name must be a real person, published on the site. | Terms §17, Privacy §12, Promo §11 |
| D4 | **Minimum age** | **18+ everywhere** at launch. India treats under-18s as children needing verifiable parental consent (DPDP §9 and Rule 10), and minors can't contract to buy. | Terms §2, Privacy §8 |
| D5 | **Governing law and court city** | India, courts at [the founder's city], with consumer carve-outs (already drafted). No US arbitration clause for now. | Terms §16 |
| D6 | **Payment provider** | **Razorpay** (the design doc agrees; test mode only). Live mode needs a registered entity and KYC. New Indian accounts at Stripe are invite-only. | Terms §10, Privacy §3, Cookies |
| D7 | **Ship-to countries** | **India only** at launch, with digital cards available worldwide. Add others once customs, returns and VAT are understood. | Terms §11, Promo §3 |
| D8 | **Currency and taxes** | INR including GST. Check GST registration with a CA before the first paid order. | Terms §10 |
| D9 | **Refund windows** (credits, decks, print cancellation, damage claims) | 14 days unused credits; cancel prints until sent to print (24 h); 14 days to report damage; refund in 7 working days | Terms §10 |
| D10 | **Credit expiry** | 12 months, or never. "Never" is simpler and avoids gift-card style rules. | Terms §10 |
| D11 | **Liability cap floor** | Greater of 12 months' fees or ₹5,000 / US$50 | Terms §15 |
| D12 | **Print vendor and courier** | Pick vendors that (a) accept custom content, (b) sign a short data and IP clause, (c) ship within India | Terms §11, Privacy §3 |
| D19 | **First-100 print budget and ship-by date** | Required before the claim button goes live. Without both, run the print waitlist instead (`growth-schemes.md` scheme 5). | Promo §8 |
| D20 | **Which growth schemes to run** | Two-sided referral unlocks, Genesis serials, Card of the Week contest | growth-schemes.md |
| D13 | **Promo details:** shipping fee or free, end date, referral window, reward value | Free shipping in India if affordable; otherwise a flat fee shown up front. Never say "50% off". | Promo |
| D14 | **Card retention** | Delete card twins 24 months after last view, plus on request. Today S3 and DynamoDB keep them forever. | Privacy §5 |
| D15 | **OpenRouter fallback in production** | Turn it off in production, or check that the chosen models don't train on prompts. Free-tier models often log prompts. | Privacy §3 |
| D16 | **Google Fonts (`Doto`, loaded from fonts.googleapis.com in `HoloCard.tsx`)** | Self-host it, as the other fonts already are via `next/font`. Then delete it from the policies. | Privacy §3, Cookies §2 |
| D17 | **EU/UK representative** (GDPR Art. 27) | Only needed if we actively target EU/UK users (EU currency, shipping there, EU marketing). With India-only shipping and no targeting, likely not needed; ask the lawyer. | Privacy §1 |
| D18 | **Card names on prints** | **Decided in the design doc: the print edition carries no brand names, logos or Qloo images.** Also strip the **love names** (artists and other people) from the constellation labels, `weakness`, `evolvesFrom` and `rarityWhy` text on the print variant. | Terms §7, Promo §8 |

## B. Risks, ranked (most likely to block the plan first)

### 1. Qloo commercial use (BLOCKER for paid features)
- **What we found:** Qloo's public Terms of Use (New York law, NY arbitration) treat API access as a licence to named "Authorized Users". They prohibit selling, reselling, redistributing or sublicensing the Services and creating derivative works of them. They say you may not store, copy or use "Site Data" in a product. They let Qloo end access at any time, and they forbid using Qloo's name or logo without consent. Where a signed agreement exists, it overrides the public terms. **I could not open the hackathon rules on Devpost (HTTP 403).** So I don't know what licence the hackathon grants, or whether API keys survive after 30 October 2026.
- **Why it matters:** Tastrology would (a) charge for minting, which is a paid product built on Qloo output, (b) print and sell physical cards that show Qloo-selected brand picks, and (c) permanently store Qloo-derived data (brand names, affinity-derived stats and popularity-based rarity, Qloo image URLs) in S3 and DynamoDB card twins. The 6-hour cache cap respects the cache side, but the twins are permanent.
- **Do this:** before any paid launch, email Qloo for **written permission or a commercial licence** that covers: paid end-user features; permanent storage of rendered cards that contain Qloo-selected entity names and derived scores; printing those names; and the public `/c/` pages. Also ask what happens to the API key after the hackathon. Until then, keep the marketplace in **test mode**, as planned, and say "Powered by Qloo" only if Qloo agrees.
- **Fallback:** if Qloo says no, the printed card can carry only Tastrology-generated content (archetype, stats, art). That needs a product decision.

### 2. Third-party brand and artist names on sold physical cards
- **Trademarks:** printing "Aesop" or "Nike" on a product we sell is a trade use of the mark. In India the defence is honest descriptive use under Trade Marks Act §30(1). Courts look at prominence, disclaimers and any hint of endorsement. In the US, the Lanham Act's false-endorsement and nominative-fair-use tests work the same way. The risk is low for small plain text with a disclaimer, and high for logos, brand colours or a brand name as the card's headline.
- **Personality rights (the bigger one in India):** Indian High Courts have granted broad injunctions protecting celebrities' names, likenesses and voices, including against **merchandise** and AI uses (Anil Kapoor, Delhi HC 2023; Arijit Singh, Bombay HC 2024; Aishwarya Rai Bachchan, Delhi HC 2025). A sold card that says it "evolves from Arijit Singh" is the kind of commercial use those orders target. US states have right-of-publicity laws too.
- **Images:** card twins include Qloo entity images (`art`, `evolvesFrom[].image`), which are often photos of real artists or brand imagery. Project rule 6 already says never print them. Keep that rule, and also keep them out of downloadable "print-grade" exports.
- **Do this:** no logos, photos or brand fonts on prints. Brand names in small plain text only, with "Not affiliated with or endorsed by any brand or person shown" on the card back. Celebrity and artist names off the printed card (D18). A notice-and-takedown address for rights holders (drafted in Terms §7). Get the print vendor's content policy in writing, since many refuse trademarked content.

### 3. Referral-incentive rules for the first-100 promo
- **India (primary):** the Public Gambling Act 1867 and state gaming/lottery laws need chance plus a stake, and neither is present in a first-come, free-entry reward. The Prize Competitions Act 1955 is read down to gambling-type competitions and is in force only in some states. The Online Gaming Act 2025 isn't engaged (no stakes). ASCI influencer guidelines and CCPA India's 2023 endorsement guidelines require reward disclosure.
- **India, continued:** a guaranteed, first-come reward with no entry fee and no chance element is neither a lottery nor a "prize competition". Random draws among sharers would change that and bring in state lottery laws. The CCPA's Misleading Advertisements Guidelines 2022 and Dark Patterns Guidelines 2023 make "50% off", fake scarcity counters and late-revealed shipping fees risky.
- **US (if opened):** no chance means no sweepstakes, but under the FTC Endorsement Guides the reward is a material connection that sharers must disclose clearly. A built-in disclosure line in the share text handles this.
- **Privacy:** never collect friends' contact details, never message them for the user. DPDP, GDPR and anti-spam rules all bite there. Count only people who sign up (drafted).
- **Do this:** keep the drafted structure. India-only, 18+, first-come, verified sign-ups, disclosure in the share text, real counter, shipping shown up front.

### 4. "Collectible" optics: investment, gambling and loot boxes
- Rarity tiers, battles, a marketplace and "digital asset redeemable physically" framing (Courtyard, Collector Crypt and Phygitals are crypto-backed, with vaults, buybacks and tokens) can attract securities, gaming or consumer-protection scrutiny.
- **Today we are safe because** rarity is computed deterministically from what the user enters, nothing is random-for-money, nothing is on-chain, and there is no resale or buyback. India's Online Gaming Act 2025 bans "online money games" with stakes. Battles with no stakes are social games.
- **Do not add without legal review:** paid random packs (loot boxes), card-for-cash buybacks, peer-to-peer resale, tokens or NFTs, or prizes for battles. Avoid "invest", "value", "appreciate" or "limited supply" in marketing (Terms §4 drafted).

### 5. Mandatory Indian disclosures and grievance handling
- The E-Commerce Rules 2020 require the legal name, address, customer care contact and Grievance Officer to be published. Complaints must be acknowledged within 48 hours and resolved within a month. The IT Rules 2021 add 24-hour acknowledgement and 15-day resolution, and 72 hours for impersonation and privacy takedowns. **This can't go live with placeholders**, so it blocks paid launch.

### 6. Children
- DPDP: anyone under 18 is a child, needing verifiable parental consent, with no tracking or behavioural monitoring of children. These obligations phase in by around **May 2027**, but plan for them now. COPPA's amended rule (compliance from 22 April 2026) applies if we knowingly collect data from under-13s in the US. **Recommendation: 18+ with an age confirmation at sign-up** (D4).

### 7. Public cards and personal taste data
- `/c/<code>` cards are public to anyone with the link and list the user's loves, which can hint at religion, politics or sexuality. Cards carry no name or email, which is good. When accounts arrive, **never put the account name or email on a card by default**. Offer "delete this card" so the public link dies too (drafted in Terms §14 and Privacy §7).

### 8. Payments and tax
- Stripe India is invite-only for new accounts, so Razorpay is the realistic choice. Razorpay KYC needs the entity, PAN, bank account and often GST. GST registration and invoicing for online sales need a CA's advice.

### 9. Data transfers and processors
- All main processors are US-based. Sign or accept each provider's DPA (Vercel, AWS, Upstash, Cloudflare, Clerk, payment provider, print vendor) and record the transfer mechanism (DPF or SCCs). DPDP §16 allows transfers unless the government blacklists a country; none is blacklisted as of this draft. The DPDP consent-notice and security duties apply in full from about **May 2027**. Building to them now is cheap.

### 10. Hackathon IP terms
- I couldn't read the Devpost rules. Check them for (a) the licence the entrant grants Qloo and Devpost, (b) any restriction on commercialising the submission, (c) what happens to the API access. The repo is AGPL-3.0. That's fine for the hackathon, but it means competitors may legally reuse the code. Decide whether future commercial code stays in the public repo.

## C. Things I verified in the code (2026-10-17)

- `tm_d`: random UUID with HMAC signature, HttpOnly, SameSite=Lax, Secure in production, 400 days (`lib/device.ts`).
- `tm_h`: signed expiry, HttpOnly, SameSite=Strict, Path=/api, 30 minutes (`lib/human.ts`). The client IP is sent to Cloudflare's siteverify as `remoteip`.
- Rate limits use a SHA-256 of `RL_SALT` plus the IP (IPv6 collapsed to its /64), truncated, as the key (`lib/ratelimit.ts`). Daily counters expire after 2 days.
- Card twins are stored write-once in S3 `twins/v1/<code>.json`, in DynamoDB `CARD#<code>`, and in Upstash with a 180-day TTL. S3 and DynamoDB have **no expiry** (`lib/twins.ts`). Deck entries are `OWNER#<device>/CARD#<code>`, with no expiry.
- The mint histogram stores the card code only, for 400 days (`lib/stats.ts`).
- The Qloo cache is capped at 6 hours (`lib/cache.ts`). Qloo images are proxied through `/api/img`, so users' IPs don't reach Qloo.
- Browser storage: `tastrology:v1`, `tastrology:persona:*` (localStorage), `tastrology:vs` (sessionStorage), and `tastrology:lab:*` (dev pages only).
- **Not mentioned in the brief but present:** the OpenRouter LLM fallback (`LLM3_*`) and Google Fonts loaded from fonts.googleapis.com in `components/card/HoloCard.tsx`.
- No analytics or advertising scripts were found.

## D. Review of `docs/design/saas-commerce.md`

I read the whole doc and aligned the drafts with §3 (referrals, the race-free counter, encrypted address deleted 90 days after delivery), §5 (Razorpay test mode, credits, no random re-rolls), §8 (data inventory) and §9 (Qloo risk, no brand names on prints). These are the points where I think the design is **legally wrong or incomplete**:

1. **"Collect claims now, print once funded" (§1, §3, risk 3).** Offering a free gift and not providing it as offered is an unfair trade practice under the Consumer Protection Act 2019. **Fix:** don't open the claim button without a committed ship-by date and a stated fallback reward (drafted in Promo §8). Also collect the address only when a print can actually be made.
2. **"Free print plus about 50% off shipping" (§3).** A discount claim with no genuine reference price is a misleading ad, and a fee revealed late is drip pricing (Dark Patterns Guidelines 2023). **Fix:** "Free print. Shipping ₹__" shown on the offer, or free shipping.
3. **Auto-rejecting same-IP referrals (§3 anti-fraud).** In India, mobile carrier CGNAT, hostels and family Wi-Fi mean genuine friends often share an IP. Automatic rejection would wrongly disqualify real people from a promised reward. **Fix:** treat same-IP as a *flag* for the manual review the design already plans. Hard-reject only on the same device or the same normalised email. Tell users why a referral was rejected and let them appeal.
4. **Card twins kept on account deletion (§2 "Account deletion").** Twins hold no name, but they hold the user's loves and, through the deck, are linked to a person. Under the DPDP Act and GDPR, that is personal data while the link exists, and erasure requests must be honoured. "Kept permanently while the service runs" is also not a defensible retention period. **Fix:** an "also delete my shared cards" option on deletion, plus a retention limit (D14).
5. **The referee must be able to qualify for free.** Qualification needs "one fresh mint", which costs a credit. That's fine while `FREE_MINTS ≥ 1`. If free mints are ever cut to 0 during the promo, the referral would require a purchase, which changes the legal character of the promotion. Lock `FREE_MINTS ≥ 1` while it runs.
6. **No age gate or terms acceptance at sign-up (§2).** Add Clerk's legal-consent checkbox ("I'm 18+ and accept the Terms and Privacy Policy") and a short DPDP consent notice before the first mint. Without these, the 18+ rule in the Terms is unenforced.
7. **`tm_ref` set on landing (§3 Links).** It's fine in India with a notice. For EU/UK visitors it is arguably a non-essential marketing cookie. **Fix:** set it only when sign-up starts, or carry `r` through the sign-up URL (Cookies §4).
8. **Processors list (§8) misses the OpenRouter LLM fallback (`LLM3_*`).** Disable it in production or disclose it (D15). The Google Fonts question is answered: `next/font` self-hosts the main fonts, but `components/card/HoloCard.tsx` loads **Doto** from fonts.googleapis.com, so Google does receive visitors' IPs. Self-host it (D16).
9. **Print variant (§4) keeps the constellation.** Its star labels are the user's loves, often real artists' names, which brings personality rights back in. Print unlabelled stars (D18).
10. **Fighter sheets (risk 4)** are permanent in S3 with Qloo-derived numbers. I agree with the design doc: add a TTL or reduce them to card fields. Reflected in the Privacy retention table.
11. **Admin CSV of decrypted addresses (§4).** OK for 100 orders, but record who exported it and when, and delete the file after use as the doc says. A DPDP breach involving addresses must be reported.

What the design gets right legally: no random re-rolls or resale; Razorpay refuses live keys while `PAYMENTS_LIVE=0`; webhook-only crediting; minimal, encrypted address with a TTL; no contact uploads; manual winner review; the print edition carries no brand names.

## Hackathon phase posture (2026-10-17)

A free student beta with no payments and no prints is low-risk if the site **says so plainly**. Honest labelling is the whole posture.

**Safe to run now**
- Free readings, decks, share links, battles, sign-in, and referral unlocks with **digital perks only**.
- **The shop showcase.** With no money involved, Qloo clause 5 ("charging for access") isn't triggered. The real risk is advertising goods that can't be bought.
  - Buttons must be disabled.
  - No checkout, "reserve" flow, addresses or pre-orders.
  - Label any prices as concept prices (or omit them).
- **Not now:** the first-100 print claim or any promise of physical goods. At most a print waitlist, with no addresses.

**Copy**
- Shop banner: *"Concept shop: nothing is for sale. Tastrology is a student hackathon project and every reading is free during the beta. Prices show what a future version might cost."*
- Footer: *"Tastrology is a free student project built for the Qloo hackathon. Not for sale. Taste data from Qloo; not affiliated with or endorsed by any brand shown. Terms · Privacy · Cookies · Grievances"*

**Simplifying the documents during the beta**
- Mark "Not active during the free beta" on:
  - Terms §10 (purchases) and §11 (shipping);
  - the Razorpay, print and courier rows in the Privacy processors table;
  - the order and address retention rows;
  - the whole of promo-first-100.md.
- **Keep, even now:**
  - who runs the site and how to contact them;
  - the Grievance Officer (24h acknowledgement, 15-day resolution). Public cards host user input, and IT Rules 2021 Rule 3 requires published terms, privacy policy and a grievance contact;
  - the 18+ rule;
  - the not-an-asset clause, AI disclaimer and brand non-endorsement;
  - acceptable use;
  - the liability cap;
  - the privacy notice: data collected, processors, rights, deletion. DPDP duties fully apply from about May 2027, but Clerk emails are personal data today;
  - the Cookie notice.

**Telling Qloo**
- Email the hackathon/partnerships contact **before submission (by 28 Oct)**:
  - it's a free showcase with no sales;
  - it stores rendered cards (Qloo-selected names and derived scores) permanently for share links, and caches raw responses for 6h at most;
  - the shop is a non-functional concept.
- Ask whether permanent storage of rendered cards is acceptable after the hackathon, and what commercial terms would look like if it wins.
- Say the same in the Devpost write-up. Keep Qloo's written reply.

**If Qloo is replaced**
- **Provenance:** add `source`/`sourceVersion` to new twins now.
- **On termination**, Qloo's terms require stopping use of the Services. Delete or regenerate Qloo-derived stored data: twins in S3, DynamoDB and Upstash, fighter sheets, caches, and deck copies. The only exception is cards Qloo agrees in writing may stay.
- Never relabel Qloo-chosen brand names as another provider's output; retire or regenerate those cards.
- Update Terms §7, the processors table and the footer.

**Running as a student or individual in India**
- An individual may run a free beta. Liability is **personal and unlimited**; no money, disclaimers and minimal data keep it small.
- The Grievance Officer can be the founder: name, email, and city/state. A full home address is needed only once selling under the E-Commerce Rules; use a registered or virtual office then.
- **If the founder is under 18**, contracts with users and vendors are voidable (Indian Contract Act). A parent or guardian should hold the accounts.
- Check the university's IP policy and the hackathon eligibility rules.
- Form an LLP or Pvt Ltd before the first rupee is taken.

## E. Sources consulted

Qloo and hackathon
- https://qloo.com/legal/terms-of-use
- https://qloo.com/terms-of-use
- https://www.qloo.com/privacy-policy
- https://qloo-hackathon.devpost.com/rules (returned 403; not reviewed)

Comparable services
- https://privy.io/blog/inside-the-stack-how-courtyard-is-reinventing-the-collectibles-marketplace
- https://dappradar.com/dapp/courtyard
- https://koinly.io/blog/collector-crypt/
- https://tokentax.co/blog/tokenized-pokemon-cards
- https://solana.com/news/tokenized-cards-and-physical-collectibles
- https://www.topps.com/terms-conditions
- https://automaton-media.com/en/news/pokemon-tcg-pocket-issues-warning-against-real-money-trades-and-data-tampering/
- https://view.sleep.pokemon.co.jp/legal/terms/1/index.html
- https://au.trustpilot.com/review/makeplayingcards.com?page=2

India
- https://www.lawrbit.com/article/digital-personal-data-protection-rules-2025
- https://webiis08.mondaq.com/india/data-protection/1775140/from-draft-to-reality-key-changes-in-indias-dpdp-rules-2025
- https://www.jsalaw.com/?p=55573
- https://amlegals.com/whatsapps-age-check-and-the-dpdp-act-what-section-9-means-for-childrens-data-compliance/
- https://law.asia/childrens-data-protection-dpdp-act/
- https://prsindia.org/theprsblog/explained-draft-amendments-to-the-it-rules-2021
- https://www.barandbench.com/law-firms/view-point/amendment-to-guidelines-for-intermediaries
- https://ssrana.in/articles/consumer-protection-e-commerce-rules-2020/
- https://www.lkslaw.com/insights/news/e-commerce-consumer-protection-e-commerce-rules-2020-notified
- https://www.indiacode.nic.in/bitstream/123456789/1515/1/A1955-42Eng.pdf (Prize Competitions Act 1955)
- https://www.mondaq.com/india/dodd-frank-consumer-protection-act/1119944/regulatory-regime-for-running-a-prize-competition-in-india
- https://prsindia.org/billtrack/the-promotion-and-regulation-of-online-gaming-bill-2025
- https://www.azbpartners.com/bank/promotion-and-regulation-of-online-gaming-bill-2025/
- https://www.azbpartners.com/bank/doctrine-of-nominative-fair-use-under-trademark-law/
- https://www.mondaq.com/india/trademark/879442/doctrine-of-nominative-fair-use39-under-trademark-law
- https://globalfreedomofexpression.columbia.edu/cases/singh-v-codible-ventures/
- https://www.medianama.com/2024/08/223-bombay-hc-orders-ai-platforms-to-remove-unauthorized-use-of-arijit-singhs-voice/
- https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india

India (added after the founder's update)
- https://www.azbpartners.com/bank/the-regulatory-evolution-of-influencer-advertising-in-india/
- https://nishithdesai.com/research-and-articles/hotline/media-hotline/social-media-vs-reality-check-ascis-new-influencer-guidelines-4713
- https://www.medianama.com/2025/01/223-non-disclosure-brand-partnerships-linkedin-influencers-asci/
- https://www.barandbench.com/law-firms/view-point/from-nudge-to-notice-what-indias-dark-pattern-orders-mean-for-digital-business
- https://www.azbpartners.com/bank/regulatory-crackdown-on-dark-patterns-ccpas-enforcement-actions-and-emerging-compliance-landscape-in-indian-e-commerce/
- https://www.scobserver.in/journal/prohibition-of-gambling-court-in-review/
- https://blog.ipleaders.in/constitutes-game-skill-game-chance/
- https://advocatetanmoy.com/unfair-trade-practice-under-consumer-protection-act-2019/
- https://yourstory.com/2018/08/consumer-protection-bill-2018-impact-contests
- https://www.legitquest.com/case/colgate-palmolive-india-ltd-v-mrtp-commission-others/2122

EU, UK, US
- https://www.legislation.gov.uk/eudr/2011/83/article/16 (Consumer Rights Directive, withdrawal exceptions)
- https://bratby.law/data-use-and-access-act-2025-commencement/
- https://harperjames.co.uk/news/what-the-data-use-and-access-act-means-for-marketers-and-website-cookies/
- https://www.jacksonlewis.com/insights/navigating-california-consumer-privacy-act-30-essential-faqs-covered-businesses-including-clarifying-regulations-effective-1126
- https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- https://www.jdsupra.com/legalnews/new-ftc-endorsement-guides-what-8179931/
- https://fbtgibbons.com/2023-updates-to-ftc-endorsement-guides/
- https://www.thompsoncoburn.com/insights/5-pitfalls-of-refer-a-friend-sweepstakes-options/
- https://www.rtm.com/blog/contests-and-sweepstakes-laws-by-state

Providers
- https://clerk.com/docs/guides/how-clerk-works/cookies.md
- https://www.captcha.eu/is-cloudflare-turnstile-gdpr-compliant/
- https://discourse.webflow.com/t/cookie-consent-compliance-cf-turnstile-u-cookie-loading-before-consent/326947

*Most sources are secondary (law-firm notes, news and summaries). The reviewing lawyer should check the primary texts: the DPDP Act and Rules in the Gazette, the E-Commerce Rules, the IT Rules as amended, and the Qloo agreement actually signed for the hackathon.*
