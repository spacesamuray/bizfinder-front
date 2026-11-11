// Bizfinder front page: scroll reveals, the hero radar, the app demo with made-up
// businesses and the running-search illustration. No libraries.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Calls onChange(true) while el is on screen and the tab is visible, onChange(false) otherwise. */
function onScreen(el, onChange, threshold = 0.15) {
  let inView = false;
  let last = null;
  const update = () => {
    const now = inView && !document.hidden;
    if (now !== last) onChange((last = now));
  };
  new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      update();
    },
    { threshold },
  ).observe(el);
  document.addEventListener('visibilitychange', update);
}

// ---------- Reveal on scroll ----------
const revealer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      revealer.unobserve(entry.target);
    }
  },
  { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
);
$$('.reveal').forEach((el) => revealer.observe(el));

// ---------- Signed in? Then the buttons open the app ----------
if (window.BizfinderAuth?.user()) {
  $$('[data-signed-out]').forEach((el) => (el.hidden = true));
  $$('[data-signed-in]').forEach((el) => (el.hidden = false));
}

// ---------- Header ----------
const header = $('.top');
const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---------- Hero radar: type a search, sweep, light up the businesses found ----------
(function radar() {
  const el = $('[data-radar]');
  if (!el) return;
  const pinsEl = $('.radar-pins', el);
  const beam = $('.radar-beam', el);
  const queryEl = $('[data-query]');
  const foundEl = $('[data-found]');
  const needEl = $('[data-need]');
  const QUERIES = ['flower shop', 'dentist', 'beauty salon', 'car repair', 'pharmacy', 'law firm', 'bakery'];
  // Roughly how real searches turn out: most small businesses have no site of their own.
  const KINDS = [
    ['none', 0.45],
    ['social', 0.27],
    ['own', 0.23],
    ['broken', 0.05],
  ];
  const TYPE = 1100;
  const SWEEP = 5200;
  const HOLD = 1700;
  const FADE = 650;
  let pins = [];
  let q = -1;
  let start = 0;
  let raf = 0;

  const pickKind = () => {
    let r = Math.random();
    for (const [kind, share] of KINDS) if ((r -= share) < 0) return kind;
    return 'none';
  };

  function layPins() {
    pinsEl.textContent = '';
    const count = 15 + Math.floor(Math.random() * 7);
    const placed = [];
    for (let tries = 0; placed.length < count && tries < 500; tries++) {
      const a = Math.random() * 360;
      const r = 0.5 + Math.random() * 0.44; // outside the logo, inside the outer ring
      const x = 50 + 50 * r * Math.sin((a * Math.PI) / 180);
      const y = 50 - 50 * r * Math.cos((a * Math.PI) / 180);
      if ((x < 46 && y < 24) || (x > 56 && y > 80)) continue; // under the floating cards
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 7.5)) continue;
      placed.push({ a, x, y, kind: pickKind() });
    }
    pins = placed
      .sort((p1, p2) => p1.a - p2.a)
      .map((p) => {
        const pin = document.createElement('span');
        pin.className = `pin pin-${p.kind}`;
        pin.style.left = `${p.x}%`;
        pin.style.top = `${p.y}%`;
        pinsEl.append(pin);
        return { ...p, el: pin, lit: false };
      });
  }

  function setCounts() {
    const lit = pins.filter((p) => p.lit);
    foundEl.textContent = lit.length;
    needEl.textContent = lit.filter((p) => p.kind !== 'own').length;
  }

  function light(p) {
    p.lit = true;
    p.el.classList.add('is-lit');
  }

  function newCycle(now) {
    start = now;
    q = (q + 1) % QUERIES.length;
    layPins();
    setCounts();
  }

  function frame(now) {
    const t = now - start;
    const query = QUERIES[q];
    if (t < TYPE) {
      queryEl.textContent = query.slice(0, Math.max(1, Math.ceil((query.length * t) / TYPE)));
    } else if (t < TYPE + SWEEP) {
      queryEl.textContent = query;
      const angle = ((t - TYPE) / SWEEP) * 360;
      beam.style.transform = `rotate(${angle}deg)`;
      el.classList.add('is-sweeping');
      const due = pins.filter((p) => !p.lit && p.a <= angle);
      if (due.length) {
        due.forEach(light);
        setCounts();
      }
    } else if (t < TYPE + SWEEP + HOLD) {
      el.classList.remove('is-sweeping');
      if (pins.some((p) => !p.lit)) {
        pins.forEach(light);
        setCounts();
      }
    } else if (t < TYPE + SWEEP + HOLD + FADE) {
      pins.forEach((p) => p.el.classList.remove('is-lit'));
    } else {
      newCycle(now);
    }
    raf = requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    q = 0;
    layPins();
    pins.forEach(light);
    setCounts();
    return;
  }
  onScreen(
    el,
    (on) => {
      cancelAnimationFrame(raf);
      if (!on) return;
      el.classList.remove('is-sweeping');
      newCycle(performance.now());
      raf = requestAnimationFrame(frame);
    },
    0.05,
  );
})();

