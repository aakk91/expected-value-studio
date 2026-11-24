'use strict';

const $ = id => document.getElementById(id);
const skillNames = ['Spatial reasoning', 'Working memory', 'Divided attention'];
const directions = ['North', 'East', 'South', 'West'];
const sessionURL = 'https://preflight.expectedvaluestudio.com/guides/atsa-practice/';
const limit = 20000;
const duration = limit / 1000;
const querySeed = new URL(location.href).searchParams.get('challenge');
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
let seed = /^[a-z0-9]{1,7}$/.test(querySeed || '') && parseInt(querySeed,36) <= 0xffffffff ? querySeed : newSeed();
let questions, answers, current, startedAt, interval, phase;

function randomSequence(value) {
  let state = parseInt(value,36) >>> 0;
  return max => {
    state = (Math.imul(state,1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * max);
  };
}

function buildSession(value) {
  const pick = randomSequence(value);
  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = pick(i + 1);
      [items[i],items[j]] = [items[j],items[i]];
    }
    return items;
  }
  return Array.from({length:9}, (_, index) => {
    const skill = index % 3;
    if (skill === 0) {
      const start = pick(4), turn = [1,2,3][pick(3)];
      const instruction = ['','right 90°','180°','left 90°'][turn];
      const answer = directions[(start + turn) % 4];
      return {skill,start,answer,options:directions,prompt:'Turn ' + instruction + '. What is your new heading?',
        explanation:'You began facing ' + directions[start].toLowerCase() + '. A turn of ' + instruction + ' points ' + answer.toLowerCase() + '.'};
    }
    if (skill === 1) {
      const digits = shuffle('123456789'.split('')).slice(0,4);
      const position = pick(4), ordinal = ['first','second','third','fourth'][position];
      return {skill,digits,answer:digits[position],options:shuffle([...digits]), prompt:'Memorize the four-digit clearance.',
        recall:'Which digit came ' + ordinal + '?',explanation:'The code was ' + digits.join(' ') + '. The ' + ordinal + ' digit was ' + digits[position] + '.'};
    }
    const tags = shuffle(['K2','R4','T7','M3']);
    const highestAt = pick(3), levels = shuffle([12,16,21]);
    levels[highestAt] = 28 + pick(7);
    const samples = tags.slice(0,3).map((tag,i) => ({tag,level:levels[i]}));
    const answer = tags[highestAt];
    return {skill,samples,answer,options:shuffle([...tags]),prompt:'Watch both channels. Remember the call sign at the highest level.',
      recall:'Which call sign appeared at the highest level?',explanation:samples.map(s => s.tag + ' at ' + s.level).join(' · ') + '. The highest level belonged to ' + answer + '.'};
  });
}

function toggleScreen(id) {
  for (const name of ['welcome','round','result']) $(name).hidden = name !== id;
  window.scrollTo(0,0);
}

function startSession() {
  clearInterval(interval);
  questions = buildSession(seed);
  answers = [];
  current = 0;
  toggleScreen('round');
  beginQuestion(Date.now());
  interval = setInterval(tick,100);
}

function beginQuestion(time) {
  startedAt = time;
  phase = -1;
  $('progress').textContent = 'Question ' + (current + 1) + ' of ' + questions.length;
  $('skill').textContent = skillNames[questions[current].skill].toUpperCase();
  $('prompt').textContent = questions[current].prompt;
  $('choices').replaceChildren();
  $('clock').textContent = duration + 's';
  $('meter').firstElementChild.style.width = '100%';
  paintPhase(0);
  $('prompt').focus();
}

function signal(label,value) {
  const box = document.createElement('div'), title = document.createElement('small');
  box.className = 'channel';
  title.textContent = label;
  box.append(title,document.createTextNode(value));
  return box;
}

function showOptions(question) {
  const questionIndex = current;
  $('choices').replaceChildren(...question.options.map(text => {
    const button = document.createElement('button');
    button.textContent = text;
    button.onclick = () => {
      if (current !== questionIndex || $('round').hidden) return;
      const now = Date.now();
      if (now - startedAt >= limit) return tick();
      advance(text,now);
    };
    return button;
  }));
}

