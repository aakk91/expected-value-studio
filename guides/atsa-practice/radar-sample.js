'use strict';
/* Keyboard radar sample: the same scenario and scoring engine as the Brain Preflight app's ATSA radar section
   (radar-engine.js is a byte copy of the app's games/_atsa_radar.js). Four waves: two radar-only, two with arithmetic.
   Keys: 1–9 remove a target (number row or numeric keypad), Space = Clear, A–D = arithmetic answer. Mouse clicks work too. */
(function () {
  const E = window.ATSARadar, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg', LETTER = 'ABCD';
  const param = new URL(location.href).searchParams.get('radar');
  const fresh = () => crypto.getRandomValues(new Uint32Array(1))[0];
  let seed = /^\d{1,10}$/.test(param || '') && +param <= 0xffffffff ? +param : fresh();
  let waves = [], results = [], wi = 0, run = null, t0 = 0, raf = null, mathNow = null, nodes = new Map(), boom = new Set(), between = 0;

  function show(id) { for (const s of ['welcome', 'round', 'result', 'radar', 'radar-result']) { const el = $(s); if (el) el.hidden = s !== id; } window.scrollTo(0, 0); }
  function begin() {
    waves = E.form(seed, { waves: 4, radarOnly: 2 }); results = []; wi = 0;
    show('radar'); $('rd-field').focus({ preventScroll: true }); nextWave();
  }
  function nextWave() {
    cancelAnimationFrame(raf); nodes.forEach(n => n.remove()); nodes.clear(); boom.clear(); $('rd-fx').replaceChildren();
    if (wi >= waves.length) return finish();
    const w = waves[wi];
    $('rd-wave').textContent = 'Wave ' + (wi + 1) + ' of ' + waves.length + (w.dual ? ' · radar + math' : ' · radar only');
    $('rd-math').hidden = !w.dual; $('rd-msg').textContent = 'Get ready…';
    between = performance.now();
    const wait = () => { if (performance.now() - between < 1200) { raf = requestAnimationFrame(wait); return; } $('rd-msg').textContent = ''; run = E.run(w); t0 = performance.now(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(wait);
  }
  const mt = now => (now - t0) / 1000;
  function act(kind, value, now) {
    if (!run) return;
    if (kind === 'remove') { const r = run.remove(value, mt(now)); if (r) flash(value); }
    else if (kind === 'clear') run.clear(mt(now));
    else if (kind === 'math' && mathNow) { const r = run.answer(mathNow.id, value, mt(now)); if (r) $('rd-opts').children[value].classList.add('on'); }
  }
  function flash(id) { const b = $('rd-ids').children[id - 1]; if (!b) return; b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 180); }
  function loop() {
    const now = performance.now(), t = Math.min(mt(now), run.wave.end);
    run.advance(mt(now));
    const pos = run.positions(t), on = new Set(pos.map(p => p.id));
    pos.forEach(p => {
      let n = nodes.get(p.id);
      if (!n) { n = document.createElementNS(NS, 'g'); n.innerHTML = '<line x1="0" y1="0" stroke="#ffc081" stroke-width=".9" stroke-linecap="round"/><circle r="3.6" fill="#ff973f" stroke="#fff1e3" stroke-width=".7"/><text y="1.55" font-size="4.4" font-weight="700" text-anchor="middle" fill="#14121e">' + p.id + '</text>'; n.dataset.id = p.id; $('rd-tg').appendChild(n); nodes.set(p.id, n); }
      n.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')');
      n.firstChild.setAttribute('x2', (p.vx * .9).toFixed(2)); n.firstChild.setAttribute('y2', (p.vy * .9).toFixed(2));
    });
    nodes.forEach((n, id) => { if (!on.has(id)) { n.remove(); nodes.delete(id); } });
    [...$('rd-ids').children].forEach((b, i) => { b.disabled = !on.has(i + 1); });
    const res = run.result();
    res.conflicts.forEach((c, i) => { if (c.state === 'collided' && !boom.has(i)) { boom.add(i); const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', 'translate(' + c.x + ' ' + c.y + ')'); g.innerHTML = '<circle r="6" fill="none" stroke="#ff6b66" stroke-width="1.4"/><path d="M-3-3L3 3M3-3L-3 3" stroke="#ff6b66" stroke-width="1.4"/>'; $('rd-fx').appendChild(g); $('rd-msg').textContent = 'Collision between ' + c.a + ' and ' + c.b + '.'; } });
    if (run.wave.dual) {
      const m = run.activeMath(t)[0] || null;
      if ((m && m.id) !== (mathNow && mathNow.id)) {
        mathNow = m; $('rd-q').textContent = m ? m.q + ' = ?' : ' ';
        [...$('rd-opts').children].forEach((b, i) => { b.classList.remove('on'); b.disabled = !m; b.lastChild.textContent = m ? String(m.opts[i]) : ' '; });
      }
    }
    if (run.ended) { results.push(run.result()); run.dispose(); run = null; mathNow = null; wi++; nextWave(); return; }
    raf = requestAnimationFrame(loop);
  }
  function finish() {
    cancelAnimationFrame(raf); run = null;
    const S = E.score(results), safe = results.filter(r => r.kind === 'safe'), safeOk = safe.filter(r => r.clearOk && r.removals === 0).length;
    const stats = [[S.resolved + '/' + S.conflicts, 'Conflicts resolved'], [S.unnecessary, 'Unneeded removals'], [safeOk + '/' + safe.length, 'Correct “Clear” calls'], [S.math ? S.mathOk + '/' + S.math : '—', 'Arithmetic correct']];
    $('rd-summary').replaceChildren(...stats.map(([v, l]) => { const d = document.createElement('div'), b = document.createElement('strong'), s = document.createElement('small'); d.className = 'stat'; b.textContent = v; s.textContent = l; d.append(b, s); return d; }));
    $('rd-score').textContent = S.resolved === S.conflicts && !S.unnecessary ? 'Clean traffic: every conflict solved.' : S.resolved + ' of ' + S.conflicts + ' conflicts solved';
    const lines = [];
    results.forEach((r, i) => r.conflicts.forEach(c => lines.push('Wave ' + (i + 1) + ': ' + c.a + ' and ' + c.b + ' — ' + (c.state === 'resolved' ? 'removed ' + c.by + ' at ' + c.at.toFixed(1) + ' s' : c.state === 'cleared' ? 'Clear was pressed while they were still converging' : 'collided at ' + c.contact.toFixed(1) + ' s'))));
    results.forEach((r, i) => { if (r.kind === 'safe') lines.push('Wave ' + (i + 1) + ': no conflict — ' + (r.clearOk && !r.removals ? 'Clear, correctly' : r.removals ? r.removals + ' unneeded removal' + (r.removals > 1 ? 's' : '') : 'no Clear call')); });
    $('rd-review').replaceChildren(...lines.map(t => { const p = document.createElement('p'); p.className = 'answer'; p.textContent = t; return p; }));
    window.__radarSample = { seed, waves, results, score: S };
    show('radar-result'); $('rd-score').focus();
  }
  document.addEventListener('keydown', e => {
    if ($('radar').hidden || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const now = performance.now(), m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
    const d = /^[1-9]$/.test(e.key) ? +e.key : m ? +m[1] : null;
    if (d) { e.preventDefault(); act('remove', d, now); return; }
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); act('clear', null, now); return; }
    const k = 'abcd'.indexOf(String(e.key).toLowerCase()); if (k >= 0) { e.preventDefault(); act('math', k, now); }
  });
  function build() {
    const ids = $('rd-ids'); for (let d = 1; d <= 9; d++) { const b = document.createElement('button'); b.type = 'button'; b.textContent = d; b.disabled = true; b.setAttribute('aria-label', 'Remove target ' + d); b.onclick = () => act('remove', d, performance.now()); ids.appendChild(b); }
    const opts = $('rd-opts'); for (let i = 0; i < 4; i++) { const b = document.createElement('button'); b.type = 'button'; b.disabled = true; b.innerHTML = '<span>' + LETTER[i] + '</span><b>&nbsp;</b>'; b.onclick = () => act('math', i, performance.now()); opts.appendChild(b); }
    $('rd-clear').onclick = () => act('clear', null, performance.now());
    $('rd-tg').addEventListener('pointerdown', e => { const g = e.target.closest('g[data-id]'); if (g) { e.preventDefault(); act('remove', +g.dataset.id, performance.now()); } });
    $('radar-start').onclick = begin;
    $('rd-retry').onclick = () => { seed = fresh(); begin(); };
    $('rd-back').onclick = () => show('welcome');
    if (param) $('radar-start').textContent = 'Start the shared radar round';
  }
  /* read-only state for automated checks (lab/qa/check-atsa-web.mjs in the app repo) */
  window.__radarState = () => {
    if (!run || run.ended) return { live: false };
    const t = mt(performance.now()), w = run.wave, res = run.result();
    return { live: true, t, dual: w.dual, safe: w.kind === 'safe', mathLeft: w.math.some(m => m.until > t), math: run.activeMath(t)[0] || null,
      pending: res.conflicts.filter(c => c.state === 'pending').map(c => ({ a: c.a, ready: Math.max(...w.targets.filter(x => x.id === c.a || x.id === c.b).map(x => x.tIn)) + 0.8 })) };
  };
  build();
})();
