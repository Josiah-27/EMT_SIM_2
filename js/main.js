import * as E from './emt.js';
import { drawSmith } from './smith.js';
import { createScene } from './scene.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  Z0: 50, R: 35, X: -47.5, type: 'short',
  stage: 1,   // 1 normalise · 2 flip · 3 distance · 4 stub
  sol: 0,
  d: 0, l: 0.25, flip: 0,
  playing: !reduceMotion,
};

let load, sols;
let dirty = true;
let scene = null;

/* ---------- tweening ---------- */
const tweens = new Map();
function tween(key, to, ms = 1100) {
  if (reduceMotion || ms === 0) {
    tweens.delete(key);
    state[key] = to;
  } else {
    tweens.set(key, { from: state[key], to, t0: performance.now(), ms });
  }
  dirty = true;
}
function runTweens(now) {
  for (const [key, t] of tweens) {
    const p = Math.min(1, (now - t.t0) / t.ms);
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    state[key] = t.from + (t.to - t.from) * e;
    if (p >= 1) tweens.delete(key);
    dirty = true;
  }
}

/* ---------- model ---------- */
function recompute() {
  load = E.analyseLoad(state.Z0, state.R, state.X);
  sols = E.solveStub(load, state.type);
  if (state.sol >= sols.length) state.sol = 0;
}

const neutralLength = (target) => (state.type === 'short' ? 0.25 : target < 0.25 ? 0.005 : 0.495);

function setStage(n, { animate = true } = {}) {
  const prev = state.stage;
  state.stage = Math.max(1, Math.min(4, n));
  const s = sols[state.sol];
  const ms = animate ? undefined : 0;
  tweens.clear();
  if (state.stage === 1) {
    state.flip = 0;
    state.d = 0;
  } else if (state.stage === 2) {
    state.d = 0;
    if (prev < 2) { state.flip = 0; tween('flip', 1, animate ? 900 : 0); } else state.flip = 1;
  } else if (state.stage === 3) {
    state.flip = 1;
    if (s) { if (prev < 3) state.d = 0; tween('d', s.d, ms); }
  } else {
    state.flip = 1;
    if (s) {
      if (prev < 3) state.d = s.d; else tween('d', s.d, ms);
      if (prev < 4) state.l = neutralLength(s.l);
      tween('l', s.l, ms);
    }
  }
  dirty = true;
}

function pickSolution(i) {
  if (!sols[i]) return;
  state.sol = i;
  const s = sols[i];
  state.flip = 1;
  tweens.clear();
  if (state.stage < 3) state.stage = 4;
  tween('d', s.d);
  if (state.stage === 4) tween('l', s.l);
  dirty = true;
}

/* ---------- copy for each step ---------- */
function stepCopy() {
  const s = sols[state.sol];
  const pct = Math.round(load.reflected * 100);
  const zL = E.fmtComplex(load.zL), yL = E.fmtComplex(load.yL);
  const ZL = E.fmtComplex(load.ZL, load.ZL.im % 1 ? 1 : 0).replace(/(\d)\.0(?!\d)/g, '$1');
  const end = state.type === 'short' ? 'short-circuited' : 'open-circuited';
  const none = 'This load is already matched (or reflects everything), so there is nothing for a stub to fix. Change the load to try again.';
  return [
    {
      title: 'Normalise the load',
      text: `Divide the load by the line’s ${E.fmt(state.Z0, 0)} Ω and plot it on the chart. The dashed circle through it holds every value this line can turn the load into. With no stub the wave is lumpy: VSWR ${E.fmt(load.vswr)}, and ${pct}% of the power bounces back.`,
      eq: `z<sub>L</sub> = (${ZL}) / ${E.fmt(state.Z0, 0)} = <b>${zL}</b>`,
    },
    {
      title: 'Flip to admittance',
      text: 'A stub hangs across the line in parallel, and parallel parts add as admittances. Go straight through the centre to the far side of the circle and read the load there as an admittance.',
      eq: `y<sub>L</sub> = 1 / z<sub>L</sub> = <b>${yL}</b>`,
    },
    {
      title: 'Walk toward the generator',
      text: s
        ? 'Move clockwise round the circle until you land on the g = 1 circle. The arc you covered, read on the outer scale, is the distance d from the load. The circle is crossed twice, so there are two answers.'
        : none,
      eq: s ? `${E.fmt(s.wtg, 3)} − ${E.fmt(load.wtgY, 3)} → <b>d = ${E.fmt(s.d, 3)} λ</b>, where y = ${E.fmtComplex(s.y)}` : '',
    },
    {
      title: 'Cancel the leftover with the stub',
      text: s
        ? `At that spot the line already looks like 1, plus an unwanted ${E.fmtJ(s.y.im)}. A ${end} stub of the right length adds ${E.fmtJ(s.bStub)} and nothing else. On the generator side of the stub the wave goes flat: nothing comes back.`
        : none,
      eq: s ? `stub = ${E.fmtJ(s.bStub)} → <b>l = ${E.fmt(s.l, 3)} λ</b>, so y<sub>in</sub> = 1.00` : '',
    },
  ];
}

