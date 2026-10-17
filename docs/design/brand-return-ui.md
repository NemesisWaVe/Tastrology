# Brand return: "Pulled" (design)

Goal: going back to an old card lands the user on that card's brands and shows how their taste found them, in a way the first-mint receipt and results page do not.

## Concepts considered
1. **Flip-side constellation**: turn the card over; each love is a star, brands are planets pulled in by them.
2. **Drift strip**: "new in your orbit" row of fresh brands for the same taste.
3. **Receipt archive drawer**: a slip slides out of the card edge, unrolls the saved receipt.
4. **Weekly brand horoscope**: one dry line per card, per week.
5. **Pulled (chosen)**: a card-sized "brand sheet" that opens from the card and is organised around the pull itself, one love at a time, with a drift row and a "since your last visit" line. It folds 1, 2 and 4 into one surface and drops 3 to a stub.

## Why it is not a repeat
First mint is a printer: linear, paper, brands ranked No. 01..N. Return is a **reverse lookup**: pick a love, see only what it dragged in. Ranked list is gone; the sky is the index. Receipt is present only as a torn stub at the bottom.

## Entry points
- **Deck grid** (`app/deck/page.tsx`): each card gets a lime foot-tab under the art: `4 brands · 1 new` (mono, 10.5px). No new count, no badge, just `4 brands`. Tap on the tab (not the card body, which still flips) opens the sheet. Cards with fresh drift get a lime dot on the tab, nothing pulsing.
- **/c/<code>**: below the FlipCard, a full-width line button: `See what your taste pulled in`. Landing from a deck tab deep-links `/c/<code>?b=1` and scrolls/opens it automatically.
- **Daily loop** (NextCard / Timeline in the deck): once a week the opponent slot is replaced by a single row, `Mon: 2 new brands for <card name>`, linking to `?b=1&drift=1`. The week's drift check is the reason to come back, so it gets the slot.

## The screen
Bottom sheet on phone (full height, 100dvh, no backdrop blur, solid `--card`), right-hand panel 560px on desktop over a dimmed deck. Header: card name, code, `Close`.

**Top: love picker (a mini Sky).** Reuse `Sky` in a 160px strip: the card's loves are stars joined by the existing constellation lines. Tapping a star selects it (default: the strongest love). Below, brand "planets" (logo discs, 44px) hang beside the star, connected by one line each, weight = share of pull.

**Middle: the pull panel for the selected love.** Heading: `Sent by Radiohead`. Up to 3 brands from that love, each a compact row: logo, name, category, `62% of the pull`, and the ablation line in the existing `ablationLines` voice: `Without Radiohead it drops 14 places.` A brand pulled by several loves shows the others as small chips; tapping a chip jumps the selection.

**Drift row.** `Fresh this week` with 2-3 brand tiles (dashed outline, not solid, to say these are new since mint). Label under: `Suggested by Qloo today for the same taste. Not part of your original card.`

**Voids.** `Nothing here for` + the loves that pulled no brand, one line.

**Stub.** A 56px torn receipt edge at the bottom: `Original receipt, 12 Oct`. Tap: the stub unrolls (height transition, 400ms) into the saved `ReceiptBody` (compact, `stagger={false}`), no printing, no beep. It is a reference, not a show.

**Click-out.** Each brand row's button: `Official site` when Qloo supplied a site, `Instagram` when only a handle, `Search the web` otherwise (this already exists as `brandLink`; reuse the same three labels). Sub-line, mono: `Link from Qloo. Opens in a new tab.` Drift tiles use the same.

## Motion and sound (cheap)
- Open: sheet translateY 0.28s, one `sfx("flip")`. Nothing else plays on open.
- Star select: `sfx("tick", {i})` rising per star order, the selected star scales 1.0 to 1.25 (transform only); old brand rows cross-fade 150ms; connecting line draws with stroke-dashoffset on 3 lines max.
- Drift tiles: one `sfx("pop")` when scrolled into view, once per session.
- Stub unroll: `sfx("rustle")`.
- Phones: no blur, no glow filters, Sky in still mode (no rAF loop, repaint on selection only). `useReducedMotion`: no transitions, no sound beyond the click pop.

## Copy
- Tab: `4 brands` / `4 brands · 2 new`
- Page button: `See what your taste pulled in`
- Sheet title: `Pulled by your taste`
- Select hint: `Tap a star to see what it brought.`
- Since last visit: `Since 12 Oct: 2 new brands, 1 gone.` (nothing changed: `Nothing moved since 12 Oct.`)
- Drift heading: `Fresh this week`
- Empty drift: `Qloo has nothing new for this card yet. Check Monday.`
- No data fallback (old card without snapshot): `This card was minted before we kept receipts. Its brands are not saved.`

## Second and fifth visit
- Visit 2: the drift row is the news. Visit count and last-seen date stored per code in localStorage (`SEEN#code`), so `Since <date>` is honest and free.
- Visit 3+: the default selected star is the love with the most movement, not the strongest, so the sheet opens somewhere new.
- Visit 5: a brand you opened twice gets a small `Opened twice` mono tag. Nothing else; no streaks, no points.
- A brand present at mint and gone from today's Qloo list shows once as `Left your orbit`; it's a good dry line and costs nothing.

## Build plan (files)
Reuse: `Sky.tsx` (strip), `brandLink`/`Stamp`/`PullChart`/`ablationLines` from `components/results/Brands.tsx` (export `brandLink` and `Stamp` if not yet), `ReceiptBody` for the stub, `sfx`, `HoloCard` untouched.
Build:
- `components/deck/BrandSheet.tsx` (sheet, picker, pull panel, drift row, stub)
- `components/deck/BrandTab.tsx` (foot-tab, takes snapshot summary)
- `lib/brandSeen.ts` (localStorage last-seen, try/catch)
Edit: `app/deck/page.tsx` (render tab in card grid, weekly row), `app/c/[code]/page.tsx` (button, `?b=1` auto-open), `app/api/card` or the data agent's snapshot endpoint (read only).

## Before Oct 30
Must: tab, sheet with picker + pull panel + click-out, stub, fallback copy (~2 days, no new backend beyond the snapshot). Should: since-last-visit line. Cut if tight: drift row (needs the weekly job), `Left your orbit`, `Opened twice`. Verify on a real iPhone: sheet scroll and Sky still mode.
