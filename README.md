# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ferofast/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ferofast/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Fleet Crystal v2 ranks 192 pre-token protocols by a fitted size curve — log10(implied) = 7.2140 + 0.5752 · log10(TVL / $100M), plus a shrunk category effect and a validated breadth factor — and nets every farm plan to the dollar at a $1,000 ticket. The curve was tested blind (leave-one-out ×2.85 vs ×4.05 flat; time-split ×1.91 vs ×3.53), and the dashboard recomputes every value live from the same model, so the page and board.json always agree.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program reads the sealed snapshot, writes `out/board.json` (192 rows), the dashboard's data beside the page, copies `dashboard/` and `screenshots/` to `out/`, writes `out/dossier.json`, and runs its own seven-row gate check. It needs Node 22 and nothing else — standard library only, no network, no clock, no randomness. Two runs on the same snapshot write byte-identical outputs.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0280650f&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## The model (radar-3)

A pre-token protocol is worth what a traded protocol of its size is worth. The curve is fitted on 83 traded comparables — 758 protocols in the snapshot, 144 with a market cap, 128 positive, 85 after house drops (9 CEX, 18 bridge, 15 staking, 1 versioned name), 83 after trimming mcap/TVL outside [1/500, 50]:

```
log10(implied) = 7.2140 + 0.5752 · log10(TVL / $100M)
  + category effect (shrunk, k=12; none with fewer than 2 comparables)
  + breadth −0.307 · log10(chains / 2), capped ±0.176
  × 0.5 when the protocol shares a first word with a traded protocol (sibling)
```

At $100M TVL the fitted level is $16.37M (×0.164). R² is 0.172 — size explains a sixth of market-cap variation, so every implied value carries its P25–P75 band (×0.40–×3.58) on the board. Momentum and seasoning were tested and dropped (r = +0.028 and +0.052, not confirmed); breadth is the only validated factor (r = −0.174).

## Blind tests

| Test | Model | Flat | Beat flat |
| --- | --- | --- | --- |
| Leave-one-out (n=83) | ×2.845 · within 3× 50.6% | ×4.046 | 29.7% |
| Time-split (fit pre-2024 n=26, test post-2024 n=37) | ×1.906 · within 3× 59.5% | ×3.528 | 46.0% |

Bootstrap (200×): slope 0.564 ± 0.121; level $16,854,605 ± $3,883,107. Gate 1 passes on both conditions — but honestly: without any factor the leave-one-out beat is 16.8%, below the 25% bar. The pass rests on breadth, one factor, implemented exactly as fitted.

## Verdicts (at the $1,000 ticket, 10% airdrop share)

Slice = (ticket / (TVL + ticket)) × implied × share — the ticket joins the TVL, so the share is dilutive, not ticket / TVL; minus farm fees (bridge $5 when the cheapest chain is not Ethereum, plus two transactions each way at that chain's gas price); minus the T-bill yield forgone on the ticket for the hold (4% a year). Net > 0 is FARM; net > 0 even at the P25 end of the band is ROBUST; slice below the fees is SKIP; the rest is THIN.

- ROBUST 82 · FARM 78 · THIN 19 · SKIP 13 — 160 of 192 rows pay at $1,000.
- Best net per hour: Reya Perps, +$27.23/h.
- Rank 1 is Steakhouse Financial at $73.5M — inside the top-10 field range of $31M–$126M. Board total $2.03B, median row $7.5M.

## The board

192 rows: the 40 watchlist protocols plus the 152 pre-token protocols below the $50M floor with the most TVL. 150 more pre-token protocols are set aside with their reason (above the floor, or below the board cut) on the Set aside tab. The dashboard has four views — board, token trades (the 83 comparables), set aside, and the full method and backtest — and every value on the page is recomputed live from the same model. The hero badge reads the match count: 192/192 rows reproduced exactly.

## Layout

- `main.ts` — entrypoint: reads the snapshot, builds the board, writes the outputs, runs the gate self-check.
- `lib/model.ts` — the radar-3 model, the farm economics, the board builder and the dashboard data.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (renders every view and recomputes every value live), `data.js` (written by the program).
- `vendor/makefun-board.ts` — the kit's dossier builder, unchanged.
- `screenshots/` — board, detail and filtered views at 1280×800.
