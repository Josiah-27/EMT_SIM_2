/**
 * Transmission-line maths for single-stub (shunt) matching.
 *
 * Conventions
 *  - Lengths are in wavelengths (λ). d is measured from the load toward the generator.
 *  - Impedances / admittances written in lower case are normalised to Z0 (or Y0 = 1/Z0).
 *  - Phasors use e^{+jωt}; the incident wave travels toward the load.
 *  - The line is lossless.
 */

const TAU = 2 * Math.PI;

/* ---------- complex helpers ---------- */

export const cx = (re, im = 0) => ({ re, im });
export const add = (a, b) => cx(a.re + b.re, a.im + b.im);
export const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
export const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const div = (a, b) => {
  const m = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / m, (a.im * b.re - a.re * b.im) / m);
};
export const scale = (a, k) => cx(a.re * k, a.im * k);
export const neg = (a) => cx(-a.re, -a.im);
export const abs = (a) => Math.hypot(a.re, a.im);
export const arg = (a) => Math.atan2(a.im, a.re);
export const expj = (theta) => cx(Math.cos(theta), Math.sin(theta));

const ONE = cx(1, 0);
const mod = (x, m) => ((x % m) + m) % m;

/* ---------- basic line relations ---------- */

/** Reflection coefficient of a normalised impedance z. */
export const gammaFromZ = (z) => div(sub(z, ONE), add(z, ONE));

/** Normalised admittance seen where the reflection coefficient is Γ. */
export const yFromGamma = (g) => div(sub(ONE, g), add(ONE, g));

/** Where a normalised admittance y sits on a chart read as an admittance chart. */
export const chartPointOfY = (y) => div(sub(y, ONE), add(y, ONE));

/** Γ after moving d wavelengths from the load toward the generator. */
export const gammaAt = (gammaL, d) => mul(gammaL, expj(-2 * TAU * d));

export const vswrOf = (rho) => (rho >= 1 ? Infinity : (1 + rho) / (1 - rho));

/**
 * Reading on the Smith chart's outer "wavelengths toward generator" scale
 * for a chart point p (0 at the left end, increasing clockwise, 0.5 per turn).
 */
export const wtgOf = (p) => mod((Math.PI - arg(p)) / (2 * TAU), 0.5);

/** Normalised susceptance of a lossless stub of length l (in λ). */
export function stubSusceptance(l, type = 'short') {
  const s = Math.sin(TAU * l);
  const c = Math.cos(TAU * l);
  const BIG = 1e6;
  if (type === 'open') return Math.abs(c) < 1e-9 ? BIG * Math.sign(s || 1) : s / c; //  tan βl
  return Math.abs(s) < 1e-9 ? -BIG * Math.sign(c || 1) : -c / s; // -cot βl
}

/** Shortest stub length (0 ≤ l < 0.5 λ) that gives the susceptance b. */
export function stubLengthFor(b, type = 'short') {
  if (type === 'open') return mod(Math.atan(b), Math.PI) / TAU; // tan βl = b
  return Math.atan2(1, -b) / TAU; // cot βl = -b, βl in (0, π)
}

/* ---------- the problem ---------- */

/** Everything that follows from the load alone. */
export function analyseLoad(Z0, R, X) {
  const zL = cx(R / Z0, X / Z0);
  const gammaL = gammaFromZ(zL);
  const rho = abs(gammaL);
  const yL = div(ONE, zL);
  return {
    Z0,
    ZL: cx(R, X),
    zL,
    yL,
    gammaL,
    rho,
    theta: arg(gammaL),
    vswr: vswrOf(rho),
    reflected: rho * rho,
    wtgZ: wtgOf(gammaL),
    wtgY: wtgOf(neg(gammaL)),
  };
}

/**
 * The two single-stub solutions.
 *
 * On the admittance chart the load travels clockwise on the circle |Γ| = ρ.
 * That circle meets the g = 1 circle where the chart angle φ obeys cos φ = ρ,
 * and there y = 1 ± j·2ρ/√(1 − ρ²). The stub supplies the opposite susceptance.
 */
