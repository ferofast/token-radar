# Token Radar — pre-token protocols, ranked by implied value

A program + static dashboard that ranks pre-token DeFi protocols by what a token *would*
be worth if the protocol's record stayed as it is, each with a concrete farm plan. It reads
one sealed snapshot (`input/snapshot.json`, DefiLlama protocols fetched 2026-11-14) and
nothing else: no network at run time, no live data, no prediction of whether or when a
token launches.

## The model (radar-2)

```
implied = round( tvl_usd x category_multiple x growth x maturity x breadth )
```

- **category_multiple** — the median market-cap/TVL ratio of the live-token protocols in
  the same category, shrunk toward the market-wide median (weight n/(n+3)). Categories with
  fewer than 3 live peers use the market-wide median. Dexs price near 0.31x TVL, liquid
  staking near 0.06x: the market really does pay different multiples for different
  businesses, and the model says so. No protocol name is ever special-cased.
- **growth** — `1 + clamp(change_7d, -60, +120) / 100 x 0.5`.
- **maturity** — `0.6 + 0.4 x min(age_days, 1095) / 1095`; unknown age counts as 365 days.
- **breadth** — `1 + 0.05 x ln(chains)`.

The board covers the whole 40-protocol watchlist (the floor) and adds the early radar:
pre-token protocols below the $50M floor, by TVL. Live-token protocols are set aside with
their market caps shown — the market's own values, never mixed into the ranking.

## Farm plans

Eight steps per protocol, each with what it costs and how long it takes. The steps follow
the protocol's category (lending, DEX, bridge, staking, perps, curator vaults, RWA, ...),
its chains (gas costs differ), its TVL (capital size) and its age (hold window). Nothing
is a slogan: every step names an action, a cost and a time.

## The dashboard

`dashboard/` is a static page with no network: `index.html`, `app.css`, `app.js`. It reads
`data.js` (written beside it by the program) and renders the ranked board with a top-3
spotlight, search, category and chain filters, a watchlist-only toggle, sortable columns,
a live-token view set apart, a detail view per protocol (why this rank, the model's four
multipliers recomputed in the page, the farm plan) and a model panel that states the
formula and prints the category multiples table. The page recomputes each row's implied
value and checks the number `board.json` carries.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and
`out/dossier.json`. Deterministic: two runs write identical bytes.

## Layout

- `main.ts` — entrypoint: read the snapshot, build the board, write the outputs.
- `lib/model.ts` — the model, the farm plans, the snapshot parser, the gate self-check.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte as shipped.
- `dashboard/` — the static page.
- `screenshots/` — the board, a detail view and a filtered view, taken of this dashboard.

## License

MIT. See `LICENSE`.