// ---------- The app demo ----------
(function demo() {
  const root = $('[data-demo]');
  if (!root) return;

  const KINDS = {
    none: ['No website', 'bad'],
    social: ['Social page only', 'warn'],
    broken: ['Broken website', 'bad'],
    own: ['Own website', 'good'],
  };
  // How a call went, with the colour of its label (as in the app)
  const CALLS = {
    'No answer': 'warn',
    'Call back': 'warn',
    Interested: 'good',
    'Somewhat interested': 'good',
    Client: 'good',
    'Not interested': 'bad',
    'Wrong number': 'bad',
  };
  const KEEN = ['Interested', 'Somewhat interested', 'Client'];
  const WAYS = ['Call', 'WhatsApp', 'Viber', 'Email', 'Instagram', 'Facebook', 'In person'];
  // Made-up businesses: every name, rating and note here is invented for the demo.
  const rows = [
    { ways: ['Call', 'WhatsApp'], name: 'Petal & Stem', cat: 'Florist', kind: 'none', rating: 4.8, reviews: 63, email: false, call: 'Somewhat interested', note: 'Likes the idea of a site. Send them the demo on WhatsApp.', x: 41, y: 40 },
    { ways: ['Call'], name: 'Bloom Corner', cat: 'Florist', kind: 'social', rating: 4.6, reviews: 41, email: false, call: 'Interested', note: 'Only has Instagram. Wants prices for a small site.', x: 55, y: 28 },
    { name: 'Green Leaf Flowers', cat: 'Market', kind: 'own', rating: 4.9, reviews: 112, email: true, call: '', note: '', x: 64, y: 54 },
    { ways: ['Call'], name: 'Violet House', cat: 'Florist', kind: 'none', rating: 4.7, reviews: 28, email: false, call: 'No answer', note: '', x: 29, y: 60 },
    { ways: ['Call'], name: 'Rosa Studio', cat: 'Florist', kind: 'social', rating: 5.0, reviews: 19, email: true, call: 'Call back', note: 'Call after 6 pm, when the owner is in.', x: 47, y: 66 },
    { name: 'Lily Market', cat: 'Market', kind: 'none', rating: 4.4, reviews: 87, email: false, call: '', note: '', x: 73, y: 37 },
    { ways: ['Call', 'Email', 'In person'], name: 'Tulip Lane', cat: 'Florist', kind: 'broken', rating: 4.5, reviews: 54, email: true, call: 'Client', note: 'Their old site was down. The new one goes live next week.', x: 35, y: 24 },
    { ways: ['Call'], name: 'Orchid Room', cat: 'Florist', kind: 'own', rating: 4.8, reviews: 76, email: true, call: 'Not interested', note: 'Happy with the site they have.', x: 58, y: 76 },
    { name: 'Daisy & Co', cat: 'Market', kind: 'none', rating: 4.3, reviews: 35, email: false, call: '', note: '', x: 20, y: 44 },
    { name: 'Peony Point', cat: 'Florist', kind: 'social', rating: 4.9, reviews: 48, email: false, call: '', note: '', x: 82, y: 62 },
    { ways: ['Call'], name: 'Sunflower Stand', cat: 'Market', kind: 'none', rating: 4.2, reviews: 12, email: false, call: 'Wrong number', note: '', x: 68, y: 18 },
    { name: 'Magnolia', cat: 'Florist', kind: 'own', rating: 4.7, reviews: 91, email: true, call: '', note: '', x: 50, y: 50 },
  ];
  const CHIPS = [
    { id: 'all', label: 'All', test: () => true },
    { id: 'leads', label: 'Needs a website', test: (r) => r.kind !== 'own' },
    { id: 'none', label: 'No website', dot: 'none', test: (r) => r.kind === 'none' },
    { id: 'social', label: 'Social page only', dot: 'social', test: (r) => r.kind === 'social' },
    { id: 'broken', label: 'Broken website', dot: 'broken', test: (r) => r.kind === 'broken' },
    { id: 'own', label: 'Own website', dot: 'own', test: (r) => r.kind === 'own' },
  ];
  const MAP_ART = `<svg class="m-art" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="800" height="400" fill="#ecebe2" />
      <g fill="#d6e4cd"><ellipse cx="140" cy="310" rx="100" ry="54" /><ellipse cx="640" cy="330" rx="80" ry="42" /><ellipse cx="470" cy="58" rx="66" ry="30" /></g>
      <path d="M-20 130C110 90 210 210 330 186S520 70 640 146 770 262 840 236" fill="none" stroke="#bcd3dc" stroke-width="24" stroke-linecap="round" />
      <g fill="none" stroke="#fff" stroke-linecap="round">
        <path stroke-width="9" d="M0 268 800 214M262 0l58 400M562 0l-42 400" />
        <path stroke-width="4" opacity=".9" d="M0 62 800 40M0 344l800-42M118 0l52 400M420 0l-10 400M694 0l-34 400M0 166l250-12M600 252l200 10" />
      </g>
    </svg>`;
  const PHONE = '5•• •• •• ••';
  const NOTE_HINT = 'What did they say? E.g. already has a website, wants prices, call after 6 pm…';

  const state = { tab: 'table', chip: 'all', sel: 0 };
  const tilesEl = $('[data-tiles]', root);
  const chipsEl = $('[data-chips]', root);
  const viewEl = $('[data-view]', root);
  const drawerEl = $('[data-drawer]', root);
  const narrow = matchMedia('(max-width: 1100px)');

  const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
  const shown = () => rows.filter(CHIPS.find((c) => c.id === state.chip).test);
  const kindPill = (r) => `<span class="pill ${KINDS[r.kind][1]}">${KINDS[r.kind][0]}</span>`;
  const callPill = (r) => (r.call ? `<span class="pill ${CALLS[r.call]}${r.pop ? ' pop' : ''}">${esc(r.call)}</span>` : '');

  function renderTiles(countUp) {
    const n = rows.length;
    const leads = rows.filter((r) => r.kind !== 'own').length;
    const none = rows.filter((r) => r.kind === 'none').length;
    const called = rows.filter((r) => r.call).length;
    const keen = rows.filter((r) => KEEN.includes(r.call)).length;
    const tiles = [
      ['Businesses found', n, '', 'in this search'],
      ['Need a website', pct(leads, n), '%', `${leads} businesses`],
      ['No website at all', pct(none, n), '%', `${none} businesses`],
      ['Called', called, '', `${keen} interested or clients`],
    ];
    tilesEl.innerHTML = tiles
      .map(
        ([label, value, unit, sub]) => `<div class="tile">
          <span class="tile-label">${label}</span>
          <span class="tile-value" data-to="${value}" data-unit="${unit}">${countUp ? 0 : value}${unit}</span>
          <span class="tile-sub">${sub}</span>
        </div>`,
      )
      .join('');
    if (countUp) {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 1100);
        const eased = 1 - (1 - p) ** 3;
        $$('.tile-value', tilesEl).forEach((v) => (v.textContent = `${Math.round(v.dataset.to * eased)}${v.dataset.unit}`));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  function renderChips() {
    chipsEl.innerHTML = CHIPS.map(
      (c) => `<button type="button" class="chip" data-chip="${c.id}" aria-pressed="${state.chip === c.id}">
        ${c.dot ? `<i class="dot dot-${c.dot}"></i>` : ''}${c.label} <span class="count">${rows.filter(c.test).length}</span>
      </button>`,
    ).join('');
  }

  function tableHtml(list) {
    if (!list.length) return '<div class="t"><p style="padding: 30px; text-align: center">Nothing here.</p></div>';
    return `<div class="t">
      <div class="t-head" aria-hidden="true"><span>#</span><span>Name</span><span class="c-cat">Category</span><span class="c-phone">Phone</span><span>Web presence</span><span>Call status</span></div>
      ${list
        .map((r, k) => {
          const i = rows.indexOf(r);
          return `<button type="button" class="t-row" data-i="${i}" aria-pressed="${state.sel === i}" style="--i:${k}">
            <span>${k + 1}</span><span class="name">${esc(r.name)}</span><span class="c-cat">${r.cat}</span>
            <span class="c-phone phone">${PHONE}</span><span>${kindPill(r)}</span><span>${callPill(r)}</span>
          </button>`;
        })
        .join('')}
    </div>`;
  }

  function mapHtml(list) {
    const legend = Object.entries(KINDS)
      .map(([k, [label]]) => `<span><i class="dot dot-${k}"></i>${label}<em>${list.filter((r) => r.kind === k).length}</em></span>`)
      .join('');
    return `<div class="m">${MAP_ART}
      ${list
        .map((r, k) => {
          const i = rows.indexOf(r);
          return `<button type="button" class="m-pin kind-${r.kind}" data-i="${i}" aria-pressed="${state.sel === i}"
            aria-label="${esc(r.name)}, ${KINDS[r.kind][0]}" title="${esc(r.name)}" style="left:${r.x}%;top:${r.y}%;--i:${k}"></button>`;
        })
        .join('')}
      <div class="m-legend"><b>Web presence</b>${legend}</div>
    </div>`;
  }

  function summaryHtml(list) {
    const n = list.length;
    const called = list.filter((r) => r.call);
    let k = 0;
    const bar = (label, count, of, color, dot) => `<div class="bar-row" style="--i:${k++}">
        <span>${dot ? `<i class="dot dot-${dot}"></i>` : ''}${label}</span><span><b>${count}</b> · ${pct(count, of)}%</span>
        <span class="bar"><i data-w="${pct(count, of)}" style="background:${color}"></i></span>
      </div>`;
    const kinds = Object.entries(KINDS)
      .map(([key, [label]]) => bar(label, list.filter((r) => r.kind === key).length, n, `var(--k-${key})`, key))
      .join('');
    const calls = Object.keys(CALLS)
      .map((s) => bar(s, called.filter((r) => r.call === s).length, called.length, 'var(--green)'))
      .join('');
    return `<div class="s">
      <div class="s-card"><h4>Web presence</h4><p>${n} ${n === 1 ? 'business' : 'businesses'}</p><div class="bars">${kinds}</div></div>
      <div class="s-card"><h4>Your calls</h4><p>${called.length} called so far</p><div class="bars">${calls}</div></div>
    </div>`;
  }

  function renderView(enter) {
    const list = shown();
    viewEl.innerHTML = state.tab === 'map' ? mapHtml(list) : state.tab === 'summary' ? summaryHtml(list) : tableHtml(list);
    viewEl.classList.toggle('is-enter', enter && !reduceMotion);
    requestAnimationFrame(() => $$('.bar i', viewEl).forEach((i) => (i.style.width = `${i.dataset.w}%`)));
    rows.forEach((r) => delete r.pop);
  }

  function renderDrawer() {
    const r = rows[state.sel];
    const site = r.kind === 'own' || r.kind === 'broken';
    const opts = ['', ...Object.keys(CALLS)]
      .map(
        (s) =>
          `<button type="button" class="call-opt ${CALLS[s] || ''}" data-call="${s}" aria-pressed="${r.call === s}">${s || 'Not called'}</button>`,
      )
      .join('');
    const ways = r.ways || [];
    const wayOpts = ['', ...WAYS]
      .map(
        (w) =>
          `<button type="button" class="call-opt${w ? ' is-via' : ''}" data-way="${w}" aria-pressed="${w ? ways.includes(w) : !ways.length}">${w || 'Not contacted'}</button>`,
      )
      .join('');
    const meta = r.call
      ? r.at
        ? `Today, ${r.at}: ${esc(r.call)}`
        : `Earlier call: ${esc(r.call)}`
      : 'Not called yet. Pick how the call went to log it.';
    drawerEl.innerHTML = `
      <div class="d-info">
        <div>
          <h4 class="d-name">${esc(r.name)}</h4>
          <p class="d-sub">${r.cat}</p>
          <div class="d-pills">${kindPill(r)}<span class="pill">★ ${r.rating.toFixed(1)} · ${r.reviews} reviews</span></div>
        </div>
        <div class="d-actions">
          <span class="d-btn"><svg class="i" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>Call</span>
          ${r.email ? '<span class="d-btn"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>Email</span>' : ''}
          ${site ? '<span class="d-btn"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>Website</span>' : ''}
          <span class="d-btn"><svg class="i" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>Google Maps</span>
        </div>
      </div>
      <section class="d-call">
        <p class="d-h">Your call</p>
        <div class="d-opts" role="group" aria-label="How the call went">${opts}</div>
        <p class="d-field">How did I contact them?</p>
        <div class="d-opts" role="group" aria-label="How I contacted them">${wayOpts}</div>
        <span class="d-field">Their response</span>
        <div class="d-note${r.note ? '' : ' is-empty'}">${esc(r.note || NOTE_HINT)}</div>
        <p class="d-meta">${meta}</p>
      </section>
      <dl class="d-facts">
        <div><dt>Phone</dt><dd class="link">+995 ${PHONE}</dd></div>
        <div><dt>Email</dt><dd>${r.email ? '<span class="link">Found on their website</span>' : '–'}</dd></div>
        <div><dt>Website</dt><dd>${KINDS[r.kind][0]}</dd></div>
      </dl>`;
  }

  function select(i, focus) {
    state.sel = i;
    renderView(false);
    renderDrawer();
    if (focus) $(`[data-i="${i}"]`, viewEl)?.focus();
    if (narrow.matches && !focus) drawerEl.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      state.tab = tab.dataset.tab;
      $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
      return renderView(true);
    }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      state.chip = chip.dataset.chip;
      renderChips();
      return renderView(true);
    }
    const row = e.target.closest('[data-i]');
    if (row) return select(Number(row.dataset.i), false);
    const way = e.target.closest('[data-way]');
    if (way) {
      const r = rows[state.sel];
      const w = way.dataset.way;
      const now = r.ways || [];
      r.ways = !w ? [] : now.includes(w) ? now.filter((x) => x !== w) : WAYS.filter((x) => x === w || now.includes(x));
      renderDrawer();
      $(`[data-way="${CSS.escape(w)}"]`, drawerEl)?.focus();
      return;
    }
    const call = e.target.closest('[data-call]');
    if (call) {
      const r = rows[state.sel];
      r.call = call.dataset.call;
      // A call result means you called them, as in the app
      if (r.call && !(r.ways || []).includes('Call')) r.ways = WAYS.filter((x) => x === 'Call' || (r.ways || []).includes(x));
      r.at = r.call ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      r.pop = true;
      renderTiles(false);
      renderView(false);
      renderDrawer();
      $(`[data-call="${CSS.escape(r.call)}"]`, drawerEl)?.focus();
    }
  });

  // ↑ and ↓ go to the previous or next business, as in the app
  viewEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = shown();
    const at = list.indexOf(rows[state.sel]);
    const next = list[Math.min(list.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    select(rows.indexOf(next), true);
  });

  renderTiles(false);
  renderChips();
  renderView(false);
  renderDrawer();

  // Count the tiles up and bring the rows in the first time the demo comes into view
  if (!reduceMotion) {
    const once = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        once.disconnect();
        renderTiles(true);
        renderView(true);
      },
      { threshold: 0.3 },
    );
    once.observe(root);
  }
})();

