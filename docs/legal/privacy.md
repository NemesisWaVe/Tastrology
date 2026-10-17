# Tastrology Privacy Policy

> **Draft, 2026-10-17. Not yet reviewed: a qualified lawyer must review this before launch. It is not legal advice.**
> Placeholders look like `[[PLACEHOLDER: …]]`. Facts about current data handling were checked against the code on 2026-10-17 (`lib/device.ts`, `lib/human.ts`, `lib/ratelimit.ts`, `lib/twins.ts`, `lib/stats.ts`, `lib/cache.ts`, `app/api/*`). Items marked *(planned)* describe features that are not built yet.

> **The short version**
> - To make a card we need **the names of things you love**. Your card is built from them and stored so it can be shared and verified.
> - Your card does **not** contain your name, email or IP address. Anyone with a card's link can see that card, so only enter loves you are happy to share.
> - With an account *(planned)*, we hold your email and sign-in data (via Clerk). If you order a print, we hold your shipping address and order details.
> - We do **not** sell your data, show ads, or use advertising trackers.
> - Raw IP addresses are not stored in our databases. For rate limits we keep a salted hash of the IP for a short time.
> - Our servers and providers are mainly in the **United States** (AWS us-east-1, Vercel, Clerk, Cloudflare).
> - You can see, correct, export or delete your data. Write to [[PLACEHOLDER: privacy email]] or our Grievance Officer (section 12).

---

## 1. Who is responsible

[[PLACEHOLDER: legal entity name]], [[PLACEHOLDER: registered address, India]] ("Tastrology", "we") decides how your data is used. We are the **Data Fiduciary** under India's Digital Personal Data Protection Act 2023 (DPDP Act) and the **controller** under the EU and UK GDPR.

Contact: [[PLACEHOLDER: privacy email]]. EU representative: [[PLACEHOLDER: name/address, if required, see open-questions.md]]. UK representative: [[PLACEHOLDER: if required]].

## 2. What we collect and why

| What | Examples | Where it comes from | Why we use it | Legal basis (GDPR) |
|---|---|---|---|---|
| **Your loves** | "Kendrick Lamar", "Spirited Away", "Aesop" | You type them | To build your card with Qloo data and AI | Contract (providing the service you asked for) |
| **Your card** | Archetype, stats, brand picks, rarity, verify code, the names of your loves | We generate it | To show, share, verify and print your card | Contract |
| **Feedback** | Likes or dislikes on brand picks | You | To re-plan your reading | Contract |
| **Device ID** | Random id in the `tm_d` cookie | Our server | To keep your deck without an account | Legitimate interests (keeping your cards); see Cookie Policy |
| **Bot-check result** | `tm_h` cookie; Cloudflare Turnstile signals | Cloudflare and our server | To stop bots from draining the service | Legitimate interests (security) |
| **Network data** | IP address, browser type | Your browser | Rate limiting, security, delivering pages | Legitimate interests (security) |
| **Account data** *(planned)* | Email (verified), name and profile photo if you sign in with Google, sign-in history, IP address and browser per session | You, Google (if you choose it) and Clerk | To run your account and deck, and to block fake sign-ups | Contract; legitimate interests (security) |
| **Order data** *(planned)* | Items, amounts, invoice, payment status (not your full card number), shipping name, address and phone. The address is **encrypted** in our database and decrypted only to make the courier list. | You and the payment provider | To take payment, print, ship, give refunds, keep tax records | Contract; legal obligation (tax) |
| **Referral and promotion data** *(planned)* | Your referral code; the `tm_ref` cookie on a friend's browser; who referred whom (account ids only); whether the referral qualified or why it was rejected; **salted hashes** of the IP address and device id of both people (for fraud checks); promo claim status | Our server | To credit referrals and run the first-100 promotion fairly | Contract; legitimate interests (fraud prevention) |
| **Support messages** | What you write to us | You | To answer you and handle complaints | Contract; legal obligation (grievance rules) |
| **Usage counts** | Number of cards minted per day, rarity histogram | Our server | To run and size the service, and show "rarer than N%" | Legitimate interests; these are aggregate and don't identify you |

**Under India's DPDP Act**, we process your data on the basis of your **consent**, which you give through the notice shown before your first mint and at sign-up, and for the "legitimate uses" the Act allows (for example data you provide voluntarily for a specific purpose, and compliance with law). You can withdraw consent at any time (section 7). Withdrawal stops future processing but does not undo what was lawfully done before.

