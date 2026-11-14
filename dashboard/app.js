// Token Radar's night dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's
// own inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The model and the farm plan are derived here a second time, from the same snapshot figures the
// program used, so the page's code and the board's data are visibly the same arithmetic: the page
// recomputes a row's implied value and checks the number board.json carries, and it regenerates
// each farm plan from the protocol's category, chains, TVL and age. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var multiples = {};
  (DATA.multiples || []).forEach(function (m) { multiples[m.category] = m.multiple; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (n === null || n === undefined) ? 'n/a' : n.toFixed(3) + 'x'; }

  // The model in one function: the same four multipliers main.ts applies, from the same figures.
  // category_multiple comes from DATA.multiples, the market's own pricing of the category, read
  // out of the snapshot by the program; growth, maturity and breadth follow the snapshot's numbers.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + model.breadth_weight * Math.log(Math.max(1, (row.chains || []).length));
    var cat = multiples[row.category || 'Other'];
    if (cat === undefined) cat = DATA.global_multiple;
    return Math.max(1, Math.round(row.tvl_usd * cat * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- the farm plan, derived exactly as main.ts derives it -----------------------------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasUsd(chain) {
    var table = {
      Ethereum: 8, Base: 1, Arbitrum: 1, Optimism: 1, Blast: 1, Mode: 1, Ink: 1, Zora: 1,
      Solana: 0.05, Binance: 0.3, Polygon: 0.1, Avalanche: 0.5, Tron: 2, Bitcoin: 3,
      Bittensor: 1, Flare: 0.5, Monad: 0.5, 'Plume Mainnet': 0.5, Sui: 0.1, Aptos: 0.1,
      Scroll: 0.5, Linea: 0.5, Mantle: 0.5, Starknet: 0.5, zkSync: 0.5, Berachain: 0.5
    };
    return table[chain] === undefined ? 2 : table[chain];
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function usdSmall(n) { return n < 1 ? '$' + n.toFixed(2) : '$' + Math.round(n); }
  function familyOf(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateral') >= 0) return 'lend';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'dex';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'stake';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0) return 'perp';
    if (c.indexOf('prediction') >= 0) return 'predict';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'curator';
    if (c.indexOf('stable') >= 0 || c.indexOf('anchor') >= 0) return 'stable';
    if (c.indexOf('rwa') >= 0) return 'rwa';
    if (c.indexOf('insurance') >= 0) return 'insurance';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'payments';
    if (c.indexOf('index') >= 0) return 'index';
    if (c.indexOf('chain') >= 0) return 'chain';
    return 'default';
  }
  function actionFor(p, capital, chain) {
    var name = p.name;
    switch (familyOf(p)) {
      case 'lend': return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow 30% of it back in the same asset and keep the health factor above 1.5.';
      case 'dex': return 'Provide $' + capital + " of liquidity to " + name + "'s largest pool on " + chain + ' — half USDC, half the pool\'s other asset — and keep the LP receipt.';
      case 'bridge': return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds once in an app on the other side instead of bridging straight back.';
      case 'stake': return 'Stake $' + capital + " of the chain's native asset through " + name + ' on ' + chain + ' and keep the receipt token in the same wallet.';
      case 'perp': return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position, no more than 2x leverage.';
      case 'predict': return 'Fund ' + name + ' with $' + capital + ' on ' + chain + ' and take one position in a market that resolves within the next two weeks.';
      case 'curator': return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares; the vault, not you, picks the allocation.';
      case 'stable': return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the same wallet.';
      case 'rwa': return 'Mint $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' and hold it so the yield accrues to your wallet.';
      case 'insurance': return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' for a position you actually hold, and keep the policy active.';
      case 'payments': return 'Fund ' + name + ' with $' + capital + ' on ' + chain + ' and make one real payment through it, then keep the balance for the next one.';
      case 'index': return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold the index token instead of its parts.';
      case 'chain': return 'Bridge $' + capital + " of USDC onto " + chain + ", swap half into the chain's native asset, and use one app built on " + name + '.';
      default: return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    }
  }
  function depthFor(p, capital, chain) {
    var name = p.name;
    switch (familyOf(p)) {
      case 'lend': return 'After a week, re-supply the borrowed funds once and check the borrow rate: a position that moves is read as a user, not a deposit.';
      case 'dex': return "Stake the LP receipt in " + name + "'s rewards contract if it has one, and note the pool's fee tier and the pair's depth before you add more.";
      case 'bridge': return 'Leave the bridged funds working for a full week, then bridge a smaller amount back: two-way flow reads as a user, one-way as a passer-by.';
      case 'stake': return 'Restake the first rewards by hand and check the validator or operator ' + name + ' routes to: a stake that compounds is a longer signal.';
      case 'perp': return 'Close the hedge after 24 hours, keep the margin on ' + name + ', and reopen it only when the market moves: the margin, not the trade, is the position.';
      case 'predict': return "When the market resolves, claim any winnings from " + name + "'s own page and put half of them straight into the next market.";
      case 'curator': return "Read " + name + "'s latest vault allocation report and check your share of the vault grew with the TVL: a vault that grows is a vault that is used.";
      case 'stable': return "Check the stable asset's peg and redemption path once a week: minting is only half the position, redeeming cleanly is the other half.";
      case 'rwa': return "Verify the yield actually accrued to your wallet after seven days and read " + name + "'s latest custodian or audit note.";
      case 'insurance': return 'Read the cover terms once: what counts as a claim, how long it takes to pay, and what the policy excludes.';
      case 'payments': return 'Make a second, smaller payment a week later: repeat use is what a payments protocol can see.';
      case 'index': return "Check the index's composition after a month: an index that rebalances is being run, not abandoned.";
      case 'chain': return 'Delegate or stake part of the native asset you hold on ' + chain + ' so the wallet shows activity beyond one swap.';
      default: return 'Make a second deposit of half the first amount a week later, so the position shows a pattern instead of a single transaction.';
    }
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasUsd(chain);
    var gasTx = 'about ' + usdSmall(gas) + ' of gas';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline, never in a screenshot.', cost: 'under ' + usdSmall(Math.max(gas, 1)) + ' of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gasTx + ' to open it', time: '15 minutes to set up' },
      { text: depthFor(p, capital, chain), cost: gasTx, time: '10 minutes' },
      { text: 'Make one qualifying action each week — a deposit, a borrow, a swap or a vote — and keep the same wallet for all of them.', cost: 'about ' + usdSmall(gas) + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, not a single week.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page from its official site and check what your wallet has earned.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Only ever follow links from ' + p.name + "'s official site or verified account, never a link in a reply or a DM, and revoke the approval after you finish.", cost: 'free', time: '5 minutes' },
      { text: 'To exit, withdraw or unstake in two parts a day apart and log the wallet, the dates and every transaction so you can repeat or unwind it.', cost: gasTx + ' per part, plus the pool\'s spread', time: '20 minutes' }
    ].map(stepText);
  }

  // ---- state from the hash ------------------------------------------------------------
  var WATCHLIST = {};
  DATA.rows.forEach(function (r) { if (r.rank <= DATA.watchlist_size) WATCHLIST[r.slug] = true; });
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist')) state.watchlist = params.get('watchlist') === '1';
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !WATCHLIST[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { html: 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record</b>. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise — and never a prediction that a token launches.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 3);
    return el('section', { class: 'spot' }, top.map(function (r) {
      return el('button', { class: 'spot-card', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'RANK ' + r.rank }),
        el('b', { text: r.name }),
        el('span', { class: 'value', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' · TVL ' + fmtUsd(r.tvl_usd) + ' · ' + fmtPct(r.change_7d) + ' in 7d' })
      );
    }));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlist ? 'checked' : null, onchange: function (e) { state.watchlist = e.target.checked; writeHash(); render(); } }),
      'Watchlist only'
    );
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      wl,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
          WATCHLIST[r.slug] ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their prices are what the pre-token multiples are read from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var multRows = (DATA.multiples || []).filter(function (x) { return x.peers >= 3; }).sort(function (a, b) { return b.multiple - a.multiple; });
    var multBody = el('tbody');
    multRows.forEach(function (x) {
      multBody.appendChild(el('tr', null,
        el('td', { text: x.category }),
        el('td', { class: 'num', text: String(x.peers) }),
        el('td', { class: 'num', text: x.peer_median === null ? 'n/a' : fmtMult(x.peer_median) }),
        el('td', { class: 'num', text: fmtMult(x.multiple) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The category multiple is the market\u2019s own pricing: the median market-cap/TVL ratio of the live-token protocols in that category, shrunk toward the market-wide median of ' + fmtMult(DATA.global_multiple) + ' with weight n/(n+' + m.shrink_prior + '). Categories with fewer than ' + m.min_peers + ' live peers use the market-wide median.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round( tvl_usd x category_multiple x growth x maturity x breadth )' }),
        el('div', { text: 'growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight }),
        el('div', { text: 'maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + '   (unknown age = ' + m.unknown_age_days + ' days)' }),
        el('div', { text: 'breadth = 1 + ' + m.breadth_weight + ' x ln(chains)' })
      ),
      el('h3', { text: 'Category multiples, read from the snapshot' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', class: 'num', text: 'Live peers' }),
            el('th', { scope: 'col', class: 'num', text: 'Peer median' }),
            el('th', { scope: 'col', class: 'num', text: 'Multiple used' })
          )),
          multBody
        )
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function whyRank(row) {
    var cat = multiples[row.category || 'Other'];
    if (cat === undefined) cat = DATA.global_multiple;
    var parts = [];
    parts.push('TVL ' + fmtUsd(row.tvl_usd) + ' is the largest single input, and the market prices ' + (row.category || 'other') + ' tokens at ' + fmtMult(cat) + ' of TVL');
    if (row.change_7d !== null) parts.push('TVL moved ' + fmtPct(row.change_7d) + ' over the last seven days, which the growth multiplier carries at ' + row.growth_multiplier + 'x');
    else parts.push('no seven-day growth was reported, so the growth multiplier sits at 1.000x');
    parts.push('it has run ' + fmtAge(row.age_days) + ' with no token on record, for a maturity multiplier of ' + row.maturity_multiplier + 'x');
    parts.push('it is live on ' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ', for a breadth multiplier of ' + row.breadth_multiplier + 'x');
    return parts.join('; ') + '.';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this rank' }),
      el('p', { class: 'why', text: whyRank(row) })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.source }),
      el('span', { text: 'Implied value is this entry\u2019s own claim, never make.fun\u2019s. A protocol records no token; the record is not proof it has none. Nothing here is a prediction that a token launches.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
