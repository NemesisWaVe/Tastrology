<div align="center">

<img src="app/icon.svg" alt="Tastrology" width="96" height="96" />

# Tastrology

### Astrology, but with receipts.

**Your taste deserves a constellation.** Name 3 things you love; an AI agent charts them through **Qloo's taste graph** into a star sign card worth collecting. Every star is a real, Qloo-verified brand, and each one comes with proof of why it's there.

<br />

<a href="https://tastrology.vercel.app"><img src="https://img.shields.io/badge/Mint_your_card-c6ff3d?style=for-the-badge&labelColor=0b0b0f&logoColor=0b0b0f" alt="Mint your card" /></a>
&nbsp;
<a href="https://qloo.devpost.com"><img src="https://img.shields.io/badge/Qloo_Agentic_Hackathon-2026-0b0b0f?style=for-the-badge&labelColor=c6ff3d" alt="Qloo Agentic Hackathon 2026" /></a>

<br /><br />

<a href="https://tastrology.vercel.app"><img src="docs/readme/banner.webp" alt="The Tastrology intro: the name drawn as a constellation inside a holographic card frame, over the Milky Way" width="100%" /></a>

<sub>The opening of the live site: your name in the stars, before the card is minted.</sub>

<br /><br />

![Next.js 15](https://img.shields.io/badge/Next.js_15-000?logo=nextdotjs)
![React 19](https://img.shields.io/badge/React_19-20232a?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)
![Qloo](https://img.shields.io/badge/Taste_graph-Qloo-c6ff3d)
![Amazon Bedrock](https://img.shields.io/badge/LLM-Amazon_Bedrock-FF9900?logo=amazonaws)
![DynamoDB](https://img.shields.io/badge/DynamoDB-no_SDK-4053D6?logo=amazondynamodb&logoColor=white)
![Tests](https://img.shields.io/badge/tests-187_passing-2ea44f)
![Budget](https://img.shields.io/badge/budget-%240-c6ff3d)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)

</div>

---

## The idea in 30 seconds

1. **Astrology is loved** because it hands you a sign that feels like *you*. But it reads your birthday, not who you are.
2. **Your taste *is* who you are**: the films you rewatch, the artist on repeat, the café you keep going back to.
3. **Qloo understands taste** across domains. People who love *Blade Runner 2049* and Berghain really do drift toward the same jackets.
4. **So Tastrology turns your taste into your star sign.** An AI agent asks Qloo what your loves say about you, and draws the answer as a constellation of real brands on a holographic card.
5. **Every star is proven real.** AI loves to make things up, so this one is built so it *can't*. Each reading ends with *"Grounding gate: 10/10 brands verified against Qloo, 0 invented"*. A **Without Qloo** panel shows what a plain LLM guesses for the same loves, side by side.
6. **Then it becomes social.** Collect, share, scan, add friends and send your sky into a fight.

That's the whole thing: **astrology, but with receipts.** Your first reading needs no sign-up.

## What you get

**A card that is actually yours.** A holographic collectible you can drag, spin and flip, with a print-grade back, a verify code and a QR. Every card has a public home at `/c/<code>` and a server-side twin, so nobody can fake one.

**Receipts, literally.** A thermal-printer receipt of your reading, plus "Show the math": the attribution matrix of which love moved which brand, measured, not guessed.

**A sky of friends.** Your friends live in a constellation around you. Their stars move closer the more you fight; their colour climbs from teal to violet to lime as friendship levels up. New friends are born on screen: the cloud collapses, flashes, ignites and the bond draws in. Tap a star and the sky flies to them; their bio waits under scratch-off foil.

**Fights.** Any two cards can battle on a deterministic engine. Friends can challenge each other for free or stake Stardust on a blind draw from each deck. Accepting is required, stakes sit in escrow, and the winner takes both.

**An economy with rules.** Retire a card and it burns into Stardust (the particles really fly into your counter). Stardust buys Battle Packs (Star, Flare, Supernova, with published odds), recasts and living sigils. One pack a day, no exceptions.

**It sounds like something.** Every tear, scratch, flake and reveal is synthesized live in WebAudio. There isn't a single audio file in the repo.

## How a reading works

This is not a chat wrapper. It's a glass-box agent: every step is a real Qloo call you can open and inspect while it streams, with a timestamp on each one.

> **In plain words:** the AI works in visible steps. To learn which love brought each brand, it removes one love at a time and watches what disappears. And it keeps a guest list: if Qloo didn't name it, it doesn't get in.

```mermaid
flowchart LR
    U([3 to 8 loves]) --> R[Resolve<br/>Qloo search]
    R --> T[Aesthetic tags<br/>per love]
    T --> I[Brand insights<br/>with explainability]
    I --> A[Ablation<br/>leave one love out]
    A --> C{Self-critique}
    C -->|one-love flukes| X[Dropped]
    C -->|loves that disagree| S[Split into a Side B]
    C --> B[Taste bridges<br/>place, film, artist, book]
    B --> N[Name the sign<br/>LLM, words only]
    N --> G[[Grounding gate]]
    G --> K([Your card])
```

1. **Resolve** each love to a Qloo entity.
2. **Tag** each love with its aesthetic, from Qloo's tag graph.
3. **Ask for brands** that share the taste, with per-love explainability.
4. **Ablate.** Re-query once per love with that love removed. The drop in affinity is how much that love earned each brand. That's the attribution matrix.
5. **Critique itself.** A brand held up by a single love is a fluke and gets cut. Two loves that pull in opposite directions aren't averaged into mush; they become a Side A and a Side B.
6. **Bridge** into a place, a film, an artist and a book that complete the picture.
7. **Name it.** Only now does the LLM speak: it names the sign and phrases the "because you love..." lines.

**The grounding rule.** The LLM never picks a brand. A `GroundingLedger` records everything Qloo returned during the run, and a final gate removes anything that isn't in it. If the model invents a brand, it simply doesn't appear. It's enforced in `lib/grounding.ts` and checked by tests against every demo persona.

## Architecture

```mermaid
flowchart TB
    subgraph Client["Browser"]
        UI["Next.js 15 / React 19<br/>cards, sky, packs, fights"]
        SND["WebAudio synth<br/>no audio files"]
    end

    subgraph Edge["Vercel"]
        API["Route handlers<br/>agent stream (NDJSON), friends, deck, packs, battle"]
        RL["Rate limits + daily caps"]
    end

    subgraph Brain["Reading engine"]
        AG["Tool-calling agent loop<br/>hand-written"]
        AP["Deterministic autopilot<br/>same tools, no LLM"]
        GL["Grounding ledger + gate"]
    end

    subgraph Providers["Outside services"]
        Q[("Qloo<br/>taste graph")]
        L1["Bedrock<br/>gpt-oss-120b / 20b"]
        L2["Bedrock<br/>Nova Pro"]
        L3["OpenRouter<br/>free model"]
        CK["Clerk<br/>accounts"]
    end

    subgraph Store["State"]
        DDB[("DynamoDB<br/>single table, SigV4 by hand")]
        S3[("S3<br/>card twins + battles")]
        UP[("Upstash Redis<br/>cache, counters, limits")]
    end

    UI <--> API
    API --> RL
    API --> AG
    AG -->|plans| L1
    L1 -.->|fails| L2
    L2 -.->|fails| L3
    L3 -.->|fails or rate-limited| AP
    AG --> Q
    AP --> Q
    AG --> GL
    API --> DDB
    API --> S3
    API --> UP
    UI --> CK
    API --> CK
```

A few pieces I'm proud of, each with the plain-words version first:

- **No AWS SDK.** *Talking to Amazon with no middleman.* DynamoDB and S3 are called over HTTPS with AWS Signature V4 written by hand (`lib/sigv4.ts`). It cuts cold starts and bundle size, and nothing is hidden.
- **One DynamoDB table for everything.** *The currency is handled like a bank handles money: nothing is lost or double-spent, even on a double tap.* Accounts, decks, wallets, ledgers, friends, requests, fights, card owners and usernames are all access patterns on a single table. Money-like moves (stakes, packs, renames) are conditional transactions with write-once ledger rows, so a retry can never charge twice.
- **Four planners deep.** *If one AI is down, the next takes over, and a backup with no AI at all finishes the job.* The agent tries Bedrock's gpt-oss-120b, then 20b, then Nova Pro, then a free OpenRouter model, and if all of them are down, a deterministic planner finishes the same run with the same tools. A user never sees a blank screen because a model had a bad day.
- **Speculative execution.** *It starts the likely next step before it's asked.* While the LLM is deciding what to do next, the likely next Qloo step is already running. Its trace events are held back until the model actually asks for it, so runs stay fast without faking the model's choices.
- **Rarity you can audit.** *Your luck is a sealed envelope, locked before you open the pack. Nobody, me included, can change it.* A card's rarity is a keyed hash of the account and the paid run, so reloading can't re-roll it. The season key's sha256 is published on `/odds` before the season and revealed after it, so anyone can check that nobody rigged the draws.
- **Real-time without sockets.** *Fights feel instant without paying for a live server.* Every write that touches you bumps one counter. Pages poll that single number (cheaply, and faster right after something happens) and only reload when it moves. Challenges land on both screens at once, and online status comes from the same heartbeat.
- **Demo personas cost nothing.** The landing page's sample readings are recorded once and replayed forever, so a viral spike never touches the Qloo quota.

## The story

I built this alone, in five days, from `create-next-app` to a live product, with a budget of exactly zero. On day one I set one rule: **every star must come from Qloo in that run, and the app has to prove it.** Everything here grew out of keeping that promise.

That last part shaped everything. No paid model, so the planner had to survive free-tier rate limits: when the LLM gets throttled mid-run, a circuit breaker pauses it and the deterministic autopilot quietly finishes the reading. No paid database, so every read and write had to be counted; the friends page is three reads and live updates are one tiny counter. No paid domain, so Clerk stays on a development instance, its badge hidden, with inactive accounts pruned by hand to stay under the cap.

Some of the best features came from things breaking in front of me.

- **Day 2: the free LLM ran dry.** OpenRouter's free tier allows 50 requests a day, and one reading takes several turns. I moved the planner to Bedrock and built the four-deep chain with circuit breakers.
- **The models leaked their thoughts.** One sign came out as *"The Daft Who…"* because the LLM had clipped "Daft Punk", and others arrived wrapped in `<reasoning>` tags. Now the reasoning is stripped and names are repaired from the real seed, so even the card's *title* is grounded.
- **Qloo bursts silently ate seeds.** A persona minted from 2 of its 5 loves. Now there is jittered backoff, a concurrency gate, and a logged event for every dropped seed.
- **I found a forgery hole in my own app.** Cards were stored from whatever the browser sent. Now registration is server-side, codes are hash-bound, and S3 writes are write-once, enforced by IAM.
- **Sharing took ten rounds on real phones.** A blank Snapchat preview, a constellation that exported as a black triangle, and iPhone dropping the art. Every card now draws its own preview image.

- **The first phone test.** A challenge sent from my laptop was accepted on my phone, and the laptop never showed the fight. So polling now runs hot for a minute after anything happens, then cools off, and a fight you started opens on your screen the moment it settles.
- **The QR that led nowhere.** Scanning my own card from another phone landed on a page that said almost nothing. Now a scanned card knows its owner: you can add them, read their card, or answer with one of your own.
- **"Why is it recommending lingerie?"** Qloo doesn't know who it's talking to. So readings now carry who they're for, taken from your private profile and never from the request. It steers the Qloo query, and a filter keeps women-only items away from anyone who didn't say they want them. The cached reading for one audience is never handed to another.
- **One trackpad fling skipped the whole intro.** Desktop scrolling now has its own pacing, so the intro reads the way it does on a phone.
- **Usernames without leaking emails.** People share cards before they ever pick a name, so the username is asked for right after sign-in, kept in sync with Clerk, and nothing that leaves the server carries an email, a real name or an account id.
- **A chaos pass before launch.** I fired junk at every endpoint and found a race where two renames at the same instant could both ride the free one, and public lookups that could be scraped in bulk. Both are closed, with tests.

## Built to be trusted

Collectible, gamified, social: that's three ways to get into trouble. So the boring parts got real attention.

- **Grounded output.** Every brand on a card came from Qloo in that run.
- **Honest odds.** Every pack table is published before you open it, rarity is commit-and-reveal, and Stardust has no cash value.
- **Privacy by default.** IPs are salted and hashed before they reach a rate limiter. No ads, no trackers, no analytics cookies. Gender is optional, private and only used to filter your own picks.
- **Real deletion.** Closing your account from the Account page deletes everything: deck, wallet, ledger, friends and username, and returns any Stardust riding on open fights.
- **Limits everywhere.** Every API route is rate limited; readings, LLM calls and fights have daily caps, so a bad actor can't run up a bill.
- **Written policies.** Privacy, terms and cookie pages written for India's DPDP Act, with an age gate before sign-up.
- **Qloo's rules respected.** No Qloo response data is committed to this repo. Mock mode runs on a small hand-made graph with the same shape.

## By the numbers

| | |
|---|---|
| Built in | 5 days, solo |
| Commits | 190 |
| Lines of TypeScript | about 35,000 |
| Tests | 187, across 32 files |
| AWS SDKs | 0 |
| Audio files | 0 |
| Budget | $0 |

## What's next

- **Sponsored Stars.** Brands can light up a star but never buy one. A sponsor shows only where Qloo already puts it in your sky, and the grounding gate enforces that. Brands get anonymous attribution from ablation ("people whose sky holds Tame Impala and Ghibli").
- **The Taste Census.** Anonymous mint counters grow into a weekly index of how taste moves.
- **Sky compatibility and taste twins.** Overlay two constellations; the compatibility engine already scores friend pairs.
- **Seasons and print.** Skies that evolve, first editions, leagues, and physical cards whose QR opens a verified twin.
- **Hardening.** Playwright and CI gates, a k6 load test, a Qloo degraded mode, and Web Push.

## Run it

```bash
git clone https://github.com/NemesisWaVe/Tastrology.git
cd Tastrology
cp .env.example .env.local   # mock mode works with no keys at all
npm install
npm run dev                  # http://localhost:3000
npm test
```

Mock mode needs nothing: a synthetic taste graph and the deterministic planner run the full experience offline.

To go live, fill in `.env.local` (`.env.example` documents the Qloo, LLM, cache and S3 settings):

| What | Variables |
|---|---|
| Qloo | `QLOO_MODE=live`, `QLOO_API_KEY` |
| LLM chain | `LLM_*`, then optional `LLM2_*` and `LLM3_*` (any OpenAI-compatible endpoint or Bedrock) |
| Cost caps | `LLM_DAILY_MAX`, `LLM_MAX_TOKENS`, `DAILY_RUNS_MAX` |
| Accounts | Clerk keys |
| Storage | `DDB_*` (DynamoDB), `S3_*` (card twins), `UPSTASH_*` (cache and limits) |
| Economy | `CREDITS_ON`, `ROLL_SECRET` |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Motion · Lenis · Clerk · Amazon Bedrock · Qloo · DynamoDB · S3 · Upstash Redis · Vercel · Vitest

## License

[AGPL-3.0](LICENSE). If you run a modified version as a service, share your changes.

<div align="center">
<br />

**[Mint your card](https://tastrology.vercel.app)** and find out what your taste has been saying about you.

</div>
