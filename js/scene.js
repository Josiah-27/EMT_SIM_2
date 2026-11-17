/**
 * 3D view: a two-wire transmission line on a low-poly floating island.
 * Generator on the left, load on the right, stub branching toward the camera.
 * The ribbon between the wires is the instantaneous voltage.
 */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

const TAU = Math.PI * 2;
const LAM = 10;       // scene units per wavelength
const SPAN = 1;       // wavelengths of line on show
const H = 2.2;        // height of the wires
const GAP = 0.35;     // half the wire spacing
const DROP = 0.3;     // the stub hangs this far below the main line
const AMP = 0.9;      // scene units per volt (incident wave = 1 V)
const X_LOAD = (SPAN * LAM) / 2;
const N_MAIN = 140;
const N_STUB = 48;
const N_FLOW = 12;

const C = {
  ice: 0xd2ddf7, wire: 0xf1f4ff, wave: 0x6ef3ff, d: 0xffcf5c, stub: 0xff8177,
  ok: 0x7dffb0, load: 0xb9a7ff, leaf: 0x4fcf7c, trunk: 0xa9623a,
};

const flat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...extra });

const groundY = (x, z) => {
  const k = 1 - (x / 8.4) ** 2 - (z / 5.4) ** 2;
  return -0.375 + (k > 0 ? 0.375 * Math.sqrt(k) : 0);
};

function makeRibbon(n) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6).fill(1), 3));
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
      roughness: 0.55, metalness: 0, emissive: 0x16304a, emissiveIntensity: 0.9,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

function makeLine(n, color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  line.frustumCulled = false;
  return line;
}

