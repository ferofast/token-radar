// Fleet Crystal v2 — one page, no network. Recomputes every value live from data.js (radar-3); hero badge must read 192/192.

const D = window.BOARD_DATA;
const META = D.meta;


// Model constants come from data.js meta (written from the same fitted params.json) — one source of truth, so the page and the program cannot drift. The gas table, mechanism map, hold days and step templates below are duplicated here with the same numbers and words.
const CURVE_A = META.curve.a;
const CURVE_B = META.curve.b;
const CURVE_R2 = META.curve.r2;
const LEVEL_AT_100M_USD = META.curve.levelUsd;
const MULTIPLE_AT_100M = META.curve.multiple;
const SHRINKAGE_K = 12;
const CATEGORY_EFFECTS_LOG10 = META.categoryEffectsLog10;
const BREADTH_WEIGHT = META.breadthWeight;
const FACTOR_CAP_LOG10 = META.factorCapLog10;
const BAND_P10_FACTOR = META.bandFactors.p10;
const BAND_P25_FACTOR = META.bandFactors.p25;
const BAND_P75_FACTOR = META.bandFactors.p75;
const BAND_P90_FACTOR = META.bandFactors.p90;
const SIBLING_MULT = 0.5;
const AIRDROP_SHARE = META.economics.airdropShare;
const TBILL_RATE = META.economics.tbillRate;
const DEFAULT_CAPITAL_USD = META.economics.defaultCapitalUsd;
const BRIDGE_FEE_USD = META.economics.bridgeFeeUsd;
const BRIDGE_MINUTES = META.economics.bridgeMinutes;
const GAS_PER_TX_USD = {
  Ethereum: 6.0, Arbitrum: 0.3, Base: 0.15, Optimism: 0.25, Solana: 0.05,
  Binance: 0.2, Avalanche: 0.5, Polygon: 0.1, Bitcoin: 5.0, 'Hyperliquid L1': 0.05,
  Monad: 0.05, Tron: 0.5, 'Robinhood Chain': 0.1, Linea: 0.2, Plasma: 0.1,
  Sonic: 0.1, Sui: 0.05, Ripple: 0.05, Mantle: 0.1, Fantom: 0.3, Scroll: 0.3,
  Berachain: 0.1, xDai: 0.05, Arc: 0.1, Celo: 0.05, 'zkSync Era': 0.2,
  Cardano: 0.3, Unichain: 0.15, TON: 0.1, Sei: 0.05, 'X Layer': 0.1,
  Stellar: 0.05, Flare: 0.1, Doge: 0.3, Litecoin: 0.3, Near: 0.05, Aptos: 0.05,
  Kava: 0.1, Blast: 0.15, Cronos: 0.1,
};
const MECHANISM_BY_CATEGORY = {
  'AI Agents': 'generic', 'Algo-Stables': 'lending', 'Anchor BTC': 'staking',
  'Basis Trading': 'basis', Bridge: 'bridge', CDP: 'lending', 'CDP Manager': 'lending',
  CEX: 'payments', 'Canonical Bridge': 'bridge', CeDeFi: 'vault', Chain: 'generic',
  'Collateral Management': 'lending', 'Collateral Markets': 'generic',
  'Cross Chain Bridge': 'bridge', 'Crypto Card Issuer': 'payments', DOR: 'generic',
  'Decentralized AI': 'generic', 'Decentralized BTC': 'generic',
  Derivatives: 'derivatives', Dexs: 'dex', 'Dual-Token Stablecoin': 'lending',
  Farm: 'yield', 'Governance Incentives': 'generic', Indexes: 'vault',
  Insurance: 'generic', 'Interest Rate Derivatives': 'generic', Launchpad: 'generic',
  Lending: 'lending', 'Leveraged Farming': 'yield', 'Liquid Restaking': 'staking',
  'Liquid Staking': 'staking', 'Liquidity Manager': 'dex', 'NFT Marketplace': 'generic',
  'OTC Marketplace': 'generic', 'Onchain Capital Allocator': 'vault',
  Options: 'derivatives', 'Options Vault': 'generic', Payments: 'payments',
  'Prediction Market': 'generic', Privacy: 'privacy', RWA: 'rwa',
  'Reserve Currency': 'generic', 'Restaked BTC': 'staking', Restaking: 'staking',
  'Risk Curators': 'vault', 'Stablecoin Issuer': 'generic', 'Stablecoin Wrapper': 'generic',
  'Staking Pool': 'staking', Synthetics: 'derivatives', 'Token Locker': 'vault',
  'Uncollateralized Lending': 'generic', Yield: 'yield', 'Yield Aggregator': 'vault',
};
const HOLD_DAYS_BY_MECHANISM = { vault: 60, rwa: 90, lending: 45, staking: 45, privacy: 45 };
const HOLD_DAYS_DEFAULT = 30;

function gasUsd(chain) {
  return GAS_PER_TX_USD[chain] ?? 1.0;
}
function mechanismFor(name, category) {
  // Name first: a whole word "vault", "bridge" or "pool", or the substring "stak", sets the mechanism before the category is consulted.
  const n = name.toLowerCase();
  if (/\bvault\b/.test(n)) return 'vault';
  if (/\bbridge\b/.test(n)) return 'bridge';
  if (/\bpool\b/.test(n)) return 'dex';
  if (/stak/.test(n)) return 'staking';
  if (category && MECHANISM_BY_CATEGORY[category]) return MECHANISM_BY_CATEGORY[category];
  return 'generic';
}
function holdDays(mechanism) {
  return HOLD_DAYS_BY_MECHANISM[mechanism] ?? HOLD_DAYS_DEFAULT;
}
function planChainFor(chains) {
  const firstThree = chains.slice(0, 3);
  let best = firstThree[0];
  for (const c of firstThree) {
    if (gasUsd(c) < gasUsd(best)) best = c;
  }
  return { chain: best, gasUsd: gasUsd(best), needsBridge: best !== 'Ethereum' };
}
function impliedParts(row) {
  const tvl = row.t;
  const logV = CURVE_A + CURVE_B * Math.log10(tvl / 100000000);
  const catEff = row.c ? (CATEGORY_EFFECTS_LOG10[row.c] ?? 0) : 0;
  const chains = row.h ? row.h.split(',') : [];
  const nCh = Math.min(Math.max(chains.length, 1), 10);
  const breadth = Math.max(
    -FACTOR_CAP_LOG10,
    Math.min(FACTOR_CAP_LOG10, BREADTH_WEIGHT * (Math.log10(nCh) - Math.log10(2))),
  );
  const value = Math.pow(10, logV + catEff + breadth) * (row.k === 1 ? SIBLING_MULT : 1);
  return {
    value,
    curveUsd: Math.pow(10, logV),
    categoryMult: Math.pow(10, catEff),
    breadthMult: Math.pow(10, breadth),
    sibling: row.k === 1,
  };
}
function forgoneUsd(capital, days) {
  return capital * TBILL_RATE * (days / 365);
}
function netUsd(slice, fees, forgone) {
  return slice - fees - forgone;
}
function verdictFor(slice, fees, forgone) {
  const net = slice - fees - forgone;
  if (slice <= fees) return 'SKIP';
  if (net <= 0) return 'THIN';
  return 'FARM';
}
function robustFor(slice, fees, forgone) {
  // ROBUST: the plan still nets positive when the implied value is cut to the P25 end of its band.
  return netUsd(slice * BAND_P25_FACTOR, fees, forgone) > 0;
}
function verdictFull(slice, fees, forgone) {
  const v = verdictFor(slice, fees, forgone);
  if (v === 'FARM' && robustFor(slice, fees, forgone)) return 'ROBUST';
  return v;
}
function paysFromUsd(tvl, implied, fees, days, share) {
  const sh = share === undefined ? AIRDROP_SHARE : share;
  const sliceAt = (capital) => (capital / (tvl + capital)) * implied * sh;
  const netAt = (capital) => sliceAt(capital) - fees - forgoneUsd(capital, days);
  // Slope of the net at $1 under the dilutive slice: if it is already falling there, the plan never turns positive.
  const slopeAtOne =
    (sh * implied * tvl) / Math.pow(tvl + 1, 2) - (TBILL_RATE * days) / 365;
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


function fmtUsd(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}
function fmtMoney(v) {
  const neg = v < 0;
  const abs = Math.abs(v);
  const s = abs >= 1000 ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 }) : abs.toFixed(2);
  return (neg ? '-$' : '$') + s;
}
function fmtSigned(v) {
  return (v < 0 ? '-' : '+') + fmtMoney(Math.abs(v)).slice(1);
}
function fmtDays(age) {
  if (age === null || age === undefined) return '—';
  if (age < 365) return `${age}d`;
  return `${(age / 365).toFixed(1)}y`;
}
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function chainShort(chains) {
  return chains.slice(0, 3).join(' · ') + (chains.length > 3 ? ` +${chains.length - 3}` : '');
}


