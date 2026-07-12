# The Math — how value is calculated and patterns are found

This is the mentor's arithmetic. Anyone with this dashboard gets the same
math; only the data is theirs. No AI key at runtime — Claude Code computes
at write time (on /sweep or when asked) and writes plain numbers; the board
renders them.

## 1 · Value right now: the equation

Every tile reports one normalized input score for the day, x ∈ 0–100:

| tile    | x =                                               |
|---------|---------------------------------------------------|
| fuel    | min(100, water_today / goal × 100)                |
| train   | sessions_this_week / weekly_target × 100 (cap 100)|
| vitals  | the recovery estimate (already 0–100)             |
| peak    | today's average predicted score                   |
| brand   | this week's growth / target pace × 100 (cap 100)  |
| finance | on-plan ratio vs monthly target (cap 100)         |

Each tile carries a weight w toward the ACTIVE goal (weights sum to 100,
lib/tiles/weights.ts). The day's value:

    y = Σ (wᵢ · xᵢ) / 100        → one 0–100 number

That's the board: y on top, the weighted x's in the row.

## 2 · Value over time: progress

- Measurable goal (e.g. 185 lb lean):
      progress = (start − current) / (start − target) × 100
- Growth goal (e.g. famous YouTuber — pick ONE proxy metric, e.g. subs):
      progress = ln(current/start) / ln(target/start) × 100
  Log-scaled because growth is exponential: 1K→10K is the same-size step
  as 10K→100K.

The mentor writes `progress` into the goal; the bar renders it.

## 3 · Patterns: the noticing

Histories are append-only and time-stamped, so a pattern is just columns
lined up by date.

1. Build daily series per stream (water count, trained yes/no, sleep hours,
   views, …).
2. Correlate day-over-day CHANGES, not raw levels (a general uptrend must
   not fake a pattern).
3. Scan lags 0, 1, 2 days (yesterday's sleep → today's output). The
   strongest |r| names the direction.
4. Thresholds: |r| > 0.5 AND n ≥ 10 days → a real pattern. Write it to the
   noticed feed with the key words **bold**.
5. Under 10 days of data: say "still learning you." Never invent insight.

## 4 · Evidence retunes the weights

Weights start as interview priors. Every ~2 weeks, for each tile compute r
between its stream and the goal's proxy, then glide:

    wᵢ ← wᵢ + 0.2 × (rᵢ·100 − wᵢ)     then renormalize to Σw = 100

Never jump a weight; glide it. When a tile that had no weight shows real
signal, it ENTERS the goal (that's the seeded example: Train entered the
YouTuber goal at 8% because workouts predicted output).

## 5 · Recovery (vitals → peak) — one formula, two runners

Poor sleep must reshape the Peak curve. Two things compute recovery and they
MUST agree, or the number flip-flops between refreshes:

- **The tile, client-side (hardwired).** Peak reads the vitals slot on load
  (`window.Vitality.read('vitals')`) and derives today's recovery itself — no
  connector, no sweep. This is why a bad night shows up the instant they
  refresh.
- **The mentor, server-side (/sweep).** When the connector is on, the nightly
  sweep writes the same recovery into `peak.whoop.recovery` so it's fresh even
  when the app is closed.

Both use this EXACT formula. A device recovery (`whoopRecovery`, from WHOOP in
Episode 2) wins outright; otherwise it's the two bone-simple manual inputs:

    clamp01(x) = max(0, min(1, x))

    whoopRecovery present → round(whoopRecovery)          (a device wins)
    else, weighted average of what exists:
      feel   present → clamp(0..100, feel)                weight 0.6
      sleep  present → clamp01(sleepHours / 8) · 100       weight 0.4

    recovery = round( Σ(partᵢ · wᵢ) / Σ wᵢ ),  clamped to 1..99

`feel` is the 0–100 value behind the Vitals feel chips (Wrecked 25 … Great 95).
Peak then scales its whole curve by `k = 0.55 + (recovery/100)·0.65`. The
canonical source is `estRecovery` in `tiles-library/vitals.html`; the verbatim
copy is `recoveryFromVitals` in `peak.html`. Change one, change all three
(both tiles + this doc + the /sweep step). Never round differently or add a
term — matching is the whole point.

## House rules

- One proxy metric per goal — more makes progress unfalsifiable.
- Append-only histories; the math never rewrites the past.
- Every Notice must trace back to numbers that exist in a tile's store.
- Show the work when asked: the mentor can print the r table any time.