export function solveStub(load, type = 'short') {
  const { rho, theta } = load;
  if (!(rho > 1e-9) || rho >= 1 - 1e-9) return [];
  const phi = Math.acos(rho);
  const b = (2 * rho) / Math.sqrt(1 - rho * rho);
  return [phi, -phi]
    .map((angle) => {
      const bLine = angle > 0 ? b : -b;
      const d = mod((theta + Math.PI - angle) / (2 * TAU), 0.5);
      const y = cx(1, bLine);
      return {
        d,
        l: stubLengthFor(-bLine, type),
        y,
        bStub: -bLine,
        wtg: wtgOf(chartPointOfY(y)),
        wtgStub: wtgOf(chartPointOfY(cx(0, -bLine))),
      };
    })
    .sort((p, q) => p.d - q.d);
}

/** What the generator sees for a stub of length l placed d from the load. */
export function lineAt(load, { d, l, type = 'short', stubOn = true }) {
  const gammaD = gammaAt(load.gammaL, d);
  const yD = yFromGamma(gammaD);
  const bStub = stubOn ? stubSusceptance(l, type) : 0;
  const yIn = cx(yD.re, yD.im + bStub);
  const gammaIn = div(sub(ONE, yIn), add(ONE, yIn));
  const rhoIn = Math.min(1, abs(gammaIn));
  return {
    gammaD,
    yD,
    bStub,
    yIn,
    gammaIn,
    rhoIn,
    vswrIn: vswrOf(rhoIn),
    reflectedIn: rhoIn * rhoIn,
  };
}

/**
 * Steady-state voltage phasors for a unit incident wave from a matched generator.
 *   main(s): on the main line, s wavelengths from the load
 *   stub(u): on the stub, u wavelengths from its far (short or open) end
 * Instantaneous voltage is Re{ V · e^{jωt} }.
 */
export function makeVoltages(load, line, { d, l, type = 'short', stubOn = true }) {
  const gL = load.gammaL;
  const pattern = (s) => add(expj(TAU * s), mul(gL, expj(-TAU * s)));
  if (!stubOn) return { main: pattern, stub: () => cx(0, 0) };

  const vJunction = mul(expj(TAU * d), add(ONE, line.gammaIn));
  const loadSide = div(vJunction, pattern(d));
  const reflectedAtJunction = mul(line.gammaIn, expj(TAU * d));

  const main = (s) =>
    s <= d
      ? mul(loadSide, pattern(s))
      : add(expj(TAU * s), mul(reflectedAtJunction, expj(-TAU * (s - d))));

  const end = type === 'open' ? Math.cos(TAU * l) : Math.sin(TAU * l);
  const stub = (u) => {
    if (Math.abs(end) < 1e-5) return cx(0, 0);
    const shape = type === 'open' ? Math.cos(TAU * u) : Math.sin(TAU * u);
    return scale(vJunction, shape / end);
  };
  return { main, stub };
}

/* ---------- formatting ---------- */

const MINUS = '−';

export function fmt(x, digits = 2) {
  if (!Number.isFinite(x)) return '∞';
  const r = Number(x.toFixed(digits));
  const s = Math.abs(r).toFixed(digits);
  return (r < 0 ? MINUS : '') + s;
}

/** "0.70 − j0.95" */
export function fmtComplex(c, digits = 2) {
  const im = Number(c.im.toFixed(digits));
  return `${fmt(c.re, digits)} ${im < 0 ? MINUS : '+'} j${Math.abs(im).toFixed(digits)}`;
}

/** "−j1.19" */
export function fmtJ(b, digits = 2) {
  if (Math.abs(b) > 999) return (b < 0 ? MINUS : '+') + 'j∞';
  const r = Number(b.toFixed(digits));
  return `${r < 0 ? MINUS : '+'}j${Math.abs(r).toFixed(digits)}`;
}
