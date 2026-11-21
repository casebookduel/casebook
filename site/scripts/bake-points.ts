// Bakes the two busts into compact dot files for the hero: node scripts/bake-points.ts
// Run it again only if a model or the sampling changes. The seeded random keeps the output identical between runs.
import { readFileSync, writeFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Q, samplePoints, type Pal } from "../src/components/duel/sample.ts";

// the same values as src/components/duel/palette.ts (this script runs in Node and cannot import that file)
const EMERALD: Pal = { deep: [0.03, 0.3, 0.19], mid: [0.25, 0.88, 0.58], hi: [0.86, 0.99, 0.9], core: [0.5, 1, 0.72] };
const SILVER: Pal = { deep: [0.22, 0.24, 0.27], mid: [0.74, 0.78, 0.82], hi: [0.97, 0.98, 1.0], core: [1, 1, 1] };
const COUNT = 66000;

function seeded(seed: number) {   // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

for (const [name, pal, seed] of [["holmes", EMERALD, 7], ["moriarty", SILVER, 11]] as const) {
  const file = readFileSync(new URL(`../../brand/agents-3d/${name}.glb`, import.meta.url));
  const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const gltf = await new Promise<{ scene: import("three").Object3D }>((ok, no) => new GLTFLoader().parse(ab, "", ok, no));
  const { P, C, S, k } = samplePoints(gltf.scene, pal, COUNT, seeded(seed));
  const out = new ArrayBuffer(4 + k * 6 + k * 3 + k), dv = new DataView(out);
  dv.setUint32(0, k, true);
  const pos = new Int16Array(out, 4, k * 3), col = new Uint8Array(out, 4 + k * 6, k * 3), sd = new Uint8Array(out, 4 + k * 9, k);
  for (let i = 0; i < k * 3; i++) { pos[i] = Math.round(P[i] * Q); col[i] = Math.round(Math.min(1, C[i]) * 255); }
  for (let i = 0; i < k; i++) sd[i] = Math.round(S[i] * 255);
  writeFileSync(new URL(`../public/points/${name}.bin`, import.meta.url), new Uint8Array(out));
  console.log(name, k, "dots,", (out.byteLength / 1024).toFixed(0), "KB");
}