// ---------- Call results cycling in the features ----------
(function callCycle() {
  const el = $('[data-call-cycle]');
  if (!el) return;
  const items = [...el.children];
  let k = 0;
  let timer = 0;
  const step = () => {
    items.forEach((item, j) => item.classList.toggle('is-on', j === k));
    k = (k + 1) % items.length;
  };
  if (reduceMotion) {
    items[3].classList.add('is-on');
    return;
  }
  onScreen(el, (on) => {
    clearInterval(timer);
    if (!on) return;
    step();
    timer = setInterval(step, 1400);
  });
})();

// ---------- A search running, as the app shows it ----------
(function job() {
  const el = $('[data-job]');
  if (!el) return;
  const steps = $$('[data-step]', el);
  const texts = steps.map((s) => $('[data-step-text]', s));
  const bar = $('[data-job-bar]', el);
  const log = $('[data-job-log]', el);
  const FOUND = 212;
  const SITES = 131;
  const FIND = 3200; // ms
  const VISIT = 7400;
  const SAVE = 8400;
  const END = 11800;
  const LOG = [
    [0, 'Searching for “dentist” in Tbilisi, Georgia, part by part'],
    [900, 'Area 5 of 16: 61 businesses so far'],
    [2000, 'Area 11 of 16: 148 businesses so far'],
    [3100, 'Found 212 businesses (and 38 other results)', 'ok'],
    [3700, 'Visiting 131 websites…'],
    [5500, 'Visited 64 of 131 websites, 11 emails so far'],
    [7300, 'Found 23 emails and 96 social media pages', 'ok'],
    [8300, 'Saved dentist_tbilisi-georgia.xlsx', 'ok'],
  ];
  let start = 0;
  let raf = 0;
  let logged = 0;

  const setStep = (now) =>
    steps.forEach((s, j) => {
      s.classList.toggle('is-done', j < now);
      s.classList.toggle('is-now', j === now);
    });

  function addLines(t) {
    while (logged < LOG.length && LOG[logged][0] <= t) {
      const [, text, cls] = LOG[logged++];
      const line = document.createElement('span');
      line.textContent = text;
      if (cls) line.className = cls;
      log.append(line);
      while (log.children.length > 5) log.firstElementChild.remove();
    }
  }

  function showDone() {
    setStep(3);
    texts[0].textContent = `${FOUND} found`;
    texts[1].textContent = `${SITES} visited`;
    texts[2].textContent = 'saved';
    bar.style.width = '100%';
  }

  function reset(now) {
    start = now;
    logged = 0;
    log.textContent = '';
    texts[1].textContent = 'waiting';
    texts[2].textContent = 'waiting';
  }

  function frame(now) {
    const t = now - start;
    if (t < FIND) {
      const p = t / FIND;
      setStep(0);
      texts[0].textContent = `${Math.round(FOUND * (1 - (1 - p) ** 2))} found`;
      bar.style.width = `${p * 34}%`;
    } else if (t < VISIT) {
      const p = (t - FIND) / (VISIT - FIND);
      setStep(1);
      texts[0].textContent = `${FOUND} found`;
      texts[1].textContent = `${Math.round(SITES * p)} of ${SITES} websites`;
      bar.style.width = `${34 + p * 58}%`;
    } else if (t < SAVE) {
      setStep(2);
      texts[1].textContent = `${SITES} visited`;
      texts[2].textContent = 'saving…';
      bar.style.width = '96%';
    } else if (t < END) {
      showDone();
    } else {
      reset(now);
    }
    addLines(t);
    raf = requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    addLines(Infinity);
    showDone();
    return;
  }
  onScreen(el, (on) => {
    cancelAnimationFrame(raf);
    if (!on) return;
    reset(performance.now());
    raf = requestAnimationFrame(frame);
  });
})();
