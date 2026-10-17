# Hook loop under rare minting (design, 2026-10-18)

Premise: a card is an identity, not a pull. You get one per refill period. Battles bring people in and bring them back; the card is what they bring.

## 1. The loop

- **Day 0.** Friend opens a challenge link (/vs/code), fights the sender's card with a house card, sees the result, is offered "Read your own taste" (the free first reading). Mint. Card page is now a passport at /c/code.
- **Day 1-29.** Daily loop is battle, not minting: one fresh opponent on the deck page each day (a friend's card, or a public seed card). Win or lose, you get a share image and a challenge link. Each qualified friend who mints = +1 reading for both (approved referral). The deck shows a countdown to the next card.
- **Refill day.** One toast, one card slot lights up. Mint a second card. The pair becomes a timeline: "March you / April you", with a one-line diff (what entered, what left, which sign moved). Old card stays; the old one is never overwritten.

## 2. UI changes

**A. Countdown in the sky frame** (app/deck/page.tsx, under the title; /account card).
Next slot drawn as an empty traced card with a moon phase. Copy:
- Waiting: "Next card at the new moon. 12 days." (monthly) / "Next card in 3 days." (weekly)
- Ready: "Your next card is ready. Name what you love now." (lime)
Which cadence: monthly feels better. It maps to a real moon cycle, makes a card feel earned, and gives a month of change to compare. Weekly makes the diff trivial and the timeline noisy. With weekly, drop the moon framing and say "Next card Sunday."

**B. Passport page** (/c/[code], component under components/results).
Add a quiet header strip: "Taste passport. Issued 18 Oct 2026. Verified original." plus a small "Add a stamp" row listing battles fought on this card: "Won 4, lost 2. Most beaten by: Moon sign." The card gains stamps, not new stats. The sharing point is that the page is a profile you send, not a result you screenshot.

**C. Timeline** (deck, shown once 2+ cards).
Heading "How your taste moved". Between two cards, one serif italic line generated from the diff: "Kept: Radiohead, Dune. Dropped: Marvel. New: slow cinema. Moon moved from Scorpio to Virgo." Copy for a single card: "One card so far. The next one shows how you changed."

**D. Daily battle slot** (app/deck/page.tsx, above the cards; reuse components/battle/BattlePicker).
"Today's opponent" with one button: "Fight". Mono line under: "Resets at midnight. Send a challenge to pick your own." After the fight: "Challenge a friend with this card" opens BattleLink. Friends answering a link see: "Maya sent you a card. Fight it, then see your own."

**E. Referral line** (app/deck, app/account).
"A friend who reads their taste gives you both an extra reading." Show as "2 friends joined. 1 extra reading banked." Credits stack on top of the refill, per refill.md, and never exceed the held limit stated there.

**F. Burn reframed** (deck confirm line, burn toast).
Burning no longer frees a slot, so it is retiring a card, not clearing space. Confirm line: "Retire this card. Its share link stops working. Your timeline keeps a faded entry." Toast: "Retired. Link gone." Dust copy unchanged otherwise (dust still buys a reading, closed loop). The timeline keeps a ghost entry so history is not erased.

## 3. Cut or reword

- **Shop** (app/shop/page.tsx, lib/products.ts). Remove "Shadow Pack" and "Domain Deck" as items; they are multi-card packs. Reword "Reading credit" to "Extra reading" and move to a single card. Headline "New loves, new sign." fine; change "Prices show what a future version might cost" to "Nothing is for sale. Readings come from the refill and from friends." Keep print as the only product.
- **Deck** (app/deck/page.tsx). "Mint your first card" becomes "Make your card." "Every one you make lands here" becomes "Each new card is added to your timeline." Drop "Season N" label above the title for "Issued to you".
- Empty (no card): "Your sky is empty. Name three to eight things you love and get your card."
- Locked: "Your next card isn't ready. Fight someone while you wait."
- Never use: pack, pull, drop, rare chase, re-roll.

## 4. Priority

Before Oct 30: A (countdown, pure UI from refill state), D (daily slot using existing battle code), shop/deck copy in section 3, F copy, E display line. These need no new data except a fixed seed opponent list.
After: B stamps (needs battle history per card), C timeline diff (needs a diff job and a second card to exist), referral counters.