/* ---------- draw everything that depends on state ---------- */
function refresh() {
  const showD = state.stage >= 3;
  const stubOn = state.stage >= 4;
  const d = showD ? state.d : 0;
  const params = { d, l: state.l, type: state.type, stubOn };
  const line = E.lineAt(load, params);
  const volt = E.makeVoltages(load, line, params);
  const matched = line.rhoIn < 0.02;
  const ZLtxt = E.fmtComplex(load.ZL, 1).replace(/\.0(?!\d)/g, '');

  scene?.setModel({
    d, l: state.l, type: state.type, showD, stubOn,
    rhoL: load.rho, rhoIn: line.rhoIn, volt,
    text: {
      d: `d = ${E.fmt(d, 3)} λ`,
      l: `${state.type === 'short' ? 'Shorted' : 'Open'} stub, l = ${E.fmt(state.l, 3)} λ`,
      load: `Load ${ZLtxt} Ω`,
    },
  });

  drawSmith($('smith'), {
    gammaL: load.gammaL, rho: load.rho, flip: state.flip,
    solutions: sols, sol: state.sol, showCrossings: showD,
    emphasiseUnitCircle: state.stage === 3,
    d, yD: line.yD, stubOn, bStub: line.bStub, yIn: line.yIn, rhoIn: line.rhoIn,
    l: state.l, type: state.type,
  });

  // step text
  const copy = stepCopy()[state.stage - 1];
  $('stepTitle').textContent = copy.title;
  $('stepText').textContent = copy.text;
  $('stepEq').innerHTML = copy.eq;
  document.querySelectorAll('#stepTabs button').forEach((b) => {
    const n = Number(b.dataset.stage);
    b.setAttribute('aria-current', n === state.stage ? 'step' : 'false');
    b.classList.toggle('done', n < state.stage);
  });
  $('btnBack').disabled = state.stage === 1;
  $('btnNext').disabled = state.stage === 4 && sols.length < 2;
  $('btnNext').textContent = state.stage === 4 ? `Show answer ${2 - state.sol}` : 'Next step';

  // meter on the stage
  $('chipVswr').textContent = `VSWR ${E.fmt(line.vswrIn)}`;
  $('chipRefl').textContent = matched ? 'Matched: nothing reflected' : `${E.fmt(line.reflectedIn * 100, 0)}% of power reflected`;
  $('meter').classList.toggle('ok', matched);

  // sliders
  $('dRange').value = state.d;
  $('lRange').value = state.l;
  $('dOut').textContent = `${E.fmt(state.d, 3)} λ`;
  $('lOut').textContent = `${E.fmt(state.l, 3)} λ`;
  $('dRow').classList.toggle('idle', !showD);
  $('lRow').classList.toggle('idle', !stubOn);

  // live readings
  const zin = E.div(E.cx(state.Z0, 0), line.yIn);
  $('rYd').textContent = showD ? E.fmtComplex(line.yD) : '—';
  $('rStub').textContent = stubOn ? E.fmtJ(line.bStub) : 'no stub yet';
  $('rYin').textContent = E.fmtComplex(line.yIn);
  $('rZin').textContent = `${E.fmtComplex(zin, 1)} Ω`;

  // both answers
  $('solBody').innerHTML = sols.length
    ? sols.map((s, i) => `
      <tr class="${i === state.sol && showD ? 'on' : ''}">
        <th scope="row">${i + 1}</th>
        <td>${E.fmt(s.d, 3)} λ</td>
        <td>${E.fmt(s.l, 3)} λ</td>
        <td>${E.fmtComplex(s.y)}</td>
        <td><button type="button" class="btn small" data-sol="${i}">Show</button></td>
      </tr>`).join('')
    : '<tr><td colspan="5">No stub needed for this load.</td></tr>';

  $('btnPlay').textContent = state.playing ? 'Pause wave' : 'Play wave';
  $('btnPlay').setAttribute('aria-pressed', String(!state.playing));
}

