# SwipeStakes — Plan

> **Prompt:** If you could engineer the perfect app for Yale students that does not currently exist, what would it be?
>
> **Our answer:** A campus exchange where students trade **meal swipes** for **dining dollars**, with a game layer on top so a swipe you'd never use becomes a shot at something you will.

The name is swipes + sweepstakes. A sweepstakes is also the legal model we lean on (see [Risks](#6-risks-and-how-we-handle-them)).

---

## 1. The problem

- **Swipes get wasted.** Students on swipe-heavy plans regularly end the week or the semester with swipes they never used. They paid for those meals, and they're gone.
- **Dining dollars run out.** Other students (upperclassmen, people who live off campus, anyone who eats at cafés and late-night spots) burn through dining dollars and would happily give up a dining-hall swipe for more.
- **There's no way to trade.** Today the only "market" is GroupMe posts and asking friends to swipe you in. There's no pricing, no trust, and nothing that makes it fun.

**The insight:** each side holds something the other values more than they do. A market fixes that. A game layer makes it something people *want* to open every day.

## 2. Why this doesn't exist yet

1. Meal plan rules generally say swipes are **non-transferable**, so nobody has built openly on top of them.
2. Anything with chance, money and a prize counts as **gambling** legally, which scares builders off.
3. It needs **Yale-only identity** (NetID), so you aren't trading with strangers.

We treat 1 and 2 as design constraints, not reasons to stop (see [Risks](#6-risks-and-how-we-handle-them)). Number 3 is a feature: being Yale-only is the moat.

## 3. How it works

```
 Have extra swipes ──► Trade or play ──► Receive dining dollars
 Need dining dollars ◄──────────────────  (and vice versa)
```

1. **Log in** with your NetID and pick your residential college.
2. Your **wallet** shows your swipes and dining dollars. In the demo, every new account starts with 14 simulated swipes and $120 in dining dollars.
3. **Choose how to trade:**
   - **Straight trade:** a plain order book, e.g. "1 swipe for $8.50". No chance involved, and always the first option we show.
   - **Play for it:** put swipes or dining dollars into one of the games for a chance at more.
4. **Settle.** In the demo, balances update instantly in the app. A real launch would need a way to actually hand over a swipe, such as a guest swipe or a partnership with Yale Hospitality (see [Open questions](#9-open-questions)).

## 4. What we built

| Feature | How it works | Who can use it |
|---|---|---|
| 🔁 **Straight trade** | Post or accept "1 swipe for $X" offers. The swipe or the dollars are held in escrow when an offer is posted, so every accepted trade settles. Recent trades set the **market rate** that prices every game. | Everyone |
| 🪙 **Coin Flip** | Put up 1–3 swipes against the same number of swipes' worth of someone's dining dollars at the market rate. 50/50, winner takes both, no house cut. | 21+ |
| 🎟️ **Daily Jackpot** | One ticket = one swipe, or one swipe's worth of dining dollars. Everyone also gets **one free ticket a day** (no purchase necessary). A $25 sponsor contribution seeds every pot. Drawn at 9pm ET. | Free ticket: everyone. Paid tickets: 21+ |
| 🌦️ **Weather Parlays** | Bet on New Haven weather: "Will it rain 8–9pm?", "Will the high between 8pm and 9pm be 45–47°F?". Stack up to 6 legs; all must hit. Priced from the live Open-Meteo forecast and settled automatically against the recorded hourly weather. | 21+ |

We also built:
- **Provably fair draws.** Before every coin flip and jackpot opens, we publish the SHA-256 hash of a secret seed. After it resolves, the seed is revealed, and the `/verify` page recomputes the hash and the result in the browser, so nobody has to trust us.
- **A live activity feed**, e.g. "Priya (Ezra Stiles) won the jackpot: 2 swipes + $43.50".
- **Responsible-play controls**, covered in [Risks](#6-risks-and-how-we-handle-them).
- **A demo seed.** A fresh database comes with four demo students, open offers and open coin flips, so the market is never empty.

**How weather parlays are priced:** nobody naturally takes the other side of a weather bet, so a sponsor pool covers them. It pays **fair odds** (1 ÷ the forecast probability, with the house margin set to 0% by default), multiplied across legs.
- **Rain** uses the highest hourly chance of rain in the window.
- **Temperature** uses a normal distribution around the forecast high, which widens the further ahead the window is.
- **Caps:** payouts are capped at $500, and the pool refuses any bet it couldn't cover if every open parlay hit.

## 5. Economics

- **Market rate.** It's the average of the last 10 straight trades ($9.00 before any trades happen). Every game uses it, so a swipe is never valued at an arbitrary amount.
- **No house edge.** Coin flips are peer-to-peer with no cut. The jackpot pays out everything that goes in, plus the sponsor's contribution. Parlays pay fair odds. Taking a cut is what makes regulators care most, and we aren't trying to be a casino.
- **Sponsored pots are the clever part.** When a sponsor tops up the jackpot, players' expected value turns *positive*. That's great marketing, and it helps the legal picture.
- **Possible revenue later:** a small flat fee on straight trades, local New Haven restaurants sponsoring pots for exposure, or a licensing deal with Yale Hospitality.

## 6. Risks and how we handle them

We're upfront about these, because each one shaped the product.

| Risk | Reality | What we did |
|---|---|---|
| **Gambling law** | Legally, gambling = paying to play + chance + a prize. Connecticut only allows licensed online gambling, and only for people 21+. Most undergrads are under 21. | **Straight trades** involve no chance, so they're open to everyone. The **free daily jackpot ticket** makes the jackpot a "no purchase necessary" sweepstakes. Every game with a stake is **21+**. A real launch would need proper age verification and a legal review. |
| **Yale meal plan policy** | Swipes are generally non-transferable, and Yale Hospitality controls the card system. | Everything is a **demo with simulated balances**. The plan is to pitch this *to* Yale Hospitality as a way to cut food waste. |
| **Weather parlays are covered by the house** | Unlike the peer-to-peer games, the sponsor pool takes the other side of parlays. That makes them the most sportsbook-like feature. | 21+ only. Fair odds with no margin. Payout and exposure caps. Paid out from sponsor money, not from other players' losses. Before any real launch: a legal review, or run parlays as a free contest with sponsor prizes. |
| **Problem gambling** | Turning food money into a game for 18–22 year-olds can hurt people. | **Daily limit** on stakes ($40 by default, up to $200). A visible "played today" bar. **Pauses** of 24 hours, 7 days or 30 days that can be extended but never shortened. Straight trades are shown first. |
| **Food insecurity** | Someone could gamble away the swipes they need to eat. | **Swipe floor:** you can never stake swipes that would leave you with fewer than 3. |
| **Fraud and trust** | Trades that never get handed over. | Escrow on every offer and every coin flip. NetID accountability. |

> **Pitch:** *"A swipe exchange that turns wasted meals into dining dollars, made fun, fair and provably random, and designed from day one to stay within the law."* The responsible design is part of the product, not something we're conceding.

## 7. Technical overview

See [README.md](README.md) to run it.

- **Stack:** Next.js 16, React 19, Tailwind 4, mobile-first.
- **Backend:** Next.js route handlers in `src/app/api`. All game logic lives in `src/lib`.
- **Database:** SQLite through Node's built-in `node:sqlite`, so there's nothing to install. The app checks for new data every few seconds.
- **Weather:** Open-Meteo (free, no API key), cached in the database, plus a predictable mock mode for offline development.
- **Login:** a demo login with NetID format checks. A real launch would use Yale's own login (CAS).
- **Tests:** Vitest. They cover the odds math, the weather settlement rules and the fairness rolls. They also play every game end to end and check that swipes and dollars are never created or destroyed.

**Data model**

```
users            netid, display name, college, 21+ flag, daily limit, paused until
wallets          swipes, dining dollars (cents)
ledger           every balance change, append-only; the source of truth
offers, trades   straight-trade order book and fills
coinflips        stakes, seed hash, revealed seed, roll, winner
jackpots         daily pot, sponsor amount, seed hash, winning ticket
jackpot_entries  free / swipe / dining-dollar tickets
parlays          stake, odds, payout, status
parlay_legs      window, pick, forecast at bet time, observed result
events           activity feed
weather_cache    cached Open-Meteo forecast
```

Balances only change through one function, `ledger.move()`, inside a database transaction, so every swipe and dollar can be traced back to its source.

**API**

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout` | Demo login |
| `GET /api/me`, `PATCH /api/settings` | Wallet, limits, pauses |
| `GET/POST /api/offers`, `POST /api/offers/:id/accept`, `POST /api/offers/:id/cancel` | Straight trades |
| `GET/POST /api/coinflips`, `POST /api/coinflips/:id/take`, `POST /api/coinflips/:id/cancel` | Coin flips |
| `GET /api/jackpot`, `POST /api/jackpot/enter` | Daily jackpot |
| `GET /api/weather`, `POST /api/parlays/quote`, `GET/POST /api/parlays` | Weather parlays |
| `GET /api/verify`, `GET /api/feed` | Fairness checks, activity feed |

## 8. Roadmap

**Next up**
- **Deploy it.** Run it as one Node server with a persistent disk (e.g. Fly or Render), or move the database to Postgres (e.g. Supabase) for Vercel.
- **Real Yale login** (CAS) and proper age verification.
- **College Cup:** residential colleges compete, every entry adds to your college's pot, and the winning college splits it each week.
- **Notifications** for jackpot draws and settled parlays.

**Later**
- **Odds Slider:** choose your own odds, e.g. risk 1 swipe for a 25% chance at 4× the market rate.
- **Event props:** "Will Yale beat Harvard at The Game?", "Will it snow before finals?"
- **Donate a swipe:** send spare swipes to a swipe bank for students who need meals.
- **Reputation and reporting** for trades.
- **Dining assistant:** tells you whether to trade, hold or play, based on how many swipes you have left and how many weeks remain in the semester.
- **Real settlement** with Yale Hospitality, so a traded swipe actually moves between student IDs.

## 9. Open questions

- What are Yale's current meal plan tiers and dining-dollar rules for each class year?
- Could guest swipes be the real-world way to hand over a swipe?
- Should we ever charge a fee, or stay free and sponsor-funded?
- Would Yale Hospitality partner on this as a food-waste initiative?
