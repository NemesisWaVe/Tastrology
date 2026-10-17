# Tastrology: accounts, physical cards and shop (design, 2026-10-17)

## 1. Recommendation summary
- **Auth:** Clerk (free Hobby tier: 50k monthly retained users). Sign-in is required for any fresh mint. Persona demos and cached replays stay anonymous, so judges can try the app without an account.
- **Turnstile: retire it from the mint path.** Clerk's bot sign-up protection already runs Cloudflare Turnstile, and minting now needs an account. Unset `TURNSTILE_*` in prod but keep `lib/human.ts` behind its env flag, which costs nothing. The CSP must still allow `challenges.cloudflare.com` for Clerk's own challenge.
- **Upstash: keep it.** It's free and has no card on file, so it can never charge. It stays the home of ephemeral cross-instance state: rate limits, run slots (ZSET leases that expire on their own), the 6h Qloo/result caches and the mint histogram.
  - DynamoDB runs at 10 provisioned WCU. Per-request counters would use that up and hit `ProvisionedThroughputExceeded` in a spike, and expiring leases is awkward there.
  - Everything durable, or tied to money or promises, goes to **DynamoDB with conditional writes or transactions**: credits, referrals, the first-100 counter, orders.
  - Removing Upstash would cut $0 of cost and raise Qloo traffic, because each instance would then keep its own cache.
- **Rate-limit identity:** key on the Clerk user ID when signed in, otherwise on the salted IP hash (the existing `clientId`).
- **Physical cards:** the "first 100" promo means a free print for users with 5 qualified referrals. During the hackathon, collect claims and addresses only. Print and ship after the founder has money and switches payments to live.
- **Fulfillment:** manual CSV export, then an Indian digital press or MakePlayingCards/QPMN.
- **Shop:** credits and packs, with Razorpay in test mode behind `PAYMENTS_PROVIDER`/`PAYMENTS_LIVE`.
- **"Buy another deck" is never a random re-roll.** Each card stays deterministic from your loves, which avoids gambling and loot-box optics. You pay for new readings and derived variants.
- **Tagline:** "New loves, new sign."
- **No real charges until Qloo gives written OK** (see Risks).

## 2. Auth (Clerk)

### Setup
- Use `@clerk/nextjs`.
- `middleware.ts` calls `clerkMiddleware()`, with a matcher that excludes static assets and `/api/img`.
- Don't call `auth()` in `/api/card` or `/api/battle`, so their `s-maxage` CDN caching survives.
- Use the `<SignIn>`/`<SignUp>` modal components; no custom flow is needed.
- Dashboard settings:
  - Bot sign-up protection: on (Smart).
  - Email verification: required.
  - Block disposable email domains and email subaddresses, if the Restrictions page offers it.
  - Sign-in options: Google plus email code.
- **CSP additions (next.config.ts):**
  - The Clerk Frontend API host (`*.clerk.accounts.dev` in dev, `clerk.<domain>` in prod) in `script-src` and `connect-src`.
  - `img-src https://img.clerk.com`.
  - `worker-src 'self' blob:`.
  - `frame-src`: Cloudflare (already there).
  - When the shop lands, add the Razorpay hosts (`checkout.razorpay.com`, `api.razorpay.com`) to `script-src`, `frame-src` and `connect-src`.
- Env, in `.env.local` and Vercel only: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`.

### Mint gate (`app/api/agent/route.ts`)
1. A cached result or a persona request skips the gate.
2. A fresh run with no `userId` returns 401 `reason:"signin"`. The client opens the sign-in modal and retries.
3. A signed-in run goes through, in order:
   1. per-user `allow("run:"+userId)`;
   2. spend one credit (§5);
   3. `acquireSlot`;
   4. the run.
4. If the run fails, write a compensating refund entry.
5. When `registerTwin` succeeds, also `ddbPutIfAbsent` the item `OWNER#<userId>/CARD#<code>` with `minted:1`. The server files the user's own cards, not the client.