/* ---------- events ---------- */
function bind() {
  $('stepTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-stage]');
    if (b) setStage(Number(b.dataset.stage));
  });
  $('btnBack').addEventListener('click', () => setStage(state.stage - 1));
  $('btnNext').addEventListener('click', () => (state.stage === 4 ? pickSolution(1 - state.sol) : setStage(state.stage + 1)));

  $('dRange').addEventListener('input', (e) => {
    tweens.clear();
    state.d = Number(e.target.value);
    state.flip = 1;
    if (state.stage < 3) state.stage = 3;
    dirty = true;
  });
  $('lRange').addEventListener('input', (e) => {
    tweens.clear();
    state.l = Number(e.target.value);
    state.flip = 1;
    if (state.stage < 3 && sols[state.sol]) state.d = sols[state.sol].d;
    state.stage = 4;
    dirty = true;
  });

  $('solBody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sol]');
    if (b) pickSolution(Number(b.dataset.sol));
  });

  for (const [id, key] of [['inZ0', 'Z0'], ['inR', 'R'], ['inX', 'X']]) {
    $(id).addEventListener('change', (e) => {
      let v = Number(e.target.value);
      if (!Number.isFinite(v)) v = state[key];
      if (key === 'Z0') v = Math.max(1, v);
      if (key === 'R') v = Math.max(0, v);
      e.target.value = v;
      state[key] = v;
      recompute();
      setStage(state.stage, { animate: false });
    });
  }
  document.querySelectorAll('input[name="stubType"]').forEach((r) =>
    r.addEventListener('change', () => {
      state.type = r.value;
      recompute();
      setStage(state.stage, { animate: false });
    }));

  $('btnReset').addEventListener('click', () => {
    Object.assign(state, { Z0: 50, R: 35, X: -47.5, type: 'short', sol: 0 });
    $('inZ0').value = 50; $('inR').value = 35; $('inX').value = -47.5;
    $('typeShort').checked = true;
    recompute();
    setStage(1);
  });

  $('btnPlay').addEventListener('click', () => { state.playing = !state.playing; dirty = true; });
  $('btnView').addEventListener('click', () => scene?.resetView());

  new ResizeObserver(() => { dirty = true; }).observe($('smith').parentElement);
  document.fonts?.ready.then(() => { dirty = true; });
}

/* ---------- go ---------- */
recompute();
bind();
try {
  scene = createScene($('scene'), $('labels'));
} catch (err) {
  console.error(err);
  $('stageNote').textContent = 'The 3D view needs WebGL, which this browser has switched off. The Smith chart and numbers below still work.';
  $('stageNote').hidden = false;
}

let last = performance.now();
let wt = 0;
let flow = 0;
const FREQ = 0.4; // wave cycles per second on screen

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  runTweens(now);
  if (dirty) { dirty = false; refresh(); }
  if (state.playing) { wt += dt * FREQ * 2 * Math.PI; flow += dt * FREQ; }
  scene?.frame(wt, flow);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// handy for checking values from the console
window.emt = { state, E, get load() { return load; }, get solutions() { return sols; }, setStage };
