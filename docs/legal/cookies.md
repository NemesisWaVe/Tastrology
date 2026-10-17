# Tastrology Cookie Policy

> **Draft, 2026-10-17. Not yet reviewed: a qualified lawyer must review this before launch. It is not legal advice.**
> Cookie and storage names were checked against the code on 2026-10-17. Rows marked *(planned)* aren't live yet. Re-check this table every time a script, SDK or provider is added.

> **The short version**
> - Tastrology uses a few small cookies and browser storage entries. **All of them are needed for the site to work or to keep it safe.**
> - We use **no advertising cookies, no tracking pixels and no analytics** today.
> - Because of that, we show a short notice rather than an "accept/reject" banner. If we ever add analytics or marketing tools, we will ask for your consent first where the law requires it.

---

## 1. What these things are

A **cookie** is a small file a website stores in your browser. **Local storage** and **session storage** are similar browser features that keep data on your device. Session storage is cleared when you close the tab; local storage stays until you clear it. Data in local or session storage is **not sent to our servers** unless the page sends it.

## 2. Everything we set

| Name | Type | Set by | Purpose | Lasts | Category |
|---|---|---|---|---|---|
| `tm_d` | Cookie (first-party, HttpOnly, signed) | Tastrology | Random device id so your deck of cards is remembered without an account. Holds no personal details. Deleted when you sign in and your deck moves to your account. | 400 days, or until you sign in | Strictly necessary (keeps the deck you asked for) |
| `tm_h` | Cookie (first-party, HttpOnly, signed, only sent to `/api`) | Tastrology | Proves you passed the bot check, so you aren't asked again for 30 minutes. Being retired: once sign-in is required, the bot check runs inside Clerk's sign-up. | 30 minutes | Strictly necessary (security) |
| `tm_ref` *(planned)* | Cookie (first-party, HttpOnly, signed) | Tastrology | Remembers whose invite link brought you here, so the right person gets credit if you create an account and mint. The first link wins. | 30 days | Strictly necessary (the referral feature behind the link you followed). See note in §4. |
| Cloudflare Turnstile cookies and storage (for example `cf_clearance`-style or `cf.turnstile.*` entries) | Third-party, on `challenges.cloudflare.com` | Cloudflare | Tells humans and bots apart before an expensive card reading | Session to [[PLACEHOLDER: confirm from Cloudflare's docs]] | Strictly necessary (security) |
| `tastrology:v1` | Local storage | Tastrology | Keeps your latest reading on this device so it shows up again when you return | Until you clear it or press "start over" | Strictly necessary / functional (the feature you used) |
| `tastrology:persona:<name>` | Local storage | Tastrology | Caches the demo "battle" fighters so the battle page loads quickly | Until you clear it | Functional |
| `tastrology:vs` | Session storage | Tastrology | Remembers the card code that challenged you while you make your own card | Until you close the tab | Strictly necessary (the challenge you followed) |
| `tastrology:lab:*` | Local storage | Tastrology | Developer test pages only; not reachable on the live site | — | Not used in production |
| `__session` *(planned)* | Cookie (first-party) | Clerk | Short-lived sign-in token checked on each request | About 60 seconds, renewed while you are active | Strictly necessary |
| `__client_uat` *(planned)* | Cookie (first-party) | Clerk | Records when your session was last updated, so the site knows whether you are signed in | Per Clerk session settings [[PLACEHOLDER: confirm]] | Strictly necessary |
| `__client` *(planned)* | Cookie (HttpOnly, on our Clerk sign-in domain `clerk.<domain>`) | Clerk | Your long-lived sign-in, so you stay logged in | Per Clerk session lifetime [[PLACEHOLDER: confirm, e.g. 7 days]] | Strictly necessary |
| `__cf_bm`, `_cfuvid` *(planned)* | Third-party | Cloudflare (for Clerk and Turnstile) | Bot management and rate limiting during sign-in | Up to 30 minutes / session | Strictly necessary (security) |
| Razorpay Checkout cookies *(planned)* | Third-party, inside Razorpay's checkout window | Razorpay | Fraud prevention and completing payment; only on the checkout step | Per Razorpay | Strictly necessary |
| Clerk browser storage keys *(planned)* | Local storage | Clerk | Sign-in state | [[PLACEHOLDER: confirm in a browser after integration]] | Strictly necessary |

**Other connections that are not cookies.** One card font is loaded from **Google Fonts**, which means your browser contacts Google and shares your IP address. Google Fonts doesn't set cookies for this. [[PLACEHOLDER: recommended engineering fix: self-host this font (as the other fonts already are) and delete this paragraph.]] Card images from Qloo are fetched through our own server, so your browser never contacts Qloo directly.

## 3. Managing cookies

You can block or delete cookies in your browser settings. If you block `tm_d`, your deck won't be remembered. If you block `tm_h` or Turnstile, you may be asked to pass the bot check more often, or be unable to mint. If you clear local storage, your latest reading disappears from this device, but cards in your deck and shared links are unaffected.

## 4. Do we need a consent banner? (recommendation for the founder)

*This section is internal guidance and should be removed from the public page.*

**Today: no consent banner is needed; a notice is enough.**
- Under the EU ePrivacy Directive (Article 5(3)), the UK PECR and similar laws, consent is not required for storage that is **strictly necessary** to provide a service the user explicitly asked for, or for security. Everything in the table above fits that: the deck cookie supports the deck the user asked for, the bot-check cookies protect the service, and the local and session storage keep the reading the user just made.
- India's DPDP Act doesn't have a separate cookie rule. Cookies that identify a device are personal data, so the privacy notice must cover them, which it does.
- California law requires an opt-out only for "sale" or "sharing" for cross-context advertising. We do neither.
- **What to ship:** a one-line, non-blocking footer notice such as "We use only essential cookies to keep your deck and stop bots. See our Cookie Policy." Don't add an "Accept" button. It implies a choice that doesn't exist and trains users to click through.
- **`tm_ref` (referral cookie):** this is the one cookie a strict EU regulator could call non-essential, because it serves our marketing (referral credit) more than the visitor. It is fine under Indian law with a notice. For EU/UK visitors, the safe options are: (a) set it only after the visitor starts sign-up, rather than on landing, or (b) carry the referral code in the sign-up URL instead of a cookie. Option (a) is a one-line change and is recommended.
- **Caveat:** some regulators expect the `tm_d` deck id to be justified carefully because it lasts 400 days. Once Clerk accounts are live, consider shortening `tm_d` to, for example, 90 days or retiring it for signed-in users.
- **Quick fix:** self-host the Google font. A German court has fined a site operator for sending visitors' IPs to Google Fonts without a legal basis.

**If analytics are added:**
- **Vercel Web Analytics** (cookieless, aggregate) or a similar first-party, cookieless tool: in the UK, the Data (Use and Access) Act 2025 now exempts analytics used only to improve the site, provided you give a clear notice and an easy opt-out. In the EU, several regulators (for example France's CNIL) accept audience measurement without consent only under strict conditions. A notice plus an opt-out link is the defensible minimum, and it must be listed in this table.
- **Google Analytics, Meta Pixel, PostHog with cookies, session replay, or any advertising or retargeting tag:** these need **prior opt-in consent** for EU/UK visitors. That means a real banner with equal "Accept" and "Reject" buttons, with nothing loading before the user chooses. Under the CCPA they also need a "Do Not Sell or Share My Personal Information" link if used for advertising. Under the DPDP Act they need clear notice and consent.
- **Payment and Clerk scripts** stay strictly necessary as long as they load only on the sign-in and checkout steps.

*Last updated: [[PLACEHOLDER: date of publication]]*
