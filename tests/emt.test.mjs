// Run with:  npm test   (or: node --test tests/*.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyseLoad, solveStub, lineAt, makeVoltages, stubSusceptance, stubLengthFor, abs, cx,
} from '../js/emt.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

// The exam problem: Z0 = 50 Ω, ZL = 35 − j47.5 Ω, short-circuited shunt stub.
const load = analyseLoad(50, 35, -47.5);

test('normalised load impedance and admittance', () => {
  near(load.zL.re, 0.70, 1e-9);
  near(load.zL.im, -0.95, 1e-9);
  near(load.yL.re, 0.50, 0.005);
  near(load.yL.im, 0.68, 0.005);
});

test('reflection coefficient and VSWR of the bare load', () => {
  near(load.rho, 0.5116, 5e-4);
  near((load.theta * 180) / Math.PI, -78.3, 0.1);
  near(load.vswr, 3.095, 5e-3);
  near(load.reflected, 0.2617, 5e-4);
});

test('two stub solutions', () => {
  const [s1, s2] = solveStub(load, 'short');
  near(s1.d, 0.059, 5e-4, 'd1');
  near(s1.y.im, 1.19, 5e-3, 'b1');
  near(s1.l, 0.111, 5e-4, 'l1');
  near(s2.d, 0.2235, 5e-4, 'd2');
  near(s2.y.im, -1.19, 5e-3, 'b2');
  near(s2.l, 0.389, 5e-4, 'l2');
});

test('each solution really matches the line', () => {
  for (const type of ['short', 'open']) {
    for (const s of solveStub(load, type)) {
      const line = lineAt(load, { d: s.d, l: s.l, type, stubOn: true });
      near(line.yIn.re, 1, 1e-9, `${type} g`);
      near(line.yIn.im, 0, 1e-9, `${type} b`);
      near(line.vswrIn, 1, 1e-6, `${type} vswr`);
    }
  }
});

test('d = 0.112 λ is not a matching position for this load', () => {
  const line = lineAt(load, { d: 0.112, l: 0.25, type: 'short', stubOn: false });
  assert.ok(Math.abs(line.yD.re - 1) > 1, `g at 0.112 λ is ${line.yD.re}, nowhere near 1`);
});

test('outer-scale readings reproduce the chart construction', () => {
  const [s1, s2] = solveStub(load, 'short');
  near(load.wtgY, 0.1085, 5e-4);
  near(s1.wtg - load.wtgY, s1.d, 1e-9);
  near(s2.wtg - load.wtgY, s2.d, 1e-9);
  // short circuit sits at 0.25 on an admittance chart
  near(s1.wtgStub - 0.25, s1.l, 1e-9);
});

test('stub susceptance and its inverse agree', () => {
  for (const type of ['short', 'open']) {
    for (const b of [-5, -1.19, -0.2, 0.3, 1.19, 4]) {
      near(stubSusceptance(stubLengthFor(b, type), type), b, 1e-9, type);
    }
  }
  near(stubSusceptance(0.25, 'short'), 0, 1e-12, 'quarter-wave short stub is invisible');
});

test('voltage is continuous at the junction and flat on the matched feed line', () => {
  const [s1] = solveStub(load, 'short');
  const p = { d: s1.d, l: s1.l, type: 'short', stubOn: true };
  const line = lineAt(load, p);
  const v = makeVoltages(load, line, p);
  near(abs(v.main(s1.d - 1e-9)), abs(v.main(s1.d + 1e-9)), 1e-6, 'main line');
  near(abs(v.stub(s1.l)), abs(v.main(s1.d)), 1e-9, 'stub end meets junction');
  near(abs(v.stub(0)), 0, 1e-12, 'zero volts at the short');
  for (let s = s1.d + 0.01; s < 1.2; s += 0.05) near(abs(v.main(s)), 1, 1e-9, `|V| at ${s}`);
});

test('without a stub the standing wave swings between 1 − ρ and 1 + ρ', () => {
  const p = { d: 0.1, l: 0.2, type: 'short', stubOn: false };
  const v = makeVoltages(load, lineAt(load, p), p);
  let lo = Infinity, hi = -Infinity;
  for (let s = 0; s <= 0.5; s += 0.0005) {
    const m = abs(v.main(s));
    lo = Math.min(lo, m); hi = Math.max(hi, m);
  }
  near(hi, 1 + load.rho, 1e-4);
  near(lo, 1 - load.rho, 1e-4);
});

test('a matched load needs no stub', () => {
  assert.deepEqual(solveStub(analyseLoad(50, 50, 0)), []);
  assert.equal(abs(cx(3, 4)), 5);
});