**What we don't collect:** we don't ask for your date of birth, ID documents, location or contacts. **We never ask you for your friends' contact details**, including for promotions.

**A note about your loves.** The things you love can sometimes hint at sensitive matters such as religion, politics or sexuality. We don't try to infer those things, and we don't use your loves for advertising. Please leave out anything you'd rather not have on a shareable card.

## 3. Who we share data with

We don't sell or rent personal data, and we don't "share" it for cross-context behavioural advertising (as the California law uses those words). We use these providers ("processors") to run Tastrology. Each gets only what it needs.

| Provider | What they do for us | Data they handle | Location |
|---|---|---|---|
| **Vercel** | Hosting, delivery of pages and APIs | Requests, IP addresses in short-lived logs | USA (global edge) |
| **Amazon Web Services** (S3, DynamoDB) | Stores cards and decks | Cards, device ids, account ids *(planned)* | USA (us-east-1) |
| **AWS Bedrock** (Anthropic Claude and Amazon Nova models) | AI that plans your reading | Your loves and Qloo results for that run; no name, email or IP | USA |
| **OpenRouter** (fallback only) | Backup AI route when Bedrock is unavailable | Same as Bedrock | USA [[PLACEHOLDER: confirm whether the fallback stays enabled in production]] |
| **Qloo** | Taste data | Your loves (as search terms) and entity ids; no name, email or IP | USA |
| **Upstash** | Short-lived cache and rate-limit counters | Hashed client ids, cached Qloo results (6 hours max), card copies, counters | [[PLACEHOLDER: Upstash region]] |
| **Cloudflare** (Turnstile, run inside Clerk's sign-up) | Bot checks | IP address and browser signals during the check | Global |
| **Google Fonts** | One web font on the card | Your IP address when the font loads | Global. [[PLACEHOLDER: we recommend self-hosting this font so it can be removed from this list]] |
| **Clerk** *(planned)* | Sign-in and accounts (email code or Google) | Email, name and photo from Google if used, IP and browser per session, sign-in history | USA |
| **Razorpay** *(planned; test mode only today)* | Payments (UPI, cards) | Name, email, phone, payment instrument, amount | India |
| **[[PLACEHOLDER: print vendor]]** *(planned)* | Printing cards | The print image of your card (no brand names) and an order number. Name and address **only** if they post it directly. | India or abroad [[PLACEHOLDER]] |
| **[[PLACEHOLDER: India Post / Shiprocket / Delhivery]]** *(planned)* | Delivery | Name, address, phone | India |

We may also disclose data if the law requires it (for example a valid court order or a lawful request under Indian law), to protect people's safety, or to a buyer if Tastrology is sold. In a sale, this policy would continue to protect your data.

**Your card is public to anyone with its link.** That's how sharing works. The card shows your loves and archetype, but not your name, email or account, unless a future feature lets you add your name and you choose to.

## 4. Data sent abroad

Most of our providers store or process data in the **United States**. If you are in India, the DPDP Act allows transfers to countries that the Government has not restricted. If you are in the EU, UK or Switzerland, we rely on the provider's EU-US Data Privacy Framework certification where it has one and on Standard Contractual Clauses (and the UK addendum) in our data processing agreements otherwise. [[PLACEHOLDER: lawyer to confirm each provider's DPA and transfer mechanism]]

## 5. How long we keep data

| Data | How long |
|---|---|
| Card (the "twin" behind `/c/<code>`) | Until you ask us to delete it, or [[PLACEHOLDER: recommended 24 months after the last view]]. Copies in our cache expire after 180 days. |
| Deck entries | Until you remove the card or delete your account. Anonymous (device) decks are moved into your account when you sign in, and the device copy is deleted 30 days later. |
| Battle sheets derived from a card | [[PLACEHOLDER: engineering to add a TTL; today they are kept indefinitely in S3 and 180 days in cache]] |
| Device id cookie `tm_d` | 400 days in your browser |
| Bot-check cookie `tm_h` | 30 minutes |
| Rate-limit counters (hashed IP) | Minutes to hours; at most 2 days |
| Qloo results cache | 6 hours at most |
| "Already counted" flag per card code (for the rarity histogram) | 400 days; holds only the card code |
| Aggregate counters | Kept; they don't identify anyone |
| Hosting logs (may include IP) | Per Vercel's log retention, [[PLACEHOLDER: e.g. 1–30 days depending on plan]] |
| Account data *(planned)* | While your account is open. Deleted when you delete your account (automatic on deletion in Clerk) |
| Referral records *(planned)* | IP and device hashes: 30 days. Who referred whom and qualification status: while either account exists, and at most [[PLACEHOLDER: 6 months]] after the promotion ends |
| `tm_ref` referral cookie | 30 days |
| Orders, invoices *(planned)* | 8 years, as required by Indian tax and company law |
| Shipping address *(planned)* | Encrypted; deleted automatically 90 days after delivery. If you delete your account first, unshipped addresses are deleted then. |
| Payment event ids *(planned)* | 90 days |
| Support and grievance messages | 3 years |

