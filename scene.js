// "One Line" — a single ink line threads through six minimalist sculptures.
// Only lines & points, no textures or models: tiny, fast, free-host friendly.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, ColorManagement, LinearSRGBColorSpace,
  Vector2, Vector3, Group, BufferGeometry, Float32BufferAttribute, Line, LineLoop, LineSegments,
  LineBasicMaterial, LineDashedMaterial, Points, ShaderMaterial, Mesh,
  TubeGeometry, CatmullRomCurve3, EdgesGeometry, IcosahedronGeometry, BoxGeometry,
  CylinderGeometry, OctahedronGeometry, Raycaster, Plane, Fog,
} from 'three';

const J = window.journey || { c: 0, reduced: false, filter: 'all' };
const root = document.documentElement;
const canvas = document.getElementById('scene');
const MOBILE = matchMedia('(pointer: coarse)').matches;
const REDUCED = J.reduced;
const TAU = Math.PI * 2;

let renderer;
try {
  renderer = new WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  root.classList.add('no-gl');
}
if (renderer) start();

function start() {
  // Pass colours straight through: CSS hex in, same hex out (custom shaders included).
  ColorManagement.enabled = false;
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  // ---------- Palette (Color objects are shared by reference, so a theme swap is 4 writes) ----------
  const pal = { ink: new Color(), muted: new Color(), accent: new Color(), bg: new Color() };
  const readPalette = () => {
    const cs = getComputedStyle(root);
    pal.ink.set(cs.getPropertyValue('--ink').trim());
    pal.muted.set(cs.getPropertyValue('--line').trim());
    pal.accent.set(cs.getPropertyValue('--accent').trim());
    pal.bg.set(cs.getPropertyValue('--bg').trim());
  };
  readPalette();
  addEventListener('themechange', readPalette);

  // Uniforms shared by every custom shader
  const U = { uPR: { value: 1 }, uNear: { value: 14 }, uFar: { value: 40 }, uTime: { value: 0 } };

  const scene = new Scene();
  scene.fog = new Fog(0xffffff, 14, 40);
  scene.fog.color = pal.bg;
  const camera = new PerspectiveCamera(42, 1, 0.1, 200);

  // ---------- Helpers ----------
  const geo = (pts) => new BufferGeometry().setFromPoints(pts);
  const lineMat = (color, opacity = 1) => {
    const m = new LineBasicMaterial({ transparent: opacity < 1, opacity });
    m.color = color;
    return m;
  };
  const arc = (r, n = 96, a0 = 0, a1 = TAU) => {
    const p = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); p.push(new Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    return p;
  };
  const edges = (g, color, opacity) => new LineSegments(new EdgesGeometry(g), lineMat(color, opacity));
  const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
  const smooth = (x) => x * x * (3 - 2 * x);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  let seed = 7;
  const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const DOT_VS = `uniform float uSize,uPR,uNear,uFar; varying float vF;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=uSize*uPR*(24./-mv.z); vF=1.-smoothstep(uNear,uFar,-mv.z); }`;
  const DOT_FS = `uniform vec3 uColor; uniform float uOpacity; varying float vF;
    void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard;
      gl_FragColor=vec4(uColor,smoothstep(.5,.3,d)*uOpacity*vF); }`;
  const dotMat = (color, size, opacity = 1) => new ShaderMaterial({
    uniforms: { uColor: { value: color }, uSize: { value: size }, uOpacity: { value: opacity }, uPR: U.uPR, uNear: U.uNear, uFar: U.uFar },
    vertexShader: DOT_VS, fragmentShader: DOT_FS, transparent: true, depthWrite: false,
  });
  const dots = (pts, mat) => { const p = new Points(geo(pts), mat); p.frustumCulled = false; return p; };

  // ---------- World layout ----------
  const A = [
    new Vector3(0, 0, 0), new Vector3(15, 2, -20), new Vector3(-3, -1, -42),
    new Vector3(16, 3, -62), new Vector3(1, 6, -84), new Vector3(8, 1, -106),
  ];
  const SIDE = [1, -1, 1, -1, 1, -1];      // which side of the screen the sculpture sits (desktop)
  const YAW = [0, 0.32, -0.28, 0.38, -0.22, 0];
  // Small per-chapter nudges so each sculpture clears the text column and rail.
  const NUDGE = [0, 0, -0.6, -0.8, 0, 0].map((x) => new Vector3(x, 0, 0));

  // ---------- 00 · Hero: one-line knot + cursor-reactive ripple field ----------
  function buildHero() {
    const group = new Group(), spin = new Group();
    group.add(spin);
    const N = 560, kp = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, r = Math.cos(3 * a) + 2.1;
      kp.push(new Vector3(r * Math.cos(2 * a), r * Math.sin(2 * a), -Math.sin(3 * a) * 1.1));
    }
    spin.add(new LineLoop(geo(kp), lineMat(pal.ink)));
    const trav = dots([new Vector3()], dotMat(pal.accent, 11));
    spin.add(trav);

    const step = MOBILE ? 0.75 : 0.5, pos = [];
    for (let x = -14; x <= 14; x += step) for (let y = -8; y <= 8; y += step) pos.push(x, y, 0);
    const fg = new BufferGeometry();
    fg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const fmat = new ShaderMaterial({
      uniforms: {
        uColor: { value: pal.muted }, uAccent: { value: pal.accent }, uMouse: { value: new Vector2(99, 99) },
        uAmp: { value: 0 }, uSize: { value: 2.3 }, uPR: U.uPR, uNear: U.uNear, uFar: U.uFar, uTime: U.uTime,
      },
      vertexShader: `uniform float uSize,uPR,uNear,uFar,uTime,uAmp; uniform vec2 uMouse; varying float vF,vH;
        void main(){ vec3 p=position; float d=distance(p.xy,uMouse);
          float r=sin(d*1.5-uTime*3.2)*exp(-d*.32)*uAmp;
          p.z+=r*1.3+sin(p.x*.3+uTime*.5)*cos(p.y*.45+uTime*.35)*.4;
          vH=clamp(abs(r)*1.6,0.,1.);
          vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=uSize*(1.+vH*1.2)*uPR*(24./-mv.z); vF=1.-smoothstep(uNear,uFar,-mv.z); }`,
      fragmentShader: `uniform vec3 uColor,uAccent; varying float vF,vH;
        void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard;
          gl_FragColor=vec4(mix(uColor,uAccent,vH),smoothstep(.5,.3,d)*(.45+.55*vH)*vF); }`,
      transparent: true, depthWrite: false,
    });
    const field = new Points(fg, fmat);
    field.position.z = -4;
    field.frustumCulled = false;
    group.add(field);

    const plane = new Plane(), hit = new Vector3(), n = new Vector3(), wp = new Vector3();
    const mouse = fmat.uniforms.uMouse.value;
    return {
      group, spin, auto: 0.18,
      hotspots: [{ obj: trav, local: new Vector3(), title: 'That’s me', text: 'Follow the line. Scroll to travel through the journey.' }],
      update(t, dt) {
        spin.rotation.x = Math.sin(t * 0.2) * 0.3;
        trav.position.copy(kp[Math.floor(((t * 0.06) % 1) * N)]);
        // Ripple source: the cursor when it's moving, otherwise a slow wandering point.
        let tx = Math.sin(t * 0.3) * 6, ty = Math.cos(t * 0.23) * 3, amp = 0.35;
        if (ptr.mouse && performance.now() - ptr.lastMove < 1500) {
          raycaster.setFromCamera(ptr.ndc, camera);
          plane.setFromNormalAndCoplanarPoint(n.set(0, 0, 1).transformDirection(field.matrixWorld), field.getWorldPosition(wp));
          if (raycaster.ray.intersectPlane(plane, hit)) { field.worldToLocal(hit); tx = hit.x; ty = hit.y; amp = 1; }
        }
        mouse.x = damp(mouse.x > 50 ? tx : mouse.x, tx, 6, dt);
        mouse.y = damp(mouse.y > 50 ? ty : mouse.y, ty, 6, dt);
        fmat.uniforms.uAmp.value = damp(fmat.uniforms.uAmp.value, amp, 2, dt);
      },
    };
  }

  // ---------- 01 · Clemson: ~30k records as a point cloud that settles into a bar chart ----------
  function buildClemson() {
    const group = new Group(), spin = new Group();
    group.add(spin);
    const n = MOBILE ? 1500 : 3000;
    const HS = [1.6, 2.6, 2.1, 3.6, 3.0, 4.6, 3.3], BW = 0.52, GAP = 0.2, X0 = -2.42, BASE = -2.3, HOT = 5;
    const total = HS.reduce((a, b) => a + b, 0);
    const bar = new Float32Array(n * 3), sc = new Float32Array(n * 3), sd = new Float32Array(n), acc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let r = rand() * total, k = 0;
      while (r > HS[k]) { r -= HS[k]; k++; }
      bar.set([X0 + k * (BW + GAP) + rand() * BW, BASE + rand() * HS[k], (rand() - 0.5) * 0.5], i * 3);
      const u = rand() * TAU, v = Math.acos(2 * rand() - 1), rr = 3.4 * Math.cbrt(rand());
      sc.set([rr * Math.sin(v) * Math.cos(u), rr * Math.cos(v), rr * Math.sin(v) * Math.sin(u)], i * 3);
      sd[i] = rand(); acc[i] = k === HOT ? 1 : 0;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(bar, 3));
    g.setAttribute('aScatter', new Float32BufferAttribute(sc, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(sd, 1));
    g.setAttribute('aAcc', new Float32BufferAttribute(acc, 1));
    const mat = new ShaderMaterial({
      uniforms: { uColor: { value: pal.ink }, uAccent: { value: pal.accent }, uMix: { value: 1 }, uSize: { value: 1.7 }, uPR: U.uPR, uNear: U.uNear, uFar: U.uFar, uTime: U.uTime },
      vertexShader: `attribute vec3 aScatter; attribute float aSeed,aAcc;
        uniform float uSize,uPR,uNear,uFar,uTime,uMix; varying float vF,vA;
        void main(){ float m=clamp(uMix*1.6-aSeed*.6,0.,1.); m=m*m*(3.-2.*m);
          vec3 p=mix(position,aScatter,m);
          p+=vec3(sin(uTime*.9+aSeed*50.),cos(uTime*.7+aSeed*80.),0.)*.04*(.3+m);
          vA=aAcc; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=uSize*uPR*(24./-mv.z); vF=1.-smoothstep(uNear,uFar,-mv.z); }`,
      fragmentShader: `uniform vec3 uColor,uAccent; varying float vF,vA;
        void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard;
          gl_FragColor=vec4(mix(uColor,uAccent,vA),smoothstep(.5,.3,d)*vF*(.75+.25*vA)); }`,
      transparent: true, depthWrite: false,
    });
    const cloud = new Points(g, mat);
    cloud.frustumCulled = false;
    spin.add(cloud);
    const R = X0 + 7 * BW + 6 * GAP + 0.4;
    spin.add(new Line(geo([new Vector3(X0 - 0.4, 2.8, 0), new Vector3(X0 - 0.4, BASE - 0.25, 0), new Vector3(R, BASE - 0.25, 0)]), lineMat(pal.muted)));
    const ticks = [];
    for (let k = 0; k < 7; k++) { const x = X0 + k * (BW + GAP) + BW / 2; ticks.push(new Vector3(x, BASE - 0.25, 0), new Vector3(x, BASE - 0.45, 0)); }
    spin.add(new LineSegments(geo(ticks), lineMat(pal.muted)));

    const topOf = (k) => new Vector3(X0 + k * (BW + GAP) + BW / 2, BASE + HS[k] + 0.15, 0);
    const hotspots = [
      { obj: spin, local: topOf(HOT), title: 'Healthcare analytics prototype', text: '~30,000 patient records · Python backend → React front end' },
      { obj: spin, local: topOf(3), title: 'Interactive Plotly visualisations', text: 'Exploratory analysis for university research' },
    ];
    const centre = new Vector3();
    return {
      group, spin, auto: 0, spring: true, hotspots,
      update(t, dt, local) {
        // Scattered while travelling or hovered; settles into the chart when you arrive.
        let hover = false;
        if (ptr.mouse && !ptr.overUI) {
          const s = toScreen(group.getWorldPosition(centre));
          hover = Math.hypot(s.x - ptr.x, s.y - ptr.y) < Math.min(W, H) * 0.22;
        }
        const target = hover || Math.abs(local) > 0.3 ? 1 : 0;
        mat.uniforms.uMix.value = damp(mat.uniforms.uMix.value, target, target ? 3 : 1.6, dt);
        const settled = mat.uniforms.uMix.value < 0.25;
        hotspots.forEach((h) => (h.active = settled));
      },
    };
  }

  // ---------- 02 · Capital One: risk gauge, 8 orbiting endpoints, 3 data stores ----------
  function buildCapOne() {
    const group = new Group(), spin = new Group();
    group.add(spin);
    const A0 = -Math.PI / 6, A1 = (Math.PI * 7) / 6;
    spin.add(new Line(geo(arc(2.6, 80, A0, A1)), lineMat(pal.muted)));
    const tk = [];
    for (let i = 0; i <= 24; i++) {
      const a = A1 - (i / 24) * (A1 - A0), r2 = i % 4 === 0 ? 3.15 : 2.98;
      tk.push(new Vector3(Math.cos(a) * 2.8, Math.sin(a) * 2.8, 0), new Vector3(Math.cos(a) * r2, Math.sin(a) * r2, 0));
    }
    spin.add(new LineSegments(geo(tk), lineMat(pal.ink)));
    const score = new Line(geo(arc(2.6, 120, A1, A0)), lineMat(pal.accent));
    score.position.z = 0.01;
    spin.add(score);
    [1.1, 1.7].forEach((r) => spin.add(new LineLoop(geo(arc(r, 72)), lineMat(pal.muted, 0.5))));
    const needle = new Line(geo([new Vector3(0, 0, 0), new Vector3(2.25, 0, 0)]), lineMat(pal.accent));
    spin.add(needle, dots([new Vector3()], dotMat(pal.accent, 12)));

    const orbit = new Group(), orbitSpin = new Group();
    orbit.rotation.x = 1.22;
    orbit.add(orbitSpin);
    spin.add(orbit);
    const ring = new LineLoop(geo(arc(3.4, 120)), new LineDashedMaterial({ dashSize: 0.18, gapSize: 0.14 }));
    ring.material.color = pal.muted;
    ring.computeLineDistances();
    orbitSpin.add(ring);
    const nodes = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; nodes.push(new Vector3(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0)); }
    orbitSpin.add(dots(nodes, dotMat(pal.ink, 9)));

    const hub = new Vector3(0, -1.15, 0), stores = [], links = [];
    const defs = [
      [new CylinderGeometry(0.34, 0.34, 0.6, 16, 1), 'PostgreSQL'],
      [new BoxGeometry(0.58, 0.58, 0.58), 'DynamoDB'],
      [new OctahedronGeometry(0.42), 'Redis'],
    ];
    defs.forEach(([g], i) => {
      const s = edges(g, pal.ink);
      s.position.set((i - 1) * 1.7, -3.3, 0);
      stores.push(s); spin.add(s);
      links.push(hub, s.position.clone().setY(-2.95));
    });
    spin.add(new LineSegments(geo(links), lineMat(pal.muted, 0.6)));

    const hotspots = [
      ...nodes.map((p, i) => ({ obj: orbitSpin, local: p, title: `Endpoint ${String(i + 1).padStart(2, '0')} / 08`, text: 'Risk Pre-Check service · Java 17 · Spring Boot' })),
      ...stores.map((s, i) => ({ obj: spin, local: s.position, title: defs[i][1], text: 'Queried & updated by the risk-scoring workflow' })),
      { obj: needle, local: new Vector3(2.25, 0, 0), title: 'ML risk score', text: 'Integrated from the internal Feature Store / ML Engine API' },
    ];
    return {
      group, spin, auto: 0, spring: true, hotspots,
      update(t) {
        const s = 0.64 + 0.16 * Math.sin(t * 0.45) + 0.05 * Math.sin(t * 1.3);
        score.geometry.setDrawRange(0, Math.floor(s * 121));
        needle.rotation.z = A1 - s * (A1 - A0);
        orbitSpin.rotation.z = t * 0.18;
        stores.forEach((m, i) => (m.rotation.y = t * 0.4 + i));
      },
    };
  }

  // ---------- 03 · JPMorgan Chase: xref graph (13 consumers), isolated VPC, ECDH/AES lock ----------
  function buildJPMC() {
    const group = new Group(), spin = new Group();
    group.add(spin);
    spin.add(edges(new IcosahedronGeometry(0.62, 0), pal.accent));
    const nodes = [], seg = [];
    for (let i = 0; i < 13; i++) {
      const y = 1 - ((i + 0.5) / 13) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      const p = new Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(2.8);
      nodes.push(p);
      seg.push(p.clone().setLength(0.62), p);
    }
    spin.add(new LineSegments(geo(seg), lineMat(pal.muted, 0.7)));
    spin.add(dots(nodes, dotMat(pal.ink, 9)));
    const packets = dots(nodes.map(() => new Vector3()), dotMat(pal.accent, 6));
    spin.add(packets);
    const hl = new Line(geo([new Vector3(), new Vector3()]), lineMat(pal.accent));
    hl.visible = false;
    spin.add(hl);

    const box = new LineSegments(new EdgesGeometry(new BoxGeometry(6.0, 6.4, 2.2)), new LineDashedMaterial({ dashSize: 0.22, gapSize: 0.16 }));
    box.material.color = pal.muted;
    box.computeLineDistances();
    group.add(box);

    // Padlock drawn in one stroke; the shackle swings open as you arrive.
    const lock = new Group();
    lock.position.set(-2.3, -2.3, 1.1);
    const w = 0.5, h = 0.4, rr = 0.1, body = [];
    [[w - rr, h - rr, 0], [-w + rr, h - rr, 1], [-w + rr, -h + rr, 2], [w - rr, -h + rr, 3]].forEach(([cx, cy, q]) =>
      arc(rr, 6, (q * Math.PI) / 2, ((q + 1) * Math.PI) / 2).forEach((p) => body.push(p.add(new Vector3(cx, cy, 0)))));
    lock.add(new LineLoop(geo(body), lineMat(pal.ink)));
    lock.add(new LineLoop(geo(arc(0.09, 24).map((p) => p.setY(p.y + 0.06))), lineMat(pal.ink)));
    lock.add(new Line(geo([new Vector3(0, -0.03, 0), new Vector3(0, -0.2, 0)]), lineMat(pal.ink)));
    const shackle = new Group();
    shackle.position.set(0.3, h, 0);
    const shMat = lineMat(pal.ink);
    shackle.add(new Line(geo([new Vector3(-0.6, 0, 0), ...arc(0.3, 24, Math.PI, 0).map((p) => p.add(new Vector3(-0.3, 0.3, 0))), new Vector3(0, 0, 0)]), shMat));
    lock.add(shackle);
    group.add(lock);

    const hotspots = [
      ...nodes.map((p, i) => ({
        obj: spin, local: p, title: `Service ${String(i + 1).padStart(2, '0')} → xref`, text: 'One of 13 internal microservices consuming xref over GraphQL',
        onHover(on) { hl.visible = on; if (on) { hl.geometry.attributes.position.setXYZ(0, 0, 0, 0); hl.geometry.attributes.position.setXYZ(1, p.x, p.y, p.z); hl.geometry.attributes.position.needsUpdate = true; } },
      })),
      { obj: spin, local: new Vector3(), title: 'xref', text: 'GraphQL cross-reference mapping service · CockroachDB' },
      { obj: lock, local: new Vector3(), title: 'Card-data decryption', text: 'ECDH + AES-256-GCM · used by virtual & physical card services' },
      { obj: group, local: new Vector3(-3.2, 3.2, 1.1), title: 'Isolated VPC', text: 'Containerised on AWS ECS · provisioned with EAC (Terraform) · CloudWatch' },
    ];
    const pp = packets.geometry.attributes.position;
    let unlock = 0;
    return {
      group, spin, auto: 0.12, hotspots,
      update(t, dt, local) {
        nodes.forEach((p, i) => {
          const f = (t * 0.35 + i * 0.137) % 1;
          pp.setXYZ(i, p.x * (1 - f), p.y * (1 - f), p.z * (1 - f));
        });
        pp.needsUpdate = true;
        unlock = damp(unlock, clamp01((local + 0.45) / 0.4), 3, dt);
        shackle.position.y = h + 0.26 * unlock;
        shackle.rotation.y = -unlock * 1.1;
        shMat.color = unlock > 0.6 ? pal.accent : pal.ink;
      },
    };
  }

  // ---------- 04 · Skills constellation ----------
  const SKILLS = [
    ['lang', 'Languages', ['Java', 'Python', 'SQL', 'JavaScript']],
    ['backend', 'Backend & APIs', ['Spring Boot', 'RESTful APIs', 'Microservices', 'GraphQL', 'Node.js / Express']],
    ['frontend', 'Frontend', ['React', 'Angular', 'NgRx']],
    ['data', 'Databases', ['PostgreSQL', 'Cassandra', 'CockroachDB', 'DynamoDB', 'MongoDB', 'Redis']],
    ['cloud', 'Cloud & DevOps', ['AWS EC2', 'ECS', 'Fargate', 'Lambda', 'S3', 'VPC', 'CloudWatch', 'Secrets Manager', 'Docker', 'Terraform / EAC', 'Git', 'CI/CD']],
    ['ai', 'AI Tooling', ['Claude AI skills', 'GenAI workflows']],
    ['quality', 'Testing & Quality', ['JUnit', 'Cucumber (BDD)', 'SonarQube', 'Postman']],
    ['design', 'System Design', ['DS & Algorithms', 'Design Patterns', 'OOD', 'SOA']],
  ];
  const skillSets = [];
  function buildSkills() {
    const group = new Group(), spin = new Group();
    group.add(spin);
    const hotspots = [];
    SKILLS.forEach(([key, label, list], k) => {
      const a = (k / SKILLS.length) * TAU + 0.3;
      const c = new Vector3(Math.cos(a) * 3.0, Math.sin(a) * 2.6, k % 2 ? 0.9 : -0.9);
      const rad = 0.4 + list.length * 0.05;
      const stars = list.map(() => {
        const t = rand() * TAU, d = rad * (0.35 + 0.65 * Math.sqrt(rand()));
        return new Vector3(Math.cos(t) * d, Math.sin(t) * d, (rand() - 0.5) * 0.6).add(c);
      });
      const order = stars.map((p, i) => i).sort((i, j) => Math.atan2(stars[i].y - c.y, stars[i].x - c.x) - Math.atan2(stars[j].y - c.y, stars[j].x - c.x));
      const chain = [];
      for (let i = 1; i < order.length; i++) chain.push(stars[order[i - 1]], stars[order[i]]);
      const lmat = lineMat(pal.muted, 0.8);
      lmat.transparent = true;
      const pmat = dotMat(pal.ink, 7);
      spin.add(new LineSegments(geo(chain.length ? chain : [c, c]), lmat), dots(stars, pmat));
      skillSets.push({ key, pmat, lmat });
      stars.forEach((p, i) => hotspots.push({ obj: spin, local: p, title: list[i], text: label, onClick: () => J.setFilter?.(key) }));
    });
    return { group, spin, auto: 0.08, hotspots, update() {} };
  }
  function applySkill(cat) {
    skillSets.forEach(({ key, pmat, lmat }) => {
      const on = cat === 'all' || key === cat, hi = on && cat !== 'all';
      pmat.uniforms.uColor.value = hi ? pal.accent : pal.ink;
      pmat.uniforms.uSize.value = hi ? 11 : 7;
      pmat.uniforms.uOpacity.value = on ? 1 : 0.2;
      lmat.color = hi ? pal.accent : pal.muted;
      lmat.opacity = on ? 0.8 : 0.12;
    });
  }
  addEventListener('skillfilter', (e) => applySkill(e.detail));

  // ---------- 05 · Finale: three certification hexagons, the line closes into a circle ----------
  function buildFinale() {
    const group = new Group(), spin = new Group();
    group.add(spin);
    const ring = new Line(geo(arc(4.2, 180, -Math.PI / 2, (Math.PI * 3) / 2)), lineMat(pal.accent));
    group.add(ring);
    const pulse = dotMat(pal.accent, 10);
    spin.add(dots([new Vector3()], pulse));
    const CERTS = [
      ['AWS Certified Solutions Architect', 'Associate · Amazon Web Services', new BoxGeometry(0.6, 0.6, 0.6)],
      ['Azure Developer Associate', 'Microsoft Certified', new OctahedronGeometry(0.42)],
      ['Azure AI Engineer Associate', 'Microsoft Certified', new IcosahedronGeometry(0.4, 0)],
    ];
    const hexes = CERTS.map(([, , g], k) => {
      const a = Math.PI / 2 + (k * TAU) / 3, h = new Group();
      h.position.set(Math.cos(a) * 2.05, Math.sin(a) * 2.05, 0);
      h.add(new LineLoop(geo(arc(0.95, 6).slice(0, 6).map((p) => p.applyAxisAngle(new Vector3(0, 0, 1), Math.PI / 6))), lineMat(pal.ink)));
      const glyph = edges(g, pal.muted);
      h.add(glyph);
      h.userData.glyph = glyph;
      spin.add(h);
      return h;
    });
    const credly = 'https://www.credly.com/users/vishnu-vulli/badges/credly';
    const hotspots = hexes.map((h, k) => ({ obj: h, local: new Vector3(), title: CERTS[k][0], text: `${CERTS[k][1]} · click to verify on Credly`, onClick: () => open(credly, '_blank', 'noopener') }));
    let prog = 0;
    return {
      group, spin, auto: 0, spring: true, hotspots,
      update(t, dt, local) {
        prog = damp(prog, clamp01((local + 0.7) / 0.7), 2.5, dt);
        ring.geometry.setDrawRange(0, Math.floor(prog * 181));
        hexes.forEach((h, k) => {
          h.position.z = Math.sin(t * 0.9 + k * 2) * 0.25;
          h.rotation.y = Math.sin(t * 0.5 + k) * 0.35;
          h.userData.glyph.rotation.set(t * 0.4, t * 0.6 + k, 0);
        });
        pulse.uniforms.uSize.value = 9 + Math.sin(t * 2.4) * 3;
      },
    };
  }

  // ---------- Pointer state (declared before builders run their update) ----------
  const ptr = { x: -9999, y: -9999, ndc: new Vector2(), mouse: false, lastMove: 0, overUI: false, down: false, lx: 0, dragged: 0 };
  const raycaster = new Raycaster();
  const isUI = (el) => !!el?.closest?.('.panel, a, button, header, .rail');

  const chapters = [buildHero(), buildClemson(), buildCapOne(), buildJPMC(), buildSkills(), buildFinale()];
  chapters.forEach((ch, i) => {
    ch.group.position.copy(A[i]).add(NUDGE[i]);
    ch.group.rotation.y = YAW[i];
    ch.drag = 0;
    scene.add(ch.group);
  });
  applySkill(J.filter || 'all');

  // ---------- The journey line: an ink tube threading every chapter, drawn as you scroll ----------
  const jp = [A[0].clone().add(new Vector3(-15, -3.5, 3))];
  for (let i = 0; i < 6; i++) {
    const p = A[i].clone().add(i === 5 ? new Vector3(0, -4.2, 0) : new Vector3(0, -3.3, -1.5));
    if (i > 0) {
      const prev = jp[jp.length - 1];
      jp.push(prev.clone().lerp(p, 0.5).add(new Vector3(Math.sin(i * 1.7) * 3, i % 2 ? 3 : -2, 0)));
    }
    jp.push(p);
  }
  const path = new CatmullRomCurve3(jp);
  const SEGS = MOBILE ? 500 : 900, RADIAL = 5;
  const tube = new Mesh(new TubeGeometry(path, SEGS, 0.045, RADIAL, false), new ShaderMaterial({
    uniforms: { uColor: { value: pal.ink }, uNear: U.uNear, uFar: U.uFar },
    vertexShader: `uniform float uNear,uFar; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        vA=smoothstep(4.,10.,-mv.z)*(1.-smoothstep(uNear,uFar,-mv.z)); }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor=vec4(uColor,vA); }`,
    transparent: true, depthWrite: false,
  }));
  tube.frustumCulled = false;
  scene.add(tube);
  const nib = dots([new Vector3()], dotMat(pal.accent, 12));
  scene.add(nib);
  // Chapter i sits at control point 1 + 2i; convert that parameter to arc length for the tube.
  const LD = 600, lens = path.getLengths(LD);
  const arcFrac = (t) => {
    const f = clamp01(t) * LD, i = Math.min(LD - 1, Math.floor(f));
    return (lens[i] + (lens[i + 1] - lens[i]) * (f - i)) / lens[LD];
  };

  // Ambient dust for depth
  const dust = [];
  for (let i = 0; i < (MOBILE ? 350 : 700); i++) dust.push(new Vector3(-18 + rand() * 50, -9 + rand() * 24, -122 + rand() * 136));
  scene.add(dots(dust, dotMat(pal.muted, 2.2, 0.7)));

  // ---------- Camera rig ----------
  let W = 1, H = 1, wide = true, camCurve, tgtCurve;
  function layout() {
    W = innerWidth; H = innerHeight;
    wide = W > 820 && W > H;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(W, H, false);
    U.uPR.value = renderer.getPixelRatio();
    camera.aspect = W / H;
    const dist = 11.5 * Math.max(1, 0.82 / camera.aspect) ** 0.9;
    U.uNear.value = scene.fog.near = dist + 3;
    U.uFar.value = scene.fog.far = dist + 26;
    const cams = [], tgts = [];
    A.forEach((a, i) => {
      const cp = a.clone().add(new Vector3(Math.sin(YAW[i]) * dist, 0.8, Math.cos(YAW[i]) * dist));
      if (i > 0) {
        cams.push(cams[cams.length - 1].clone().lerp(cp, 0.5).add(new Vector3(0, 2.5, 3)));
        tgts.push(tgts[tgts.length - 1].clone().lerp(a, 0.5));
      }
      cams.push(cp); tgts.push(a.clone());
    });
    camCurve = new CatmullRomCurve3(cams);
    tgtCurve = new CatmullRomCurve3(tgts);
  }
  layout();
  addEventListener('resize', layout);

  const tmp = new Vector3(), look = new Vector3(), par = new Vector2(), scr = new Vector2();
  function toScreen(v) {
    tmp.copy(v).project(camera);
    return scr.set((tmp.x * 0.5 + 0.5) * W, (-tmp.y * 0.5 + 0.5) * H);
  }

  // ---------- Input ----------
  addEventListener('pointermove', (e) => {
    ptr.x = e.clientX; ptr.y = e.clientY;
    ptr.ndc.set((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1);
    ptr.mouse = e.pointerType === 'mouse';
    ptr.lastMove = performance.now();
    ptr.overUI = isUI(e.target);
    if (ptr.down) {
      const dx = e.clientX - ptr.lx;
      ptr.lx = e.clientX; ptr.dragged += Math.abs(dx);
      spinVel = dx * 0.006;
      chapters[activeIdx()].drag += spinVel;
    }
  }, { passive: true });
  addEventListener('pointerout', (e) => { if (!e.relatedTarget) ptr.x = ptr.y = -9999; });
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || isUI(e.target)) return;
    e.preventDefault();
    ptr.down = true; ptr.lx = e.clientX; ptr.dragged = 0;
    root.classList.add('dragging');
  });
  addEventListener('pointerup', () => { ptr.down = false; root.classList.remove('dragging'); });
  addEventListener('click', (e) => {
    if (isUI(e.target) || ptr.dragged > 5) return;
    const h = pick(e.clientX, e.clientY, MOBILE ? 38 : 28);
    if (!h) return;
    if (e.pointerType !== 'mouse' || MOBILE) { pinned = h; pinnedUntil = performance.now() + 2800; }
    h.onClick?.();
  });

  // ---------- Hotspots & tooltip ----------
  const tip = document.getElementById('tip'), tipB = tip.querySelector('b'), tipS = tip.querySelector('span');
  let hovered = null, pinned = null, pinnedUntil = 0, spinVel = 0;
  const hp = new Vector3();
  const activeIdx = () => Math.round(camC);
  function pick(x, y, radius) {
    const i = activeIdx();
    if (Math.abs(camC - i) > 0.3) return null;
    let best = null, bd = radius * radius;
    for (const h of chapters[i].hotspots) {
      if (h.active === false) continue;
      h.obj.localToWorld(hp.copy(h.local)).project(camera);
      if (hp.z > 1) continue;
      const sx = (hp.x * 0.5 + 0.5) * W, sy = (-hp.y * 0.5 + 0.5) * H;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  function updateTip(now) {
    if (pinned && now > pinnedUntil) pinned = null;
    const h = pinned || (ptr.mouse && !ptr.overUI && !ptr.down ? pick(ptr.x, ptr.y, 28) : null);
    if (h !== hovered) {
      hovered?.onHover?.(false);
      h?.onHover?.(true);
      hovered = h;
      root.classList.toggle('hot', !!h);
      tip.classList.toggle('on', !!h);
      if (h) { tipB.textContent = h.title; tipS.textContent = h.text; }
    }
    if (h) {
      const s = toScreen(h.obj.localToWorld(hp.copy(h.local)));
      tip.style.transform = `translate(${Math.round(s.x)}px,${Math.round(s.y)}px) translate(-50%, calc(-100% - 16px))`;
    }
  }

  // ---------- Loop ----------
  let camC = J.c, last = performance.now(), t = 0, intro = REDUCED ? 1 : 0, running = true, readySent = false;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    if (!REDUCED) t += dt;
    U.uTime.value = t;
    camC = REDUCED ? Math.round(J.c) : damp(camC, J.c, 4.5, dt);
    intro = Math.min(1, intro + dt / 1.8);

    // Camera along the rail, with pointer parallax and a side offset so text and art don't collide.
    const u = camC / 5;
    camCurve.getPoint(u, camera.position);
    tgtCurve.getPoint(u, look);
    par.x = damp(par.x, ptr.mouse ? ptr.ndc.x : 0, 2.5, dt);
    par.y = damp(par.y, ptr.mouse ? ptr.ndc.y : 0, 2.5, dt);
    if (!REDUCED) camera.position.add(tmp.set(par.x * 0.7, par.y * 0.4, 0));
    camera.lookAt(look);
    const i0 = Math.floor(camC), side = SIDE[i0] + (SIDE[Math.min(i0 + 1, 5)] - SIDE[i0]) * smooth(camC - i0);
    if (wide) camera.setViewOffset(W, H, -side * W * 0.17, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.2, W, H);

    // Only nearby chapters are drawn/updated.
    spinVel *= Math.exp(-dt * 3);
    const ai = activeIdx();
    chapters.forEach((ch, i) => {
      const vis = Math.abs(camC - i) < 1;
      ch.group.visible = vis;
      if (!vis) return;
      if (i === ai && !ptr.down) ch.drag += spinVel;
      if (ch.spring && !(ptr.down && i === ai)) ch.drag = damp(ch.drag, 0, 2, dt);
      ch.spin.rotation.y = ch.auto * t + ch.drag;
      ch.update(t, dt, camC - i);
    });

    const f = arcFrac(((1 + 2 * camC + 0.25) / 11) * smooth(intro));
    tube.geometry.setDrawRange(0, Math.floor(f * SEGS) * RADIAL * 6);
    path.getPointAt(f, nib.position);

    updateTip(now);
    renderer.render(scene, camera);
    if (!readySent) {
      readySent = true;
      J.sceneOK = true;
      dispatchEvent(new Event('scene:ready'));
    }
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });
}
