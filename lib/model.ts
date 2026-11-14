// Token Radar, model radar-2: one sealed snapshot in, one ranked board out.
//
// The board ranks pre-token protocols by an implied value: what a token would be worth if the
// protocol's record stayed as it is. The value is the market's own pricing of comparable protocols,
// read out of the snapshot itself — never a hand-kept list of names, never an outside feed.
//
//   implied = round( tvl_usd x category_multiple x growth_mult x maturity_mult x breadth_mult )
//
//   category_multiple  the median market-cap/TVL ratio of the live-token protocols in the same
//                      category, shrunk toward the market-wide median with weight n/(n+3). A
//                      category with fewer than three live peers uses the market-wide median, so a
//                      single odd token cannot set a whole category's price. Clamped to 0.02..1.5.
//                      Dexs price near 0.31x TVL, liquid staking near 0.06x: the market really does
//                      pay different multiples for different businesses, and the model says so.
//   growth_mult        1 + clamp(change_7d, -60, +120) / 100 x 0.5. A protocol growing fast is
//                      worth more than a shrinking one at the same TVL; a 4,400% week is clamped,
//                      not believed.
//   maturity_mult      0.6 + 0.4 x min(age_days, 1095) / 1095. Age is the time since DefiLlama first
//                      listed the protocol: how long it has run with no token. Older is steadier,
//                      but the curve flattens after three years. Unknown age counts as 365 days.
//   breadth_mult       1 + 0.05 x ln(chains). A protocol live on more chains has more surface to
//                      farm and more users to serve; the factor is small on purpose.
//
// The board covers the whole watchlist (the floor) and adds the early radar: pre-token protocols
// below the floor, by TVL, up to 200 of them. Live-token protocols are kept apart and shown with
// their market caps, never mixed into a ranking of tokens that do not exist yet.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_weight: number;
  shrink_prior: number;
  min_peers: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_weight: 0.05,
  shrink_prior: 3,
  min_peers: 3,
  multiple_floor: 0.02,
  multiple_cap: 1.5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's priced multiple, with the peer count behind it. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  peers: number;
  peer_median: number | null;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the multiples and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  multiples: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * The market's own pricing, read out of the snapshot: for every category, the median market-cap/TVL
 * ratio of its live-token protocols, shrunk toward the market-wide median. Categories with fewer
 * than `min_peers` live peers fall back to the market-wide median outright.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; multiples: CategoryMultiple[] } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && p.mcap_usd !== null);
  const global = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list) list.push(p.mcap_usd! / p.tvl_usd);
    else byCategory.set(key, [p.mcap_usd! / p.tvl_usd]);
  }
  const categories = new Set<string>(snapshot.protocols.map((p) => p.category ?? 'Other'));
  const multiples: CategoryMultiple[] = [...categories].sort().map((category) => {
    const peers = byCategory.get(category) ?? [];
    if (peers.length < model.min_peers) {
      return { category, multiple: round4(global), peers: peers.length, peer_median: peers.length > 0 ? round4(median(peers)) : null };
    }
    const peerMedian = median(peers);
    const weight = peers.length / (peers.length + model.shrink_prior);
    const shrunk = peerMedian * weight + global * (1 - weight);
    const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
    return { category, multiple: round4(multiple), peers: peers.length, peer_median: round4(peerMedian) };
  });
  return { global: round4(global), multiples };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: Map<string, number>,
  globalMultiple: number,
  model: ModelConstants = MODEL,
): { implied: number; categoryMultiple: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_weight * Math.log(Math.max(1, protocol.chains.length));
  const categoryMultiple = multiples.get(protocol.category ?? 'Other') ?? globalMultiple;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * breadthMult));
  return { implied, categoryMultiple, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { global, multiples } = categoryMultiples(snapshot, model);
  const multipleByCategory = new Map(multiples.map((m) => [m.category, m.multiple]));
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multipleByCategory, global, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.categoryMultiple),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