Under the DPDP Rules, if you don't use your account for a long time we may delete it after giving you at least 48 hours' notice. [[PLACEHOLDER: lawyer to confirm whether the Third Schedule retention periods apply to Tastrology]]

## 6. Security

- Cards are written once on the server and can't be forged: each verify code is checked against the card's own contents.
- Cookies are signed, `HttpOnly`, and `Secure` in production.
- IP addresses are hashed with a secret salt before they reach our rate-limit store.
- Storage access keys are limited to the exact actions the app needs.
- Payment card details never touch our servers.

No system is perfectly secure. If a breach affects your personal data, we will tell you and the authorities as the law requires (including the Data Protection Board of India and, for EU/UK users, the relevant supervisory authority within 72 hours where GDPR applies).

## 7. Your rights

**If you are in India (DPDP Act 2023 and DPDP Rules 2025)**, you can:
- get a summary of the personal data we process about you, what we do with it, and who we have shared it with;
- have it corrected, completed, updated or erased;
- withdraw consent at any time, as easily as you gave it. Afterwards we stop processing, and ask our processors to stop, unless the law requires us to keep something, such as invoices;
- nominate another person to use these rights if you die or become unable to;
- use our grievance process (section 12). If you aren't satisfied, you can complain to the **Data Protection Board of India**.

**If you are in the US:** we don't sell your personal data or share it for cross-context behavioural advertising. Where a state privacy law such as the CCPA/CPRA applies to us, you can ask to know, delete or correct your data, and you won't be treated differently for doing so. You may use an authorised agent. Tastrology is not directed at children under 13, and we don't knowingly collect their data (COPPA).

**If you are in the EU or UK:** the GDPR / UK GDPR gives you similar rights, plus data portability, the right to object to processing based on our legitimate interests, and the right to restrict processing. You can complain to your local data protection authority (in the UK, the ICO).

**How:** email [[PLACEHOLDER: privacy email]] or use [[PLACEHOLDER: /account settings]] *(planned)*. Deleting your account in settings deletes your profile, deck, credits wallet, referral links and unshipped addresses straight away. If you have no account, send us your card codes. We reply within **30 days** at most, and we may need to confirm it's you.

**Your public cards.** A card is stored under its verify code, without your name. Deleting your account doesn't automatically remove cards you shared, because other people may hold the link. **Ask us, or tick "also delete my shared cards" when deleting**, and we'll take them down. [[PLACEHOLDER: engineering to add this option; the design doc currently keeps twins on deletion]]

## 8. Children

Tastrology is for people aged **[[PLACEHOLDER: 18]]** and over. We don't knowingly collect data from children. Under India's DPDP Act anyone under 18 is a child and needs verifiable parental consent, so at launch we ask users to confirm they are 18 or older. If you believe a child has used Tastrology, tell us and we will delete their data. [[PLACEHOLDER: if the age floor is lowered, this section must be rewritten for parental consent, COPPA (under 13 in the US) and GDPR Article 8]]

## 9. Emails

We send account and order emails (receipts, shipping updates) because they are part of the service. We send news or offers only if you opt in, and every such email has an unsubscribe link.

## 10. Automated decisions

Your card is generated automatically by AI. It has no legal or similarly significant effect on you: it doesn't decide prices, credit or access to anything. Promotion fraud checks *(planned)* may flag an account automatically; a person reviews any flag before we disqualify you, and you can ask us to look again.

## 11. Changes

We will post changes here with a new date, and notify signed-in users of significant changes before they apply.

## 12. Grievance Officer and contact

- **Grievance Officer:** [[PLACEHOLDER: name]], [[PLACEHOLDER: designation]]
- **Email:** [[PLACEHOLDER: grievance email]]
- **Address:** [[PLACEHOLDER: postal address]]

We acknowledge complaints within 24 hours and resolve them within 15 days, or within the shorter time the law requires.

*Last updated: [[PLACEHOLDER: date of publication]]*