function fmtCap(capital) {
  return `$${capital.toLocaleString('en-US')}`;
}
function checksFor(hold) {
  return Math.round(hold / 7);
}

const STEP3 = {
  vault: (c) => `Deposit ${fmtCap(c.capital)} into the ${c.name} vault on ${c.chain} and confirm the receipt shows your share balance. The vault curator manages the allocation; you do not pick positions yourself.`,
  lending: (c) => `Supply ${fmtCap(c.capital)} of collateral on ${c.chain} and borrow only if the plan needs it; for a plain farm, supply without borrowing and earn the supply rate.`,
  dex: (c) => `Add ${fmtCap(c.capital)} of liquidity to the ${c.name} pool on ${c.chain} in the pair the docs name, and confirm the LP receipt shows your share.`,
  yield: (c) => `Stake ${fmtCap(c.capital)} in the ${c.name} farm on ${c.chain} and confirm the staked balance shows. The farm pays in points or a second token; check which before you stake.`,
  rwa: (c) => `Buy ${fmtCap(c.capital)} of the ${c.name} tokenised asset on ${c.chain} and confirm the holding shows in your wallet. The asset pays real-world yield, not points.`,
  basis: (c) => `Deposit ${fmtCap(c.capital)} into the ${c.name} basis vault on ${c.chain} and confirm the position shows. The vault earns the funding-rate spread between spot and perps.`,
  derivatives: (c) => `Open a ${fmtCap(c.capital)} hedged position on ${c.name} on ${c.chain} — long spot, short perps — and confirm both legs show. Never run an unhedged leg.`,
  payments: (c) => `Route ${fmtCap(c.capital)} of volume through ${c.name} on ${c.chain} for the payments the docs name, and confirm the transactions settle.`,
  privacy: (c) => `Deposit ${fmtCap(c.capital)} into the ${c.name} privacy pool on ${c.chain} and confirm the shielded balance shows. Use the pool's own interface, never a third-party relayer you have not checked.`,
  bridge: (c) => `Bridge ${fmtCap(c.capital)} through ${c.name} on ${c.chain} and confirm the receipt on the destination chain. The bridge fee is the cost; the points are the reward.`,
  staking: (c) => `Stake ${fmtCap(c.capital)} with ${c.name} on ${c.chain} and confirm the liquid staking receipt shows in your wallet.`,
  generic: (c) => `Use ${fmtCap(c.capital)} in the ${c.name} protocol on ${c.chain} exactly as the official docs describe, and confirm the position shows.`,
};
const STEP4 = {
  vault: () => `Read the vault's fee schedule on the official docs — performance fee and management fee — and the curator's track record. Exit if the performance fee is above 20% or the curator changes.`,
  lending: () => `Check the collateral factor and the liquidation threshold before you deposit, and keep the health factor above 2.0 at all times.`,
  dex: () => `Check the pool's fee tier and the 7-day volume; a pool with volume under 10% of its TVL pays too little to cover the gas.`,
  yield: () => `Read the emission schedule on the official docs: a farm that halves emissions weekly pays less the longer you wait.`,
  rwa: () => `Read the asset's backing and custodian on the official docs, and check the redemption terms before you buy.`,
  basis: () => `Check the funding rate history: a negative funding rate for two weeks in a row means the vault pays nothing.`,
  derivatives: () => `Check the margin requirement and the liquidation price for each leg before you open, and keep twice the required margin.`,
  payments: () => `Check the fee per payment against the alternatives; the farm only pays if the route is cheaper than the default.`,
  privacy: () => `Check the anonymity set size before you deposit. A small set leaks more than a large one; prefer the pool with the most deposits.`,
  bridge: () => `Check the bridge's fee and time-to-finality against the alternatives; a bridge slower than 30 minutes costs a day of farming.`,
  staking: () => `Check the staking APR and the unstaking delay on the official docs; a delay over 7 days locks the capital too long.`,
  generic: () => `Read the docs fee and lock-up terms before you commit; a lock-up over the hold makes the plan unexitable.`,
};
const STEP5 = {
  vault: () => `Record the deposit transaction hash, the vault address, and the share price at entry. A rising share price is the position working; a falling one is the exit signal.`,
  lending: () => `Record the supply transaction hash, the collateral address, and the borrow limit. A health factor under 1.5 is the exit signal.`,
  dex: () => `Record the LP transaction hash, the pool address, and the price range at entry. Leave if the pair drifts 20% out of range.`,
  yield: () => `Record the stake transaction hash and the reward rate at entry. A reward rate that halves twice is the exit signal.`,
  rwa: () => `Record the purchase transaction hash and the yield rate at entry. A missed payout is the exit signal.`,
  basis: () => `Record the deposit transaction hash and the funding rate at entry. A funding rate under zero is the exit signal.`,
  derivatives: () => `Record both transaction hashes and the entry prices. A leg that moves 10% against you is the exit signal.`,
  payments: () => `Record the transaction hashes and the volume routed. Volume under the plan target is the exit signal.`,
  privacy: () => `Record the pool contract and the deposit transaction hash in your own notes. Never record the note or secret alongside the wallet address.`,
  bridge: () => `Record the bridge transaction hash and the arrival time. A bridge that takes over an hour is the exit signal.`,
  staking: () => `Record the stake transaction hash and the APR at entry. An APR that halves is the exit signal.`,
  generic: () => `Record the transaction hash and the terms at entry. A term that changes against you is the exit signal.`,
};