export function createScene(canvas, labelLayer) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.5, 0.9);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 46;
  controls.maxPolarAngle = 1.52;
  const viewDir = new THREE.Vector3(-0.22, 0.62, 1).normalize();
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });

  scene.add(new THREE.HemisphereLight(0xdbe6ff, 0x2a2f6e, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(-6, 11, 7);
  scene.add(sun);

  /* ---- stars ---- */
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const starField = (count, size, opacity, map) => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1, a = rand() * TAU, r = 150 + rand() * 80, q = Math.sqrt(1 - u * u);
      p.set([r * q * Math.cos(a), r * u, r * q * Math.sin(a)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xe4eaff, size, sizeAttenuation: false, transparent: true, opacity, map,
      depthWrite: false, blending: map ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
  };
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const gctx = glowCanvas.getContext('2d');
  const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(220,228,255,0.55)');
  grad.addColorStop(1, 'rgba(160,180,255,0)');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 64, 64);
  scene.add(starField(1500, 1.5, 0.85), starField(70, 9, 0.9, new THREE.CanvasTexture(glowCanvas)));

  /* ---- island ---- */
  const islandGeo = new THREE.IcosahedronGeometry(1, 6);
  const ip = islandGeo.attributes.position;
  for (let i = 0; i < ip.count; i++) {
    const x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i);
    const w = 1 + 0.05 * Math.sin(6 * x + 1) * Math.cos(5 * z) + 0.04 * Math.sin(9 * z + 2 * x);
    const X = x * 8.4 * w, Z = z * 5.4 * w;
    const Y = y > 0
      ? y * 0.375 + 0.07 * Math.sin(2.1 * X + 0.4) * Math.cos(1.7 * Z) * Math.min(1, y * 4)
      : y * 2.5 * (1 + 0.18 * Math.sin(7 * x) * Math.cos(6 * z));
    ip.setXYZ(i, X, Y, Z);
  }
  islandGeo.computeVertexNormals();
  const island = new THREE.Mesh(islandGeo, flat(C.ice, { roughness: 0.95 }));
  island.position.y = -0.375;
  scene.add(island);

  /* ---- trees ---- */
  const leafMat = flat(C.leaf), trunkMat = flat(C.trunk);
  for (const [x, z, s] of [[-6.6, 2.0, 1], [-5.9, -2.7, 0.8], [6.7, -1.7, 0.9], [2.6, -3.9, 1.1], [-1.9, -4.2, 0.75], [6.2, 2.4, 0.7]]) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5), trunkMat);
    trunk.position.y = 0.25;
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 6), leafMat);
    c1.position.y = 0.8;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 6), leafMat);
    c2.position.y = 1.25;
    tree.add(trunk, c1, c2);
    tree.position.set(x, groundY(x, z) - 0.05, z);
    tree.scale.setScalar(s);
    tree.rotation.y = x;
    scene.add(tree);
  }

  /* ---- main line ---- */
  const wireMat = flat(C.wire, { metalness: 0.35, roughness: 0.45 });
  const wireGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6).rotateZ(Math.PI / 2);
  for (const z of [GAP, -GAP]) {
    const w = new THREE.Mesh(wireGeo, wireMat);
    w.scale.x = SPAN * LAM;
    w.position.set(0, H, z);
    scene.add(w);
  }
  const legMat = flat(0x8f9cc9);
  for (const x of [-4, -2, 0, 2, 4]) {
    for (const z of [GAP, -GAP]) {
      const g = groundY(x, z);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, H - g, 0.09), legMat);
      leg.position.set(x, (H + g) / 2, z);
      scene.add(leg);
    }
  }

  /* ---- generator ---- */
  const gen = new THREE.Group();
  gen.position.set(-X_LOAD - 0.75, H, 0);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), flat(C.d, { emissive: 0xb0701a, emissiveIntensity: 0.6 }));
  const cage = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.BoxGeometry(1.5, 1.5, 1.5, 3, 3, 3)),
    new THREE.LineBasicMaterial({ color: 0xcfd8ff, transparent: true, opacity: 0.55 }),
  );
  gen.add(core, cage);
  scene.add(gen);

  /* ---- load ---- */
  const loadMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshNormalMaterial({ flatShading: true }));
  loadMesh.position.set(X_LOAD + 0.72, H, 0);
  scene.add(loadMesh);
  for (const x of [gen.position.x, loadMesh.position.x]) {
    const g = groundY(x, 0);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, H - 0.8 - g, 6), legMat);
    post.position.set(x, (H - 0.8 + g) / 2, 0);
    scene.add(post);
  }

  /* ---- voltage on the main line ---- */
  const ribbon = makeRibbon(N_MAIN);
  const envTop = makeLine(N_MAIN, 0xffffff, 0.6);
  const envBot = makeLine(N_MAIN, 0xffffff, 0.6);
  scene.add(ribbon, envTop, envBot);
  const mainRe = new Float32Array(N_MAIN), mainIm = new Float32Array(N_MAIN);
  const sOf = (i) => (SPAN * i) / (N_MAIN - 1);
  {
    const p = ribbon.geometry.attributes.position;
    for (let i = 0; i < N_MAIN; i++) {
      const x = X_LOAD - sOf(i) * LAM;
      p.setXYZ(i * 2, x, H, -0.2);
      p.setXYZ(i * 2 + 1, x, H, 0.2);
    }
  }

  /* ---- power flow markers ---- */
  const flowGeo = new THREE.OctahedronGeometry(0.13, 0);
  const incident = new THREE.InstancedMesh(flowGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c2 }), N_FLOW);
  const reflected = new THREE.InstancedMesh(flowGeo, new THREE.MeshBasicMaterial({ color: C.stub }), N_FLOW);
  incident.frustumCulled = reflected.frustumCulled = false;
  scene.add(incident, reflected);
  const dummy = new THREE.Object3D();

  /* ---- distance marker ---- */
  const nodeMat = flat(C.d, { emissive: 0xb0701a, emissiveIntensity: 0.7 });
  const nodeA = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), nodeMat);
  const nodeB = nodeA.clone();
  const dStrip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.34), flat(C.d, { emissive: 0x8a5a10, emissiveIntensity: 0.5 }));
  const dTicks = [0, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), dStrip.material));
  scene.add(nodeA, nodeB, dStrip, ...dTicks);

  /* ---- stub ---- */
  const stub = new THREE.Group();
  scene.add(stub);
  const stubMat = flat(C.stub, { metalness: 0.2, roughness: 0.5 });
  const zWire = new THREE.CylinderGeometry(0.07, 0.07, 1, 6).rotateX(Math.PI / 2);
  const condA = new THREE.Mesh(zWire, stubMat);
  const condB = new THREE.Mesh(zWire, stubMat);
  const linkGeo = new THREE.CylinderGeometry(0.07, 0.07, DROP, 6);
  const linkA = new THREE.Mesh(linkGeo, stubMat);
  const linkB = new THREE.Mesh(linkGeo, stubMat);
  linkA.position.set(-0.3, H - DROP / 2, GAP);
  linkB.position.set(0.3, H - DROP / 2, -GAP);
  const shortBar = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.26, 0.2), flat(0xffffff, { emissive: C.stub, emissiveIntensity: 0.35 }));
  const openCaps = new THREE.Group();
  for (const x of [-0.3, 0.3]) {
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), flat(0xffffff));
    cap.position.x = x;
    openCaps.add(cap);
  }
  const stubRibbon = makeRibbon(N_STUB);
  const lStrip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 1), flat(C.stub, { emissive: 0x8a2c25, emissiveIntensity: 0.5 }));
  stub.add(condA, condB, linkA, linkB, shortBar, openCaps, stubRibbon, lStrip);
  const stubRe = new Float32Array(N_STUB), stubIm = new Float32Array(N_STUB);

  /* ---- labels ---- */
  const mk = (cls) => {
    const el = document.createElement('div');
    el.className = `label ${cls}`;
    labelLayer.appendChild(el);
    return el;
  };
  const labels = {
    gen: { el: mk('l-plain'), at: new THREE.Vector3(gen.position.x, H + 1.35, 0), on: true },
    load: { el: mk('l-load'), at: new THREE.Vector3(loadMesh.position.x, H + 1.3, 0), on: true },
    d: { el: mk('l-d'), at: new THREE.Vector3(), on: false },
    l: { el: mk('l-stub'), at: new THREE.Vector3(), on: false },
  };
  labels.gen.el.textContent = 'Generator';

  let model = null;
  const col = new THREE.Color();

  function setModel(m) {
    model = m;
    const xj = X_LOAD - m.d * LAM;
    const matched = m.stubOn && m.rhoIn < 0.02;

    // main line phasors, envelope and colours
    const colors = ribbon.geometry.attributes.color;
    const top = envTop.geometry.attributes.position, bot = envBot.geometry.attributes.position;
    for (let i = 0; i < N_MAIN; i++) {
      const s = sOf(i);
      const v = m.volt.main(s);
      mainRe[i] = v.re;
      mainIm[i] = v.im;
      const mag = Math.min(2.9, AMP * Math.hypot(v.re, v.im));
      const x = X_LOAD - s * LAM;
      top.setXYZ(i, x, H + mag, 0);
      bot.setXYZ(i, x, H - mag, 0);
      const feed = s >= m.d;
      col.set(feed ? (matched ? C.ok : C.wave) : C.load);
      colors.setXYZ(i * 2, col.r, col.g, col.b);
      colors.setXYZ(i * 2 + 1, col.r, col.g, col.b);
    }
    colors.needsUpdate = top.needsUpdate = bot.needsUpdate = true;

    // where the stub goes
    const showD = m.showD;
    nodeA.visible = nodeB.visible = showD;
    nodeA.position.set(xj - 0.3, H, GAP);
    nodeB.position.set(xj + 0.3, H, -GAP);
    const hasD = showD && m.d > 0.004;
    dStrip.visible = dTicks[0].visible = dTicks[1].visible = hasD;
    dStrip.scale.x = Math.max(0.001, m.d * LAM);
    dStrip.position.set((xj + X_LOAD) / 2, 0.14, 0);
    dTicks[0].position.set(xj, 0.14, 0);
    dTicks[1].position.set(X_LOAD, 0.14, 0);
    labels.d.on = showD;
    labels.d.at.set(X_LOAD + 1.5, 0.2, 0.2);
    labels.d.el.textContent = m.text.d;

    // the stub itself
    stub.visible = m.stubOn;
    stub.position.x = xj;
    const len = m.l * LAM, zEnd = GAP + len, yS = H - DROP;
    condA.scale.z = len;
    condA.position.set(-0.3, yS, GAP + len / 2);
    condB.scale.z = len + 2 * GAP;
    condB.position.set(0.3, yS, len / 2);
    shortBar.visible = m.type === 'short';
    openCaps.visible = m.type === 'open';
    shortBar.position.set(0, yS, zEnd);
    openCaps.position.set(0, yS, zEnd);
    lStrip.scale.z = Math.max(0.001, len);
    lStrip.position.set(0, 0.14, GAP + len / 2);
    const sp = stubRibbon.geometry.attributes.position, sc = stubRibbon.geometry.attributes.color;
    col.set(C.stub);
    for (let i = 0; i < N_STUB; i++) {
      const u = (m.l * i) / (N_STUB - 1);
      const v = m.volt.stub(u);
      stubRe[i] = v.re;
      stubIm[i] = v.im;
      const z = GAP + (m.l - u) * LAM;
      sp.setXYZ(i * 2, -0.17, yS, z);
      sp.setXYZ(i * 2 + 1, 0.17, yS, z);
      sc.setXYZ(i * 2, col.r, col.g, col.b);
      sc.setXYZ(i * 2 + 1, col.r, col.g, col.b);
    }
    sc.needsUpdate = true;
    labels.l.on = m.stubOn;
    labels.l.at.set(xj - 1.5, 0.2, GAP + len);
    labels.l.el.textContent = m.text.l;
    labels.load.el.textContent = m.text.load;
  }

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userMoved) {
      const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
      const dist = Math.max(12.5, 7.4 / Math.tan(half));
      camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
    }
  }
  new ResizeObserver(fit).observe(canvas.parentElement);
  fit();

  const tmp = new THREE.Vector3();
  const clampV = (v) => Math.max(-2.9, Math.min(2.9, v));

  function frame(wt, flow) {
    if (!model) return;
    const c = Math.cos(wt), s = Math.sin(wt);

    const p = ribbon.geometry.attributes.position;
    for (let i = 0; i < N_MAIN; i++) {
      const y = H + clampV(AMP * (mainRe[i] * c - mainIm[i] * s));
      p.setY(i * 2, y);
      p.setY(i * 2 + 1, y);
    }
    p.needsUpdate = true;

    if (model.stubOn) {
      const q = stubRibbon.geometry.attributes.position;
      for (let i = 0; i < N_STUB; i++) {
        const y = H - DROP + clampV(AMP * (stubRe[i] * c - stubIm[i] * s));
        q.setY(i * 2, y);
        q.setY(i * 2 + 1, y);
      }
      q.needsUpdate = true;
    }

    for (let i = 0; i < N_FLOW; i++) {
      const along = ((((i / N_FLOW) * SPAN + flow) % SPAN) + SPAN) % SPAN;
      // incident power heads for the load along the near wire
      dummy.position.set(-X_LOAD + along * LAM, H + 0.2, GAP);
      dummy.rotation.set(0, wt + i, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      incident.setMatrixAt(i, dummy.matrix);
      // reflected power heads back along the far wire, sized by |Γ| on that stretch
      const sBack = along;
      const rho = model.stubOn && sBack > model.d ? model.rhoIn : model.rhoL;
      dummy.position.set(X_LOAD - sBack * LAM, H + 0.2, -GAP);
      dummy.scale.setScalar(Math.max(0.0001, Math.min(1.5, rho * 1.9)));
      dummy.updateMatrix();
      reflected.setMatrixAt(i, dummy.matrix);
    }
    incident.instanceMatrix.needsUpdate = reflected.instanceMatrix.needsUpdate = true;

    loadMesh.rotation.y = wt * 0.12;
    loadMesh.rotation.x = 0.4;
    cage.rotation.y = -wt * 0.08;
    core.rotation.y = wt * 0.2;

    controls.update();
    renderer.render(scene, camera);

    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const k in labels) {
      const L = labels[k];
      tmp.copy(L.at).project(camera);
      const show = L.on && tmp.z < 1;
      L.el.style.opacity = show ? 1 : 0;
      if (show) {
        L.el.style.transform = `translate(-50%, -50%) translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
      }
    }
  }

  return {
    setModel,
    frame,
    resetView() {
      userMoved = false;
      fit();
    },
  };
}
