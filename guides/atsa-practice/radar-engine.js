/* ATSA radar — moving-target conflict engine (Brain Preflight design, not an FAA specification).
   Shared verbatim by the app (games/atsa_radar.js loads it through `needs`) and by the web radar sample
   (studio-growth guides/atsa-practice/radar-engine.js is a byte copy; lab/qa/check-atsa.mjs compares them).
   No DOM and no clock: every call receives the model time in seconds, so rendering rate never changes a score.

   Target  { id, x, y, vx, vy, tIn, tOut } : straight line, position (x, y) at tIn, units per second, on screen during [tIn, tOut).
   Pair    closest approach over the overlapping on-screen interval [start, end]: with p the relative position at `start`
           and v the relative velocity, t* = start + clamp(−p·v / v·v, 0, end − start); v·v = 0 keeps the distance constant.
           Conflict when that distance is below the wave radius; the collision is the first instant the distance reaches it.
   Run     remove(id, t) before a collision resolves every pending conflict of that target; a removal that resolves nothing
           is unnecessary. clear(t) is the "no conflict" call and ends the wave. Math prompts expire at `until`. */
(function (root) {
  "use strict";
  const VERSION = "atsa-radar-1", SIZE = 100, RADIUS = 7;
  /* mulberry32 : same sequence on every engine (app, browser, Node) */
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(text) { let h = 2166136261 >>> 0; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  const round = (v, d) => { const k = Math.pow(10, d == null ? 3 : d); return Math.round(v * k) / k; };
  const at = (tg, t) => [tg.x + tg.vx * (t - tg.tIn), tg.y + tg.vy * (t - tg.tIn)];

  /* closest approach of two targets during the time both are on screen; null when they never share the screen */
  function approach(a, b, radius) {
    const start = Math.max(a.tIn, b.tIn), end = Math.min(a.tOut, b.tOut);
    if (!(end > start)) return null;
    const pa = at(a, start), pb = at(b, start), px = pa[0] - pb[0], py = pa[1] - pb[1], vx = a.vx - b.vx, vy = a.vy - b.vy;
    const vv = vx * vx + vy * vy, pv = px * vx + py * vy, pp = px * px + py * py;
    const s = vv === 0 ? 0 : Math.max(0, Math.min(end - start, -pv / vv));
    const dx = px + vx * s, dy = py + vy * s, dmin = Math.sqrt(dx * dx + dy * dy), r = radius == null ? RADIUS : radius;
    let contact = null;
    if (dmin < r) {
      if (pp <= r * r) contact = start;                       // already inside the radius when both are on screen
      else { const disc = pv * pv - vv * (pp - r * r); contact = start + (-pv - Math.sqrt(Math.max(0, disc))) / vv; }
    }
    const ma = at(a, start + s), mb = at(b, start + s);
    return { a: a.id, b: b.id, start, end, t: start + s, dmin, contact, x: (ma[0] + mb[0]) / 2, y: (ma[1] + mb[1]) / 2 };
  }
  /* every pair of a wave, conflicts first in collision order */
  function pairs(wave) {
    const out = [], T = wave.targets, r = wave.radius == null ? RADIUS : wave.radius;
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) { const p = approach(T[i], T[j], r); if (p) out.push(p); }
    return out;
  }
  function conflicts(wave) { return pairs(wave).filter(p => p.contact != null).sort((p, q) => p.contact - q.contact || p.a - q.a || p.b - q.b); }

  /* entry and exit of a straight track crossing the square: the track passes (mx, my) at time tm with velocity (vx, vy) */
  function track(id, mx, my, tm, vx, vy) {
    const back = [], fwd = [];
    [[vx, mx, 0], [vx, mx, SIZE], [vy, my, 0], [vy, my, SIZE]].forEach(([v, m, edge]) => { if (v === 0) return; const s = (edge - m) / v; (s < 0 ? back : fwd).push(s); });
    const s0 = Math.max.apply(null, back), s1 = Math.min.apply(null, fwd);
    return { id, x: mx + vx * s0, y: my + vy * s0, vx, vy, tIn: tm + s0, tOut: tm + s1 };
  }
  /* wave = { seed, kind, dual, targets, radius, end, math, conflicts } ; spec = { kind: "conflict" | "safe", n, pairs, dual, window } */
  function makeWave(seed, spec) {
    const R = rng(seed), rad = RADIUS, win = spec.window || (spec.dual ? 5 : 4);
    const pick = (lo, hi) => lo + R() * (hi - lo);
    for (let attempt = 0; attempt < 2000; attempt++) {
      const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9]; for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
      const T = [], speed = () => pick(7, 9.5);
      const dir = deg => [Math.sin(deg * Math.PI / 180), -Math.cos(deg * Math.PI / 180)];
      const add = (mx, my, tm, heading, sp) => { const d = dir(heading); T.push(track(ids[T.length], mx, my, tm, round(d[0] * sp, 4), round(d[1] * sp, 4))); };
      const nConf = spec.kind === "conflict" ? (spec.pairs || 1) : 0;
      for (let k = 0; k < nConf; k++) {   // two tracks through one point at the same time, a little offset so the call is not trivial
        const mx = pick(28, 72), my = pick(28, 72), tm = pick(7.5, 10) + k * pick(3, 5), h1 = pick(0, 360), h2 = h1 + (R() < .5 ? 1 : -1) * pick(55, 150);
        add(mx, my, tm, h1, speed()); add(mx + pick(-2, 2), my + pick(-2, 2), tm, h2, speed());
      }
      if (spec.kind === "safe") {   // a deliberate near-look: same crossing two to four seconds apart, or parallel traffic
        const mx = pick(30, 70), my = pick(30, 70), tm = pick(6.5, 9), h1 = pick(0, 360), sp = speed();
        if (R() < .6) { add(mx, my, tm, h1, sp); add(mx, my, tm + pick(2.6, 4), h1 + (R() < .5 ? 1 : -1) * pick(60, 130), speed()); }
        else { const d = dir(h1 + 90), off = pick(17, 24); add(mx, my, tm, h1, sp); add(mx + d[0] * off, my + d[1] * off, tm + pick(-1, 1), h1, sp); }
      }
      /* other traffic: each extra track is redrawn until it stays well clear of everything already planned */
      for (let tries = 0; T.length < spec.n && tries < 200; tries++) {
        add(pick(18, 82), pick(18, 82), pick(4, 12), pick(0, 360), speed());
        const last = T[T.length - 1];
        if (T.slice(0, -1).some(o => { const p = approach(last, o, rad); return p && p.dmin < rad * 1.8; })) T.pop();
      }
      if (T.length < spec.n) continue;
      const t0 = Math.min.apply(null, T.map(t => t.tIn)) - 0.6;   // the first target appears 0.6 s after the wave starts
      T.forEach(t => { t.tIn = round(t.tIn - t0); t.tOut = round(t.tOut - t0); t.x = round(t.x, 3); t.y = round(t.y, 3); });
      const wave = { seed: seed >>> 0, kind: spec.kind, dual: !!spec.dual, radius: rad, targets: T };
      const all = pairs(wave), hit = all.filter(p => p.contact != null);
      if (hit.length !== nConf) continue;                                                     // exactly the planned conflicts
      if (all.some(p => p.contact == null && p.dmin < rad * 1.7)) continue;                    // no ambiguous near miss
      if (hit.some(p => p.contact - p.start < win)) continue;                                  // time to see both and act
      if (hit.some(p => p.contact - Math.max(T.find(t => t.id === p.a).tIn, T.find(t => t.id === p.b).tIn) < win)) continue;
      if (T.some(t => t.tOut - t.tIn < 6)) continue;                                           // no corner-clipping blips
      if (T.some(a => T.some(b => a !== b && Math.abs(a.tIn - b.tIn) < 0.4))) continue;        // one arrival at a time
      if (nConf > 1 && new Set(hit.flatMap(p => [p.a, p.b])).size !== nConf * 2) continue;      // separate pairs, two decisions
      wave.end = round(Math.min(Math.max.apply(null, T.map(t => t.tOut)), 24));
      if (T.some(t => t.tIn > wave.end - 6) || hit.some(p => p.contact > wave.end - 1)) continue;
      wave.conflicts = hit.map(p => ({ a: p.a, b: p.b, contact: round(p.contact), t: round(p.t), x: round(p.x, 2), y: round(p.y, 2), dmin: round(p.dmin, 2) }));
      wave.math = spec.dual ? mathPrompts(R, wave.end) : [];
      return wave;
    }
    throw new Error("radar wave not generated for seed " + seed);
  }
  /* arithmetic prompts: one every five to six seconds, four choices, answer lettered A–D */
  function mathPrompts(R, end) {
    const out = []; let t = 1.8, k = 0;
    while (t + 5 <= end - 0.5) {
      const kind = Math.floor(R() * 3); let a, b, ans, q;
      if (kind === 0) { a = 3 + Math.floor(R() * 15); b = 2 + Math.floor(R() * 9); ans = a + b; q = a + " + " + b; }
      else if (kind === 1) { a = 9 + Math.floor(R() * 13); b = 2 + Math.floor(R() * (a - 3)); ans = a - b; q = a + " − " + b; }
      else { a = 2 + Math.floor(R() * 8); b = 2 + Math.floor(R() * 8); ans = a * b; q = a + " × " + b; }
      const opts = [ans], near = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans + 3];
      while (opts.length < 4) { const v = near[Math.floor(R() * near.length)]; if (v >= 0 && opts.indexOf(v) < 0) opts.push(v); }
      for (let i = 3; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const s = opts[i]; opts[i] = opts[j]; opts[j] = s; }
      out.push({ id: k++, t: round(t), until: round(t + 5), q, opts, ans: opts.indexOf(ans) });
      t += 5.5 + R() * 1.2;
    }
    return out;
  }
  /* a section: waves of one seed. opts = { waves, radarOnly, n(i) } ; the kinds are balanced inside every block of four */
  function form(seed, opts) {
    const R = rng(seed), total = opts.waves, solo = opts.radarOnly == null ? total : opts.radarOnly, out = [];
    for (let b = 0; b < total; b += 4) {
      const kinds = ["conflict", "conflict", "conflict", "safe"];
      for (let i = 3; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const s = kinds[i]; kinds[i] = kinds[j]; kinds[j] = s; }
      for (let i = 0; i < 4 && b + i < total; i++) {
        const w = b + i, dual = w >= solo, kind = kinds[i];
        const n = dual ? (kind === "conflict" ? 4 : 3) + (w % 2) : (w < 2 ? 3 : 3 + (w % 2));
        const twin = kind === "conflict" && dual && n >= 5 && R() < .5;
        out.push(makeWave(hash(seed + ":" + w), { kind, n, pairs: twin ? 2 : 1, dual }));
      }
    }
    return out;
  }

  /* one wave being played. Inputs carry their own model time; events are applied in time order, never per frame. */
  function run(wave) {
    const byId = new Map(wave.targets.map(t => [t.id, t]));
    const conf = wave.conflicts.map(c => ({ a: c.a, b: c.b, contact: c.contact, t: c.t, x: c.x, y: c.y, state: "pending", by: null, at: null }));
    const math = wave.math.map(m => ({ id: m.id, t: m.t, until: m.until, q: m.q, opts: m.opts, ans: m.ans, pick: null, at: null, state: "waiting" }));
    const removed = new Map(), log = [];
    let now = 0, end = null, clearAt = null, clearPending = 0, dead = false;
    const visible = (tg, t) => t >= tg.tIn && t < tg.tOut && !removed.has(tg.id) && (end == null || t < end);
    function advance(t) {
      if (dead || end != null) return;
      if (t < now) t = now;                                  // time never goes back (late or reordered events)
      const until = Math.min(t, wave.end), events = [];
      conf.forEach(c => { if (c.state === "pending" && c.contact <= until) events.push([c.contact, 0, c]); });
      math.forEach(m => { if (m.state !== "answered" && m.state !== "expired" && m.until <= until) events.push([m.until, 1, m]); });
      events.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      events.forEach(e => { if (e[1] === 0) { e[2].state = "collided"; e[2].at = e[0]; } else e[2].state = "expired"; });
      math.forEach(m => { if (m.state === "waiting" && m.t <= until) m.state = "shown"; });
      now = until;
      if (t >= wave.end) finish(wave.end);
    }
    function finish(t) {
      end = t;
      math.forEach(m => { if (m.state === "waiting") m.state = "unshown"; else if (m.state === "shown") m.state = m.until <= t ? "expired" : "cut"; });
    }
    const api = {
      wave,
      get now() { return now; }, get ended() { return end != null; }, get endedAt() { return end; },
      advance(t) { advance(t); return api; },
      /* positions to draw at time t */
      positions(t) { return wave.targets.filter(tg => visible(tg, t)).map(tg => { const p = at(tg, t); return { id: tg.id, x: p[0], y: p[1], vx: tg.vx, vy: tg.vy }; }); },
      onScreen(id, t) { const tg = byId.get(id); return !!tg && visible(tg, t); },
      remove(id, t) {
        if (dead) return null; advance(t); if (end != null) return null;
        const tg = byId.get(id); if (!tg || !visible(tg, now)) return null;
        removed.set(id, now);
        const solved = conf.filter(c => c.state === "pending" && (c.a === id || c.b === id));
        solved.forEach(c => { c.state = "resolved"; c.by = id; c.at = now; });
        const entry = { type: "remove", id, t: now, necessary: solved.length > 0 }; log.push(entry); return entry;
      },
      clear(t) {
        if (dead) return null; advance(t); if (end != null) return null;
        const open = conf.filter(c => c.state === "pending");
        open.forEach(c => { c.state = "cleared"; c.at = now; });
        clearAt = now; clearPending = open.length; log.push({ type: "clear", t: now, pending: open.length });
        finish(now); return { t: now, ok: open.length === 0 };
      },
      answer(mid, choice, t) {
        if (dead) return null; advance(t); if (end != null) return null;
        const m = math.find(x => x.id === mid); if (!m || m.state !== "shown") return null;
        m.state = "answered"; m.pick = choice; m.at = now; log.push({ type: "math", id: mid, t: now, choice }); return { ok: choice === m.ans };
      },
      activeMath(t) { return math.filter(m => m.state === "shown" && m.t <= t && m.until > t); },
      /* teardown: nothing after this changes the outcome */
      dispose() { dead = true; },
      result() {
        const rm = log.filter(e => e.type === "remove");
        return {
          kind: wave.kind, dual: wave.dual, end, conflicts: conf.map(c => Object.assign({}, c)),
          resolved: conf.filter(c => c.state === "resolved").length, missed: conf.filter(c => c.state !== "resolved").length,
          removals: rm.length, unnecessary: rm.filter(e => !e.necessary).length,
          clearAt, clearOk: clearAt != null && clearPending === 0, clearWrong: clearAt != null && clearPending > 0,
          math: math.map(m => ({ id: m.id, q: m.q, opts: m.opts, ans: m.ans, pick: m.pick, state: m.state === "answered" ? (m.pick === m.ans ? "correct" : "wrong") : m.state })),
          log: log.slice()
        };
      }
    };
    return api;
  }
  /* section totals; presented math = shown before the wave ended */
  function score(results) {
    const s = { conflicts: 0, resolved: 0, missed: 0, unnecessary: 0, removals: 0, safe: 0, safeOk: 0, clearWrong: 0, math: 0, mathOk: 0, mathWrong: 0, mathExpired: 0 };
    results.forEach(r => {
      s.conflicts += r.conflicts.length; s.resolved += r.resolved; s.missed += r.missed; s.unnecessary += r.unnecessary; s.removals += r.removals;
      if (r.kind === "safe") { s.safe++; if (r.clearOk) s.safeOk++; }
      if (r.clearWrong) s.clearWrong++;
      r.math.forEach(m => { if (m.state === "unshown" || m.state === "waiting") return; s.math++; if (m.state === "correct") s.mathOk++; else if (m.state === "wrong") s.mathWrong++; else s.mathExpired++; });
    });
    s.efficiency = s.removals ? (s.removals - s.unnecessary) / s.removals : null;
    return s;
  }
  const api = { VERSION, SIZE, RADIUS, rng, hash, at, approach, pairs, conflicts, makeWave, form, run, score, round };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ATSARadar = api;
  if (root.PP) { root.PP.bank = root.PP.bank || {}; root.PP.bank.atsaRadar = api; }
})(typeof window !== "undefined" ? window : globalThis);