function farmSteps(row, capital) {
  const chains = row.h ? row.h.split(',') : [];
  const mechanism = mechanismFor(row.n, row.c);
  const plan = planChainFor(chains);
  const hold = holdDays(mechanism);
  const checks = checksFor(hold);
  const ctx = { name: row.n, capital, chain: plan.chain };
  const steps = [
    {
      text: plan.needsBridge
        ? `Use a fresh wallet that holds only the funds you plan to farm, fund it with ${fmtCap(capital)} on Ethereum, then bridge it to ${plan.chain} ($5.00 bridge fee, 15 minutes). Never reuse a wallet that holds other assets.`
        : `Use a fresh wallet that holds only the funds you plan to farm, and fund it with ${fmtCap(capital)} on Ethereum. Never reuse a wallet that holds other assets.`,
      costUsd: plan.needsBridge ? BRIDGE_FEE_USD : 0,
      timeMinutes: plan.needsBridge ? 20 : 5,
    },
    {
      text: `Open ${row.n}'s official site and docs from its DefiLlama listing only, and check the contract addresses match before you connect. Never follow a link from a reply or a DM.`,
      costUsd: 0,
      timeMinutes: 10,
    },
    { text: STEP3[mechanism](ctx), costUsd: 2 * plan.gasUsd, timeMinutes: 10 },
    { text: STEP4[mechanism](), costUsd: 0, timeMinutes: 10 },
    { text: STEP5[mechanism](), costUsd: 0, timeMinutes: 10 },
    {
      text: `Check the position once a week — ${checks} checks over ${hold} days, 10 minutes each — and record TVL and any token or points announcement.`,
      costUsd: 0,
      timeMinutes: 10 * checks,
    },
    {
      text: `Set the exit trigger now: leave if TVL falls 30% from entry, if a token launches and the airdrop snapshot passes, or if the plan fees exceed the slice.`,
      costUsd: 0,
      timeMinutes: 10,
    },
    {
      text: `Claim any points or rewards, withdraw the deposit on ${plan.chain}, and revoke the spending approval after the exit transaction confirms.`,
      costUsd: 2 * plan.gasUsd,
      timeMinutes: 10,
    },
  ];
  return { steps, mechanism, plan, hold, checks };
}

/** Every display value for one row at one ticket and one airdrop share.
 *  At the $1,000 / 10% default these must equal the board.json row exactly. */
function enrichRow(row, capital, share) {
  const parts = impliedParts(row);
  const chains = row.h ? row.h.split(',') : [];
  const plan = farmSteps(row, capital);
  const fees = plan.steps.reduce((n, s) => n + s.costUsd, 0);
  const workMinutes = plan.steps.reduce((n, s) => n + s.timeMinutes, 0);
  // Dilutive slice: the capital joins the TVL, so the share is capital / (TVL + capital) — not capital / TVL.
  const slice = (capital / (row.t + capital)) * parts.value * share;
  const forgone = capital * TBILL_RATE * (plan.hold / 365);
  const net = slice - fees - forgone;
  const verdict = verdictFull(slice, fees, forgone);
  const paysFrom = paysFromUsd(row.t, parts.value, fees, plan.hold, share);
  const relChange = (row.d ?? META.marketMedianPp) - META.marketMedianPp;
  const nearestPeers = D.comps
    .map((c) => ({ comp: c, dist: Math.abs(Math.log10(c.t) - Math.log10(row.t)) }))
    .sort((a, b) => a.dist - b.dist || (a.comp.s < b.comp.s ? -1 : 1))
    .slice(0, 5)
    .map(({ comp }) => comp);
  return {
    row,
    parts,
    chains,
    mechanism: plan.mechanism,
    planChain: plan.plan.chain,
    needsBridge: plan.plan.needsBridge,
    hold: plan.hold,
    checks: plan.checks,
    steps: plan.steps,
    fees,
    workHours: workMinutes / 60,
    slice,
    forgone,
    net,
    netPerHour: net / (workMinutes / 60),
    verdict,
    paysFrom,
    bandLo: parts.value * BAND_P25_FACTOR,
    bandHi: parts.value * BAND_P75_FACTOR,
    relChange,
    nearestPeers,
  };
}


/** How many rows the page's own recomputation reproduces exactly.
 *  Must read N/N — the page and board.json price every row one way. */
function matchCount() {
  let n = 0;
  for (const r of D.rows) {
    if (Math.round(impliedParts(r).value) === r.v) n++;
  }
  return n;
}
function verdictCountsAt(capital, share) {
  const counts = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of D.rows) {
    counts[enrichRow(r, capital, share).verdict]++;
  }
  return counts;
}

function drawCurveChart(canvas, opts) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const padL = 44, padR = 10, padT = 8, padB = 20;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of opts.points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  x0 -= 0.15; x1 += 0.15; y0 -= 0.15; y1 += 0.15;
  const X = (x) => padL + ((x - x0) / (x1 - x0)) * (w - padL - padR);
  const Y = (y) => padT + (1 - (y - y0) / (y1 - y0)) * (h - padT - padB);
  const fmtAxis = (v) => { const a = Math.pow(10, v); return '$' + (a >= 1e9 ? `${(a / 1e9).toFixed(0)}B` : `${(a / 1e6).toFixed(0)}M`); };
  ctx.strokeStyle = '#1e2635';
  ctx.fillStyle = '#5d6577';
  ctx.font = '10px ui-monospace, monospace';
  ctx.lineWidth = 1;
  for (let gx = Math.ceil(x0); gx <= Math.floor(x1); gx++) {
    ctx.beginPath();
    ctx.moveTo(X(gx), padT);
    ctx.lineTo(X(gx), h - padB);
    ctx.stroke();
    ctx.fillText(fmtAxis(gx), X(gx) - 10, h - 6);
  }
  for (let gy = Math.ceil(y0); gy <= Math.floor(y1); gy++) {
    ctx.beginPath();
    ctx.moveTo(padL, Y(gy));
    ctx.lineTo(w - padR, Y(gy));
    ctx.stroke();
    ctx.fillText(fmtAxis(gy), 4, Y(gy) + 3);
  }
  ctx.strokeStyle = '#4da3ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const x = x0 + ((x1 - x0) * i) / 60;
    const y = CURVE_A + CURVE_B * (x - 8);
    if (i === 0) ctx.moveTo(X(x), Y(y));
    else ctx.lineTo(X(x), Y(y));
  }
  ctx.stroke();
  for (const p of opts.points) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), p.r || 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.highlight) {
    const p = opts.highlight;
    ctx.strokeStyle = '#e6e9ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e6e9ef';
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}


function headerHtml(view) {
  const nav = [
    ['board', 'Board'],
    ['trades', 'Token trades'],
    ['setaside', 'Set aside'],
    ['method', 'Method and backtest'],
  ];
  return `<header class="top"><div class="brand">Fleet Crystal <span>· Launch Radar</span></div><nav>${nav
    .map(([v, label]) => `<a href="?view=${v}" class="${view === v || (view === 'detail' && v === 'board') ? 'on' : ''}">${label}</a>`)
    .join('')}</nav></header>`;
}
function footerHtml() {
  return `<footer>Launch Radar ranks pre-token protocols by a fitted size curve and nets every farm plan to the dollar. Model snapshot ${esc(META.asOf)} · ${META.compsCount} traded comparables · not financial advice.</footer>`;
}
function tabsHtml(view, counts) {
  return `<div class="tabs">
    <a href="?view=board" class="${view === 'board' || view === 'detail' ? 'on' : ''}">No token yet (${counts.board})</a>
    <a href="?view=trades" class="${view === 'trades' ? 'on' : ''}">Token trades (${counts.trades})</a>
    <a href="?view=setaside" class="${view === 'setaside' ? 'on' : ''}">Set aside (${counts.setaside})</a>
    <a href="?view=method" class="${view === 'method' ? 'on' : ''}">Method and backtest</a>
  </div>`;
}