function paintPhase(elapsed) {
  const q = questions[current];
  let next = 0;
  if (q.skill === 1) next = elapsed < 4000 ? 0 : 1;
  if (q.skill === 2) next = elapsed < 2200 ? 0 : Math.min(4,1 + Math.floor((elapsed - 2200) / 2000));
  if (next === phase) return;
  phase = next;
  const stage = $('stage');
  stage.replaceChildren();
  if (q.skill === 0) {
    const dial = document.createElement('span'), arrow = document.createElement('span');
    dial.className = 'dial'; arrow.className = 'arrow'; arrow.textContent = '↑';
    arrow.style.transform = 'rotate(' + q.start * 90 + 'deg)';
    dial.setAttribute('aria-hidden','true');
    dial.append(arrow);
    stage.append(dial,signal('Starting heading',directions[q.start]));
    $('cue').textContent = 'Choose your direction after the turn.';
    showOptions(q);
  } else if (q.skill === 1 && next === 0) {
    stage.textContent = q.digits.join('  ');
    $('cue').textContent = 'Read left to right. The code disappears after four seconds.';
  } else if (q.skill === 2 && next < 4) {
    const s = q.samples[next - 1];
    stage.append(signal('Call sign',s?.tag || '—'),signal('Level',s?.level || '—'));
    $('cue').textContent = next ? 'Signal ' + next + ' of 3' : 'Three pairs will appear. Track the call sign and the level together.';
  } else {
    stage.textContent = q.skill === 1 ? '• • • •' : 'Signals ended';
    $('prompt').textContent = q.recall;
    $('cue').textContent = 'Choose your answer.';
    showOptions(q);
  }
}

function tick() {
  const now = Date.now();
  while (!$('round').hidden && now - startedAt >= limit) advance(null,startedAt + limit);
  if ($('round').hidden) return;
  const elapsed = now - startedAt;
  $('clock').textContent = Math.ceil((limit - elapsed) / 1000) + 's';
  $('meter').firstElementChild.style.width = ((limit - elapsed) / limit * 100) + '%';
  paintPhase(elapsed);
}

function advance(answer,time) {
  answers[current] = answer;
  current++;
  if (current === questions.length) return finish();
  beginQuestion(time);
}

function finish() {
  clearInterval(interval);
  const totals = [0,0,0];
  const review = questions.map((q,i) => {
    const right = answers[i] === q.answer;
    if (right) totals[q.skill]++;
    const item = document.createElement('div'), title = document.createElement('strong'), line = document.createElement('p'), detail = document.createElement('small');
    item.className = 'answer';
    title.textContent = (i + 1) + '. ' + skillNames[q.skill] + ' · ' + (right ? 'Correct' : answers[i] === null ? 'Time expired' : 'Missed');
    line.textContent = (q.recall || q.prompt) + ' Your answer: ' + (answers[i] ?? 'unanswered') + '.';
    detail.textContent = q.explanation;
    item.append(title,line,detail);
    return item;
  });
  const total = totals.reduce((a,b) => a+b,0);
  const focus = totals.indexOf(Math.min(...totals));
  $('score').textContent = total + ' of 9 correct';
  $('summary').replaceChildren(...totals.map((n,i) => {
    const el = document.createElement('div'), number = document.createElement('strong'), label = document.createElement('small');
    el.className = 'stat'; number.textContent = n + '/3'; label.textContent = skillNames[i];
    el.append(number,label); return el;
  }));
  $('focus').textContent = total === 9 ? 'Keep your practice going.' : 'Practise ' + skillNames[focus].toLowerCase() + ' next.';
  $('next-copy').textContent = total === 9 ? 'Choose the ATSA programme in Brain Preflight to continue with a new exercise.' :
    ['Try a mental rotation exercise in the ATSA programme.','Try a working-memory exercise in the ATSA programme.','Try a divided-attention exercise in the ATSA programme.'][focus];
  $('install').href = 'https://apps.apple.com/us/app/apple-store/id6794363864?pt=129217861&ct=atsa-web-challenge&mt=8';
  $('review').replaceChildren(...review);
  $('share-status').textContent = '';
  $('manual-link').hidden = true;
  toggleScreen('result');
  $('score').focus();
}

async function share() {
  const url = sessionURL + '?challenge=' + encodeURIComponent(seed);
  try {
    if (navigator.share) {
      await navigator.share({title:'Brain Preflight · ATSA practice',text:'Try the same nine questions.',url});
      return;
    }
    await navigator.clipboard.writeText(url);
    $('share-status').textContent = 'Challenge link copied.';
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('share-status').textContent = 'Copy this link to share the same questions.';
    $('manual-link').hidden = false;
    $('manual-link').value = url;
    $('manual-link').select();
  }
}

$('start').onclick = startSession;
$('retry').onclick = () => { seed = newSeed(); startSession(); };
$('share').onclick = share;
