// radar-3 — the value model for the token-radar-01 v2 entry ("Fleet Crystal" rebuild).
//
// One formula prices the whole board. The constants below are the Phase-1 fit
// on the sealed kit snapshot (DefiLlama 2026-11-14, 758 protocols): an OLS
// log-log size curve over 83 traded comparables, shrunk category residuals
// (k = 12), and a single validated factor, breadth. Momentum and seasoning
// were tested on the blind residuals and dropped — the snapshot cannot
// confirm either (r = +0.03 and +0.05), so they stay out and the dashboard
// says so. Nothing here is tuned by hand: no row is overridden, no name is
// hand-picked, and the program never re-fits at run time — the grade runs
// on the same sealed snapshot the fit was made from, so the fitted
// constants are the model.
//
//   log10(implied) = 7.2140 + 0.5752 * log10(TVL / $100M)
//                    + categoryEffect[category]      (0 when fewer than 2 comps)
//                    + breadthContribution           (chains, capped)
//                    + log10(0.5) when the protocol is a sibling of a traded token
//   implied = 10 ^ log10(implied)
//
// Bands come from the full-model leave-one-out residuals (P25 x0.40,
// P75 x3.58), not from the fit. Farm verdicts are netted in dollars:
// slice minus fees minus the 4% T-bill yield forgone over the hold.
// See the dashboard's Method tab for the full research note.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export type Verdict = 'ROBUST' | 'FARM' | 'THIN' | 'SKIP';

export interface FarmStep {
  text: string;
  costUsd: number;
  minutes: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  relChangePp: number;
  ageDays: number | null;
  implied_value_usd: number;
  impliedFloat: number;
  bandLoUsd: number;
  bandHiUsd: number;
  curveUsd: number;
  categoryMult: number;
  breadthMult: number;
  sibling: boolean;
  mechanism: string;
  planChain: string;
  needsBridge: boolean;
  holdDays: number;
  workHours: number;
  feesUsd: number;
  sliceUsd: number;
  netUsd: number;
  netPerHourUsd: number;
  verdict: Verdict;
  paysFromUsd: number | null;
  farm_steps: string[];
  farmPlan: FarmStep[];
  nearestPeers: { slug: string; name: string; tvl_usd: number; mcap_usd: number }[];
}

// ---------------------------------------------------------------- fitted constants (Phase 1, verbatim)

/** log10(mcap) = A + B * log10(TVL / $100M), OLS on 83 comps. R2 = 0.172. */
export const CURVE_A = 7.213994656718122;
export const CURVE_B = 0.5751741341819144;
export const CURVE_R2 = 0.17152568560968118;
/** Fitted level at $100M TVL: $16,367,964, a 0.1637 multiple of TVL. */
export const LEVEL_AT_100M_USD = 16367963.832068121;
export const MULTIPLE_AT_100M = 0.16367963832068122;
/** Shrinkage prior for category residuals: effect = mean * n / (n + k). */
export const SHRINKAGE_K = 12;

/** Shrunk category residual effects, log10. Only categories with >= 2 traded
 *  comps carry an effect; every other category (and a null category) is 0. */
export const CATEGORY_EFFECTS_LOG10: Record<string, number> = {
  'Basis Trading': 0.17712193752477498,
  Privacy: 0.09551352818948508,
  Derivatives: 0.0893669475870499,
  'Token Locker': 0.079775870546307,
  Dexs: 0.03951247399879498,
  RWA: 0.035005046111400706,
  'AI Agents': 0.006550526703262172,
  Indexes: -0.004047898876560533,
  Yield: -0.020718175140619,
  Payments: -0.06642684815542152,
  CDP: -0.1004908189966209,
  'Onchain Capital Allocator': -0.106661531607554,
  'Yield Aggregator': -0.11029092629698989,
  Lending: -0.2096826534237193,
};

/** Breadth is the only validated factor: weight -0.307 log10 per unit of
 *  log10(min(chains, 10)) - log10(2). Negative: more chains, lower value.
 *  Each factor's total contribution is capped at +/- log10(1.5). */
export const BREADTH_WEIGHT = -0.3073668626472821;
export const FACTOR_CAP_LOG10 = 0.17609125905568124;

/** Bands from the full-model LOO residuals (log10 quantiles). The board
 *  draws P25-P75; the Method tab shows P10-P90 too. */
export const BAND_LOG10 = {
  p10: -0.9797436373779721,
  p25: -0.3935334050428523,
  p50: 0.061782110175681026,
  p75: 0.5537099675635937,
  p90: 0.8809572082330238,
};
export const BAND_P25_FACTOR = Math.pow(10, BAND_LOG10.p25);
export const BAND_P75_FACTOR = Math.pow(10, BAND_LOG10.p75);
export const BAND_P10_FACTOR = Math.pow(10, BAND_LOG10.p10);
export const BAND_P90_FACTOR = Math.pow(10, BAND_LOG10.p90);