function boardView(params) {
  const q = (params.get('q') || '').toLowerCase();
  const tier = params.get('tier') || 'all';
  const cat = params.get('cat') || '';
  const chain = params.get('chain') || '';
  const verdict = params.get('verdict') || '';
  const minTvl = Number(params.get('mintvl') || '0') || 0;
  const capital = [1000, 10000, 100000].includes(Number(params.get('capital'))) ? Number(params.get('capital')) : 1000;
  const share = [0.05, 0.1, 0.2].includes(Number(params.get('share'))) ? Number(params.get('share')) : 0.1;
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const perPage = 25;

  const matched = matchCount();
  const counts = verdictCountsAt(capital, share);
  const categories = [...new Set(D.rows.map((r) => r.c).filter(Boolean))].sort();
  const chains = [...new Set(D.rows.flatMap((r) => (r.h ? r.h.split(',') : [])))].sort();

  const filtered = D.rows
    .map((r, i) => ({ r, rank: i + 1 }))
    .filter(({ r }) => {
      if (q && !(r.n.toLowerCase().includes(q) || r.s.includes(q))) return false;
      if (tier === 'watchlist' && r.w !== 1) return false;
      if (tier === 'early' && r.w === 1) return false;
      if (cat && r.c !== cat) return false;
      if (chain && !(r.h ? r.h.split(',') : []).includes(chain)) return false;
      if (minTvl > 0 && r.t < minTvl) return false;
      if (verdict) {
        const e = enrichRow(r, capital, share);
        if (e.verdict !== verdict) return false;
      }
      return true;
    });
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, pages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const best = META.bestPerHour;
  const statsHtml = `<div class="stats">
    <div class="stat"><div class="v">${META.boardRows}</div><div class="l">Ranked no-token</div></div>
    <div class="stat"><div class="v">${META.watchlistCovered}/40</div><div class="l">Watchlist covered</div></div>
    <div class="stat"><div class="v">${META.compsCount}</div><div class="l">Traded comparables</div></div>
    <div class="stat"><div class="v">${D.setAside.length}</div><div class="l">Set aside</div></div>
    <div class="stat"><div class="v">×${META.validation.loo.modelMedianMiss.toFixed(2)}</div><div class="l">LOO error (median miss)</div></div>
    <div class="stat"><div class="v">${counts.ROBUST} · ${counts.FARM} · ${counts.THIN} · ${counts.SKIP}</div><div class="l">Robust · Farm · Thin · Skip</div></div>
  </div>`;

  const methodHtml = `<div class="panel"><h2>How a launch is priced</h2>
    <div class="formula">log10(implied) = ${CURVE_A.toFixed(4)} + ${CURVE_B.toFixed(4)}·log10(TVL/$100M) + cat(k=${SHRINKAGE_K}) + breadth ${BREADTH_WEIGHT.toFixed(3)}·log10(chains/2)</div>
    <table class="mini"><tr><td>Leave-one-out (n=${META.compsCount})</td><td class="num">×${META.validation.loo.modelMedianMiss.toFixed(3)}</td><td class="num">flat ×${META.validation.loo.flatMedianMiss.toFixed(2)}</td><td class="num">beat ${(META.validation.loo.beatFlatPct * 100).toFixed(1)}%</td></tr>
    <tr><td>Time-split</td><td class="num">×${META.validation.timeSplit.modelMedianMiss.toFixed(3)}</td><td class="num">flat ×${META.validation.timeSplit.flatMedianMiss.toFixed(3)}</td><td class="num">beat ${(META.validation.timeSplit.beatFlatPct * 100).toFixed(1)}%</td></tr></table>
    <p class="small" style="margin-top:3px">Best net/hour: <strong>${esc(best ? best.name : '—')}</strong> ${best ? `+${fmtMoney(best.netPerHourUsd)}/h` : ''} · bands P25–P75 ×${META.bandFactors.p25.toFixed(2)}–×${META.bandFactors.p75.toFixed(2)} · factor cap ±${FACTOR_CAP_LOG10.toFixed(3)}.</p>
  </div>`;

  const filterVal = (name) => esc(params.get(name) || '');
  const filtersHtml = `<div class="filters">
    <label>Search <input type="search" id="f-q" value="${filterVal('q')}" placeholder="name or slug"></label>
    <label>Tier <select id="f-tier"><option value="all" ${tier === 'all' ? 'selected' : ''}>All</option><option value="watchlist" ${tier === 'watchlist' ? 'selected' : ''}>Watchlist</option><option value="early" ${tier === 'early' ? 'selected' : ''}>Early</option></select></label>
    <label>Category <select id="f-cat"><option value="">All</option>${categories.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label>Chain <select id="f-chain"><option value="">All</option>${chains.map((c) => `<option ${c === chain ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label>Verdict <select id="f-verdict"><option value="">All</option>${['ROBUST', 'FARM', 'THIN', 'SKIP'].map((v) => `<option ${v === verdict ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Min TVL <input type="number" id="f-mintvl" value="${minTvl || ''}" placeholder="$" min="0"></label>
    <label>Ticket <select id="f-capital">${[1000, 10000, 100000].map((c) => `<option value="${c}" ${c === capital ? 'selected' : ''}>${fmtCap(c)}</option>`).join('')}</select></label>
    <label>Share <select id="f-share">${[0.05, 0.1, 0.2].map((s) => `<option value="${s}" ${s === share ? 'selected' : ''}>${Math.round(s * 100)}%</option>`).join('')}</select></label>
    <span class="count">${filtered.length} of ${D.rows.length} rows</span>
  </div>`;

  const rowsHtml = pageRows
    .map(({ r, rank }) => {
      const e = enrichRow(r, capital, share);
      const lo = Math.log10(e.bandLo);
      const hi = Math.log10(e.bandHi);
      const pt = Math.log10(r.v);
      const pos = ((pt - lo) / (hi - lo)) * 100;
      const chg = r.d === null ? '—' : `${r.d >= 0 ? '+' : ''}${r.d.toFixed(1)}%`;
      const rel = `${e.relChange >= 0 ? '+' : ''}${e.relChange.toFixed(1)}pp`;
      const netCls = e.net >= 0 ? 'netpos' : 'netneg';
      const pays = e.paysFrom === null ? 'never pays' : `pays from ${fmtMoney(e.paysFrom)}`;
      return `<tr data-slug="${esc(r.s)}">
        <td class="num">${rank}</td>
        <td><span class="name">${esc(r.n)}</span>${r.w === 1 ? '<span class="tag wl">WATCHLIST</span>' : '<span class="tag early">EARLY</span>'}${r.k === 1 ? '<span class="tag sib">SIBLING ×0.5</span>' : ''}<div class="sub">${esc(r.c || 'Uncategorised')} · ${esc(chainShort(e.chains))}</div></td>
        <td class="num">${fmtUsd(r.t)}</td>
        <td class="num">${chg}<div class="sub">${rel} vs market</div></td>
        <td class="num">${fmtDays(r.a)}</td>
        <td class="num">${fmtUsd(r.v)}<div class="rangebar" title="P25–P75 ${fmtUsd(e.bandLo)} – ${fmtUsd(e.bandHi)}"><i style="left:0%;width:100%"></i><b style="left:${pos.toFixed(1)}%"></b></div></td>
        <td class="num">${fmtMoney(e.slice)}</td>
        <td><span class="chip ${e.verdict}">${e.verdict}</span> <span class="mono ${netCls}">${fmtSigned(e.net)}</span><div class="sub">${fmtSigned(e.netPerHour)}/h · ${pays}</div></td>
        <td class="num">${fmtMoney(e.fees)}<div class="sub">${e.hold}d · ${esc(e.mechanism)} · ${esc(e.planChain)}</div></td>
      </tr>`;
    })
    .join('');

  const pageParams = new URLSearchParams(params);
  const pageLink = (p) => {
    pageParams.set('page', String(p));
    return `?${pageParams.toString()}`;
  };

  return `<div class="wrap">
    ${headerHtml('board')}
    <div class="hero"><h1>Launch Radar: size curve tested blind (LOO ×${META.validation.loo.modelMedianMiss.toFixed(2)} vs ×${META.validation.loo.flatMedianMiss.toFixed(2)} flat), every farm plan netted to the dollar</h1>
    <div class="hero-row"><p class="lede">192 pre-token protocols priced by one fitted size curve — 83 traded comparables, no name hand-picked.</p>
    <div class="badges"><span class="badge ok">Watchlist ${META.watchlistCovered}/40</span><span class="badge ${matched === D.rows.length ? 'ok' : 'warn'}">Page = board.json ${matched}/${D.rows.length}</span></div></div></div>
    ${statsHtml}
    <div class="panels">${methodHtml}<div class="panel"><h2>Size curve vs traded comparables</h2><canvas class="chart" id="board-chart"></canvas><p class="small muted">Blue: ${META.compsCount} traded (TVL vs mcap). Green: ${D.rows.length} board rows. Line: fitted curve.</p></div></div>
    ${tabsHtml('board', { board: D.rows.length, trades: D.comps.length, setaside: D.setAside.length })}
    ${filtersHtml}
    <table class="board"><thead><tr><th class="num">#</th><th>Protocol</th><th class="num">TVL</th><th class="num">7D</th><th class="num">No token for</th><th class="num">Implied value</th><th class="num">${fmtCap(capital)} slice</th><th>Net of all costs</th><th class="num">Farm · Fees · Hold</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="9"><div class="empty">No rows match these filters.</div></td></tr>'}</tbody></table>
    <div class="pager"><a class="pagebtn ${pageSafe <= 1 ? 'off' : ''}" href="${pageLink(1)}">First</a><a class="pagebtn ${pageSafe <= 1 ? 'off' : ''}" href="${pageLink(pageSafe - 1)}">Prev</a><span class="small muted">Page ${pageSafe} of ${pages} · ${filtered.length} rows</span><a class="pagebtn ${pageSafe >= pages ? 'off' : ''}" href="${pageLink(pageSafe + 1)}">Next</a><a class="pagebtn ${pageSafe >= pages ? 'off' : ''}" href="${pageLink(pages)}">Last</a></div>
    ${footerHtml()}
  </div>`;
}


function detailView(params) {
  const slug = params.get('slug') || '';
  const idx = D.rows.findIndex((r) => r.s === slug);
  if (idx < 0) {
    return `<div class="wrap">${headerHtml('board')}<div class="empty">No board row for “${esc(slug)}”.</div>${footerHtml()}</div>`;
  }
  const capital = [1000, 10000, 100000].includes(Number(params.get('capital'))) ? Number(params.get('capital')) : 1000;
  const share = [0.05, 0.1, 0.2].includes(Number(params.get('share'))) ? Number(params.get('share')) : 0.1;
  const row = D.rows[idx];
  const rank = idx + 1;
  const e = enrichRow(row, capital, share);
  const recomputed = Math.round(e.parts.value);
  const matches = recomputed === row.v;
  const catEff = row.c ? (META.categoryEffectsLog10[row.c] ?? null) : null;
  const nChains = e.chains.length;
  const breadthTerm = BREADTH_WEIGHT * (Math.log10(Math.min(Math.max(nChains, 1), 10)) - Math.log10(2));

  const sensRows = [0.05, 0.1, 0.2]
    .map((drop) => {
      const cells = [1000, 10000, 100000]
        .map((cap) => {
          const s = (cap / (row.t + cap)) * e.parts.value * (1 - drop) * share;
          const f = forgoneUsd(cap, e.hold);
          const net = s - e.fees - f;
          return `<td class="${net >= 0 ? 'netpos' : 'netneg'}">${fmtSigned(net)}</td>`;
        })
        .join('');
      return `<tr><td>${Math.round(drop * 100)}% drop</td>${cells}</tr>`;
    })
    .join('');

  const stepsHtml = e.steps
    .map(
      (s, i) =>
        `<li><span class="step-text">${esc(s.text)}</span><span class="step-cost">${fmtMoney(s.costUsd)}<br>${s.timeMinutes} min</span></li>`,
    )
    .join('');

  const peersRows = e.nearestPeers
    .map(
      (c) =>
        `<tr><td>${esc(c.n)}</td><td class="num">${fmtUsd(c.t)}</td><td class="num">${fmtUsd(c.m)}</td><td class="num">×${(c.m / c.t).toFixed(2)}</td></tr>`,
    )
    .join('');

  const peerPoints = e.nearestPeers.map((c) => ({ x: Math.log10(c.t), y: Math.log10(c.m), color: '#4da3ff', r: 3 }));
  for (const c of D.comps) peerPoints.push({ x: Math.log10(c.t), y: Math.log10(c.m), color: '#2a3448', r: 1.5 });
  const highlight = { x: Math.log10(row.t), y: Math.log10(row.v) };

  const detailParams = new URLSearchParams();
  detailParams.set('view', 'detail');
  detailParams.set('slug', slug);

  return `<div class="wrap">
    ${headerHtml('detail')}
    <a class="back" href="?view=board">← Back to the board</a>
    <div class="detail-head"><span class="rank">#${rank}</span><h1>${esc(row.n)}</h1>${row.w === 1 ? '<span class="tag wl">WATCHLIST</span>' : '<span class="tag early">EARLY</span>'}${row.k === 1 ? '<span class="tag sib">SIBLING ×0.5</span>' : ''}<span class="muted">${esc(e.mechanism)} · ${esc(e.chains.join(' · '))}</span></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmtUsd(row.v)}</div><div class="l">Implied value</div><div class="s">P25–P75 ${fmtUsd(e.bandLo)} – ${fmtUsd(e.bandHi)}</div></div>
      <div class="kpi"><div class="v">${fmtUsd(row.t)}</div><div class="l">TVL · 7-day</div><div class="s">${row.d === null ? 'no 7-day change' : `${row.d >= 0 ? '+' : ''}${row.d.toFixed(1)}% (${e.relChange >= 0 ? '+' : ''}${e.relChange.toFixed(1)}pp vs market)`}</div></div>
      <div class="kpi"><div class="v">${fmtDays(row.a)}</div><div class="l">No token for</div><div class="s">${row.c || 'Uncategorised'} · ${nChains} chain${nChains === 1 ? '' : 's'}</div></div>
      <div class="kpi"><div class="v">${fmtMoney(e.slice)}</div><div class="l">${fmtCap(capital)} slice at ${Math.round(share * 100)}%</div><div class="s">if the airdrop pays ${Math.round(share * 100)}% of it</div></div>
      <div class="kpi"><div class="v"><span class="chip ${e.verdict}">${e.verdict}</span> <span class="${e.net >= 0 ? 'netpos' : 'netneg'}">${fmtSigned(e.net)}</span></div><div class="l">Net of all costs</div><div class="s">fees ${fmtMoney(e.fees)} · forgone ${fmtMoney(e.forgone)} · ${e.netPerHour >= 0 ? '+' : ''}${fmtMoney(e.netPerHour)}/h</div></div>
    </div>
    <div class="detail-grid">
      <div>
        <div class="panel" style="margin-bottom:12px"><h2>How ${fmtUsd(row.v)} is built</h2>
          <div class="factor"><span>Size curve — log10(implied) = ${META.curve.a.toFixed(4)} + ${META.curve.b.toFixed(4)}·log10(TVL/$100M)</span><span class="fv">${fmtUsd(e.parts.curveUsd)}</span></div>
          <div class="factor"><span>Category — ${esc(row.c || 'Uncategorised')}${catEff === null ? ' (too few comparables, no effect)' : ` (${catEff >= 0 ? '+' : ''}${catEff.toFixed(3)} in log10)`}</span><span class="fv">×${e.parts.categoryMult.toFixed(3)}</span></div>
          <div class="factor"><span>Breadth — ${nChains} chain${nChains === 1 ? '' : 's'} (${BREADTH_WEIGHT.toFixed(3)}·log10(chains/2), cap ±${FACTOR_CAP_LOG10.toFixed(3)})</span><span class="fv">×${e.parts.breadthMult.toFixed(3)}</span></div>
          <div class="factor"><span>Sibling — ${row.k === 1 ? 'shares a first word with a traded protocol, halved' : 'no traded sibling, full value'}</span><span class="fv">×${row.k === 1 ? '0.500' : '1.000'}</span></div>
          <div class="factor"><span><strong>Implied value</strong> (curve × category × breadth × sibling)</span><span class="fv"><strong>${fmtUsd(row.v)}</strong></span></div>
          <p class="small" style="margin-top:8px">Recomputed on this page: ${fmtUsd(recomputed)} — board.json carries the same ${fmtUsd(row.v)} at rank ${rank}. ${matches ? 'They match.' : 'They do not match — do not trust this row.'}</p>
        </div>
        <div class="panel"><h2>Against traded peers</h2>
          <canvas class="chart mini" id="peer-chart"></canvas>
          <table class="mini" style="margin-top:8px"><tr><th>Nearest 5 by size</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr>${peersRows}
          <tr><td><strong>${esc(row.n)} (implied)</strong></td><td class="num"><strong>${fmtUsd(row.t)}</strong></td><td class="num"><strong>${fmtUsd(row.v)}</strong></td><td class="num"><strong>×${(row.v / row.t).toFixed(2)}</strong></td></tr></table>
        </div>
      </div>
      <div class="panel"><div class="plan-head"><h2>Farm plan — ${fmtCap(capital)} on ${esc(e.planChain)}${e.needsBridge ? ' (bridged from Ethereum)' : ''}</h2><span class="plan-controls">Ticket <select id="d-capital">${[1000, 10000, 100000].map((c) => `<option value="${c}" ${c === capital ? 'selected' : ''}>${fmtCap(c)}</option>`).join('')}</select> · Airdrop <select id="d-share">${[0.05, 0.1, 0.2].map((s) => `<option value="${s}" ${s === share ? 'selected' : ''}>${Math.round(s * 100)}%</option>`).join('')}</select></span></div>
        <ol class="plan">${stepsHtml}</ol>
        <div class="plan-foot">Slice ${fmtMoney(e.slice)} − fees ${fmtMoney(e.fees)} − forgone ${fmtMoney(e.forgone)} = <span class="net ${e.net >= 0 ? 'netpos' : 'netneg'}">${fmtSigned(e.net)}</span> · ${e.workHours.toFixed(1)}h · ${fmtSigned(e.netPerHour)}/h · ${e.paysFrom === null ? 'never pays' : `pays from ${fmtMoney(e.paysFrom)}`}</div>
        <h3 style="margin-top:6px">Net if the implied value falls</h3>
        <table class="sens"><tr><th></th><th>$1,000 ticket</th><th>$10,000 ticket</th><th>$100,000 ticket</th></tr>${sensRows}</table>
      </div>
    </div>
    ${footerHtml()}
  </div>`;
}


function tradesView() {
  const sorted = [...D.comps].sort((a, b) => b.t - a.t);
  const counts = META.compsCounts;
  const rowsHtml = sorted
    .map(
      (c, i) =>
        `<tr><td class="num">${i + 1}</td><td><span class="name">${esc(c.n)}</span><div class="sub">${esc(c.s)}</div></td><td class="num">${fmtUsd(c.t)}</td><td class="num">${fmtUsd(c.m)}</td><td class="num">×${(c.m / c.t).toFixed(2)}</td></tr>`,
    )
    .join('');
  return `<div class="wrap">
    ${headerHtml('trades')}
    <div class="hero"><h1>Token trades: the ${META.compsCount} comparables behind the curve</h1>
    <p class="lede">Every implied value on the board is priced against these traded protocols — same snapshot, same TVL, real market caps. The curve is fitted to them and to nothing else.</p></div>
    ${tabsHtml('trades', { board: D.rows.length, trades: D.comps.length, setaside: D.setAside.length })}
    <div class="panels"><div class="panel"><h2>How 758 protocols become 83 comparables</h2>
      <table class="mini">
      <tr><td>Protocols in the snapshot</td><td class="num">758</td></tr>
      <tr><td>With a market cap</td><td class="num">${counts.tradedWithMcap}</td></tr>
      <tr><td>With a positive market cap</td><td class="num">${counts.positiveMcap}</td></tr>
      <tr><td>After merging by token (${counts.mergedTokens} tokens)</td><td class="num">${counts.mergedTokens}</td></tr>
      <tr><td>After house drops (${counts.houseDropped}: ${counts.houseDropReasons.cex} CEX, ${counts.houseDropReasons.bridgeCategory} bridge, ${counts.houseDropReasons.stakingCategory} staking, ${counts.houseDropReasons.versionedName} versioned name)</td><td class="num">${counts.afterHouseDrops}</td></tr>
      <tr><td>After trimming mcap/TVL outside [1/500, 50] (dropped ${counts.trimDropped.join(', ')})</td><td class="num"><strong>${counts.afterTrim}</strong></td></tr></table>
      <p class="small" style="margin-top:8px">83 is just below the 85–130 band the brief suggests — the reason is the mcap-bearing set, not the rules. Dropping the house rules reaches 123 comparables but fits worse (LOO ×3.274 vs ×2.845), so 83 stands.</p>
    </div><div class="panel"><h2>Reading the multiple</h2>
      <p>mcap / TVL is the market's own answer to “what is a protocol of this size worth”. The curve is the median of that answer across sizes: at $100M TVL the level is ${fmtUsd(META.curve.levelUsd)} (×${META.curve.multiple.toFixed(4)}), rising with TVL to the power ${META.curve.b.toFixed(4)}.</p>
      <p>R² is ${META.curve.r2.toFixed(3)} — size explains a sixth of the variation and no more. The rest is the band: P25–P75 runs ×${META.bandFactors.p25.toFixed(2)}–×${META.bandFactors.p75.toFixed(2)} around the point. Read the range, not the dot.</p>
    </div></div>
    <table class="board"><thead><tr><th class="num">#</th><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    ${footerHtml()}
  </div>`;
}

function setAsideView() {
  const rowsHtml = D.setAside
    .map(
      (r, i) =>
        `<tr><td class="num">${i + 1}</td><td><span class="name">${esc(r.n)}</span><div class="sub">${esc(r.s)}</div></td><td>${esc(r.c || 'Uncategorised')}</td><td class="num">${fmtUsd(r.t)}</td><td class="small">${esc(r.r)}</td></tr>`,
    )
    .join('');
  return `<div class="wrap">
    ${headerHtml('setaside')}
    <div class="hero"><h1>Set aside: ${D.setAside.length} pre-token protocols not on the board</h1>
    <p class="lede">The board holds the 40 watchlist protocols plus the 152 pre-token protocols below the $${(META.floorUsd / 1e6).toFixed(0)}M floor with the most TVL. Everything else is here with the reason it was set aside — nothing is hidden.</p></div>
    ${tabsHtml('setaside', { board: D.rows.length, trades: D.comps.length, setaside: D.setAside.length })}
    <table class="board"><thead><tr><th class="num">#</th><th>Protocol</th><th>Category</th><th class="num">TVL</th><th>Why set aside</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    ${footerHtml()}
  </div>`;
}

function methodView() {
  const v = META.validation;
  const top5 = D.rows.slice(0, 5);
  const steak = D.rows.find((r) => r.s === 'steakhouse-financial');
  const tuningRows = v.shrinkageTuning
    .map(
      (t) =>
        `<tr><td class="num">${t.k}</td><td class="num">×${t.medianMiss.toFixed(3)}</td><td class="num">${(t.within3x * 100).toFixed(1)}%</td><td class="num">${(t.within10x * 100).toFixed(1)}%</td><td class="num">${(t.beatFlatPct * 100).toFixed(1)}%</td></tr>`,
    )
    .join('');
  return `<div class="wrap method">
    ${headerHtml('method')}
    <div class="hero"><h1>Method and backtest</h1>
    <p class="lede">The whole research note, on the page: what the model is, how it was tested blind, where it is weak, and how to reproduce it. Nothing on this board is hand-picked.</p></div>
    ${tabsHtml('method', { board: D.rows.length, trades: D.comps.length, setaside: D.setAside.length })}

    <h2>The question</h2>
    <p>A protocol has TVL, a category, a chain count and no token yet. What would its token be worth if it launched today? The answer here is not a guess and not a list: it is the market cap a traded protocol of the same size carries, fitted from the snapshot itself.</p>

    <h2>The model (radar-3)</h2>
    <div class="formula">log10(implied) = ${META.curve.a.toFixed(4)} + ${META.curve.b.toFixed(4)} · log10(TVL / $100M)
+ category effect (shrunk, k=${SHRINKAGE_K}) + breadth ${META.breadthWeight.toFixed(3)} · log10(chains / 2), capped ±${META.factorCapLog10.toFixed(3)}
× 0.5 when the protocol shares a first word with a traded protocol (sibling)</div>
    <p>The curve is a least-squares fit of log10(market cap) on log10(TVL / $100M) over the ${META.compsCount} comparables: intercept ${META.curve.a.toFixed(4)}, slope ${META.curve.b.toFixed(4)}, R² ${META.curve.r2.toFixed(3)}. At $100M TVL the level is ${fmtUsd(META.curve.levelUsd)} (×${META.curve.multiple.toFixed(4)} on TVL). The category effect is the mean residual per category, shrunk toward zero with k=${SHRINKAGE_K}; a category with fewer than two comparables gets none. Breadth is the only validated factor: each doubling of the chain count (up to 10) multiplies the implied value by 10^${META.breadthWeight.toFixed(3)} ≈ ×${Math.pow(10, META.breadthWeight).toFixed(2)}, capped at ×${Math.pow(10, META.factorCapLog10).toFixed(2)}. A sibling — a pre-token protocol sharing a first word with a traded protocol — is halved, because part of its name's value already trades.</p>

    <h2>The comparables</h2>
    <p>758 protocols in the snapshot; ${META.compsCounts.tradedWithMcap} carry a market cap, ${META.compsCounts.positiveMcap} a positive one. Merging by token changes nothing (${META.compsCounts.mergedTokens} tokens). House drops remove ${META.compsCounts.houseDropped} — ${META.compsCounts.houseDropReasons.cex} centralised exchanges, ${META.compsCounts.houseDropReasons.bridgeCategory} bridges, ${META.compsCounts.houseDropReasons.stakingCategory} staking, ${META.compsCounts.houseDropReasons.versionedName} versioned name — products whose market cap is not a protocol token's value. Trimming mcap/TVL outside [1/500, 50] drops ${META.compsCounts.trimDropped.join(' and ')}, leaving ${META.compsCounts.afterTrim}. Just below the 85–130 band the brief suggests; the no-drop variant reaches 123 but fits worse (LOO ×3.274 vs ×2.845), so 83 stands.</p>

    <h2>Shrinkage tuning (leave-one-out, curve + category, no factors)</h2>
    <table class="mini"><tr><th class="num">k</th><th class="num">Median miss</th><th class="num">Within 3×</th><th class="num">Within 10×</th><th class="num">Beat flat</th></tr>${tuningRows}</table>
    <p>Best k = 12 — the smallest k attaining the minimum. The flat baseline (no curve, no category) misses by ×${v.loo.flatMedianMiss.toFixed(3)} in leave-one-out, within 3× ${(v.loo.flatWithin3x * 100).toFixed(1)}% of the time.</p>

    <h2>Factor checks (Pearson r vs curve-only leave-one-out residual)</h2>
    <table class="mini"><tr><th>Factor</th><th class="num">r</th><th>Verdict</th></tr>
    <tr><td>7-day momentum (relative to market)</td><td class="num">${v.factorChecks.momentumRelativeR >= 0 ? '+' : ''}${v.factorChecks.momentumRelativeR.toFixed(3)}</td><td>Not confirmed — dropped</td></tr>
    <tr><td>Seasoning (time with no token)</td><td class="num">${v.factorChecks.seasoningR >= 0 ? '+' : ''}${v.factorChecks.seasoningR.toFixed(3)}</td><td>Not confirmed — dropped</td></tr>
    <tr><td>Breadth (chain count)</td><td class="num">${v.factorChecks.breadthR.toFixed(3)}</td><td><strong>Validated</strong> — the only factor in the model</td></tr></table>
    <p>Momentum and seasoning look plausible and fail on the data, so they are not in the model. Breadth validates in leave-one-out and the time-split, and survives stress tests (r = −0.222 on ≤10 chains, −0.217 on ≤5, −0.180 after partialling log-age; correlation with size 0.085, so not a size proxy). It improves 43 of 83 tokens in leave-one-out.</p>

    <h2>Blind tests</h2>
    <table class="mini"><tr><th>Test</th><th class="num">Model</th><th class="num">Flat</th><th class="num">Beat flat</th></tr>
    <tr><td>Leave-one-out, full model (n=${META.compsCount})</td><td class="num">×${v.loo.modelMedianMiss.toFixed(3)} · within 3× ${(v.loo.modelWithin3x * 100).toFixed(1)}% · within 10× ${(v.loo.modelWithin10x * 100).toFixed(1)}%</td><td class="num">×${v.loo.flatMedianMiss.toFixed(3)}</td><td class="num">${(v.loo.beatFlatPct * 100).toFixed(1)}%</td></tr>
    <tr><td>Leave-one-out, curve + category (k=12)</td><td class="num">×${v.loo.curvePlusCategoryMedianMiss.toFixed(3)}</td><td class="num">×${v.loo.flatMedianMiss.toFixed(3)}</td><td class="num">—</td></tr>
    <tr><td>Leave-one-out, curve only</td><td class="num">×${v.loo.curveOnlyMedianMiss.toFixed(3)}</td><td class="num">×${v.loo.flatMedianMiss.toFixed(3)}</td><td class="num">—</td></tr>
    <tr><td>Time-split (fit pre-2024 n=${v.timeSplit.fitN}, test post-2024 n=${v.timeSplit.testN})</td><td class="num">×${v.timeSplit.modelMedianMiss.toFixed(3)} · within 3× ${(v.timeSplit.modelWithin3x * 100).toFixed(1)}%</td><td class="num">×${v.timeSplit.flatMedianMiss.toFixed(3)} · within 3× ${(v.timeSplit.flatWithin3x * 100).toFixed(1)}%</td><td class="num">${(v.timeSplit.beatFlatPct * 100).toFixed(1)}%</td></tr></table>
    <p>Bands come from the full-model leave-one-out residuals: P10 ×${META.bandFactors.p10.toFixed(2)}, P25 ×${META.bandFactors.p25.toFixed(2)}, P75 ×${META.bandFactors.p75.toFixed(2)}, P90 ×${META.bandFactors.p90.toFixed(2)}. The board draws P25–P75. Bootstrap (${v.bootstrap.n}×): slope ${v.bootstrap.slopeMean.toFixed(3)} ± ${v.bootstrap.slopeSd.toFixed(3)} (P5 ${v.bootstrap.slopeP5.toFixed(3)}, P95 ${v.bootstrap.slopeP95.toFixed(3)}); level ${fmtUsd(v.bootstrap.levelMeanUsd)} ± ${fmtUsd(v.bootstrap.levelSdUsd)}.</p>
    <p><strong>Gate 1: PASS.</strong> Leave-one-out beats flat by ${(v.loo.beatFlatPct * 100).toFixed(1)}% (bar ≥25%) and the time-split beats flat too. Caveat: without any factor the leave-one-out beat is 16.8% — below the bar. The pass rests on breadth, one factor, implemented exactly as fitted and shown on every row.</p>

    <h2>Robustness</h2>
    <ul>
      <li>Comps variants, full-model leave-one-out: A (83 comps, strict house rules) ×2.845 · B (82, +staked-name rule) ×2.847 · C (123, no house drops) ×3.274. Absolute miss picks A; B is tied; C is worse.</li>
      <li>Time-split (same split): curve-only ×2.195 · curve+category ×2.195 · full model ×1.906. Category adds nothing out-of-sample; breadth generalises across time. The time-split fit gives breadth weight −0.154 vs full-sample −0.307 — same sign, half the magnitude; the magnitude is uncertain, the sign is not.</li>
      <li>Category effects add nothing out-of-sample (curve-only ×3.37 vs curve+category ×3.37). They are kept as honest in-sample structure, but the leave-one-out gain comes from breadth, not categories.</li>
    </ul>

    <h2>Board sanity</h2>
    <p>${META.boardRows} rows (40 watchlist + 152 early), total implied ${fmtUsd(META.totalImpliedUsd)}, median ${fmtUsd(META.medianImpliedUsd)}, P10 ${fmtUsd(META.p10ImpliedUsd)}, P90 ${fmtUsd(META.p90ImpliedUsd)}. Top 5: ${top5.map((r) => `${esc(r.n)} ${fmtUsd(r.v)}`).join(', ')}. ${steak ? `Steakhouse Financial sits at ${fmtUsd(steak.v)} — inside the top-10 field range of $31M–$126M.` : ''} ${META.siblingRows} rows are siblings and get the ×0.5 halving; none of the 40 watchlist rows is one.</p>

    <h2>Farm economics</h2>
    <p>Every row is netted the same way at a ${fmtCap(META.economics.defaultCapitalUsd)} ticket and a ${Math.round(META.economics.airdropShare * 100)}% airdrop share: slice = (ticket / (TVL + ticket)) × implied × share (dilutive — the ticket joins the TVL), minus farm fees (bridge ${fmtMoney(META.economics.bridgeFeeUsd)} when the cheapest chain is not Ethereum, plus two transactions each way at that chain's gas price), minus the T-bill yield forgone on the ticket for the hold (${(META.economics.tbillRate * 100).toFixed(0)}% a year). Net &gt; 0 is FARM; net &gt; 0 even at the P25 end of the band is ROBUST; slice below the fees is SKIP; the rest is THIN. “Pays from $X” is the smallest ticket at which the plan nets positive. The plan is eight mechanism-aware steps on the cheapest of the protocol's first three chains by TVL, with a cost and a time on every step and a sensitivity table for a 5/10/20% fall.</p>

    <h2>What the model does not know</h2>
    <ul>
      <li>R² is ${META.curve.r2.toFixed(3)}: size explains a sixth of market-cap variation. The band is wide by design — a point estimate without its band is a lie.</li>
      <li>The snapshot is one day (${esc(META.asOf)}). TVL, 7-day change and chain count all move; the board is a photograph, not a forecast.</li>
      <li>Momentum and seasoning were tested and dropped. If a launch's timing matters, this model does not capture it.</li>
      <li>The airdrop share (${Math.round(META.economics.airdropShare * 100)}%) and T-bill rate (${(META.economics.tbillRate * 100).toFixed(0)}%) are assumptions, not measurements. Change them on the board and every verdict recomputes live.</li>
      <li>No name is hand-picked, but the board is still a ranking of a fitted curve — the top row is the largest fitted number, not a recommendation.</li>
    </ul>

    <h2>Reproduce it</h2>
    <p>Run the program on the same snapshot: <span class="mono">node main.ts --input input/snapshot.json --output out</span>. It writes board.json, the dashboard data and dossier.json, then runs its own seven-row gate check. The two runs must be byte-identical; the dossier must stay under 1.5 MiB.</p>
    ${footerHtml()}
  </div>`;
}


function render() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view') || 'board';
  let html;
  if (view === 'detail') html = detailView(params);
  else if (view === 'trades') html = tradesView(params);
  else if (view === 'setaside') html = setAsideView(params);
  else if (view === 'method') html = methodView(params);
  else html = boardView(params);
  document.getElementById('app').innerHTML = html;
  afterRender(view, params);
}

function afterRender(view, params) {
  const pts = (list, color, r, yk) => list.map((c) => ({ x: Math.log10(c.t), y: Math.log10(c[yk]), color, r }));
  if (view === 'board' || view === '' || view === null) {
    const canvas = document.getElementById('board-chart');
    if (canvas) {
      drawCurveChart(canvas, { points: [...pts(D.comps, '#4da3ff', 2.5, 'm'), ...pts(D.rows, '#3fb27f', 1.5, 'v')] });
    }
    wireBoardFilters();
    document.querySelectorAll('table.board tbody tr[data-slug]').forEach((tr) => {
      tr.addEventListener('click', () => {
        location.search = `?view=detail&slug=${encodeURIComponent(tr.dataset.slug)}`;
      });
    });
  }
  if (view === 'detail') {
    const canvas = document.getElementById('peer-chart');
    const slug = params.get('slug') || '';
    const row = D.rows.find((r) => r.s === slug);
    if (canvas && row) {
      const e = enrichRow(row, 1000, 0.1);
      drawCurveChart(canvas, { points: [...pts(e.nearestPeers, '#4da3ff', 3, 'm'), ...pts(D.comps, '#2a3448', 1.5, 'm')], highlight: { x: Math.log10(row.t), y: Math.log10(row.v) } });
    }
    const capSel = document.getElementById('d-capital');
    const shareSel = document.getElementById('d-share');
    const goDetail = () => {
      const p = new URLSearchParams();
      p.set('view', 'detail');
      p.set('slug', slug);
      if (capSel) p.set('capital', capSel.value);
      if (shareSel) p.set('share', shareSel.value);
      location.search = p.toString();
    };
    if (capSel) capSel.addEventListener('change', goDetail);
    if (shareSel) shareSel.addEventListener('change', goDetail);
  }
}

function wireBoardFilters() {
  const get = (id) => document.getElementById(id);
  const F = [['f-q', 'q'], ['f-tier', 'tier', 'all'], ['f-cat', 'cat'], ['f-chain', 'chain'], ['f-verdict', 'verdict'], ['f-mintvl', 'mintvl'], ['f-capital', 'capital', '1000'], ['f-share', 'share', '0.1']];
  const apply = () => {
    const p = new URLSearchParams();
    p.set('view', 'board');
    for (const [id, key, def = ''] of F) {
      const el = get(id);
      const v = el ? el.value.trim() : def;
      if (v && v !== def) p.set(key, v);
    }
    location.search = p.toString();
  };
  let timer = null;
  const search = get('f-q');
  if (search) {
    search.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, 500);
    });
  }
  for (const [id] of F) {
    if (id === 'f-q') continue;
    const el = get(id);
    if (el) el.addEventListener('change', apply);
  }
}

render();
