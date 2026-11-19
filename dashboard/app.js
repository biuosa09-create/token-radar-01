// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with
// the model's own inputs and the protocol's farm plan, the live-token set the model learned
// from, and a model sandbox that re-ranks the board live. No network: every byte it shows is
// in data.js. The page recomputes every row from the snapshot figures, so the page's code and
// the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var M = DATA.model;
  var state = {
    q: '', category: 'all', chain: 'all', tvl: 'all', watchlist: false,
    tab: 'board', sort: 'implied', dir: -1, selected: null,
    sb: { growth: M.growth_weight, floor: M.maturity_floor, cap: M.multiple_cap },
  };

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
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries. The sandbox passes its own parameters; the submitted board
  // always uses DATA.model.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var multiple = Math.min(row.category_multiple, model.multiple_cap);
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity));
  }
  function sandboxOn() {
    return state.sb.growth !== M.growth_weight || state.sb.floor !== M.maturity_floor || state.sb.cap !== M.multiple_cap;
  }
  function effModel() {
    if (!sandboxOn()) return M;
    return {
      growth_weight: state.sb.growth, growth_floor: M.growth_floor, growth_cap: M.growth_cap,
      maturity_floor: state.sb.floor, maturity_range: M.maturity_range, maturity_days: M.maturity_days,
      unknown_age_days: M.unknown_age_days, shrink_k: M.shrink_k,
      multiple_floor: M.multiple_floor, multiple_cap: state.sb.cap,
    };
  }
  function shownImplied(row) { return sandboxOn() ? impliedOf(row, effModel()) : row.implied_value_usd; }

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

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is
  // special-cased, and the page's plan and the board's plan are the same strings.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
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
  var FAMILIES = [
    { m: ['lend', 'cdp', 'collateral', 'uncollateralized'], main: 'Supply $CAPITAL of USDC to $NAME on $CHAIN and keep the position open.', weekly: 'Borrow a small amount against the supply, then repay it the same week.' },
    { m: ['dex'], main: "Provide $CAPITAL of liquidity to $NAME's main pool on $CHAIN and keep the position open.", weekly: 'Swap a small amount through the pool so the position shows trading activity.' },
    { m: ['leveraged farm', 'yield', 'farm'], main: 'Deposit $CAPITAL into a $NAME vault on $CHAIN and keep the shares.', weekly: 'Harvest the vault rewards once and redeposit them into the same vault.' },
    { m: ['bridge', 'cross chain'], main: 'Bridge $CAPITAL of USDC to $CHAIN through $NAME and use the bridged funds in its app.', weekly: 'Bridge a small amount back or onward so the address shows repeated use.' },
    { m: ['staking', 'restak'], main: "Stake $CAPITAL of the chain's staking asset through $NAME and keep the receipt.", weekly: 'Restake the staking rewards instead of withdrawing them.' },
    { m: ['perpetual', 'derivative', 'options'], main: 'Deposit $CAPITAL of USDC as margin on $NAME and open one small hedge.', weekly: 'Close the hedge and open a fresh one so the account shows repeated trading.' },
    { m: ['prediction'], main: 'Fund $CAPITAL and place one market position on $NAME.', weekly: 'Place one more market position on a different market.' },
    { m: ['curator', 'allocator'], main: 'Deposit $CAPITAL into a $NAME vault on $CHAIN and keep the shares.', weekly: 'Rebalance into a second vault of the same curator when one is offered.' },
    { m: ['stable', 'dual-token'], main: 'Mint or deposit $CAPITAL of the stable asset through $NAME on $CHAIN.', weekly: 'Use the stable asset in one payment or deposit so the holding is active.' },
    { m: ['rwa'], main: "Mint $CAPITAL of the protocol's yield asset on $CHAIN and hold it.", weekly: 'Claim the yield the asset accrues and keep the position open.' },
    { m: ['insurance'], main: 'Buy $CAPITAL of cover from $NAME on $CHAIN and keep the policy.', weekly: 'Check the policy still covers the position and renew it if it lapses.' },
    { m: ['basis'], main: 'Deposit $CAPITAL into $NAME on $CHAIN and hold the basis position.', weekly: 'Check the funding rate and rebalance the position if it flips.' },
    { m: ['indexes', 'index'], main: 'Buy $CAPITAL of the $NAME index on $CHAIN and hold the tokens.', weekly: 'Rebalance the holding when the index weights change.' },
    { m: ['payment', 'card'], main: 'Fund $CAPITAL through $NAME and make one real payment on $CHAIN.', weekly: 'Make one more payment so the account shows repeated use.' },
    { m: ['governance'], main: 'Stake $CAPITAL through $NAME and vote on one proposal on $CHAIN.', weekly: 'Vote on the next proposal the protocol puts up.' },
    { m: ['chain'], main: 'Bridge $CAPITAL to $CHAIN and use $NAME for one transaction there.', weekly: 'Use the chain for one more transaction through $NAME.' },
    { m: ['btc', 'anchor'], main: 'Mint or deposit $CAPITAL of the Bitcoin-backed asset through $NAME on $CHAIN.', weekly: 'Move the asset once between the protocol and a wallet you control.' },
    { m: ['otc'], main: 'Place one $CAPITAL order through $NAME on $CHAIN and settle it.', weekly: 'Place one more order of a smaller size.' },
  ];
  function familyFor(p) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < FAMILIES.length; i++) {
      var f = FAMILIES[i];
      for (var j = 0; j < f.m.length; j++) if (c.indexOf(f.m[j]) >= 0) return f;
    }
    return { main: 'Deposit $CAPITAL of USDC into $NAME on $CHAIN and keep the position open.', weekly: 'Make one qualifying action each week, such as a deposit, a swap or a vote.' };
  }
  function fill(t, capital, name, chain) {
    return t.split('$CAPITAL').join(String(capital)).split('$NAME').join(name).split('$CHAIN').join(chain);
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
    var fam = familyFor(p);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: fill(fam.main, capital, p.name, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: fill(fam.weekly, capital, p.name, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ].map(stepText);
  }
  // Risks, derived from the same record as the plan: every position carries smart-contract
  // risk, and each family adds the risk its own mechanism creates.
  function risksFor(p) {
    var c = (p.category || '').toLowerCase();
    var risks = [['Smart-contract risk', 'the contracts holding your funds can have bugs; never farm more than you can lose.']];
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) risks.push(['Impermanent loss', 'the pool can move against the pair you supplied, and the loss stays when you withdraw.']);
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) risks.push(['Liquidation', 'a sharp price move can close the position below the level that keeps it open.']);
    if (c.indexOf('stable') >= 0 || c.indexOf('rwa') >= 0) risks.push(['Depeg', 'the asset can trade below its target price, and the backing may not cover every holder at once.']);
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) risks.push(['Bridge risk', 'the bridge holds the funds while they cross chains, and a bridge failure strands them.']);
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) risks.push(['Slashing and lockup', 'misbehaviour or a lockup can cut the stake or keep it from being withdrawn.']);
    if (c.indexOf('prediction') >= 0) risks.push(['Market loss', 'a wrong position loses the stake; only fund what the position itself is worth.']);
    return risks;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tvl')) state.tvl = params.get('tvl');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watchlist') === '1') state.watchlist = true;
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tvl !== 'all') params.set('tvl', state.tvl);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    var minTvl = state.tvl === 'all' ? 0 : Number(state.tvl) * 1e6;
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < minTvl) return false;
      if (state.watchlist && !r.in_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var model = effModel();
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  // Sandbox ranks: the shown rank is the position in the re-ranked board, not the submitted rank.
  function displayRank(row, list) {
    if (!sandboxOn()) return row.rank;
    return list.indexOf(row) + 1;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: DATA.source }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols the floor leaves out — the whole pre-token universe, ranked by what the market already pays per dollar of TVL for its kind. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows beyond the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var tv = el('select', { id: 'tvl', 'aria-label': 'Filter by TVL' },
      el('option', { value: 'all', text: 'Any TVL' }),
      el('option', { value: '100', text: 'TVL $100M+', selected: state.tvl === '100' ? 'selected' : null }),
      el('option', { value: '500', text: 'TVL $500M+', selected: state.tvl === '500' ? 'selected' : null }),
      el('option', { value: '1000', text: 'TVL $1B+', selected: state.tvl === '1000' ? 'selected' : null })
    );
    tv.addEventListener('change', function () { state.tvl = tv.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var count = state.tab === 'board' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.comparables.length + ' categories with live comparables';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('div', { class: 'field' }, el('label', { for: 'tvl', text: 'TVL' }), tv),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('board', 'Board'), tabBtn('live', 'Live token'), tabBtn('method', 'Method'))),
      el('span', { class: 'count', text: count })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
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
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tvl = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { max = Math.max(max, shownImplied(r)); });
    max = max || 1;
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
        el('td', { class: 'num', text: String(displayRank(r, list)) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, r.in_watchlist ? el('span', { class: 'badge watch', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownImplied(r)) })
        )),
        el('td', null, el('span', { class: 'badge pre', text: 'NO TOKEN' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: (sandboxOn() ? 'Sandbox ranking — the submitted board uses the stated model. ' : '') + 'Pre-token protocols, strongest implied value first. Select a row for its model, comparables and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
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
        el('td', null, el('span', { class: 'badge live', text: 'LIVE' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap / TVL multiples are the comparables the pre-token ranking is built from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = M;
    var compRows = DATA.comparables.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.live_count) }),
        el('td', { class: 'num', text: c.median_multiple === null ? 'n/a' : fmtMult(c.median_multiple) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      );
    });
    return el('div', null,
      el('section', { class: 'panel model' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
        el('div', { class: 'formula' },
          'implied = round( tvl_usd x multiple(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
        ),
        el('p', { class: 'sub', text: 'The multiple is the category comparable: the median market-cap / TVL of the live-token protocols in the same category, shrunk toward the global median by n / (n + ' + m.shrink_k + ') and clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. A category with one live protocol barely moves the multiple; one with fifteen mostly sets it. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Wrapped, staked and bridged products of tokens that already trade are excluded by the watchlist rule, applied to the whole board — a big wrapped product can never top the board on TVL alone.' }),
        el('p', { class: 'sub', text: 'Honest limits: the snapshot records no token, it does not prove there is none. A protocol on this board may still have a token its DefiLlama record does not carry. The implied value is this entry\u2019s claim, never a price, and the board does not predict whether or when a token is issued.' }),
        el('div', { class: 'sandbox' },
          el('h3', { text: 'Model sandbox — re-rank the board live' }),
          el('p', { class: 'sub', text: 'Move a slider and the board re-ranks on the new parameters. This changes only this page: the submitted board always uses the stated model above.' }),
          el('div', { class: 'sliders' },
            el('label', null, 'Growth weight ', el('output', { id: 'sb-growth-out', text: String(state.sb.growth) }),
              el('input', { type: 'range', id: 'sb-growth', min: '0', max: '1', step: '0.05', value: String(state.sb.growth), 'aria-label': 'Growth weight' })),
            el('label', null, 'Maturity floor ', el('output', { id: 'sb-floor-out', text: String(state.sb.floor) }),
              el('input', { type: 'range', id: 'sb-floor', min: '0.3', max: '0.9', step: '0.05', value: String(state.sb.floor), 'aria-label': 'Maturity floor' })),
            el('label', null, 'Multiple cap ', el('output', { id: 'sb-cap-out', text: String(state.sb.cap) }),
              el('input', { type: 'range', id: 'sb-cap', min: '0.5', max: '2', step: '0.05', value: String(state.sb.cap), 'aria-label': 'Multiple cap' }))
          ),
          el('p', { class: 'sandbox-note', id: 'sb-note', text: sandboxOn() ? 'Sandbox active: the board below is re-ranked on your parameters, not the submitted model.' : 'Sandbox at the submitted model.' }),
          el('button', { class: 'button', type: 'button', text: 'Reset to the submitted model', onclick: function () { state.sb = { growth: M.growth_weight, floor: M.maturity_floor, cap: M.multiple_cap }; render(); } })
        )
      ),
      el('section', { class: 'panel model' },
        el('h2', { text: 'Category comparables' }),
        el('p', { class: 'sub', text: 'Every category with live-token protocols: how many set the multiple, their median market-cap / TVL, and the shrunk multiple the model uses.' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'comps' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live protocols' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))),
            el('tbody', null, compRows)
          )
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, effModel());
    var comp = DATA.comparables.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.in_watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: row.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the multiple comes from ' + row.comparable_count + ' live-token protocol' + (row.comparable_count === 1 ? '' : 's') + ' in ' + (row.category || 'Other') + (comp && comp.median_multiple !== null ? ' (median mcap / TVL ' + fmtMult(comp.median_multiple) + ', shrunk toward the global median)' : ' (no live protocol in this category: the global median is used)') + '. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ' — the sandbox changed it from the board\u2019s ' + fmtUsd(row.implied_value_usd) + '.') + ' This is an estimate, not a price.' })
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
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Risks' }),
      el('ul', { class: 'risks' }, risksFor(row).map(function (r) {
        return el('li', null, el('b', { text: r[0] + ': ' }), r[1]);
      })),
      el('p', { class: 'note', text: 'Farming does not guarantee an airdrop. A protocol may never issue a token, and one that does may reward nobody, or reward a different behaviour than the one above.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'method') shell.appendChild(methodPanel());
    else shell.appendChild(boardTable());
    if (state.tab === 'board') shell.appendChild(methodPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    // Sandbox sliders live after render: wire them here so every render re-binds them.
    // 'input' moves the readout live; 'change' (drag end) re-renders, so the slider being
    // dragged is never rebuilt under the pointer.
    var g = document.getElementById('sb-growth');
    var f = document.getElementById('sb-floor');
    var c = document.getElementById('sb-cap');
    function sbNote() { return 'Sandbox active: the board below is re-ranked on your parameters, not the submitted model.'; }
    if (g) {
      g.addEventListener('input', function () { state.sb.growth = Number(g.value); document.getElementById('sb-growth-out').textContent = g.value; document.getElementById('sb-note').textContent = sbNote(); });
      g.addEventListener('change', function () { render(); });
    }
    if (f) {
      f.addEventListener('input', function () { state.sb.floor = Number(f.value); document.getElementById('sb-floor-out').textContent = f.value; document.getElementById('sb-note').textContent = sbNote(); });
      f.addEventListener('change', function () { render(); });
    }
    if (c) {
      c.addEventListener('input', function () { state.sb.cap = Number(c.value); document.getElementById('sb-cap-out').textContent = c.value; document.getElementById('sb-note').textContent = sbNote(); });
      c.addEventListener('change', function () { render(); });
    }
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tvl = 'all';
    state.watchlist = false; state.tab = 'board'; state.sort = 'implied'; state.selected = null;
    readHash();
    render();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
