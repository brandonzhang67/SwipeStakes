# SwipeStakes

Trade Yale meal swipes for dining dollars. There are four ways to play:

- **Straight trade:** post or accept "1 swipe for $X" offers. No chance involved, and open to everyone.
- **Coin Flip:** your swipes against someone's dining dollars at the market rate. 50/50, winner takes both, no house cut.
- **Daily Jackpot:** one free ticket per day (no purchase necessary), plus paid tickets. The sponsor pool boosts every pot. Drawn at 9pm ET.
- **Weather parlays:** bet on New Haven weather, such as "Will it rain 8–9pm?" or "Will the high between 8pm and 9pm be 45–47°F?". You can stack up to 6 legs. Odds come straight from the Open-Meteo forecast with no house edge, and legs settle against observed hourly data.

Coin flips and the jackpot are **provably fair**. Every draw commits to `sha256(seed)` before the game opens, and the `/verify` page recomputes the hash and the roll in your browser after the seed is revealed.

The product reasoning, the risks and the compliance design are all in [PLAN.md](PLAN.md).

> Hackathon demo: balances are simulated, and no real swipes or money move.
## Demo



https://github.com/user-attachments/assets/1f6e0286-f745-45e8-971b-349cf9f8f063



## Built with Grok

<img width="1512" height="851" alt="Screenshot 2026-11-17 at 6 14 02 PM" src="https://github.com/user-attachments/assets/edf8f33b-9470-4e16-9667-bb965d5b9485" />


## Run it

You need Node 22.13 or newer. The database uses the built-in `node:sqlite`, so there is no database to install.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000 and log in with any NetID-shaped string (for example `abc123`). On first boot the database is seeded with four demo students, some open offers and some open coin flips, so the market isn't empty.

Useful environment variables (see `.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `WEATHER_PROVIDER` | `open-meteo` | Set it to `mock` to use deterministic offline weather for development. Never use `mock` for real stakes. |
| `DATABASE_PATH` | `data/swipestakes.db` | SQLite file (git-ignored). Delete it to reset everything. |
| `SESSION_SECRET` | dev value | Signs the demo login cookie. |
| `PARLAY_MARGIN` | `0` | House margin on parlay odds (`0.05` = 5%). |
| `SEED_DEMO` | `true` | Seeds demo users on an empty database. |

Open-Meteo's free tier is rate-limited per IP. Forecasts are cached for 10 minutes, and a cached forecast up to 6 hours old is used if the API is unavailable.

## Test

```bash
npm test
```

```bash
npm run typecheck
```

The tests cover:
- odds math, window and settlement rules, and fairness (`src/lib/odds.test.ts`);
- every game end to end against an in-memory database with mock weather (`src/lib/games.test.ts`), including checks that swipes and dollars are never created or destroyed.

## How it's built

```
src/lib/          Server-side logic (no framework code)
  db.ts           SQLite schema + transaction helper
  ledger.ts       move(): the only way balances change. Append-only ledger.
  limits.ts       21+, daily limit, swipe floor, self-exclusion
  fair.ts         Commit-reveal randomness
  trading.ts      Order book with escrow
  coinflip.ts     Coin flips
  jackpot.ts      Daily jackpot (lazy draw on the first request after 9pm ET)
  weather.ts      Open-Meteo client + cache + mock provider
  odds.ts         Pure pricing/settlement for weather legs
  parlay.ts       Parlay validation, placement, settlement
src/app/api/      JSON route handlers
src/app/(app)/    Pages: home, market, flip, jackpot, parlays, verify, settings
```

### Weather parlay rules

- A window like 8pm–9pm uses the **8:00pm and 9:00pm temperature readings**. The window's "high" is the larger of the two.
- **Rain** means at least 0.01" of measured precipitation across the window. The price uses the highest hourly chance of precipitation in the window.
- **Temperature** is priced as a normal distribution around the forecast high. Its spread grows with lead time: ±1.5°F plus 0.08°F per hour ahead, capped at ±6°F.
- Legs can be for today or tomorrow, must start in the future, and run 1–12 hours. Two legs of the same type can't overlap.
- Each leg's probability is clamped to 2–98%. Parlay odds are capped at 250x, and the payout is capped at $500.
- The sponsor pool banks parlays and refuses bets it couldn't cover if every open parlay won.
- Legs settle about an hour after their window closes. If there's no data after 24 hours, the parlay is voided and the stake refunded.