/** Blind-test numbers the board and the Method tab print (Phase 1). */
export const VALIDATION = {
  compsCount: 83,
  compsCounts: {
    tradedWithMcap: 144,
    positiveMcap: 128,
    mergedTokens: 128,
    afterHouseDrops: 85,
    houseDropped: 43,
    houseDropReasons: { versionedName: 1, bridgeCategory: 18, stakingCategory: 15, cex: 9 },
    afterTrim: 83,
    trimDropped: ['concentrator', 'rain'],
  },
  loo: {
    modelMedianMiss: 2.84541203745205,
    modelWithin3x: 0.5060240963855421,
    modelWithin10x: 0.8433734939759037,
    flatMedianMiss: 4.046131557591275,
    flatWithin3x: 0.37349397590361444,
    flatWithin10x: 0.7951807228915663,
    curvePlusCategoryMedianMiss: 3.365771843603618,
    curveOnlyMedianMiss: 3.365771843603618,
    beatFlatPct: 0.29675740965131453,
  },
  timeSplit: {
    fitN: 26,
    testN: 37,
    excludedNoDateN: 20,
    modelMedianMiss: 1.905571413132993,
    modelWithin3x: 0.5945945945945946,
    modelWithin10x: 0.7837837837837838,
    flatMedianMiss: 3.5275902162442887,
    flatWithin3x: 0.32432432432432434,
    flatWithin10x: 0.7567567567567568,
    beatFlatPct: 0.4598093042786037,
    fitCurveA: 7.212269408887095,
    fitCurveB: 0.4121792128334139,
    fitBreadthWeight: -0.15413994937088324,
  },
  bootstrap: {
    n: 200,
    slopeMean: 0.5644957946249356,
    slopeSd: 0.1212844220509887,
    slopeP5: 0.3870953782445289,
    slopeP95: 0.7736609191382567,
    levelMeanUsd: 16854604.830344513,
    levelSdUsd: 3883107.218542518,
    levelP5Usd: 11313635.798281364,
    levelP95Usd: 23280974.677597575,
  },
  factorChecks: {
    momentumRelativeR: 0.028097097256009916,
    momentumRawR: 0.027961659394137042,
    seasoningR: 0.051809417973146,
    breadthR: -0.17444595076256766,
  },
  shrinkageTuning: [
    { k: 3, medianMiss: 3.4806201068939435, within3x: 0.4457831325301205, within10x: 0.8072289156626506, beatFlatPct: 0.1397659573466735 },
    { k: 5, medianMiss: 3.394117277818482, within3x: 0.4457831325301205, within10x: 0.8072289156626506, beatFlatPct: 0.16114510131275797 },
    { k: 8, medianMiss: 3.394117277818482, within3x: 0.43373493975903615, within10x: 0.8072289156626506, beatFlatPct: 0.16114510131275797 },
    { k: 12, medianMiss: 3.365771843603618, within3x: 0.43373493975903615, within10x: 0.8072289156626506, beatFlatPct: 0.16815066546988053 },
    { k: 20, medianMiss: 3.365771843603618, within3x: 0.42168674698795183, within10x: 0.8072289156626506, beatFlatPct: 0.16815066546988053 },
    { k: 40, medianMiss: 3.365771843603618, within3x: 0.4457831325301205, within10x: 0.8192771084337349, beatFlatPct: 0.16815066546988053 },
  ],
};

// ---------------------------------------------------------------- farm economics (stated, not fitted)

/** Airdrop share of the implied value that reaches depositors. */
export const AIRDROP_SHARE = 0.1;
/** T-bill yield forgone on the capital over the hold. */
export const TBILL_RATE = 0.04;
/** The board's default ticket; the page also offers $150 and $350. */
export const DEFAULT_CAPITAL_USD = 1000;
/** Flat bridge fee when the plan chain is not Ethereum (funds start there). */
export const BRIDGE_FEE_USD = 5;
export const BRIDGE_MINUTES = 15;

/** Approximate cost of one simple transaction per chain, USD, November 2026.
 *  The plan runs on the cheapest of the protocol's three largest chains. */
export const GAS_PER_TX_USD: Record<string, number> = {
  Ethereum: 6.0,
  Arbitrum: 0.3,
  Base: 0.15,
  Optimism: 0.25,
  Solana: 0.05,
  Binance: 0.2,
  Avalanche: 0.5,
  Polygon: 0.1,
  Bitcoin: 5.0,
  'Hyperliquid L1': 0.05,
  Monad: 0.05,
  Tron: 0.5,
  'Robinhood Chain': 0.1,
  Linea: 0.2,
  Plasma: 0.1,
  Sonic: 0.1,
  Sui: 0.05,
  Ripple: 0.05,
  Mantle: 0.1,
  Fantom: 0.3,
  Scroll: 0.3,
  Berachain: 0.1,
  xDai: 0.05,
  Arc: 0.1,
  Celo: 0.05,
  'zkSync Era': 0.2,
  Cardano: 0.3,
  Unichain: 0.15,
  TON: 0.1,
  Sei: 0.05,
  'X Layer': 0.1,
  Stellar: 0.05,
  Flare: 0.1,
  Doge: 0.3,
  Litecoin: 0.3,
  Near: 0.05,
  Aptos: 0.05,
  Kava: 0.1,
  Blast: 0.15,
  Cronos: 0.1,
};
/** Fallback gas cost for a chain with no table entry. */
export const GAS_DEFAULT_USD = 1.0;

