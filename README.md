# SwipeStakes

**Turn the meal swipes you won't use into dining dollars you will.**

Every week, Yale students let meal swipes go to waste while their friends run out of dining dollars. SwipeStakes connects the two: trade swipes straight up, or play for them with provably fair games and parlays on New Haven weather.

## Demo

https://github.com/user-attachments/assets/1f6e0286-f745-45e8-971b-349cf9f8f063

## Features

| | What it is | Who can use it |
|---|---|---|
| 🔁 **Straight trade** | Post or accept "1 swipe for $X" offers. Both sides are held in escrow, so every accepted trade settles. | Everyone |
| 🪙 **Coin Flip** | Your swipes vs. someone's dining dollars at the market rate. 50/50, winner takes both, no house cut. | 21+ |
| 🎟️ **Daily Jackpot** | One free ticket every day (no purchase necessary), plus paid tickets. A sponsor pool boosts every pot. Drawn at 9pm ET. | Free ticket: everyone. Paid tickets: 21+ |
| 🌦️ **Weather parlays** | "Will it rain 8–9pm?" "Will the high between 8pm and 9pm be 45–47°F?" Stack up to 6 legs, priced live from the forecast with no house edge. | 21+ |

**Provably fair.** Before every coin flip and jackpot draw, we publish the SHA-256 hash of a secret seed. Once it's over, the seed is revealed and the `/verify` page recomputes the hash and the result in your browser, so nobody has to take our word for it.

**Responsible by design.** Games with a stake are 21+. Everyone has a daily limit and a swipe floor, so nobody can bet away the swipes they need to eat, and players can pause games for 24 hours, 7 days or 30 days. Straight trades and the free jackpot ticket stay open to everyone.

> Hackathon demo: balances are simulated, and no real swipes or money move.

## Built with Grok

<img width="1512" height="851" alt="Using Grok while building SwipeStakes" src="https://github.com/user-attachments/assets/edf8f33b-9470-4e16-9667-bb965d5b9485" />

<!-- Add a sentence or two here on what you used Grok for. -->

## Run it locally

You need Node 22.13 or newer. The database is Node's built-in SQLite, so there's nothing else to install.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000 and log in with any NetID-style username (for example `abc123`). A fresh database comes with four demo students, open offers and open coin flips, so the market isn't empty.

To start over, stop the server and delete `data/swipestakes.db*`.

<details>
<summary>Environment variables</summary>

See `.env.example`.

| Variable | Default | What it does |
|---|---|---|
| `WEATHER_PROVIDER` | `open-meteo` | Set to `mock` for deterministic offline weather during development. |
| `DATABASE_PATH` | `data/swipestakes.db` | Where the SQLite file lives (git-ignored). |
| `SESSION_SECRET` | dev value | Signs the login cookie. |
| `PARLAY_MARGIN` | `0` | House margin on parlay odds (`0.05` = 5%). |
| `SEED_DEMO` | `true` | Seeds demo students into an empty database. |

Forecasts come from Open-Meteo and are cached for 10 minutes. If the API is unavailable, a cached forecast up to 6 hours old is used.

</details>

## Tests

```bash
npm test
```

```bash
npm run typecheck
```

The tests cover the odds math, the weather settlement rules and the provably fair rolls. They also play every game end to end against an in-memory database and check that swipes and dollars are never created or destroyed.

## How it works

**Stack:** Next.js 16, React 19, Tailwind 4 and SQLite (`node:sqlite`). Weather data comes from [Open-Meteo](https://open-meteo.com).

```
src/lib/          Game logic
  ledger.ts       The only way balances change (append-only ledger)
  limits.ts       21+, daily limit, swipe floor, pauses
  fair.ts         Commit-reveal randomness
  trading.ts      Order book with escrow
  coinflip.ts     Coin flips
  jackpot.ts      Daily jackpot
  weather.ts      Open-Meteo client, cache and mock provider
  odds.ts         Weather leg pricing and settlement
  parlay.ts       Parlay placement and settlement
src/app/api/      JSON API
src/app/(app)/    Pages: home, trade, flip, jackpot, weather, verify, settings
```

<details>
<summary>Weather parlay rules</summary>

- A window like 8pm–9pm uses the 8:00pm and 9:00pm temperature readings. The window's "high" is the larger of the two.
- **Rain** means at least 0.01" of measured precipitation in the window. It's priced from the highest hourly chance of rain in the window.
- **Temperature** is priced as a normal distribution around the forecast high. The spread widens the further ahead the window is: ±1.5°F, plus 0.08°F per hour, capped at ±6°F.
- Legs can be for today or tomorrow, must start in the future, and run 1–12 hours. Two legs of the same type can't overlap.
- Each leg's probability is clamped to 2–98%. Parlay odds are capped at 250×, and payouts at $500.
- A sponsor pool covers parlay payouts. It refuses any bet it couldn't pay if every open parlay won.
- Legs settle about an hour after their window closes. If there's still no data after 24 hours, the parlay is voided and the stake refunded.

</details>

## More

The full product plan, including the risks and the compliance approach, is in [PLAN.md](PLAN.md).