### Deck migration
- Owner keys can't collide: Clerk IDs start with `user_`, and device IDs are UUIDs, so `OWNER#<userId>` and `OWNER#<deviceUuid>` stay distinct.
- `/api/deck` GET reads by user ID when signed in. Anonymous visitors still get read-only access to their device deck. POST requires sign-in.
- `POST /api/deck/claim` runs automatically on the first signed-in page load whenever a valid `tm_d` cookie is present:
  1. `PutIfAbsent DEVICE#<dev>/CLAIM {userId, at}`. If the item already exists for another user, refuse. A device is claimed once by one person, so a shared computer can't pull its deck into a second account.
  2. Query `OWNER#<dev>` and `PutIfAbsent` each item as `OWNER#<userId>/CARD#<code>` with `source:"claim"`. Copied cards keep `minted:0`, because the device never proved who minted them.
  3. Respond with `Set-Cookie: tm_d=; Max-Age=0`.
- Leave the old device items in place for 30 days so a failed claim can be retried. Delete them after that (this needs `DeleteItem`).
- The localStorage `tastrology:v1` card: if it has a twin code, POST it to `/api/deck` once after sign-in.

### Account deletion
- A `user.deleted` webhook goes to `/api/webhooks/clerk`. The Svix signature is verified by hand with HMAC in `node:crypto`, matching the no-SDK style.
- It deletes `USER#<id>/*`, `OWNER#<id>/*`, open `ORDER#…/ADDR` items and the `REF#` mapping.
- Card twins stay: they hold no PII and are shared publicly.

## 3. Referrals and promo

### How comparable products work
- Courtyard vaults graded cards at Brink's and tokenizes them. Redeeming burns the token and ships the card for a fee.
- Collector Crypt and Phygitals use custodians (PSA, Alt, Fanatics), with shipping fees by region that drop when bundled.
- Topps BUNT, Panini digital and Pokémon TCG Pocket are digital-only; physical cards show up only as prizes.
- Tastrology needs no vault and no tokens. The card is printed on demand from its twin, and "ownership" is the `minted:1` item in your deck.

### Links
- Each user gets an 8-character `refCode` (random Crockford base32), stored write-once as `REF#<refCode>/META {userId}` and on `USER#<id>/PROFILE`.
- The share link reuses the existing card pages: `/c/<code>?r=<refCode>`. The home page also accepts `?r=`.
- When middleware sees `r`, it sets `tm_ref`: signed, HttpOnly, 30 days. First touch wins, so an existing value is not overwritten.
- When the user is signed in, the share sheet adds the `r` parameter automatically.

### Qualified referral
- A visit alone counts for nothing: it can't be verified and is trivial to fake.
- A referral **qualifies** only when all of these hold:
  1. a new Clerk account, created after `tm_ref` was set, with a verified email;
  2. that account completes **one fresh mint**, a real reading that costs the faker a Qloo run and a sign-up challenge;
  3. the referral passes the fraud checks below.
- On the referee's first authenticated request, record attribution:
  - `PutIfAbsent USER#<referee>/PROFILE` with `referredBy`;
  - `PutIfAbsent USER#<referrer>/REFERRAL#<referee> {status:"pending", ipHash, devHash, at}`.
- At the referee's first mint, qualify it in one transaction:
  - update the REFERRAL item to `status:"qualified"`, on condition that it is `pending`;
  - `ADD qualifiedRefs 1` on the referrer's PROFILE.
- The threshold is `PROMO_REFS_NEEDED`, default 5.

### Anti-fraud
- Reject a referral when any of these hold:
  - `referee == referrer`;
  - same `tm_d` device hash;
  - same `ipHash` as the referrer (salted, /64 for IPv6);
  - more than 2 qualified referrals from one `ipHash` per referrer per day;
  - a normalized email collision (Gmail dots and `+tags` stripped; compared as hashes only).