// ---------------------------------------------------------------- farm plans

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in dollars: the chain's own gas, not a guess per protocol. */
export function gasUsd(chain: string): number {
  const table: Record<string, number> = {
    Ethereum: 8, Base: 1, Arbitrum: 1, Optimism: 1, Blast: 1, Mode: 1, Ink: 1, Zora: 1,
    Solana: 0.05, Binance: 0.3, Polygon: 0.1, Avalanche: 0.5, Tron: 2, Bitcoin: 3,
    Bittensor: 1, Flare: 0.5, Monad: 0.5, 'Plume Mainnet': 0.5, Sui: 0.1, Aptos: 0.1,
    Scroll: 0.5, Linea: 0.5, Mantle: 0.5, Starknet: 0.5, zkSync: 0.5, Berachain: 0.5,
  };
  return table[chain] ?? 2;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A dollar amount as the page writes it: $0.05, $1, $8. */
function usd(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`;
}

type Family =
  | 'lend' | 'dex' | 'bridge' | 'stake' | 'perp' | 'predict' | 'curator'
  | 'stable' | 'rwa' | 'insurance' | 'payments' | 'index' | 'chain' | 'default';

/** The protocol's family, from its category's words: the action follows the business, not the name. */
function familyOf(p: SnapshotProtocol): Family {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateral')) return 'lend';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged') || c.includes('farm') || c.includes('liquidity manager')) return 'dex';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('stak') || c.includes('restak')) return 'stake';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('synthetic')) return 'perp';
  if (c.includes('prediction')) return 'predict';
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'curator';
  if (c.includes('stable') || c.includes('anchor')) return 'stable';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('payment') || c.includes('card')) return 'payments';
  if (c.includes('index')) return 'index';
  if (c.includes('chain')) return 'chain';
  return 'default';
}

/** The first, main action: what to do with the capital, in the protocol's own terms. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  switch (familyOf(p)) {
    case 'lend':
      return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow 30% of it back in the same asset and keep the health factor above 1.5.`;
    case 'dex':
      return `Provide $${capital} of liquidity to ${name}'s largest pool on ${chain} — half USDC, half the pool's other asset — and keep the LP receipt.`;
    case 'bridge':
      return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds once in an app on the other side instead of bridging straight back.`;
    case 'stake':
      return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and keep the receipt token in the same wallet.`;
    case 'perp':
      return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position, no more than 2x leverage.`;
    case 'predict':
      return `Fund ${name} with $${capital} on ${chain} and take one position in a market that resolves within the next two weeks.`;
    case 'curator':
      return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares; the vault, not you, picks the allocation.`;
    case 'stable':
      return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the same wallet.`;
    case 'rwa':
      return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it so the yield accrues to your wallet.`;
    case 'insurance':
      return `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy active.`;
    case 'payments':
      return `Fund ${name} with $${capital} on ${chain} and make one real payment through it, then keep the balance for the next one.`;
    case 'index':
      return `Buy $${capital} of the ${name} index on ${chain} and hold the index token instead of its parts.`;
    case 'chain':
      return `Bridge $${capital} of USDC onto ${chain}, swap half into the chain's native asset, and use one app built on ${name}.`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  }
}

/** The second, depth action: the move that turns one deposit into a pattern. */
function depthFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  switch (familyOf(p)) {
    case 'lend':
      return `After a week, re-supply the borrowed funds once and check the borrow rate: a position that moves is read as a user, not a deposit.`;
    case 'dex':
      return `Stake the LP receipt in ${name}'s rewards contract if it has one, and note the pool's fee tier and the pair's depth before you add more.`;
    case 'bridge':
      return `Leave the bridged funds working for a full week, then bridge a smaller amount back: two-way flow reads as a user, one-way as a passer-by.`;
    case 'stake':
      return `Restake the first rewards by hand and check the validator or operator ${name} routes to: a stake that compounds is a longer signal.`;
    case 'perp':
      return `Close the hedge after 24 hours, keep the margin on ${name}, and reopen it only when the market moves: the margin, not the trade, is the position.`;
    case 'predict':
      return `When the market resolves, claim any winnings from ${name}'s own page and put half of them straight into the next market.`;
    case 'curator':
      return `Read ${name}'s latest vault allocation report and check your share of the vault grew with the TVL: a vault that grows is a vault that is used.`;
    case 'stable':
      return `Check the stable asset's peg and redemption path once a week: minting is only half the position, redeeming cleanly is the other half.`;
    case 'rwa':
      return `Verify the yield actually accrued to your wallet after seven days and read ${name}'s latest custodian or audit note.`;
    case 'insurance':
      return `Read the cover terms once: what counts as a claim, how long it takes to pay, and what the policy excludes.`;
    case 'payments':
      return `Make a second, smaller payment a week later: repeat use is what a payments protocol can see.`;
    case 'index':
      return `Check the index's composition after a month: an index that rebalances is being run, not abandoned.`;
    case 'chain':
      return `Delegate or stake part of the native asset you hold on ${chain} so the wallet shows activity beyond one swap.`;
    default:
      return `Make a second deposit of half the first amount a week later, so the position shows a pattern instead of a single transaction.`;
  }
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Every step names what it costs and how long it takes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasUsd(chain);
  const gasTx = `about ${usd(gas)} of gas`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline, never in a screenshot.`,
      cost: `under ${usd(Math.max(gas, 1))} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gasTx} to open it`,
      time: '15 minutes to set up',
    },
    {
      text: depthFor(p, capital, chain),
      cost: gasTx,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week — a deposit, a borrow, a swap or a vote — and keep the same wallet for all of them.`,
      cost: `about ${usd(gas)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, not a single week.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from its official site and check what your wallet has earned.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Only ever follow links from ${p.name}'s official site or verified account, never a link in a reply or a DM, and revoke the approval after you finish.`,
      cost: 'free',
      time: '5 minutes',
    },
    {
      text: `To exit, withdraw or unstake in two parts a day apart and log the wallet, the dates and every transaction so you can repeat or unwind it.`,
      cost: `${gasTx} per part, plus the pool's spread`,
      time: '20 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { global, multiples } = categoryMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: global,
    multiples,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