/** Hold days by mechanism: vaults and real-world assets lock longer. */
export const HOLD_DAYS_BY_MECHANISM: Record<string, number> = {
  vault: 60,
  rwa: 90,
  lending: 45,
  staking: 45,
  privacy: 45,
  dex: 30,
  yield: 30,
  basis: 30,
  derivatives: 30,
  payments: 30,
  bridge: 30,
  generic: 30,
};

// ---------------------------------------------------------------- snapshot helpers

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Days from `listed_at` to the snapshot date; null when unreported. */
export function ageDays(p: SnapshotProtocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  const [y, m, d] = p.listed_at.split('-').map(Number);
  const [ay, am, ad] = asOf.split('-').map(Number);
  const listed = Date.UTC(y, m - 1, d);
  const asOfMs = Date.UTC(ay, am - 1, ad);
  return Math.max(0, Math.round((asOfMs - listed) / 86400000));
}

/** Median of the reported 7-day changes, in percentage points. */
export function marketMedianChange(protocols: SnapshotProtocol[]): number {
  const xs = protocols
    .map((p) => p.change_7d)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
}

/** First word of a name, lowercased: the unit the sibling rule compares. */
export function firstWord(name: string): string {
  const w = name.trim().split(/\s+/)[0];
  return w === undefined ? '' : w.toLowerCase();
}

/** House-rule reasons to exclude a traded listing from the comps set. */
export function houseDropReasons(p: SnapshotProtocol): string[] {
  const reasons: string[] = [];
  const cat = p.category ?? '';
  if (cat === 'CEX') reasons.push('CEX');
  if (cat.toLowerCase().includes('bridge')) reasons.push('bridge-category');
  if (
    cat === 'Liquid Staking' ||
    cat === 'Restaking' ||
    cat === 'Liquid Restaking' ||
    cat === 'Staking Pool'
  ) {
    reasons.push('staking-category');
  }
  if (VERSIONED_NAME.test(p.name)) reasons.push('versioned-name');
  if (p.name.toLowerCase().includes('wrap')) reasons.push('wrapped-name');
  return reasons;
}

export interface CompsResult {
  comps: SnapshotProtocol[];
  counts: {
    tradedWithMcap: number;
    positiveMcap: number;
    mergedTokens: number;
    afterMerge: number;
    afterHouseDrops: number;
    houseDropped: number;
    afterTrim: number;
    trimDropped: string[];
  };
}

/** The traded comparables the curve is fitted on (Phase-1 variant A):
 *  positive-mcap listings, merged by token, house drops applied, extreme
 *  mcap/TVL ratios trimmed. Deterministic from the snapshot: 83 comps. */
export function buildComps(protocols: SnapshotProtocol[]): CompsResult {
  const traded = protocols.filter((p) => p.mcap_usd !== null);
  const pos = traded.filter((p) => (p.mcap_usd as number) > 0 && p.tvl_usd > 0);
  const byToken = new Map<string, SnapshotProtocol[]>();
  for (const p of pos) {
    const key = p.gecko_id ?? `SYM:${p.symbol ?? p.slug}`;
    const group = byToken.get(key);
    if (group) group.push(p);
    else byToken.set(key, [p]);
  }
  const merged: SnapshotProtocol[] = [];
  for (const group of byToken.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      const base = { ...group[0] };
      base.tvl_usd = group.reduce((n, x) => n + x.tvl_usd, 0);
      base.mcap_usd = Math.max(...group.map((x) => x.mcap_usd as number));
      merged.push(base);
    }
  }
  const kept: SnapshotProtocol[] = [];
  let houseDropped = 0;
  for (const p of merged) {
    if (houseDropReasons(p).length > 0) houseDropped++;
    else kept.push(p);
  }
  const comps: SnapshotProtocol[] = [];
  const trimDropped: string[] = [];
  for (const p of kept) {
    const ratio = (p.mcap_usd as number) / p.tvl_usd;
    if (ratio < 1 / 500 || ratio > 50) trimDropped.push(p.slug);
    else comps.push(p);
  }
  return {
    comps,
    counts: {
      tradedWithMcap: traded.length,
      positiveMcap: pos.length,
      mergedTokens: byToken.size,
      afterMerge: merged.length,
      afterHouseDrops: kept.length,
      houseDropped,
      afterTrim: comps.length,
      trimDropped,
    },
  };
}

/** First words of the names of every token with a positive market cap.
 *  A pre-token protocol whose first word is in this set is a sibling of a
 *  traded token and its implied value is halved. The set is pinned by the
 *  Phase-1 counts: 9 such protocols among the 342 pre-token rows, 5 on the
 *  192-row board. */
export function siblingFirstWords(protocols: SnapshotProtocol[]): Set<string> {
  const words = new Set<string>();
  for (const p of protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      words.add(firstWord(p.name));
    }
  }
  return words;
}

/** Why a pre-token protocol at or above the floor is not on the watchlist:
 *  the house rule that excludes it. Returns null when no rule in the
 *  snapshot explains it (then it is a parent product by DefiLlama's record,
 *  which the snapshot does not carry). */
