# Token Radar — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/biuosa09-create/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/biuosa09-create/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for make.fun bounty [`token-radar-01`](https://make.fun/bounty/token-radar-01):
a radar that reads a sealed snapshot of every protocol DefiLlama tracks, ranks the
pre-token ones by what their token would be worth, and shows a reader how to farm each.

New to make.fun? Sign up with my referral link: https://make.fun/r/shw861zs (code `shw861zs`).

## What it is

- **198 rows scored** from the snapshot's 758 protocols: the whole 40-protocol watchlist
  (every protocol with at least $50M of TVL and no token on record) plus 158 more pre-token
  protocols the floor leaves out — the whole pre-token universe, not just the biggest few.
- **A model built from the snapshot's own figures, not a flat multiple.** Each category's
  multiple is the median market-cap / TVL of the live-token protocols in that category,
  shrunk toward the global median by n/(n+5) and clamped to [0.05, 1.25]. A category with
  one live protocol barely moves the multiple; one with fifteen mostly sets it. Implied value
  is then `TVL x multiple x growth x maturity`, where growth is the seven-day TVL change
  (clamped to [-60, 120]%, weight 0.5) and maturity is how long the protocol has run with no
  token (0.6 + min(age, 1095)/1095 x 0.4). No protocol name is ever special-cased.
- **Wrapped, staked and bridged products are excluded** by the watchlist's own rule, applied
  to the whole board: no CEX, no Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking /
  Restaked BTC, no versioned pool, no name carrying "wrapped", "staked" or "staking", no
  exchange's own product. A big wrapped product can never top the board on TVL alone.
- **A dashboard a reader can use**: a sortable, filterable board (search, category, chain,
  TVL, watchlist-only), a detail view for every protocol (model breakdown with the exact
  multiple and comparables behind it, farm plan, risks), a live-token view showing the market
  caps and multiples the model learned from, a method page with the full comparables table,
  and a model sandbox that re-ranks the board live on different parameters. The page
  recomputes every row from the snapshot figures and checks the number board.json carries.
- **Farm plans with costs and times**: six steps per protocol, derived from its category,
  chains, TVL and age — the position, a weekly action to keep it active, a hold long enough
  to count in more than one snapshot, a safe claim, and a farm log.

## Data and honesty

- The snapshot is DefiLlama's protocol index, fetched 2026-11-14 (`input/snapshot.json` in
  the kit). Every figure on the board traces to it; where it lacks a signal (four protocols
  report no seven-day change, 113 report no listing date), the model says so and uses a
  stated fallback (0% growth, 365 days).
- The snapshot records no token; it does not prove there is none. A protocol on this board
  may still have a token its DefiLlama record does not carry. The implied value is this
  entry's claim, never a price, and the board does not predict whether or when a token is
  issued. Farming does not guarantee an airdrop.

## Top of the board

1. Steakhouse Financial — $1.47B implied (Risk Curators, $2.75B TVL, 0.67x multiple)
2. Sentora Curator — $1.41B (Risk Curators, $2.76B TVL, 0.67x)
3. Gauntlet — $873M (Risk Curators, $1.58B TVL, 0.67x)
4. Polymarket International — $398M (Prediction Market, $320M TVL, 1.25x)
5. Nonce Capital — $203M (Risk Curators, $514M TVL, 0.67x)

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22.18 or later, standard library only, no network. `main.ts` writes
`board.json` (the 198 ranked rows), `data.js` (the dashboard's data), copies
`dashboard/` and `screenshots/` to the output, and writes `dossier.json` with the
vendored make.fun library. The program is deterministic: two runs write the same bytes.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the board, the data and the dossier.
- `lib/model.ts` — the model: comparables, ranking, farm plans, board validation.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js` (no network, no framework).
- `screenshots/` — the board, a protocol's detail view, a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, unchanged.
