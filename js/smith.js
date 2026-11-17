/**
 * 2D Smith chart drawn on a canvas.
 *
 * The chart is read as an admittance chart once the load has been flipped
 * through the centre, exactly as in the pencil-and-compass method:
 * a normalised admittance y is plotted at (y − 1)/(y + 1).
 */
import { cx, neg, expj, mul, arg, chartPointOfY } from './emt.js';

const TAU = 2 * Math.PI;

export const COLORS = {
  grid: 'rgba(176, 194, 255, 0.17)',
  gridStrong: 'rgba(200, 214, 255, 0.34)',
  rim: 'rgba(226, 234, 255, 0.85)',
  text: 'rgba(226, 234, 255, 0.82)',
  dim: 'rgba(226, 234, 255, 0.5)',
  load: '#b9a7ff',
  distance: '#ffcf5c',
  stub: '#ff8177',
  matched: '#7dffb0',
  wave: '#6ef3ff',
};

const FONT = '"IBM Plex Sans", system-ui, sans-serif';

export function drawSmith(canvas, m) {
  const box = canvas.parentElement.getBoundingClientRect();
  const size = Math.floor(Math.min(box.width, box.height));
  if (size < 40) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = canvas.height = Math.round(size * dpr);
    canvas.style.width = canvas.style.height = `${size}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const small = size < 380;
  const pad = small ? 30 : 38;
  const R = size / 2 - pad;
  const c0 = size / 2;
  const P = (g) => [c0 + R * g.re, c0 - R * g.im];
  const fs = small ? 10.5 : 12;

  const circle = (g, r) => {
    const [x, y] = P(g);
    ctx.beginPath();
    ctx.arc(x, y, r * R, 0, TAU);
    ctx.stroke();
  };
  const dot = (g, r, fill, stroke) => {
    const [x, y] = P(g);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  };
  const label = (text, sub, x, y, color, align = 'left') => {
    ctx.font = `600 ${fs + 1}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w1 = ctx.measureText(text).width;
    ctx.font = `600 ${fs - 2}px ${FONT}`;
    const w2 = sub ? ctx.measureText(sub).width : 0;
    let x0 = x;
    if (align === 'right') x0 = x - w1 - w2;
    if (align === 'center') x0 = x - (w1 + w2) / 2;
    x0 = Math.max(2, Math.min(size - w1 - w2 - 2, x0));
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(6, 8, 26, 0.85)';
    ctx.fillStyle = color;
    ctx.font = `600 ${fs + 1}px ${FONT}`;
    ctx.strokeText(text, x0, y);
    ctx.fillText(text, x0, y);
    if (sub) {
      ctx.font = `600 ${fs - 2}px ${FONT}`;
      ctx.strokeText(sub, x0 + w1, y + 4);
      ctx.fillText(sub, x0 + w1, y + 4);
    }
  };
  const arrowHead = (from, to, color, s = 7) => {
    const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
    ctx.beginPath();
    ctx.moveTo(to[0], to[1]);
    ctx.lineTo(to[0] - s * Math.cos(a - 0.42), to[1] - s * Math.sin(a - 0.42));
    ctx.lineTo(to[0] - s * Math.cos(a + 0.42), to[1] - s * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const polyline = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };

  /* ---- grid ---- */
  ctx.save();
  ctx.beginPath();
  ctx.arc(c0, c0, R, 0, TAU);
  ctx.clip();
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.grid;
  for (const r of [0.2, 0.5, 2, 5]) circle(cx(r / (1 + r), 0), 1 / (1 + r));
  for (const x of [0.2, 0.5, 1, 2, 5]) {
    circle(cx(1, 1 / x), 1 / x);
    circle(cx(1, -1 / x), 1 / x);
  }
  ctx.beginPath();
  ctx.moveTo(c0 - R, c0);
  ctx.lineTo(c0 + R, c0);
  ctx.stroke();
  ctx.restore();

  // the g = 1 circle: the target the walk has to hit
  ctx.lineWidth = m.emphasiseUnitCircle ? 2 : 1.2;
  ctx.strokeStyle = m.emphasiseUnitCircle ? 'rgba(125, 255, 176, 0.8)' : 'rgba(125, 255, 176, 0.38)';
  circle(cx(0.5, 0), 0.5);

  ctx.lineWidth = 1.4;
  ctx.strokeStyle = COLORS.rim;
  circle(cx(0, 0), 1);

  /* ---- outer scale: wavelengths toward generator ---- */
  ctx.strokeStyle = COLORS.dim;
  ctx.fillStyle = COLORS.dim;
  ctx.lineWidth = 1;
  ctx.font = `500 ${fs - 1}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 20; i++) {
    const w = i * 0.025;
    const a = Math.PI - 2 * TAU * w; // chart angle for this reading
    const major = i % 2 === 0;
    const r1 = R + 3, r2 = R + (major ? 9 : 6);
    ctx.beginPath();
    ctx.moveTo(c0 + r1 * Math.cos(a), c0 - r1 * Math.sin(a));
    ctx.lineTo(c0 + r2 * Math.cos(a), c0 - r2 * Math.sin(a));
    ctx.stroke();
    if (major) {
      const rt = R + (small ? 19 : 23);
      ctx.fillText(w.toFixed(2), c0 + rt * Math.cos(a), c0 - rt * Math.sin(a));
    }
  }

  /* ---- constant |Γ| circle through the load ---- */
  const gL = m.gammaL;
  const yLpt = neg(gL);
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(185, 167, 255, 0.75)';
  circle(cx(0, 0), m.rho);
  ctx.setLineDash([]);

  /* ---- the two crossings with g = 1 ---- */
  if (m.flip >= 1 && m.showCrossings) {
    ctx.lineWidth = 1.5;
    m.solutions.forEach((s, i) => {
      const p = chartPointOfY(s.y);
      dot(p, 6.5, null, i === m.sol ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)');
      const [x, y] = P(p);
      label(String(i + 1), '', x + 10, y + (p.im > 0 ? -9 : 9), i === m.sol ? '#ffffff' : COLORS.dim);
    });
  }

  /* ---- load impedance, and its flip to admittance ---- */
  const [zx, zy] = P(gL);
  if (m.flip > 0) {
    const [yx, yy] = P(yLpt);
    const ex = zx + (yx - zx) * Math.min(1, m.flip);
    const ey = zy + (yy - zy) * Math.min(1, m.flip);
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.load;
    polyline([[zx, zy], [ex, ey]]);
    ctx.setLineDash([]);
    if (m.flip < 1) dot(cx((ex - c0) / R, -(ey - c0) / R), 4, COLORS.load);
  }
  ctx.lineWidth = 2;
  dot(gL, 5, 'rgba(6, 8, 26, 1)', COLORS.load);
  label('z', 'L', zx + (gL.re > 0 ? 9 : -9), zy + (gL.im > 0 ? -10 : 11), COLORS.load, gL.re > 0 ? 'left' : 'right');

  if (m.flip >= 1) {
    const [yx, yy] = P(yLpt);
    dot(yLpt, 5, COLORS.load);
    label('y', 'L', yx + (yLpt.re > 0 ? 9 : -9), yy + (yLpt.im > 0 ? -10 : 11), COLORS.load, yLpt.re > 0 ? 'left' : 'right');

    /* ---- walk toward the generator: clockwise by 4πd ---- */
    if (m.d > 1e-4) {
      const a0 = arg(yLpt);
      const turn = 2 * TAU * m.d;
      const n = Math.max(8, Math.ceil(turn * 14));
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(P(mul(cx(m.rho, 0), expj(a0 - (turn * i) / n))));
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = COLORS.distance;
      polyline(pts);
      arrowHead(pts[n - 1], pts[n], COLORS.distance, 9);

      // spokes out to the wavelength scale
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 207, 92, 0.5)';
      for (const a of [a0, a0 - turn]) {
        ctx.beginPath();
        ctx.moveTo(c0 + m.rho * R * Math.cos(a), c0 - m.rho * R * Math.sin(a));
        ctx.lineTo(c0 + (R + 9) * Math.cos(a), c0 - (R + 9) * Math.sin(a));
        ctx.stroke();
      }
    }

    const yDpt = chartPointOfY(m.yD);
    const [dx, dy] = P(yDpt);

    /* ---- stub: slide along constant g by the stub's susceptance ---- */
    if (m.stubOn) {
      const b = Math.max(-60, Math.min(60, m.bStub));
      const n = 48;
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(P(chartPointOfY(cx(m.yD.re, m.yD.im + (b * i) / n))));
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.stub;
      polyline(pts);
      if (Math.hypot(pts[n][0] - pts[0][0], pts[n][1] - pts[0][1]) > 10) arrowHead(pts[n - 1], pts[n], COLORS.stub, 9);

      // the stub's own length, read on the rim from its short (or open) end
      const start = m.type === 'open' ? Math.PI : 0;
      const turn = 2 * TAU * m.l;
      if (turn > 0.01) {
        ctx.beginPath();
        ctx.arc(c0, c0, R, -start, -start + turn); // canvas angles grow clockwise
        ctx.lineWidth = 4;
        ctx.strokeStyle = COLORS.stub;
        ctx.stroke();
        dot(expj(start - turn), 4, COLORS.stub);
      }
      ctx.lineCap = 'butt';

      const inPt = chartPointOfY(m.yIn);
      const matched = m.rhoIn < 0.02;
      if (matched) {
        const [ix, iy] = P(inPt);
        const glow = ctx.createRadialGradient(ix, iy, 0, ix, iy, 26);
        glow.addColorStop(0, 'rgba(125, 255, 176, 0.55)');
        glow.addColorStop(1, 'rgba(125, 255, 176, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(ix - 26, iy - 26, 52, 52);
      }
      ctx.lineWidth = 2;
      dot(inPt, 6, matched ? COLORS.matched : COLORS.stub, 'rgba(6, 8, 26, 0.9)');
      if (matched) label('matched', '', c0, c0 + 20, COLORS.matched, 'center');
    }
    ctx.lineCap = 'butt';

    if (m.d > 1e-4) {
      ctx.lineWidth = 2;
      dot(yDpt, 5.5, COLORS.distance, 'rgba(6, 8, 26, 0.9)');
      if (!(m.stubOn && m.rhoIn < 0.02 && Math.hypot(dx - c0, dy - c0) < 30)) {
        label('y(d)', '', dx + (yDpt.re >= 0 ? 10 : -10), dy + (yDpt.im >= 0 ? -11 : 12), COLORS.distance, yDpt.re >= 0 ? 'left' : 'right');
      }
    }
  }

  // "g = 1" tag sits inside the circle it names
  label('g = 1', '', c0 + 0.76 * R, c0 + 13, 'rgba(125, 255, 176, 0.9)', 'center');

  ctx.font = `500 ${fs - 1}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('Outer scale: wavelengths toward generator', 6, size - 6);
}