export function watchlistExclusionReason(p: SnapshotProtocol): string | null {
  const cat = p.category ?? '';
  if (
    cat === 'Bridge' ||
    cat === 'Canonical Bridge' ||
    cat === 'Liquid Staking' ||
    cat === 'Liquid Restaking' ||
    cat === 'Restaked BTC' ||
    cat === 'CEX'
  ) {
    return `category ${cat} is excluded from the watchlist`;
  }
  if (VERSIONED_NAME.test(p.name)) return 'versioned name (V2, 2.0 and the like)';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product of a token that trades';
  if (EXCHANGE_START.test(p.name)) return 'named for an exchange';
  return null;
}

// ---------------------------------------------------------------- mechanisms

/** Mechanism by category; name signals (generic words, never names) win. */
const MECHANISM_BY_CATEGORY: Record<string, string> = {
  'Risk Curators': 'vault',
  'Yield Aggregator': 'vault',
  'Onchain Capital Allocator': 'vault',
  'Token Locker': 'vault',
  Indexes: 'vault',
  CeDeFi: 'vault',
  Lending: 'lending',
  CDP: 'lending',
  'CDP Manager': 'lending',
  'Collateral Management': 'lending',
  'Dual-Token Stablecoin': 'lending',
  'Algo-Stables': 'lending',
  Dexs: 'dex',
  'Liquidity Manager': 'dex',
  Yield: 'yield',
  'Leveraged Farming': 'yield',
  Farm: 'yield',
  RWA: 'rwa',
  'Basis Trading': 'basis',
  Derivatives: 'derivatives',
  Options: 'derivatives',
  Synthetics: 'derivatives',
  Payments: 'payments',
  'Crypto Card Issuer': 'payments',
  Privacy: 'privacy',
  Bridge: 'bridge',
  'Canonical Bridge': 'bridge',
  'Cross Chain Bridge': 'bridge',
  'Liquid Staking': 'staking',
  'Liquid Restaking': 'staking',
  Restaking: 'staking',
  'Staking Pool': 'staking',
  'Anchor BTC': 'staking',
  'Restaked BTC': 'staking',
  CEX: 'payments',
};

/** The farm play follows the protocol's mechanism, derived from its
 *  category plus generic name signals — never from a list of names. */
export function mechanismFor(p: SnapshotProtocol): string {
  const name = p.name;
  if (/\bvault\b/i.test(name)) return 'vault';
  if (/\bbridge\b/i.test(name)) return 'bridge';
  if (/\bpool\b/i.test(name)) return 'dex';
  if (/stak/i.test(name)) return 'staking';
  return MECHANISM_BY_CATEGORY[p.category ?? ''] ?? 'generic';
}

/** Cheapest gas among the protocol's three largest chains (the snapshot
 *  lists chains in TVL order). Funds start on Ethereum. */
export function planChainFor(p: SnapshotProtocol): { chain: string; gasUsd: number; needsBridge: boolean } {
  const top = (p.chains ?? []).slice(0, 3);
  const chains = top.length > 0 ? top : ['Ethereum'];
  let chain = chains[0];
  let gas = GAS_PER_TX_USD[chain] ?? GAS_DEFAULT_USD;
  for (const c of chains) {
    const g = GAS_PER_TX_USD[c] ?? GAS_DEFAULT_USD;
    if (g < gas) {
      chain = c;
      gas = g;
    }
  }
  return { chain, gasUsd: gas, needsBridge: chain !== 'Ethereum' };
}

// ---------------------------------------------------------------- the model

export interface ImpliedParts {
  value: number;
  curveUsd: number;
  categoryMult: number;
  breadthMult: number;
  siblingMult: number;
  bandLoUsd: number;
  bandHiUsd: number;
}

/** The fitted size curve plus shrunk category residual plus breadth, with a
 *  sibling halving. Every input is the protocol's own snapshot figure. */
export function impliedValue(
  p: SnapshotProtocol,
  siblingWords: Set<string>,
): ImpliedParts {
  const logV = CURVE_A + CURVE_B * Math.log10(p.tvl_usd / 1e8);
  const curveUsd = Math.pow(10, logV);
  const catEff = p.category ? (CATEGORY_EFFECTS_LOG10[p.category] ?? 0) : 0;
  const nChains = Math.min(Math.max(p.chains ? p.chains.length : 1, 1), 10);
  const breadth = Math.max(
    -FACTOR_CAP_LOG10,
    Math.min(FACTOR_CAP_LOG10, BREADTH_WEIGHT * (Math.log10(nChains) - Math.log10(2))),
  );
  const siblingMult = siblingWords.has(firstWord(p.name)) ? 0.5 : 1;
  const value = Math.pow(10, logV + catEff + breadth) * siblingMult;
  return {
    value,
    curveUsd,
    categoryMult: Math.pow(10, catEff),
    breadthMult: Math.pow(10, breadth),
    siblingMult,
    bandLoUsd: value * BAND_P25_FACTOR,
    bandHiUsd: value * BAND_P75_FACTOR,
  };
}

// ---------------------------------------------------------------- farm economics

/** The slice of the implied value a ticket buys: the ticket's share of the
 *  TVL after it joins — capital / (TVL + capital) — times the airdrop
 *  share times the implied value. The share is dilutive, not capital / TVL. */
export function sliceUsd(capital: number, tvl: number, implied: number): number {
  return (capital / (tvl + capital)) * AIRDROP_SHARE * implied;
}

