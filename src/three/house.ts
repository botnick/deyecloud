import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/* The home hero house — a white, architectural-model style solar home built from
   primitives (no external assets): two-storey flat-roof volume, carport, tilted 2×4 PV
   array, wall battery + inverter, meter box and a utility pole with its drop line.
   Same model as design/house/scene.html (which renders the static poster images).

   Besides the meshes it returns, in world space, where each device is (for the floating
   labels) and the cable route of each energy flow (for the moving light particles). */

export type FlowKey = "pv" | "grid" | "home" | "batt";
export interface HouseModel {
  group: THREE.Group;
  anchors: Record<FlowKey, THREE.Vector3>;   // label position for each device
  routes: Record<FlowKey, THREE.Vector3[]>;  // cable polyline, drawn FROM the device TO the inverter
  target: THREE.Vector3;                     // orbit centre
  dispose: () => void;
}

const HX = -1.3, HZ = -0.6;           // main volume centre (x, z)
const FZ = HZ + 1.9;                  // front facade plane
const SX = HX + 2.3 + 0.12;           // side wall (carport side) face for wall devices
const BZ = HZ + 1.05, IZ = HZ + 0.4;  // battery / inverter positions along that wall
const PX = 4.1, PZ = -3.3;            // utility pole

export function buildHouse(night: boolean): HouseModel {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [], texs: THREE.Texture[] = [];
  const M = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o }); mats.push(m); return m; };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => { geos.push(g); const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; group.add(o); return o; };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, r = 0.02) => {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
    const o = mesh(g, m); o.position.set(x, y, z); return o;
  };

  const white = M(0xf7f7f5), offwhite = M(0xeceae5), grey = M(0xc9ccd1), dark = M(0x2b2f36, { roughness: 0.5 });
  const wood = M(0xb88a5a, { roughness: 0.7 });
  const glass = night ? M(0xffd28a, { emissive: 0xffb24d, emissiveIntensity: 1.25, roughness: 0.3 }) : M(0x6f8fa8, { roughness: 0.08, metalness: 0.35 });
  const frame = M(0x3a3f47, { roughness: 0.4 });

  // ground slab, lawn, driveway, path
  box(11, 0.3, 9, M(0xe9e7e2), 0, -0.15, 0, 0.12);
  box(10.4, 0.06, 8.4, M(0xa8c98a, { roughness: 1 }), 0, 0.03, 0, 0.03);
  box(2.6, 0.07, 3.4, M(0xd8d6d0), 1.3, 0.04, 2.6, 0.02);
  box(0.9, 0.07, 1.6, M(0xd8d6d0), -1.2, 0.04, 3.4, 0.02);

  // main volume + roof slab; carport canopy, posts, back wall
  box(4.6, 3.2, 3.8, white, HX, 1.6, HZ, 0.05);
  box(4.8, 0.18, 4.0, offwhite, HX, 3.29, HZ, 0.04);
  box(2.9, 0.16, 2.0, offwhite, 2.3, 2.1, HZ - 0.85, 0.04);
  box(0.14, 2.05, 0.14, white, 3.65, 1.02, HZ + 0.05, 0.03);
  box(0.14, 2.05, 0.14, white, 3.65, 1.02, HZ - 1.75, 0.03);
  box(2.9, 2.05, 0.2, white, 2.3, 1.02, HZ - 1.75, 0.03);

  // glazing
  const win = (w: number, h: number, x: number, y: number, z: number, side = false) => {
    if (side) { box(0.06, h + 0.1, w + 0.1, frame, x, y, z, 0.01); box(0.07, h, w, glass, x + 0.01, y, z, 0.005); }
    else { box(w + 0.1, h + 0.1, 0.06, frame, x, y, z, 0.01); box(w, h, 0.07, glass, x, y, z + 0.01, 0.005); }
  };
  win(2.2, 1.9, HX - 0.9, 1.05, FZ);
  win(1.0, 2.1, HX + 1.3, 1.1, FZ);
  win(2.6, 0.62, HX - 0.4, 2.62, FZ);
  win(1.4, 0.9, HX + 2.3, 2.55, HZ + 0.6, true);
  box(1.0, 0.06, 0.6, wood, HX + 1.3, 0.1, FZ + 0.35, 0.01);
  for (let i = 0; i < 6; i++) box(0.05, 2.0, 0.06, wood, HX + 0.45 + i * 0.09, 1.1, FZ + 0.02, 0.01);
  // back + far side windows so the house reads from every angle
  win(2.4, 1.2, HX, 1.9, HZ - 1.9 - 0.04);
  win(1.6, 1.2, HX - 2.3 - 0.04, 1.9, HZ, true);

  // PV array: 2 × 4 panels on rails, tilted
  const c = document.createElement("canvas"); c.width = 256; c.height = 384;
  const x = c.getContext("2d")!;
  const gr = x.createLinearGradient(0, 0, 256, 384); gr.addColorStop(0, "#22385f"); gr.addColorStop(1, "#142440");
  x.fillStyle = gr; x.fillRect(0, 0, 256, 384);
  x.strokeStyle = "rgba(190,210,240,.35)"; x.lineWidth = 2;
  for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo((i * 256) / 6, 0); x.lineTo((i * 256) / 6, 384); x.stroke(); }
  for (let j = 1; j < 10; j++) { x.beginPath(); x.moveTo(0, (j * 384) / 10); x.lineTo(256, (j * 384) / 10); x.stroke(); }
  const pvTex = new THREE.CanvasTexture(c); pvTex.colorSpace = THREE.SRGBColorSpace; pvTex.anisotropy = 4; texs.push(pvTex);
  const pvMat = new THREE.MeshStandardMaterial({ map: pvTex, roughness: 0.25, metalness: 0.4 }); mats.push(pvMat);
  const frameMat = M(0xc7ccd3, { metalness: 0.6, roughness: 0.35 });
  const frameGeo = new RoundedBoxGeometry(0.98, 0.05, 1.5, 2, 0.015), cellGeo = new THREE.PlaneGeometry(0.92, 1.44); geos.push(frameGeo, cellGeo);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
    const p = new THREE.Group();
    const fr = new THREE.Mesh(frameGeo, frameMat), cell = new THREE.Mesh(cellGeo, pvMat);
    cell.rotation.x = -Math.PI / 2; cell.position.y = 0.027; fr.castShadow = cell.castShadow = true;
    p.add(fr, cell); p.position.set(HX - 1.6 + k * 1.04, 3.62, HZ - 0.95 + r * 1.75); p.rotation.x = 0.26; group.add(p);
    for (const dz of [-0.6, 0.6]) box(0.04, 0.25 + (dz < 0 ? 0.15 : -0.02), 0.04, grey, p.position.x, 3.45 + (dz < 0 ? 0.08 : 0), p.position.z + dz * 0.95, 0.005);
  }

  // battery + inverter on the side wall
  box(0.24, 1.2, 0.62, M(0xfafafa, { roughness: 0.5 }), SX, 0.72, BZ, 0.05);
  box(0.01, 0.5, 0.04, M(0x18a673, { emissive: 0x18a673, emissiveIntensity: night ? 2 : 0.6 }), SX + 0.125, 0.95, BZ - 0.22, 0.004);
  for (let i = 0; i < 3; i++) box(0.01, 0.008, 0.56, grey, SX + 0.122, 0.36 + i * 0.36, BZ, 0);
  box(0.2, 0.7, 0.55, M(0xf2f3f5, { roughness: 0.5 }), SX - 0.02, 1.45, IZ, 0.05);
  box(0.01, 0.12, 0.22, M(0x0f172a, { emissive: night ? 0x4cc3ff : 0x000000, emissiveIntensity: 0.8 }), SX + 0.085, 1.55, IZ, 0.01);

  // meter box + utility pole + drop line
  const meter = box(0.12, 0.42, 0.3, M(0xdfe2e6), HX + 2.36, 1.55, HZ - 0.25, 0.02);
  const poleMat = M(0x9a9da3);
  box(0.14, 4.4, 0.14, poleMat, PX, 2.2, PZ, 0.03);
  box(1.1, 0.08, 0.08, poleMat, PX, 4.15, PZ, 0.02);
  for (const dx of [-0.45, 0, 0.45]) box(0.05, 0.12, 0.05, white, PX + dx, 4.25, PZ, 0.01);
  const poleTop = new THREE.Vector3(PX, 4.25, PZ), meterTop = meter.position.clone().add(new THREE.Vector3(0.06, 0.2, 0));
  const sag = poleTop.clone().lerp(meterTop, 0.5); sag.y -= 0.5;
  const drop = new THREE.QuadraticBezierCurve3(poleTop, sag, meterTop);
  mesh(new THREE.TubeGeometry(drop, 30, 0.012, 6), dark);

  // planting
  const leaf = M(0x6f9a5a, { roughness: 0.9 }), leaf2 = M(0x5d8a4c, { roughness: 0.9 });
  const sphere = new THREE.SphereGeometry(1, 24, 16); geos.push(sphere);
  const shrub = (x0: number, z0: number, s: number) => { for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(sphere, i % 2 ? leaf : leaf2); m.scale.set(s * (0.8 + i * 0.12), s * (0.8 + i * 0.12) * 0.8, s * (0.8 + i * 0.12)); m.position.set(x0 + (i - 1) * s * 0.7, s * 0.7, z0 + (i % 2) * s * 0.3); m.castShadow = m.receiveShadow = true; group.add(m); } };
  shrub(-3.6, 2.2, 0.32); shrub(-0.2, 2.0, 0.24); shrub(-4.4, -2.6, 0.3);
  const tree = (x0: number, z0: number, h: number) => { box(0.08, h * 0.45, 0.08, M(0x6b5544), x0, h * 0.22, z0, 0.02); const m = new THREE.Mesh(sphere, leaf2); m.scale.set(h * 0.14, h * 0.25, h * 0.14); m.position.set(x0, h * 0.62, z0); m.castShadow = true; group.add(m); };
  tree(-4.2, 0.4, 3.4); tree(-4.6, -1.0, 2.6); tree(4.6, -1.6, 3.0);

  const V = (a: number, b: number, c2: number) => new THREE.Vector3(a, b, c2);
  return {
    group,
    target: V(0.1, 2.2, -0.3),
    anchors: {
      pv: V(HX - 0.6, 4.2, HZ),
      grid: V(PX, 4.6, PZ),
      home: V(HX - 2.1, 2.2, FZ + 0.05),
      batt: V(SX + 0.15, 1.5, BZ),
    },
    routes: {
      // roof array → over the parapet → down the side wall → inverter
      pv: [V(HX - 0.6, 3.72, HZ), V(SX - 0.1, 3.45, IZ), V(SX + 0.06, 3.3, IZ), V(SX + 0.06, 1.8, IZ)],
      // pole → drop line → meter → inverter
      grid: [...drop.getPoints(16), V(SX + 0.06, 1.55, HZ - 0.25), V(SX + 0.06, 1.45, IZ - 0.25)],
      // house loads ← inverter (drawn from the living room to the inverter, flow runs reversed)
      home: [V(HX - 0.4, 1.0, FZ + 0.12), V(SX - 0.05, 1.0, FZ + 0.12), V(SX + 0.06, 1.0, FZ - 0.1), V(SX + 0.06, 1.2, IZ + 0.28)],
      // battery ↔ inverter
      batt: [V(SX + 0.13, 1.25, BZ - 0.1), V(SX + 0.13, 1.25, IZ + 0.27)],
    },
    dispose: () => { geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose()); },
  };
}
