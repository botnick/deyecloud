import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildHouse, type FlowKey, type HouseModel } from "./house";

/* Interactive 3D house: drag left/right to walk around it (vertical drags still scroll
   the page), light particles run along each cable in the direction power flows, and
   each device's screen position is reported whenever the camera moves so React can pin
   its label. Renders on demand (battery: low/mid phones): a still scene is drawn once and
   then idles; moving particles run at ~30 fps; dragging the camera draws every frame.
   Rendering pauses when the card is off-screen or the tab is hidden. */

export interface Flow { key: FlowKey; watts: number; toHouse: boolean } // toHouse: device → inverter
export interface HouseView {
  setFlows: (f: Flow[]) => void;
  setNight: (night: boolean) => void;
  reset: () => void;
  dispose: () => void;
}
export const FLOW_COLOR: Record<FlowKey, number> = { pv: 0xf5a623, home: 0x0d6bff, batt: 0x18a673, grid: 0x8b5cf6 };

export type LabelPos = Record<FlowKey, { x: number; y: number; behind: boolean }>; // x, y in % of the canvas
export function createHouseView(host: HTMLElement, opts: {
  night: boolean; reducedMotion: boolean;
  onLabels: (pos: LabelPos, w: number, h: number) => void; // only when the camera or size changed
  onContextLost?: () => void;                               // GPU dropped the context — show the poster again
}): HouseView {
  const dpr = window.devicePixelRatio || 1;
  // high-dpi screens hide jaggies by themselves; MSAA there only costs battery
  const renderer = new THREE.WebGLRenderer({ antialias: dpr <= 1, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(1.5, dpr));
  // the light never moves: the shadow map is drawn only when the scene changes
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const cv = renderer.domElement; cv.style.display = "block"; cv.style.width = "100%"; cv.style.height = "100%";
  host.appendChild(cv);

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-7, 12, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.radius = 4; sun.shadow.bias = -0.0004;
  scene.add(sun);
  const lamps = [new THREE.PointLight(0xffb45a, 6, 6, 1.6), new THREE.PointLight(0xffb45a, 3, 4, 1.6)];
  lamps[0].position.set(-2.2, 1.2, 2.1); lamps[1].position.set(-1.3, 2.5, 1.9); lamps.forEach((l) => scene.add(l));

  const cam = new THREE.PerspectiveCamera(22, 1, 1, 100);
  const controls = new OrbitControls(cam, cv);
  controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  // drag in any direction: sideways walks around, up/down tilts between a near top-down
  // view and almost eye level (never under the ground). The card owns its touches, so the
  // page scrolls from anywhere outside it. No auto-spin — a moving camera nobody asked for
  // is tiring to watch.
  const POLAR = 1.02;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.38;
  cv.style.touchAction = "none";

  let model: HouseModel | null = null;
  const cables = new THREE.Group(); scene.add(cables);
  const dotGeo = new THREE.SphereGeometry(0.085, 12, 8);
  type Run = { key: FlowKey; path: THREE.CurvePath<THREE.Vector3>; len: number; dots: THREE.Mesh[]; speed: number; reverse: boolean; mat: THREE.MeshBasicMaterial; cable: THREE.Mesh };
  let runs: Run[] = [];
  let flows: Flow[] = [];

  const clearRuns = () => { for (const r of runs) { r.dots.forEach((d) => cables.remove(d)); cables.remove(r.cable); r.cable.geometry.dispose(); (r.cable.material as THREE.Material).dispose(); r.mat.dispose(); } runs = []; };
  const buildRuns = () => {
    clearRuns(); if (!model) return;
    for (const f of flows) {
      const pts = model.routes[f.key];
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      const cable = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(8, pts.length * 4), 0.018, 6), new THREE.MeshBasicMaterial({ color: FLOW_COLOR[f.key], transparent: true, opacity: 0.5 }));
      cables.add(cable);
      const mat = new THREE.MeshBasicMaterial({ color: FLOW_COLOR[f.key] });
      const len = path.getLength();
      const n = Math.max(2, Math.round(len * 1.6));
      const dots = Array.from({ length: n }, () => { const d = new THREE.Mesh(dotGeo, mat); cables.add(d); return d; });
      // speed (scene units / s) grows with power, gently
      const speed = 0.5 + Math.min(1.6, f.watts / 2500);
      runs.push({ key: f.key, path, len, dots, speed, reverse: !f.toHouse, mat, cable });
    }
    moveDots(); // still scenes (reduced motion) draw the dots once, here
    renderer.shadowMap.needsUpdate = true; invalidate();
  };
  const moveDots = () => {
    for (const r of runs) {
      const step = 1 / r.dots.length;
      const base = opts.reducedMotion ? 0 : ((t * r.speed) / r.len) % 1;
      r.dots.forEach((d, i) => {
        let u = (base + i * step) % 1; if (r.reverse) u = 1 - u;
        r.path.getPointAt(u, d.position);
      });
    }
  };

  // the classic front-right three-quarter view (first load, and the "back to start" tap)
  const place = () => {
    if (!model) return;
    const r = 30, yaw = 0.66;
    cam.position.set(model.target.x + r * Math.sin(POLAR) * Math.sin(yaw), model.target.y + r * Math.cos(POLAR), model.target.z + r * Math.sin(POLAR) * Math.cos(yaw));
    controls.update(); invalidate(true);
  };
  const setNight = (night: boolean) => {
    if (model) { scene.remove(model.group); model.dispose(); }
    model = buildHouse(night); scene.add(model.group);
    hemi.color.set(night ? 0x5a6a9a : 0xf4f8ff); hemi.groundColor.set(night ? 0x141a28 : 0xd9dccf); hemi.intensity = night ? 0.55 : 1.9;
    sun.color.set(night ? 0x8fa2e0 : 0xfff3e0); sun.intensity = night ? 0.35 : 2.6;
    lamps.forEach((l) => (l.visible = night));
    renderer.toneMappingExposure = night ? 0.9 : 1.0;
    controls.target.copy(model.target);
    if (!placed) { place(); placed = true; }
    controls.update();
    buildRuns();
    renderer.shadowMap.needsUpdate = true; invalidate(true);
  };
  let placed = false;

  // ---- on-demand rendering ----
  let visible = true, raf = 0, last = performance.now(), lastDraw = 0, t = 0, lost = false, disposed = false;
  let dirty = true, labelsDirty = true, camMoving = false;
  const running = () => visible && !document.hidden && !lost && !disposed;
  const animating = () => !opts.reducedMotion && runs.length > 0;
  const schedule = () => { if (!raf && running()) raf = requestAnimationFrame(tick); };
  function invalidate(labels = false) { dirty = true; if (labels) labelsDirty = true; schedule(); }

  const v = new THREE.Vector3(), toCam = new THREE.Vector3(), rel = new THREE.Vector3();
  const pos = { pv: { x: 0, y: 0, behind: false }, grid: { x: 0, y: 0, behind: false }, home: { x: 0, y: 0, behind: false }, batt: { x: 0, y: 0, behind: false } } as LabelPos;
  const emitLabels = () => {
    if (!model) return;
    toCam.copy(cam.position).sub(model.target).setY(0).normalize();
    for (const k of Object.keys(model.anchors) as FlowKey[]) {
      v.copy(model.anchors[k]).project(cam);
      rel.copy(model.anchors[k]).sub(model.target).setY(0);
      const o = pos[k]; o.x = (v.x + 1) * 50; o.y = (1 - v.y) * 50; o.behind = rel.dot(toCam) < -1.6;
    }
    opts.onLabels(pos, host.clientWidth, host.clientHeight);
    labelsDirty = false;
  };
  const draw = () => { renderer.render(scene, cam); dirty = false; if (labelsDirty) emitLabels(); };

  const FRAME_MS = 1000 / 30 - 2; // particles: ~30 fps is smooth enough, half the GPU work
  function tick(now: number) {
    raf = 0; if (!running()) return;
    // the damped camera keeps gliding after the finger lifts; update() is true while it moves
    camMoving = controls.update();
    if (camMoving) dirty = labelsDirty = true;
    const anim = animating();
    if (dirty || (anim && now - lastDraw >= FRAME_MS)) {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (anim) { t += dt; moveDots(); }
      draw(); lastDraw = now;
    }
    if (camMoving || anim) schedule();
  }
  controls.addEventListener("change", () => invalidate(true));
  controls.addEventListener("start", () => invalidate(true));

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h || lost) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    // fit the plot: narrower screens pull back a little
    cam.zoom = Math.min(1, w / h) * 0.84; cam.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true; labelsDirty = true;
    draw(); // setSize clears the canvas; repaint now, even while paused
  };
  const ro = new ResizeObserver(resize); ro.observe(host);

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { last = performance.now(); invalidate(true); } }, { threshold: 0.01 });
  io.observe(host);
  const onVis = () => { if (!document.hidden) { last = performance.now(); invalidate(true); } };
  document.addEventListener("visibilitychange", onVis);

  const onLost = (e: Event) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; opts.onContextLost?.(); };
  const onRestored = () => { lost = false; renderer.shadowMap.needsUpdate = true; invalidate(true); };
  cv.addEventListener("webglcontextlost", onLost);
  cv.addEventListener("webglcontextrestored", onRestored);

  setNight(opts.night); resize();

  return {
    setFlows: (f) => {
      const sig = (x: Flow[]) => x.map((y) => `${y.key}${y.toHouse ? ">" : "<"}${Math.round(y.watts / 250)}`).join(",");
      if (sig(f) === sig(flows)) return;
      flows = f; buildRuns();
    },
    setNight,
    reset: place,
    dispose: () => {
      disposed = true; cancelAnimationFrame(raf); raf = 0; ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis);
      cv.removeEventListener("webglcontextlost", onLost); cv.removeEventListener("webglcontextrestored", onRestored);
      clearRuns(); dotGeo.dispose(); model?.dispose(); controls.dispose(); renderer.dispose();
      // hand the GL context back now instead of waiting for GC (browsers cap live contexts)
      if (!lost) renderer.forceContextLoss();
      cv.remove();
    },
  };
}
