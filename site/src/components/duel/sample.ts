// Turns a bust mesh into coloured dots. It has no imports of our own, so the bake script can run it in Node:
// the dots are made once at build time (scripts/bake-points.ts), not in every visitor's browser.
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

export type Pal = { deep: number[]; mid: number[]; hi: number[]; core: number[] };
export const mix3 = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Samples the surface, lights each sample from one key and one fill light, and keeps fewer samples where the bust
// fades out at the bottom. Returns positions (height normalised to 1.75), colours and a random seed per dot.
export function samplePoints(scene: THREE.Object3D, pal: Pal, count: number, rand: () => number = Math.random) {
  const parts: THREE.BufferGeometry[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); parts.push(g.index ? g.toNonIndexed() : g); }
  });
  const total = parts.reduce((a, g) => a + g.attributes.position.array.length, 0);
  const pos = new Float32Array(total); let off = 0;
  for (const g of parts) { pos.set(g.attributes.position.array as Float32Array, off); off += g.attributes.position.array.length; }
  const merged = new THREE.BufferGeometry(); merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  merged.computeVertexNormals(); merged.computeBoundingBox();
  const size = new THREE.Vector3(), centre = new THREE.Vector3(); merged.boundingBox!.getSize(size); merged.boundingBox!.getCenter(centre);
  const s = 1.75 / size.y; merged.translate(-centre.x, -centre.y, -centre.z); merged.scale(s, s, s);

  // setRandomGenerator exists in three r170 but is missing from its type definitions
  const sampler = (new MeshSurfaceSampler(new THREE.Mesh(merged)) as unknown as { setRandomGenerator(f: () => number): MeshSurfaceSampler }).setRandomGenerator(rand).build();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const light = new THREE.Vector3(-0.5, 0.55, 0.8).normalize(), fill = new THREE.Vector3(0.7, 0.1, 0.5).normalize();
  const P = new Float32Array(count * 3), C = new Float32Array(count * 3), S = new Float32Array(count);
  let k = 0;
  for (let i = 0; i < count * 5 && k < count; i++) {
    sampler.sample(p, n);
    const lit = Math.min(1, Math.max(0, n.dot(light)) + 0.35 * Math.max(0, n.dot(fill)));
    const fade = Math.pow(sstep(-0.86, 0.05, p.y), 1.4);
    if (rand() > (p.y > 0.12 ? 1 : 0.55) * fade * (0.06 + 0.94 * Math.pow(lit, 1.5))) continue;
    P.set([p.x, p.y, p.z], k * 3);
    let c = mix3(pal.deep, pal.mid, sstep(0, 0.6, lit)); c = mix3(c, pal.hi, sstep(0.8, 1, lit) * 0.8);
    const dim = (p.y > 0.12 ? 1 : 0.85) * (0.55 + 0.45 * fade);
    C.set([c[0] * dim, c[1] * dim, c[2] * dim], k * 3); S[k] = rand();
    k++;
  }
  return { P: P.subarray(0, k * 3), C: C.subarray(0, k * 3), S: S.subarray(0, k), k };
}

// The baked file: a 4-byte count, then int16 positions (x 30000), then uint8 colours, then a uint8 seed per dot.
export const Q = 30000;
export function decodePoints(buf: ArrayBuffer) {
  const k = new DataView(buf).getUint32(0, true);
  const pos = new Int16Array(buf, 4, k * 3), col = new Uint8Array(buf, 4 + k * 6, k * 3), seed = new Uint8Array(buf, 4 + k * 9, k);
  const P = new Float32Array(k * 3), C = new Float32Array(k * 3), S = new Float32Array(k);
  for (let i = 0; i < k * 3; i++) { P[i] = pos[i] / Q; C[i] = col[i] / 255; }
  for (let i = 0; i < k; i++) S[i] = seed[i] / 255;
  return { P, C, S, k };
}