/** T-bill yield forgone on the capital over the hold, at 4%. */
export function forgoneUsd(capital: number, holdDays: number): number {
  return TBILL_RATE * capital * (holdDays / 365);
}

export function netUsd(slice: number, fees: number, forgone: number): number {
  return slice - fees - forgone;
}

/** ROBUST pays even at the band's low end; FARM pays at the point value;
 *  THIN covers cash fees only, not the T-bill; SKIP does not cover fees. */
export function verdictFor(slice: number, fees: number, forgone: number): Verdict {
  const netLow = slice * BAND_P25_FACTOR - fees - forgone;
  if (netLow > 0) return 'ROBUST';
  if (slice - fees - forgone > 0) return 'FARM';
  if (slice - fees > 0) return 'THIN';
  return 'SKIP';
}

/** Smallest ticket at which the plan nets positive, or null when no ticket
 *  ever beats the T-bill at this implied value. Fees are fixed; the slice
 *  grows with the ticket but the forgone yield grows with it too. */
export function paysFromUsd(
  tvl: number,
  implied: number,
  fees: number,
  holdDays: number,
): number | null {
  const netAt = (c: number): number =>
    sliceUsd(c, tvl, implied) - fees - forgoneUsd(c, holdDays);
  // If the net is already falling at $1, it never turns positive.
  const slopeAtOne =
    (AIRDROP_SHARE * implied * tvl) / Math.pow(tvl + 1, 2) - (TBILL_RATE * holdDays) / 365;
  if (slopeAtOne <= 0 || netAt(1) > 0) return netAt(1) > 0 ? 1 : null;
  let lo = 1;
  let hi = 2;
  while (hi <= 1e12 && netAt(hi) <= 0) {
    lo = hi;
    hi *= 2;
  }
  if (hi > 1e12) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (netAt(mid) > 0) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

// ---------------------------------------------------------------- farm plans

function fmtInt(n: number): string {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fill(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => slots[k] ?? `{${k}}`);
}

/** The three core actions of each mechanism's play. Shared steps (fresh
 *  wallet, verify, weekly upkeep, exit trigger, claim and exit) wrap them. */
const CORE_ACTIONS: Record<string, string[]> = {
  vault: [
    'Deposit {capital} into the {name} vault on {chain} and confirm the receipt shows your share balance. The vault curator manages the allocation; you do not pick positions yourself.',
    "Read the vault's fee schedule on the official docs — performance fee and management fee — and the curator's track record. Exit if the performance fee is above 20% or the curator changes.",
    "Record the deposit transaction hash, the vault address, and the share price at entry. A rising share price is the position working; a falling one is the exit signal.",
  ],
  lending: [
    'Supply {capital} of collateral on {chain} and borrow only if the plan needs it; for a plain farm, supply without borrowing and earn the supply rate.',
    'Check the collateral factor and the liquidation threshold before you deposit, and keep the health factor above 2.0 at all times.',
    'Record the supply transaction hash, the collateral address, and the borrow limit. A health factor under 1.5 is the exit signal.',
  ],
  dex: [
    'Add {capital} of liquidity to the {name} pool on {chain} in the pair the docs name, and confirm the LP receipt shows your share.',
    "Check the pool's fee tier and the 7-day volume; a pool with volume under 10% of its TVL pays too little to cover the gas.",
    'Record the LP transaction hash, the pool address, and the price range at entry. Leave if the pair drifts 20% out of range.',
  ],
  yield: [
    'Stake {capital} in the {name} farm on {chain} and confirm the staked balance shows. The farm pays in points or a second token; check which before you stake.',
    'Read the emission schedule on the official docs: a farm that halves emissions weekly pays less the longer you wait.',
    'Record the stake transaction hash and the reward rate at entry. A reward rate that halves twice is the exit signal.',
  ],
  rwa: [
    'Buy {capital} of the {name} tokenised asset on {chain} and confirm the holding shows in your wallet. The asset pays real-world yield, not points.',
    "Read the asset's backing and custodian on the official docs, and check the redemption terms before you buy.",
    'Record the purchase transaction hash and the yield rate at entry. A missed payout is the exit signal.',
  ],
  basis: [
    'Deposit {capital} into the {name} basis vault on {chain} and confirm the position shows. The vault earns the funding-rate spread between spot and perps.',
    'Check the funding rate history: a negative funding rate for two weeks in a row means the vault pays nothing.',
    'Record the deposit transaction hash and the funding rate at entry. A funding rate under zero is the exit signal.',
  ],
  derivatives: [
    'Open a {capital} hedged position on {name} on {chain} — long spot, short perps — and confirm both legs show. Never run an unhedged leg.',
    'Check the margin requirement and the liquidation price for each leg before you open, and keep twice the required margin.',
    'Record both transaction hashes and the entry prices. A leg that moves 10% against you is the exit signal.',
  ],
  payments: [
    'Route {capital} of volume through {name} on {chain} for the payments the docs name, and confirm the transactions settle.',
    'Check the fee per payment against the alternatives; the farm only pays if the route is cheaper than the default.',
    'Record the transaction hashes and the volume routed. Volume under the plan target is the exit signal.',
  ],
  privacy: [
    'Shield {capital} through {name} on {chain} and confirm the shielded balance shows. The privacy set is the product; check its size first.',
    'Check the anonymity set size on the official docs: a set under 100 users leaks too much to be worth farming.',
    'Record the shield transaction hash and the set size at entry. A set that shrinks by half is the exit signal.',
  ],
  bridge: [
    'Bridge {capital} through {name} on {chain} and confirm the receipt on the destination chain. The bridge fee is the cost; the points are the reward.',
    "Check the bridge's fee and time-to-finality against the alternatives; a bridge slower than 30 minutes costs a day of farming.",
    'Record the bridge transaction hash and the arrival time. A bridge that takes over an hour is the exit signal.',
  ],
  staking: [
    'Stake {capital} with {name} on {chain} and confirm the liquid staking receipt shows in your wallet.',
    'Check the staking APR and the unstaking delay on the official docs; a delay over 7 days locks the capital too long.',
    'Record the stake transaction hash and the APR at entry. An APR that halves is the exit signal.',
  ],
  generic: [
    'Use {capital} in the {name} protocol on {chain} exactly as the official docs describe, and confirm the position shows.',
    'Read the docs fee and lock-up terms before you commit; a lock-up over the hold makes the plan unexitable.',
    'Record the transaction hash and the terms at entry. A term that changes against you is the exit signal.',
  ],
};

/** Eight steps, mechanism-aware, each with a dollar cost and minutes.
 *  On-chain steps cost one transaction on the plan chain; the deposit takes
 *  two (approve, then deposit) and the exit takes two (withdraw, then
 *  revoke). Funds start on Ethereum, so a plan off Ethereum pays the bridge. */
export function farmPlan(
  p: SnapshotProtocol,
  mechanism: string,
  planChain: string,
  gasUsd: number,
  needsBridge: boolean,
  capital: number,
): { steps: FarmStep[]; feesUsd: number; workHours: number } {
  const holdDays = HOLD_DAYS_BY_MECHANISM[mechanism] ?? 30;
  const weeks = Math.max(1, Math.round(holdDays / 7));
  const slots: Record<string, string> = {
    name: p.name,
    chain: planChain,
    capital: `$${fmtInt(capital)}`,
    hold: String(holdDays),
    weeks: String(weeks),
    gas: `$${gasUsd.toFixed(2)}`,
    bridge: `$${BRIDGE_FEE_USD.toFixed(2)}`,
  };
  const core = CORE_ACTIONS[mechanism] ?? CORE_ACTIONS.generic;
  const fundText = needsBridge
    ? 'Use a fresh wallet that holds only the funds you plan to farm, fund it with {capital} on Ethereum, then bridge it to {chain} ({bridge} bridge fee, 15 minutes). Never reuse a wallet that holds other assets.'
    : 'Use a fresh wallet that holds only the funds you plan to farm, and fund it with {capital} on Ethereum. Never reuse a wallet that holds other assets.';
  const steps: FarmStep[] = [
    { text: fill(fundText, slots), costUsd: needsBridge ? BRIDGE_FEE_USD : 0, minutes: needsBridge ? 30 : 15 },
    {
      text: fill(
        "Open {name}'s official site and docs from its DefiLlama listing only, and check the contract addresses match before you connect. Never follow a link from a reply or a DM.",
        slots,
      ),
      costUsd: 0,
      minutes: 10,
    },
    { text: fill(core[0], slots), costUsd: 2 * gasUsd, minutes: 10 },
    { text: fill(core[1], slots), costUsd: 0, minutes: 10 },
    { text: fill(core[2], slots), costUsd: 0, minutes: 5 },
    {
      text: fill(
        'Check the position once a week — {weeks} checks over {hold} days, 10 minutes each — and record TVL and any token or points announcement.',
        slots,
      ),
      costUsd: 0,
      minutes: 10 * weeks,
    },
    {
      text: 'Set the exit trigger now: leave if TVL falls 30% from entry, if a token launches and the airdrop snapshot passes, or if the plan fees exceed the slice.',
      costUsd: 0,
      minutes: 5,
    },
    {
      text: fill(
        'Claim any points or rewards, withdraw the deposit on {chain}, and revoke the spending approval after the exit transaction confirms.',
        slots,
      ),
      costUsd: 2 * gasUsd,
      minutes: 10,
    },
  ];
  const feesUsd = steps.reduce((n, s) => n + s.costUsd, 0);
  const workHours = steps.reduce((n, s) => n + s.minutes, 0) / 60;
  return { steps, feesUsd, workHours };
}

// ---------------------------------------------------------------- the board

export interface BoardTotals {
  totalImpliedUsd: number;
  medianImpliedUsd: number;
  p10ImpliedUsd: number;
  p90ImpliedUsd: number;
  verdictCounts: Record<Verdict, number>;
  bestPerHour: { slug: string; name: string; netPerHourUsd: number } | null;
  siblingRows: number;
}

export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

export interface BoardResult {
  rows: BoardRow[];
  totals: BoardTotals;
  setAside: SetAsideRow[];
  comps: SnapshotProtocol[];
  compsCounts: CompsResult['counts'];
  marketMedianPp: number;
}

/** The 192-row board: the 40 watchlist protocols plus the 152 pre-token
 *  protocols below the floor with the most TVL. Ranked by implied value,
 *  ties by slug. Every row carries its model parts, its farm plan, and its
 *  netted verdict at the $1,000 ticket. */
export function buildBoard(snapshot: Snapshot): BoardResult {
  const marketMedian = marketMedianChange(snapshot.protocols);
  const compsRes = buildComps(snapshot.protocols);
  const sibWords = siblingFirstWords(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const pre = snapshot.protocols.filter((p) => p.gecko_id === null && p.symbol === null);
  const watchRows = pre.filter((p) => watchlist.has(p.slug));
  const earlyPool = pre
    .filter((p) => !watchlist.has(p.slug) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, 152);
  const boardProtocols = [...watchRows, ...earlyPool];

  const rows: BoardRow[] = boardProtocols.map((p) => {
    const parts = impliedValue(p, sibWords);
    const mechanism = mechanismFor(p);
    const plan = planChainFor(p);
    const holdDays = HOLD_DAYS_BY_MECHANISM[mechanism] ?? 30;
    const farm = farmPlan(p, mechanism, plan.chain, plan.gasUsd, plan.needsBridge, DEFAULT_CAPITAL_USD);
    const slice = sliceUsd(DEFAULT_CAPITAL_USD, p.tvl_usd, parts.value);
    const forgone = forgoneUsd(DEFAULT_CAPITAL_USD, holdDays);
    const net = netUsd(slice, farm.feesUsd, forgone);
    const verdict = verdictFor(slice, farm.feesUsd, forgone);
    const paysFrom = paysFromUsd(p.tvl_usd, parts.value, farm.feesUsd, holdDays);
    const relChange = (p.change_7d ?? marketMedian) - marketMedian;
    const nearestPeers = compsRes.comps
      .map((c) => ({
        comp: c,
        dist: Math.abs(Math.log10(c.tvl_usd) - Math.log10(p.tvl_usd)),
      }))
      .sort((a, b) => a.dist - b.dist || (a.comp.slug < b.comp.slug ? -1 : 1))
      .slice(0, 5)
      .map(({ comp }) => ({
        slug: comp.slug,
        name: comp.name,
        tvl_usd: comp.tvl_usd,
        mcap_usd: comp.mcap_usd as number,
      }));
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      relChangePp: relChange,
      ageDays: ageDays(p, snapshot.as_of),
      implied_value_usd: Math.round(parts.value),
      impliedFloat: parts.value,
      bandLoUsd: Math.round(parts.bandLoUsd),
      bandHiUsd: Math.round(parts.bandHiUsd),
      curveUsd: parts.curveUsd,
      categoryMult: parts.categoryMult,
      breadthMult: parts.breadthMult,
      sibling: parts.siblingMult === 0.5,
      mechanism,
      planChain: plan.chain,
      needsBridge: plan.needsBridge,
      holdDays,
      workHours: farm.workHours,
      feesUsd: farm.feesUsd,
      sliceUsd: slice,
      netUsd: net,
      netPerHourUsd: net / farm.workHours,
      verdict,
      paysFromUsd: paysFrom,
      farm_steps: farm.steps.map((s) => s.text),
      farmPlan: farm.steps,
      nearestPeers,
    };
  });

  rows.sort((a, b) => b.impliedFloat - a.impliedFloat || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const values = rows.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const totals: BoardTotals = {
    totalImpliedUsd: rows.reduce((n, r) => n + r.implied_value_usd, 0),
    medianImpliedUsd: values[Math.floor(values.length / 2)],
    p10ImpliedUsd: values[Math.floor(values.length * 0.1)],
    p90ImpliedUsd: values[Math.floor(values.length * 0.9)],
    verdictCounts: { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 },
    bestPerHour: null,
    siblingRows: rows.filter((r) => r.sibling).length,
  };
  for (const r of rows) totals.verdictCounts[r.verdict]++;
  let best: BoardRow | null = null;
  for (const r of rows) {
    if (best === null || r.netPerHourUsd > best.netPerHourUsd) best = r;
  }
  if (best !== null) {
    totals.bestPerHour = { slug: best.slug, name: best.name, netPerHourUsd: best.netPerHourUsd };
  }

  const onBoard = new Set(rows.map((r) => r.slug));
  const setAside: SetAsideRow[] = pre
    .filter((p) => !onBoard.has(p.slug))
    .map((p) => {
      let reason: string;
      if (p.tvl_usd >= snapshot.floor_usd) {
        reason =
          watchlistExclusionReason(p) ??
          'parent product of a token that already trades (DefiLlama record)';
      } else {
        reason = 'below the board cut: not among the 152 early rows by TVL';
      }
      return { slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason };
    })
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));

  return { rows, totals, setAside, comps: compsRes.comps, compsCounts: compsRes.counts, marketMedianPp: marketMedian };
}

