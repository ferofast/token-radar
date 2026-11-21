# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ferofast/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ferofast/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar: size curve tested blind (LOO ×2.85 vs ×4.05 flat), rank ranges over 200 refits, every farm plan netted to the dollar.

One fitted log-log size curve prices 192 pre-token protocols by implied value — 40 watchlist rows plus 152 pre-token rows ranked by implied value with no TVL floor, so no legitimate protocol is dropped for being below an arbitrary cutoff. The model is `log10(implied) = 7.2140 + 0.5752 · log10(TVL / $100M) + category (k=12 shrinkage) + breadth (−0.307 · log10(chains/2))`, fitted on 83 traded comparables (level $16.37M at $100M TVL). Board total $2.18B implied, median $7.12M. Verdicts at a $1,000 ticket and 10% share: ROBUST 83, FARM 73, THIN 25, SKIP 11. Sentora Curator ranks #1 at $89.1M (rank range 1–2), Steakhouse Financial #2 at $73.5M (2–3), Polymarket International #9 at $39.6M (5–10, FARM).

The curve is tested blind, not just fitted: leave-one-out median miss ×2.845 vs ×4.046 for a flat mcap/TVL line (the full model beats flat on 29.7% of comparables; curve + category alone on 16.8%), time-split ×1.906 vs ×3.528 (beats flat 46.0%), bootstrap slope 0.564 ± 0.121 (P5–P95 0.387–0.774). Three alternative comparables sets (98, 123 and 84 comps) and growth + seasoning tilts were tested and not adopted — none cleared the slope and leave-one-out gates together, and the tilts (r = +0.03 growth, +0.05 seasoning) are not confirmed by this snapshot, so they stay out. Every row carries a rank range (P10–P90 over 200 whole-pipeline bootstrap refits), a break-even odds column (fees + forgone yield over the slice), and an 8-step farm plan with a WHEN column (day 0 / day 3 / weekly / exit day), costed to the dollar with a sensitivity table. The 150 set-aside protocols are listed with the house rule that excluded each one.

## Run it

```sh
node main.ts --input /input/snapshot.json --output /output
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=0280650f&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