- Store rejected referrals with their reason, so manual review can see them.
- Every promo winner is reviewed by hand before shipping (it's only 100 people). Look for bursts of referrals within minutes and identical loves across referees.
- Keep `ipHash` and `devHash` for 30 days, using a DynamoDB TTL attribute (free).

### The first-100 counter (race-free)
- `POST /api/promo/claim` requires `qualifiedRefs >= N` and at least one `minted:1` card.
- It runs one `TransactWriteItems`:
  - `Update PROMO#print1/META SET claimed = claimed + :1`, with condition `claimed < :cap`;
  - `Put PROMO#print1/CLAIM#<userId>`, with condition `attribute_not_exists(PK)`;
  - `Put ORDER#<id>/META {kind:"promo_print", status:"awaiting_address"}`.
- If both conditions pass, the user holds a slot. If the transaction is cancelled, the reasons say whether the promo sold out or the user had already claimed.
- A claim with no address after 7 days is released by a compensating transaction (decrement, delete the claim) run from the admin page; no cron is needed.
- `slotsLeft` in the UI is an eventually consistent read, which is fine.

### Address (minimal PII)
- Fields: name, line1, line2, city, state/region, postal code, country, and phone (Indian couriers require it). No date of birth, and no copy of the email (Clerk already has it).
- Stored as `ORDER#<id>/ADDR {enc}`: AES-256-GCM in `node:crypto`, key `ADDR_KEY` from env, with the order ID as additional authenticated data.
- TTL is **delivered + 90 days**.
- Never log the address, and never put it in card data or Upstash.

### Shipping cost
- The promo is a free print plus about 50% off shipping.
- Until payments go live, take no money: the order sits at `status:"awaiting_shipping_payment"`.
- Alternatively, the founder could cover India-only shipping (about ₹50–100 per card via India Post or Shiprocket). That spends cash, so it's the founder's call.
- Recommendation: **India shipping at launch**, international later as paid-only.

## 4. Physical fulfillment

### Print art
- Rule 6 applies: generated art only.
- The print variant drops the `art` collage (Qloo images) and any logos, and **omits brand names** (§9).
- It keeps the archetype, Big Three, stats, rarity, constellation, serial, verify code and a QR code to `/c/<code>`.
- Size: 63×88 mm with 3 mm bleed (815×1110 px at 300 dpi).
- The admin page `/admin/print` renders the variants and exports PNGs with the existing `html-to-image` at pixelRatio of about 4.

### Workflow (manual; fine for 100 cards)
1. Approve or reject each order on `/admin/orders` after the fraud review.
2. Export with `GET /api/admin/orders.csv`. It is admin-only (Clerk `publicMetadata.role === "admin"`), and addresses are decrypted only on export.
   - Columns: orderId, code, name, address…, phone.
   - Delete the file after handing it to the courier.
3. Print as a batch.
4. Pack each card in a penny sleeve and a toploader, inside a stiff mailer.
5. Record the shipment with `POST /api/admin/orders/<id>`: `status=shipped` plus the tracking number. This starts the address TTL clock.

### Vendors
- **India (cheapest):** a local digital press or Printo/PrintStop.
  - Imposed A3 sheets, 9–10 cards per sheet, so about 11 sheets for 100 cards.
  - 300–350 gsm stock with gloss or holo-film lamination, then cut.
  - About ₹20–40 per card.
- **International print-on-demand:**
  - MakePlayingCards: custom trading cards with 18–612 different faces per order, so 100 unique cards fit one batch. It ships to the founder, who re-mails domestically.
  - QPMN: true print-on-demand from 1 unit, combined into bulk.
  - Printify (playing cards) as a fallback.
- Batching to the founder and re-mailing is cheaper than dropshipping each card from abroad. No vaulting, no tokens.

## 5. Marketplace and payments

### What "buy another deck" means
A card is a pure function of your loves and Qloo data, so the shop never sells randomness. Products:
- **Reading credit (1 fresh mint):** change your loves and get a new sign.
  - Everyone gets `FREE_MINTS=3` lifetime, granted lazily when PROFILE is created.
  - A cached or identical request is free.
- **Shadow Pack (5 credits' worth):** one card per love removed, using the agent's existing leave-one-out ablation. These are honest, derived "the you without X" variants.
- **Domain Deck:** cards built from one domain's loves only (films, music, …).
- **Physical print:** one card, print plus shipping. Disabled until fulfillment is funded.
- **Not built:** peer-to-peer resale or trading for money. It would raise money-transmission questions, hit the Qloo resale clause, and carry gambling optics.

### Tagline options
1. "New loves, new sign."
2. "Not your sign? Read again."
3. "Your taste moved. Your stars follow."
4. "Pull another sign."
5. "Same stars? Feed them something new."

**Pick: "New loves, new sign."** It's short and astrological, and it says what actually happens (new inputs) rather than hinting at a gacha re-roll.

### Provider
- **Razorpay.** Test mode needs no KYC and supports UPI and cards. Indian KYC (24–48 h) is needed only to go live.
- Stripe is invite-only in India.
- Env:
  - `PAYMENTS_PROVIDER=razorpay|none`. The default is `none`, and the shop then shows "free during beta".
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
  - `PAYMENTS_LIVE=0`.
- The server **refuses `rzp_live_` keys unless `PAYMENTS_LIVE=1`**, and the UI shows a "Test mode" ribbon.
- The product catalog lives in code (`lib/products.ts`), with prices in paise.

### Ledger (DynamoDB)
- Items: `USER#<id>/WALLET {credits, v}` and `USER#<id>/LEDGER#<ts>#<ref> {delta, reason, ref}`.
- **Webhook `/api/webhooks/razorpay`:**
  1. Verify `X-Razorpay-Signature` (HMAC-SHA256 over the raw body).
  2. Run one transaction:
     - `Put PAYEVT#<x-razorpay-event-id>`, with condition not-exists and a 90-day TTL;
     - `Update ORDER#<id>/META status=paid`, with condition `status=created`;
     - `Update WALLET ADD credits :n`;
     - `Put LEDGER`.
  3. A duplicate delivery cancels the transaction on its event condition; return 200.
  4. Credits come only from the webhook, never from the client callback.
- **Spend:** `Update WALLET SET credits = credits - 1`, with condition `credits >= 1`, plus `Put LEDGER#…#run-<runId>` (not-exists, so idempotent).
  - A failed run writes `LEDGER#…#refund-<runId>` (not-exists) plus `ADD 1`.
- IAM: add `UpdateItem`, `DeleteItem`, `ConditionCheckItem` and `BatchWriteItem` (there is no `TransactWriteItems` IAM action; each op in a transaction is authorized by its own action).
- `lib/ddb.ts` needs `ddbUpdate`, `ddbDelete`, `ddbTransact` and `ddbBatchDelete`. `TransactItems` has no top-level `TableName`.

## 6. Data model and routes

Single table `tastrology`, no GSIs.

| PK | SK | Attributes | Notes |
|---|---|---|---|
| CARD#code | META | card, rarityScore, createdAt | existing, write-once |
| OWNER#dev | CARD#code | code, card, rarityScore, addedAt | legacy; delete 30 days after claim |
| OWNER#userId | CARD#code | + minted 0/1, source mint/claim/collect | user deck |
| DEVICE#dev | CLAIM | userId, at | write-once |
| USER#id | PROFILE | createdAt, refCode, referredBy, qualifiedRefs, freeGranted | |
| USER#id | WALLET | credits, v | |
| USER#id | LEDGER#ts#ref | delta, reason | append-only |
| USER#id | REFERRAL#refereeId | status, reason, ipHash, devHash, at, ttl | TTL on the hashes |
| REF#refCode | META | userId | |
| PROMO#print1 | META | claimed, cap | seeded with cap=100 |
| PROMO#print1 | CLAIM#userId | orderId, at | lists every claim for admin |
| ORDER#id | META | userId, kind, code, status, amount, currency, providerOrderId, tracking, at | |
| ORDER#id | ADDR | enc, ttl | encrypted PII |
| PAYEVT#eventId | META | at, ttl | idempotency |

Capacity: about 100 orders and a few thousand users fit easily in 10/10. Transactions cost 2× capacity units.

**New routes:**
- `middleware.ts`
- `POST /api/deck/claim`
- `GET /api/me`: credits, freeLeft, refCode, refs {pending, qualified, needed}, promo {eligible, claimed, slotsLeft}, orders
- `POST /api/promo/claim`
- `POST /api/orders/[id]/address`
- `POST /api/checkout`: creates a Razorpay test order
- `POST /api/webhooks/razorpay`
- `POST /api/webhooks/clerk`
- `GET /api/admin/orders.csv`
- `POST /api/admin/orders/[id]`

**Changed routes:**
- `/api/agent`: auth, credits, owner write.
- `/api/deck`: decks owned by the user.

**Pages:** `/sign-in`, `/sign-up`, `/account`, `/shop`, `/admin/orders`, `/admin/print`, and the legal pages `/terms`, `/privacy`, `/cookies`.

## 7. Build order (Oct 18 → Oct 30)
0. **Before Oct 19: the Vercel deploy (NOTES §5.1).** Everything below sits behind env flags so the demo never breaks.
1. **Oct 18–19, auth:** Clerk, middleware, CSP, the 401 sign-in gate, decks written by owner, `/api/deck/claim`.
   - **Frontend first:**
     - a sign-in modal on the "read my stars" CTA;
     - a UserButton in the navs;
     - the `/deck` merge with a "cards from this device moved to your account" toast.
2. **Oct 20–21, ledger:** the `ddb.ts` additions plus IAM, WALLET and LEDGER, FREE_MINTS, `/api/me`.
   - Frontend: an `/account` skeleton and a credits chip.
3. **Oct 22–23, referrals:** ref codes, `?r=` and `tm_ref`, attribution, qualification at mint, fraud checks.
   - Frontend: the share sheet with the personal link and a "3/5 friends read their stars" meter.
4. **Oct 24–25, promo:** the promo claim transaction, encrypted address, admin orders and CSV, the print variant.
   - Frontend: the claim flow and address form.
5. **Oct 26–27, shop:** `/shop` with the tagline, Razorpay test checkout, webhook.
   - Ledger tests: a duplicate webhook, concurrent spend, and 101 concurrent claims against cap=100 (Vitest, with DynamoDB Local or mocks).
6. **Oct 28, privacy:** Clerk `user.deleted`, legal pages, and a cookie notice (essential-only, so a banner with no consent wall).
7. **Oct 29:** QA on prod, plus the judge path without login (personas).
8. **Oct 30:** buffer, then submit.

Cut line if late: drop step 5 (shop) first. Then cut steps 4–5 down to a "join the waitlist for prints" claim.

## 8. Data inventory (for the lawyer)

### Cookies
All first party unless noted.
- `tm_d`: signed random device ID. HttpOnly, Lax, 400 days, Path=/. Holds the legacy anonymous deck; cleared after claim.
- `tm_h`: signed expiry. HttpOnly, Strict, 30 min, Path=/api. Marks a Turnstile pass; retired once the Turnstile keys are unset.
- `tm_ref` (new): signed referral code. HttpOnly, Lax, 30 days.
- Clerk:
  - `__session`: short-lived JWT, about 60 s.
  - `__client_uat`: when the session was last updated.
  - `__client`: long-lived, HttpOnly, on the Clerk Frontend API domain.
  - `__clerk_db_jwt`: dev instances only.
- Cloudflare `__cf_bm`/`_cfuvid` may be set during the Clerk/Turnstile challenge.
- Razorpay Checkout sets its own cookies inside its iframe.
- All of these are strictly necessary. There are no analytics or ad cookies.

### localStorage and sessionStorage
- `tastrology:v1` (localStorage): the last reading. It holds the request (loves), the trimmed result, votes and pins. No expiry; cleared by "start over".
- `tastrology:persona:<key>` (localStorage): cached demo persona results.
- `tastrology:lab:<p>` (localStorage): only on the internal `/lab` pages.
- `tastrology:vs` (sessionStorage): the challenger card code for that tab's session.
- Clerk JS may write its own keys; confirm in a browser after integration.

### Server-side data
**DynamoDB (us-east-1)**
- Card twins and decks: no PII. Kept permanently while the service runs.
- Profile, wallet and ledger: the user ID and credits. Kept for the account's lifetime; the ledger for paid orders as long as tax law requires (lawyer to confirm; India GST records are about 6–8 years).
- Referrals: user IDs, plus IP and device hashes for 30 days.
- Orders: kind, status, amounts, tracking.
- Encrypted shipping addresses: until delivery + 90 days.
- Payment event IDs: 90 days.

**S3**
- `twins/v1/<code>.json`: the rendered card, kept permanently.
- `fighters/v1/<code>.json`: the derived battle sheet, permanent today (see Risks).

**Upstash Redis**
- Rate-limit keys (salted IP hash or user ID): 10 min.
- Daily counters: 2 days.
- Run slots: about 5 min.
- Qloo and result caches (loves and Qloo-derived names): 6 h max.
- Twin and fighter copies: 180 days.
- Mint histogram: per season.
- Seen-codes: 400 days.

**Vercel logs**
- `agent_run` events, which carry no IP.
- Vercel's own platform request logs, which do contain IPs (retention depends on the plan).

**Clerk (US)**
- Email, optional name, OAuth profile and avatar.
- IP and user agent per session.
- Sign-in history.

### Processors
- **Vercel** (hosting, CDN, logs): all traffic.
- **AWS** DynamoDB, S3 and Bedrock in us-east-1: storage, plus LLM prompts that contain loves and Qloo names. Bedrock doesn't train on inputs.
- **Upstash:** caches and limits.
- **Cloudflare:** Turnstile, through Clerk. Receives IP and browser signals.
- **Clerk:** identity.
- **Qloo:** the love names users type, not linked to any identity.
- **Razorpay:** name, email, phone and payment instrument (test mode for now).
- **Print vendor:** card art only if batches ship to the founder; name and address if it drop-ships.
- **Courier** (India Post, Shiprocket or Delhivery): name, address, phone.
- **Google Fonts:** served via the CSP's allowed hosts. Check whether `next/font` self-hosts them; if not, Google is also a recipient of IPs.

## 9. Risks
1. **Qloo terms.**
   - Clause 5 bans selling, reselling or sublicensing the Services, or "otherwise charg[ing] third parties for access". Paid reading credits trigger Qloo calls, so they plausibly fall under it.
   - Clause 4 limits storing Site Data, and clause 8 says Qloo owns its output.
   - **No live payments or paid prints until Qloo gives written permission**, or a commercial agreement supersedes the public terms.
2. **Trademarks on physical goods.**
   - Printing brand names ("moves") or Qloo images on cards that are sold, or given away as promo prizes, invites infringement and false-endorsement claims. Clause 8 also bars using marks.
   - The print edition carries no brand names, logos or Qloo images. Digital cards keep their run-sourced names (nominative and display use).
3. **The free print isn't $0.** Print plus courier for 100 cards is about ₹10–25k. Capture claims now and fulfil them once funded; the promo copy must say "ships after launch".
4. **Fighter sheets** store Qloo affinity, popularity and explainability numbers permanently in S3 (and for 180 days in Upstash). That conflicts with the 6h cache rule and clause 4. Reduce them to card-derived fields or give them a TTL.
5. **Promo legality.** A free referral-for-prize promo is fine only if entering requires no purchase; otherwise it can read as a lottery. Put the conditions in the terms.
6. **Gambling and loot-box optics.** Never sell random rarity: India's 2025 online-gaming law and EU loot-box scrutiny both apply. The deterministic design avoids this.
7. **Scope.** 13 days is tight, and judges care about Qloo usage. Commerce must ship behind flags, and the anonymous persona demo must never regress.
8. **Privacy.** India's DPDP Act, plus GDPR for EU visitors. The address and Clerk data are the only real PII, so keep the deletion path (Clerk webhook) and the TTLs.

## 10. Sources
- https://qloo.com/legal/terms-of-use
- https://clerk.com/articles/clerk-pricing-explained
- https://clerk.com/docs/security/bot-protection
- https://clerk.com/docs/deployments/clerk-cookies
- https://clerk.com/docs/references/sdk/terminology
- https://upstash.com/pricing/redis
- https://razorpay.com/docs/webhooks/validate-test
- https://razorpay.com/docs/us/payments/quickstart
- https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india
- https://support.token.im/hc/en-us/articles/48851280924313-Start-Collecting-Courtyard-NFTs-with-imToken
- https://privy.io/blog/inside-the-stack-how-courtyard-is-reinventing-the-collectibles-marketplace
- https://docs.jup.ag/user-docs/trade/gacha/shipping
- https://koinly.io/blog/collector-crypt/
- https://solanacompass.com/projects/phygitals
- https://mlb.com/news/topps-bunt-app-delivers-digital-baseball-cards-to-your-devices/c-70941256
- https://www.thespike.gg/reviews/topps-ripped
- https://www.makeplayingcards.com/design/custom-trading-game-cards.html
- https://qpmarketnetwork.com/print-on-demand-trading-cards-solution
- https://printify.com/custom-playing-cards
- https://printo.in/p/business-cards-india
- Pokémon TCG Pocket (digital-only, no redemption): general knowledge, not verified by search.

## 11. Amendments after legal review (2026-10-17)

| # | Objection | Verdict | Mechanism |
|---|---|---|---|
| 1 | "Collect claims, print once funded" (CPA 2019) | **Accept** | No free-print claim button until the founder commits a print budget and a ship-by date. Collect addresses only when a print can actually be made. |
| 2 | "~50% off shipping" and a late fee | **Accept** | No discount wording. Any future offer says "Free print. Shipping ₹X" on the offer itself, or shipping is free. No fee appears for the first time at checkout. |
| 3 | Same-network referrals | **Accept** | A shared IP or /64 is flagged for manual review, not rejected. Hard-reject only on the same `tm_d` device, the same normalized email, or self-referral. `/account` shows each referral's status and reason, with an appeal by email. |
| 4 | Shared cards must be deletable | **Accept, different mechanism** | Twins are content-addressed, so a code may belong to several people with the same loves. Delete writes `CARD#<code>/TOMBSTONE`, removes the user's `OWNER#` item, makes `/c/<code>` return 410, and purges the S3 and Upstash copies. Other owners keep their deck copy, which embeds the card JSON. Account deletion asks "also delete my shared cards" (default yes). Twins with no views for 24 months are deleted. |
| 5 | 18+ at sign-up | **Accept, no DOB** | Clerk's legal-consent checkbox: "I'm 18+ and accept the Terms and Privacy Policy." Self-declared; store the consent timestamp on PROFILE. A one-line DPDP notice before the first mint. |
| 6 | Prints must drop every name | **Accept** | The print variant shows archetype, Big Three, stats, unlabelled stars, serial, verify code and QR. No brand, artist or title names, and no Qloo images. A non-affiliation line on the back. |
| 7 | OpenRouter and Doto are unlisted processors | **Accept** | Leave `LLM3_*` unset in prod (Bedrock only). Load Doto through `next/font/google`, which self-hosts it, and remove the Google Fonts hosts from the CSP. |
| 8 | `tm_ref` set on landing | **Accept** | Carry `r` in the sign-up URL (Clerk `unsafeMetadata` or the redirect), not in a cookie set on landing. |
| 9 | Referees must be able to qualify free | **Accept** | Lock `FREE_MINTS ≥ 1` in config while any promo runs, enforced by a test. |

### Revised promo (13 days, $0)
1. **Two-sided unlocks.** When a referred friend verifies and mints, both people get +1 free reading. Credits have no cash value and can't be transferred.
   - At 5 qualified friends: a holo frame plus a Shadow Pack.
   - No shipping, no cash cost.
2. **Genesis serials.** Accounts 1–1,000 get "Genesis #NNNN".
   - Assignment is race-free: `ADD n 1` on `PROMO#genesis/META` with the condition `n < 1000`, then a write-once put to PROFILE.
   - The live counter shows the real count.
3. **Print waitlist** replaces the first-100 claim.
   - Each qualified referral moves you up 10 places, computed deterministically.
   - It promises early access only and collects no address.
   - "First 100 prints free" goes to the top 100 only once the founder funds the batch and commits a ship-by date.
4. **Disclosure built into the share text:** "I get a free reading if you join."
5. **Card of the Week contest:** after launch, only if time allows.

Build impact:
- §7 steps 3–4 become referral unlocks, Genesis serials and the waitlist (Oct 22–25).
- Address capture and the admin CSV move behind `PRINTS_ENABLED`.
