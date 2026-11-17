# SwipeStakes — Plan

> **Prompt:** If you could engineer the perfect app for Yale students that does not currently exist, what would it be?
>
> **Our answer:** A campus exchange where students trade **meal swipes** and **dining dollars**, with a game layer on top so a swipe you'd never use becomes a shot at something you will.

Working name: **SwipeStakes** (swipes + sweepstakes, which is also the legal model we lean on; see §8).

---

## 1. The problem

- **Swipes get wasted.** Students on swipe-heavy plans regularly end a week or semester with swipes they never used. Those swipes are paid for and then lost.
- **Dining dollars run out.** Other students (upperclassmen, people who live off-campus, anyone who eats at retail spots like cafés and late-night places) burn through dining dollars and would gladly give up a dining-hall swipe for more.
- **There's no channel between them.** Today the only "market" is GroupMe posts and asking friends to swipe you in. There's no pricing, no trust, nothing that makes it fun.

**The insight:** each side holds something the other values more than they do. A market fixes that. A game layer makes it something people *want* to open every day rather than a chore.

## 2. Why this doesn't exist yet

1. Meal plan rules generally say swipes are **non-transferable**, so nobody has built openly on top of them.
2. Anything with chance + money + prize is **gambling** in legal terms, which scares off builders.
3. It needs **Yale-only identity** (CAS/NetID) so you aren't trading with strangers.

We treat 1 and 2 as design constraints, not reasons to stop (see §8). Number 3 is a feature: being Yale-only is the moat.

## 3. Core loop

```
 Have extra swipes ──► Put a swipe "on the table" ──► Match / game resolves ──► Receive dining dollars
 Need dining dollars ◄──────────────────────────────────────────────────────── (and vice versa)
```

1. **Log in with Yale NetID** (CAS). Verified Yalies only.
2. **Wallet** shows your swipes and dining dollars (mocked for the hackathon; see §6).
3. **Choose how to trade:**
   - **Straight trade:** a plain order book: "1 swipe for $9 DD". No chance involved. This is always available and is the safe fallback.
   - **Play for it:** put the swipe into one of the game modes below for a chance at more than the market rate.
4. **Settle:** whoever ends up holding a swipe gets swiped in. The giver's QR / a "swipe-in" handoff at the dining hall, or a guest swipe.

## 4. Game modes

All modes are **peer-to-peer**: the house never takes the other side. Odds are tied to the live market rate, so every game has an expected value close to zero for players (minus a tiny fee, or no fee at all; see §5).

| Mode | How it works | Why it's fun |
|---|---|---|
| **Coin Flip** | Put 1 swipe up against someone's dining dollars at roughly market value. 50/50, winner takes both. | Instant, social, very easy to explain. |
| **Odds Slider** | Choose your odds: risk 1 swipe for a 25% chance at 4× the market rate in DD, and so on. Matched against people taking the other side. | Lets risk-lovers and cautious people both play. |
| **Daily Jackpot** | Each swipe entered = 1 ticket. One draw at 9pm; the winner takes the pooled DD. | Daily habit, push notification, campus-wide hype. |
| **College Cup** | Residential colleges compete; each entry adds to your college's pot. The weekly winning college splits it. | Plugs into college rivalry, which is very Yale. |
| **Event Props** *(stretch)* | Predict outcomes ("Will Yale beat Harvard at The Game?", "Will it snow before finals?") with swipes/DD. | Big spikes around campus events. |

**Provably fair:** every draw uses commit-reveal randomness (we publish a hash of the server seed ahead of time, then reveal the seed once the draw is done) so anyone can verify we didn't rig it. This is cheap to build and makes for a great demo moment.

## 5. Economics

- **Market rate:** set by the straight-trade order book (the last N fills). It's used to price every game so that a swipe is never treated as "worth" an arbitrary amount.
- **No house edge in the MVP.** We aren't trying to be a casino, and taking a rake is what makes regulators care most. Possible later revenue: a small flat fee on straight trades, sponsored jackpots (local New Haven restaurants add DD to the pot for exposure), or a licensing deal with Yale Hospitality.
- **Sponsored pots** are the clever part: when a sponsor tops up a pot, players' expected value goes *positive*. That's great marketing and also helps the legal picture.

## 6. MVP scope (hackathon)

**Must have**
- [ ] NetID-style login (mock CAS for the demo, with a real CAS integration path documented)
- [ ] Wallet with swipe + DD balances (seeded fake balances, stored in our DB)
- [ ] Straight-trade order book (post/accept an offer)
- [ ] Coin Flip mode with provably fair RNG
- [ ] Daily Jackpot with a live countdown and pot size
- [ ] Activity feed ("Ezra Stiles just won $42 DD in the jackpot")
- [ ] Responsible-play controls: daily limit, self-exclusion toggle

**Nice to have**
- [ ] Odds Slider
- [ ] College Cup leaderboard
- [ ] Push / SMS notifications for jackpot draws
- [ ] AI "dining concierge": tells you whether to trade, hold or play based on how many swipes you have left and how many weeks remain in the semester

**Out of scope for the hackathon**
- Real integration with Yale's card system (needs Yale Hospitality / ITS partnership)
- Real money of any kind

## 7. Technical plan