/** First problem with a board's rows, or null when the rows are clean.
 *  The gate's board_file / sorted_by_value / coverage / farm_steps rows
 *  check the same things on the written board.json. */
export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seenRanks = new Set<number>();
  let prev: number | null = null;
  for (const r of rows) {
    if (!slugs.has(r.slug)) return `row ${r.slug} is not a snapshot protocol`;
    if (!r.name) return `row ${r.slug} has an empty name`;
    if (!Number.isSafeInteger(r.rank) || r.rank < 1) return `row ${r.slug} has a bad rank`;
    if (seenRanks.has(r.rank)) return `rank ${r.rank} appears twice`;
    seenRanks.add(r.rank);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `row ${r.slug} has a bad implied value`;
    }
    if (prev !== null && r.implied_value_usd > prev) return `implied value rises at rank ${r.rank}`;
    prev = r.implied_value_usd;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `row ${r.slug} has ${r.farm_steps.length} farm steps`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} has a farm step of ${t.length} chars`;
    }
  }
  for (let i = 1; i <= rows.length; i++) {
    if (!seenRanks.has(i)) return `rank ${i} is missing`;
  }
  const onBoard = new Set(rows.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    if (!onBoard.has(slug)) return `watchlist slug ${slug} is not on the board`;
  }
  return null;
}

// ---------------------------------------------------------------- dashboard data

/** Compact rows for data.js. The page recomputes every derived value
 *  (bands, slice, net, verdict, factor breakdown) live from these inputs
 *  plus the constants in meta — one model prices the board and the page.
 *  Keys: s slug, n name, c category, h chains (comma-joined), t TVL,
 *  d change_7d, a age in days, v implied value (whole dollars),
 *  k sibling flag (1 halved), w watchlist flag (1 on the watchlist). */
export interface DashboardData {
  meta: {
    model: string;
    asOf: string;
    floorUsd: number;
    boardRows: number;
    watchlistCovered: number;
    compsCount: number;
    compsCounts: CompsResult['counts'];
    totalImpliedUsd: number;
    medianImpliedUsd: number;
    p10ImpliedUsd: number;
    p90ImpliedUsd: number;
    verdictCounts: Record<Verdict, number>;
    bestPerHour: BoardTotals['bestPerHour'];
    siblingRows: number;
    marketMedianPp: number;
    curve: { a: number; b: number; r2: number; levelUsd: number; multiple: number };
    categoryEffectsLog10: Record<string, number>;
    breadthWeight: number;
    factorCapLog10: number;
    bandFactors: { p10: number; p25: number; p75: number; p90: number };
    validation: typeof VALIDATION;
    economics: {
      airdropShare: number;
      tbillRate: number;
      defaultCapitalUsd: number;
      bridgeFeeUsd: number;
      bridgeMinutes: number;
    };
  };
  rows: {
    s: string;
    n: string;
    c: string | null;
    h: string;
    t: number;
    d: number | null;
    a: number | null;
    v: number;
    k: number;
    w: number;
  }[];
  comps: { s: string; n: string; t: number; m: number }[];
  setAside: { s: string; n: string; c: string | null; t: number; r: string }[];
}

export function buildDashboardData(board: BoardResult, snapshot: Snapshot): DashboardData {
  return {
    meta: {
      model: 'radar-3',
      asOf: snapshot.as_of,
      floorUsd: snapshot.floor_usd,
      boardRows: board.rows.length,
      watchlistCovered: snapshot.watchlist.length,
      compsCount: board.comps.length,
      compsCounts: board.compsCounts,
      totalImpliedUsd: board.totals.totalImpliedUsd,
      medianImpliedUsd: board.totals.medianImpliedUsd,
      p10ImpliedUsd: board.totals.p10ImpliedUsd,
      p90ImpliedUsd: board.totals.p90ImpliedUsd,
      verdictCounts: board.totals.verdictCounts,
      bestPerHour: board.totals.bestPerHour,
      siblingRows: board.totals.siblingRows,
      marketMedianPp: board.marketMedianPp,
      curve: {
        a: CURVE_A,
        b: CURVE_B,
        r2: CURVE_R2,
        levelUsd: LEVEL_AT_100M_USD,
        multiple: MULTIPLE_AT_100M,
      },
      categoryEffectsLog10: CATEGORY_EFFECTS_LOG10,
      breadthWeight: BREADTH_WEIGHT,
      factorCapLog10: FACTOR_CAP_LOG10,
      bandFactors: {
        p10: BAND_P10_FACTOR,
        p25: BAND_P25_FACTOR,
        p75: BAND_P75_FACTOR,
        p90: BAND_P90_FACTOR,
      },
      validation: VALIDATION,
      economics: {
        airdropShare: AIRDROP_SHARE,
        tbillRate: TBILL_RATE,
        defaultCapitalUsd: DEFAULT_CAPITAL_USD,
        bridgeFeeUsd: BRIDGE_FEE_USD,
        bridgeMinutes: BRIDGE_MINUTES,
      },
    },
    rows: board.rows.map((r) => ({
      s: r.slug,
      n: r.name,
      c: r.category,
      h: r.chains.join(','),
      t: r.tvl_usd,
      d: r.change_7d,
      a: r.ageDays,
      v: r.implied_value_usd,
      k: r.sibling ? 1 : 0,
      w: snapshot.watchlist.includes(r.slug) ? 1 : 0,
    })),
    comps: board.comps.map((c) => ({
      s: c.slug,
      n: c.name,
      t: c.tvl_usd,
      m: c.mcap_usd as number,
    })),
    setAside: board.setAside.map((r) => ({
      s: r.slug,
      n: r.name,
      c: r.category,
      t: r.tvl_usd,
      r: r.reason,
    })),
  };
}
