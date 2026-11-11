// Bizfinder web preview: answers the app's /api/... requests right here in the browser, from
// the sample searches in demo/ (every business in them is made up). Searches you run, call
// notes and deleted searches are kept in this browser, separately for each account.
//
// FRONT END ONLY FOR NOW. Once the backend is online, take this file out of index.html
// (site/tools/sync_app.py adds it) and serve the same /api/ routes: bizfinder/server.py
// shows what each one takes and gives back.
window.BizfinderDemo = (function () {
  const realFetch = window.fetch.bind(window);
  const account = (window.BizfinderAuth?.user()?.email || 'preview').toLowerCase();
  const key = (name) => `bizfinder-demo:${account}:${name}`;
  const load = (name, fallback) => {
    try {
      const value = localStorage.getItem(key(name));
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };
  const save = (name, value) => {
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
    } catch {
      // storage full or turned off: changes last until the page reloads
    }
  };

  // As in bizfinder/calls.py
  const STATUSES = ['No answer', 'Call back', 'Interested', 'Somewhat interested', 'Client', 'Not interested', 'Wrong number'];
  const CHANNELS = ['Call', 'WhatsApp', 'Viber', 'Email', 'Instagram', 'Facebook', 'In person'];
  const SAME_CALL_MINUTES = 10;
  const MAX_TEXT = 5000;
  const SOURCES = { google: 'Google Maps', tomtom: 'TomTom' };

  const pad = (n) => String(n).padStart(2, '0');
  const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localMinute = (d = new Date()) => `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; // like Python's isoformat
  const slug = (text) =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  let indexLoad;
  const index = () =>
    (indexLoad ||= realFetch('demo/index.json').then((res) => {
      if (!res.ok) throw new ApiError(500, 'The sample searches are missing.');
      return res.json();
    }));
  const datasets = new Map();
  const dataset = (id) => {
    if (!datasets.has(id))
      datasets.set(
        id,
        realFetch(`demo/${id}.json`).then((res) => {
          if (!res.ok) throw new ApiError(500, 'This sample search is missing.');
          return res.json();
        }),
      );
    return datasets.get(id);
  };

  // ---------- Saved searches: the samples, plus searches run here, minus deleted ones ----------
  async function savedSearches() {
    const { datasets: samples } = await index();
    const runs = load('runs', []);
    const deleted = new Set(load('deleted', []));
    const entry = (d, file = d.file, generated = d.generated) => ({
      file,
      title: d.title,
      generated,
      source: d.source,
      found: d.found,
      others: d.others,
      id: d.id,
    });
    return [
      ...samples.map((d) => entry(d)),
      ...runs.map((r) => entry(samples.find((d) => d.id === r.id), r.file, r.generated)),
    ]
      .filter((s) => !deleted.has(s.file))
      .sort((a, b) => b.generated.localeCompare(a.generated));
  }

  async function findSaved(file) {
    const found = (await savedSearches()).find((s) => s.file === file);
    if (!found) throw new ApiError(404, 'That search isn’t there any more.');
    return found;
  }

  // ---------- Call notes (the same rules as bizfinder/calls.py) ----------
  async function allCalls() {
    let calls = load('calls', null);
    if (!calls) {
      calls = (await index()).calls || {};
      save('calls', calls);
    }
    return calls;
  }

  const minutesSince = (stamp) => {
    const t = new Date(stamp).getTime();
    return Number.isFinite(t) ? (Date.now() - t) / 60000 : Infinity;
  };

  async function updateCall(changes) {
    const id = String(changes.key || '').slice(0, 300);
    if (!id) throw new ApiError(400, 'Which business? The note has no key.');
    const calls = await allCalls();
    const call = calls[id] || {};
    const now = localMinute();

    if ('status' in changes) {
      const status = changes.status || '';
      if (status && !STATUSES.includes(status)) throw new ApiError(400, `Unknown call result: ${status}`);
      if (!status) {
        delete call.status;
        delete call.calledAt;
        delete call.history;
      } else if (status !== call.status) {
        const history = (call.history ||= []);
        const last = history[history.length - 1];
        if (last && minutesSince(last.at) < SAME_CALL_MINUTES) history[history.length - 1] = { at: now, status };
        else history.push({ at: now, status });
        call.status = status;
        call.calledAt = now;
      }
    }

    if ('contacted' in changes) {
      let picked = changes.contacted || [];
      if (typeof picked === 'string') picked = [picked];
      const unknown = picked.find((w) => !CHANNELS.includes(w));
      if (unknown) throw new ApiError(400, `Unknown way of getting in touch: ${unknown}`);
      picked = CHANNELS.filter((w) => picked.includes(w));
      if (!picked.length) {
        delete call.contacted;
        delete call.contactedAt;
      } else if (picked.join() !== (call.contacted || []).join()) {
        call.contacted = picked;
        call.contactedAt = now;
      }
    }

    for (const field of ['response', 'improve']) {
      if (!(field in changes)) continue;
      const text = String(changes[field] ?? '')
        .trim()
        .slice(0, MAX_TEXT);
      if (text) call[field] = text;
      else delete call[field];
    }

    if (!call.status && !call.contacted?.length && !call.response && !call.improve) {
      delete calls[id];
      save('calls', calls);
      return null;
    }
    for (const field of ['name', 'phone', 'search']) if (changes[field]) call[field] = String(changes[field]).slice(0, 300);
    call.updatedAt = now;
    calls[id] = call;
    save('calls', calls);
    return call;
  }

  // ---------- Map requests used today ----------
  function usageToday(source) {
    const usage = load('usage', {});
    const resets = new Date();
    resets.setHours(24, 0, 0, 0);
    return { used: usage[`${source}:${localDay()}`] || 0, free: source === 'tomtom' ? 2500 : null, resets: resets.toISOString() };
  }

  function addUsage(source, requests) {
    const usage = load('usage', {});
    const k = `${source}:${localDay()}`;
    usage[k] = (usage[k] || 0) + requests;
    save('usage', usage);
  }

  // ---------- A search, played out over about 12 seconds ----------
  const SEARCH_S = 4.5;
  const WEBSITES_S = 6;
  const SAVE_S = 1.2;

  async function startSearch(body) {
    const queries = (body.queries || []).filter((q) => typeof q === 'string' && q.trim()).map((q) => q.trim());
    const location = String(body.location || '').trim();
    if (!queries.length) throw new ApiError(400, 'Add at least one thing to search for.');
    if (!location) throw new ApiError(400, 'Say where to search, e.g. Tbilisi, Georgia.');
    if (!SOURCES[body.source]) throw new ApiError(400, 'Choose Google Maps or TomTom.');
    const current = load('job', null);
    if (current && jobStatus(current).state === 'running')
      throw new ApiError(409, 'A search is already running. Stop it or wait for it to finish.');

    const { datasets: samples } = await index();
    const words = queries.join(' ').toLowerCase();
    const sample = samples.find((d) => d.keywords.some((k) => words.includes(k)));
    if (!sample)
      throw new ApiError(
        400,
        'This preview has sample searches for pet shops, dentists, beauty salons and car repair. Search for one of those.',
      );
    const data = await dataset(sample.id);
    const cols = data.businesses.columns;
    const has = cols.indexOf('Has website');
    const email = cols.indexOf('Email');
    const started = new Date();
    const job = {
      id: Math.random().toString(16).slice(2, 12),
      sample: sample.id,
      queries: queries.slice(0, 10),
      location,
      source: SOURCES[body.source],
      sourceId: body.source,
      crawl: body.crawl !== false,
      started: started.getTime(),
      file: `${slug(queries.join(' '))}_${slug(location)}_${localDay(started).replace(/-/g, '')}-${pad(started.getHours())}${pad(started.getMinutes())}.xlsx`,
      total: sample.found + sample.others,
      found: sample.found,
      others: sample.others,
      sites: data.businesses.rows.filter((r) => r[has] === 'Yes').length,
      emails: data.businesses.rows.filter((r) => r[email]).length,
      requests: body.source === 'tomtom' ? 24 : 3 * queries.length,
      where: sample.where,
    };
    save('job', job);
    return jobStatus(job);
  }

  function jobLines(job) {
    const quoted = job.queries.map((q) => `“${q}”`).join(', ');
    const lines = [
      [0, 'info', `Searching ${job.source} for ${quoted} in ${job.location}`],
      [SEARCH_S * 0.45, 'info', `${Math.round(job.total * 0.5)} found so far`],
      [SEARCH_S, 'info', `Found ${job.total} places${job.others ? `, ${job.others} of them don't look like a match` : ''}`],
    ];
    let t = SEARCH_S;
    if (job.crawl) {
      lines.push([t + 0.2, 'info', `Visiting ${job.sites} websites for emails and social media`]);
      t += WEBSITES_S;
      lines.push([t, 'info', `Found ${job.emails} emails`]);
    }
    lines.push([t + SAVE_S * 0.8, 'info', `Saved ${job.file}`]);
    return lines;
  }

  function jobStatus(job, since = 0) {
    const now = job.stopAt ? Math.min(Date.now(), job.stopAt) : Date.now();
    const t = (now - job.started) / 1000;
    const websitesEnd = SEARCH_S + (job.crawl ? WEBSITES_S : 0);
    const end = job.stopAt ? (job.stopAt - job.started) / 1000 + 1 : websitesEnd + SAVE_S;
    const elapsed = (Date.now() - job.started) / 1000;
    let state = 'running';
    let progress;
    let found = job.found;
    if (elapsed >= end) {
      state = 'done';
      if (job.stopAt && t < SEARCH_S) found = Math.max(1, Math.round(job.found * (t / SEARCH_S)));
      progress = { stage: 'save', source: job.source, found };
    } else if (t < SEARCH_S) {
      const p = t / SEARCH_S;
      const steps = job.queries.length;
      const step = Math.min(steps, 1 + Math.floor(p * steps));
      progress = {
        stage: 'search',
        source: job.source,
        query: job.queries[step - 1],
        step,
        steps,
        found: Math.round(job.total * (1 - (1 - p) ** 2)),
        requests: Math.max(1, Math.round(job.requests * p)),
      };
    } else if (t < websitesEnd) {
      progress = {
        stage: 'websites',
        source: job.source,
        found: job.total,
        requests: job.requests,
        checked: Math.round(job.sites * ((t - SEARCH_S) / WEBSITES_S)),
        total: job.sites,
      };
    } else {
      progress = { stage: 'save', source: job.source, found: job.total, requests: job.requests };
    }

    const lines = jobLines(job)
      .filter(([at]) => at <= Math.min(t, end))
      .map(([, level, text]) => ({ level, text }));
    if (state === 'done' && job.stopAt) lines.push({ level: 'info', text: 'Stopped early: saved what was found so far' });

    let result = null;
    if (state === 'done') {
      result = { file: job.file, found, others: job.others, requests: job.requests, stopped: !!job.stopAt };
      if (!job.saved) {
        job.saved = true;
        save('job', job);
        save('runs', [...load('runs', []), { file: job.file, id: job.sample, generated: localMinute(new Date(job.started)).replace('T', ' ') }]);
        addUsage(job.sourceId, job.requests);
      }
    }
    return {
      id: job.id,
      state,
      queries: job.queries,
      location: job.location,
      progress,
      stopping: !!job.stopAt && state === 'running',
      lines: lines.slice(since),
      lineCount: lines.length,
      result,
      error: null,
      seconds: Math.round(Math.min(elapsed, end)),
    };
  }

  // ---------- The routes ----------
  async function handle(route, query, body) {
    switch (route) {
      case 'ping':
        return { app: 'bizfinder' };
      case 'setup':
        return {
          sources: Object.entries(SOURCES).map(([id, name]) => ({ id, name, hasKey: true, envVar: '', today: usageToday(id) })),
          output: '',
          version: 'preview',
          stale: false,
        };
      case 'saved':
        return { saved: (await savedSearches()).map(({ id, ...item }) => item) };
      case 'result': {
        const item = await findSaved(query.get('file') || '');
        return { ...(await dataset(item.id)), file: item.file, generated: item.generated };
      }
      case 'calls':
        if (body) return { call: await updateCall(body) };
        return { calls: await allCalls(), statuses: STATUSES };
      case 'search':
        return { job: await startSearch(body || {}) };
      case 'job': {
        const job = load('job', null);
        if (!job || (query.get('id') && query.get('id') !== job.id)) return { job: null };
        return { job: jobStatus(job, Number(query.get('since')) || 0) };
      }
      case 'stop': {
        const job = load('job', null);
        if (job && !job.stopAt && jobStatus(job).state === 'running') {
          job.stopAt = Date.now();
          save('job', job);
        }
        return { ok: true };
      }
      case 'trash': {
        const item = await findSaved(body?.file || '');
        const runs = load('runs', []);
        if (runs.some((r) => r.file === item.file))
          save(
            'runs',
            runs.filter((r) => r.file !== item.file),
          );
        else save('deleted', [...load('deleted', []), item.file]);
        return { ok: true };
      }
      case 'reveal':
        throw new ApiError(400, 'There’s no folder to show in the web version.');
      default:
        throw new ApiError(404, 'Not found.');
    }
  }

  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    let body;
    if (init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        return reply({ error: 'Send JSON.' }, 415);
      }
    }
    await sleep(80 + Math.random() * 140); // about as quick as a real server
    try {
      return reply(await handle(url.pathname.slice(5), url.searchParams, body));
    } catch (err) {
      return reply({ error: err.message }, err.status || 500);
    }
  };

  return {
    /** The sample a saved search shows, for downloading its spreadsheet. */
    async sampleFor(file) {
      return (await findSaved(file)).id;
    },
  };
})();