**Stack (optimized for building fast):**
- **Frontend:** Next.js + React + Tailwind, mobile-first (PWA so it installs to the home screen)
- **Backend:** Next.js API routes or a small Node/Express service
- **DB + realtime:** Supabase (Postgres + realtime subscriptions for the feed, jackpot pot and order book)
- **Auth:** mock CAS during the hackathon; real path via Yale CAS
- **Deploy:** Vercel

**Data model (first pass):**

```
users(id, netid, display_name, college, created_at, daily_limit, self_excluded_until)
wallets(user_id, swipes, dining_dollars_cents)
offers(id, maker_id, side['sell_swipe'|'buy_swipe'], price_cents, status, created_at)
trades(id, offer_id, taker_id, price_cents, created_at)
games(id, type['coinflip'|'jackpot'|'odds'|'college_cup'], status, seed_hash, seed, opens_at, resolves_at)
entries(id, game_id, user_id, stake_swipes, stake_cents, payout_swipes, payout_cents)
ledger(id, user_id, delta_swipes, delta_cents, reason, ref_id, created_at)   -- append-only, source of truth
```

Every balance change goes through `ledger` inside a DB transaction, so the money can always be audited back to its source.

**Key endpoints:**
`POST /offers`, `POST /offers/:id/accept`, `POST /games/coinflip`, `POST /games/:id/enter`, `GET /games/:id/verify`, `GET /market/rate`, `GET /feed`

## 8. Risks & how we handle them

We're upfront about these because judges will ask. Each one also shapes the product.

| Risk | Reality | Mitigation |
|---|---|---|
| **Gambling law** | Legally, gambling = *consideration + chance + prize*. Connecticut only permits licensed online gaming for players who are **21+**, and most undergrads are under 21. An unlicensed real-value gambling app is a real legal problem. | Remove one of the three elements. **Sweepstakes model:** every user gets a free daily jackpot entry with no swipe required ("no purchase necessary"), the same structure as legal promotional sweepstakes. The **straight trade** has no chance element at all. Real-stakes game modes are gated behind 21+ verification and a partnership/legal review before launch. |
| **Yale meal plan policy** | Swipes are generally non-transferable; Yale Hospitality owns the card system. | Pitch this *to* Yale Hospitality as a way to cut food waste and unused-swipe complaints. Until then, keep everything a **demo with simulated balances**. A good fallback is guest-swipe mechanics, where they exist. |
| **Problem gambling** | Gamifying food money for 18–22 year-olds can hurt people. | Default daily limits, cooling-off periods, self-exclusion, no loot-box dark patterns, a visible "you've staked X this week" counter, and the straight-trade option shown first. |
| **Food insecurity** | Someone could gamble away the swipes they need to eat. | **Swipe floor:** you can't stake below a minimum of N swipes per week remaining. Optional "donate a swipe" button feeding into a swipe bank for students who need meals. |
| **Fraud / trust** | Failed handoffs, people not swiping someone in. | Escrow in the app, reputation scores, NetID accountability, and a report flow. |

> **Pitch framing:** *"A swipe exchange that turns wasted meals into dining dollars, made fun, fair and provably random, and designed from day one to stay within the law."* The responsible design is part of the product, not something we're conceding.

## 9. Hackathon timeline

| Block | Goal |
|---|---|
| **Hours 0–2** | Scaffold Next.js + Supabase, schema + seed data, mock login, wallet screen |
| **Hours 2–6** | Order book (post/accept), ledger transactions, market-rate calc |
| **Hours 6–10** | Coin Flip + Daily Jackpot with commit-reveal RNG, "verify" page |
| **Hours 10–13** | Realtime activity feed, College Cup leaderboard, responsible-play controls |
| **Hours 13–16** | Polish UI (Yale blue, bulldog), mobile PWA, deploy to Vercel |
| **Final hours** | Demo script, slides, rehearse, buffer for bugs |

**Suggested split for 3–4 people:**
- **Backend/ledger:** schema, transactions, market rate, game resolution
- **Frontend:** wallet, order book, game screens, feed
- **Games/fairness:** RNG, jackpot scheduler, verify page
- **Product/pitch:** branding, legal/compliance slide, demo script, user interviews (quickly ask 10 Yalies how many swipes they waste a week; real numbers win pitches)

## 10. Demo script (≈3 minutes)

1. **Hook (20s):** "Raise your hand if you've wasted a meal swipe this semester." Then share the stat from our quick survey.
2. **Problem (20s):** Swipes go to waste while dining dollars run out, and the two groups have no way to trade.
3. **Live demo (90s):**
   - Log in as a first-year with 6 spare swipes → post a straight trade → a junior accepts it instantly.
   - Throw 1 swipe into Coin Flip → win → open the **verify** page to show the hash matches.
   - Show the Daily Jackpot countdown and the College Cup leaderboard ticking up in realtime.
4. **Responsibility (20s):** daily limits, swipe floor, free entry, 21+ gating.
5. **Vision (30s):** partner with Yale Hospitality, sponsored pots from New Haven restaurants, then expand to every campus that has meal swipes.

## 11. Open questions

- [ ] What are Yale's current meal plan tiers and dining-dollar rules for each class year? (Check Yale Hospitality's site before the pitch.)
- [ ] Are guest swipes available, and could they be the real-world settlement mechanism?
- [ ] Do we keep any house fee, or stay 100% peer-to-peer?
- [ ] Should the hackathon demo lead with the safe straight-trade exchange or with the games?
- [ ] Final name: SwipeStakes / Boola Bets / Swipe Right / Bulldog Bank?
