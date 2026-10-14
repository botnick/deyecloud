import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildHouse, type FlowKey, type HouseModel } from "./house";

/* Interactive 3D house: drag left/right to walk around it (vertical drags still scroll
   the page), light particles run along each cable in the direction power flows, and
   each device's screen position is reported every frame so React can pin its label.
   Rendering pauses when the card is off-screen or the tab is hidden. */

export interface Flow { key: FlowKey; watts: number; toHouse: boolean } // toHouse: device → inverter
export interface HouseView {
  setFlows: (f: Flow[]) => void;
  setNight: (night: boolean) => void;
  dispose: () => void;
}
export const FLOW_COLOR: Record<FlowKey, number> = { pv: 0xf5a623, home: 0x0d6bff, batt: 0x18a673, grid: 0x8b5cf6 };

export function createHouseView(host: HTMLElement, opts: { night: boolean; reducedMotion: boolean; onFrame: (pos: Record<FlowKey, { x: number; y: number; behind: boolean }>) => void }): HouseView {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const cv = renderer.domElement; cv.style.display = "block"; cv.style.width = "100%"; cv.style.height = "100%";
  host.appendChild(cv);

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-7, 12, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.radius = 4; sun.shadow.bias = -0.0004;
  scene.add(sun);
  const lamps = [new THREE.PointLight(0xffb45a, 6, 6, 1.6), new THREE.PointLight(0xffb45a, 3, 4, 1.6)];
  lamps[0].position.set(-2.2, 1.2, 2.1); lamps[1].position.set(-1.3, 2.5, 1.9); lamps.forEach((l) => scene.add(l));

  const cam = new THREE.PerspectiveCamera(22, 1, 1, 100);
  const controls = new OrbitControls(cam, cv);
  controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  // fixed viewing height: horizontal drags orbit, vertical drags stay with the page scroll
  const POLAR = 1.02;
  controls.minPolarAngle = controls.maxPolarAngle = POLAR;
  cv.style.touchAction = "pan-y";
  controls.autoRotate = !opts.reducedMotion; controls.autoRotateSpeed = 0.35;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  let model: HouseModel | null = null;
  const cables = new THREE.Group(); scene.add(cables);
  const dotGeo = new THREE.SphereGeometry(0.085, 12, 8);
  type Run = { key: FlowKey; path: THREE.CurvePath<THREE.Vector3>; dots: THREE.Mesh[]; speed: number; reverse: boolean; mat: THREE.MeshBasicMaterial; cable: THREE.Mesh };
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
      runs.push({ key: f.key, path, dots, speed, reverse: !f.toHouse, mat, cable });
    }
  };

  const setNight = (night: boolean) => {
    if (model) { scene.remove(model.group); model.dispose(); }
    model = buildHouse(night); scene.add(model.group);
    hemi.color.set(night ? 0x5a6a9a : 0xf4f8ff); hemi.groundColor.set(night ? 0x141a28 : 0xd9dccf); hemi.intensity = night ? 0.55 : 1.9;
    sun.color.set(night ? 0x8fa2e0 : 0xfff3e0); sun.intensity = night ? 0.35 : 2.6;
    lamps.forEach((l) => (l.visible = night));
    renderer.toneMappingExposure = night ? 0.9 : 1.0;
    controls.target.copy(model.target);
    if (!placed) { // first placement: the classic front-right three-quarter view
      const r = 30, yaw = 0.66;
      cam.position.set(model.target.x + r * Math.sin(POLAR) * Math.sin(yaw), model.target.y + r * Math.cos(POLAR), model.target.z + r * Math.sin(POLAR) * Math.cos(yaw));
      placed = true;
    }
    controls.update();
    buildRuns();
  };
  let placed = false;

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    // fit the plot: narrower screens pull back a little
    cam.zoom = Math.min(1, w / h) * 0.84; cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host);

  let visible = true, raf = 0, last = performance.now(), t = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }, { threshold: 0.01 });
  io.observe(host);
  const onVis = () => { if (!document.hidden) loop(); };
  document.addEventListener("visibilitychange", onVis);

  const v = new THREE.Vector3();
  const frame = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    controls.update();
    for (const r of runs) {
      const len = r.path.getLength();
      const step = 1 / r.dots.length;
      const base = opts.reducedMotion ? 0 : ((t * r.speed) / len) % 1;
      r.dots.forEach((d, i) => {
        let u = (base + i * step) % 1; if (r.reverse) u = 1 - u;
        d.position.copy(r.path.getPointAt(u));
      });
    }
    renderer.render(scene, cam);
    if (model) {
      const out = {} as Record<FlowKey, { x: number; y: number; behind: boolean }>;
      const toCam = new THREE.Vector3();
      for (const k of Object.keys(model.anchors) as FlowKey[]) {
        v.copy(model.anchors[k]).project(cam);
        toCam.copy(cam.position).sub(model.target).setY(0).normalize();
        const a = model.anchors[k].clone().sub(model.target).setY(0);
        out[k] = { x: (v.x + 1) * 50, y: (1 - v.y) * 50, behind: a.dot(toCam) < -1.6 };
      }
      opts.onFrame(out);
    }
  };
  const loop = () => {
    cancelAnimationFrame(raf);
    if (!visible || document.hidden) return;
    last = performance.now();
    const tick = () => { if (!visible || document.hidden) return; frame(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  };

  setNight(opts.night); resize(); loop();

  return {
    setFlows: (f) => {
      const sig = (x: Flow[]) => x.map((y) => `${y.key}${y.toHouse ? ">" : "<"}${Math.round(y.watts / 250)}`).join(",");
      if (sig(f) === sig(flows)) return;
      flows = f; buildRuns();
    },
    setNight,
    dispose: () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis);
      clearRuns(); dotGeo.dispose(); model?.dispose(); controls.dispose(); renderer.dispose(); cv.remove();
    },
  };
}
