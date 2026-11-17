export const config = {
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-secret-change-me",
  databasePath: process.env.DATABASE_PATH ?? "data/swipestakes.db",
  weatherProvider: (process.env.WEATHER_PROVIDER ?? "open-meteo") as "open-meteo" | "mock",
  parlayMargin: Number(process.env.PARLAY_MARGIN ?? 0),
  seedDemo: process.env.SEED_DEMO !== "false",

  /** Fallback price of one swipe, in cents, before any trades have happened. */
  defaultRateCents: 900,
  /** Simulated balances every new account starts with. */
  signupSwipes: 14,
  signupCents: 120_00,
  /** Responsible play. */
  defaultDailyLimitCents: 40_00,
  maxDailyLimitCents: 200_00,
  /** You can never stake swipes below this many remaining: keeps people fed. */
  swipeFloor: 3,
  /** Daily jackpot. */
  jackpotDrawHourET: 21,
  jackpotSponsorCents: 25_00,
  jackpotMaxPaidTicketsPerDay: 5,
  /** Weather parlays. */
  parlayMaxLegs: 6,
  parlayMaxOdds: 250,
  parlayMaxPayoutCents: 500_00,
  houseSeedCents: 5_000_00,
  /** New Haven Green. */
  location: { latitude: 41.3083, longitude: -72.9279, name: "New Haven, CT" },
  timeZone: "America/New_York",
};

export const COLLEGES = [
  "Benjamin Franklin",
  "Berkeley",
  "Branford",
  "Davenport",
  "Ezra Stiles",
  "Grace Hopper",
  "Jonathan Edwards",
  "Morse",
  "Pauli Murray",
  "Pierson",
  "Saybrook",
  "Silliman",
  "Timothy Dwight",
  "Trumbull",
] as const;
