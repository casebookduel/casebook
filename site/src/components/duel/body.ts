import * as THREE from "three";
import { BODY_FRAG, BODY_VERT } from "./shaders";

type Baked = { P: Float32Array; C: Float32Array; S: Float32Array; k: number };

// One bust as a point cloud from baked dots (see scripts/bake-points.ts). Each dot also gets a random start position
// and a place on a ring, which the opening animates through. `count` keeps the first n dots: the bake is in random
// order, so any prefix is an even thinning of the whole bust (phones take fewer).
export function buildBody(src: Baked, count: number, uniforms: Record<string, THREE.IUniform>) {
  const k = Math.min(count, src.k);
  const A0 = new Float32Array(k * 3), AR = new Float32Array(k * 3);
  for (let i = 0; i < k; i++) {
    const r = 2.6 + Math.random() * 2.2, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    A0.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th)], i * 3);
    const a = Math.random() * Math.PI * 2, rr = 0.9 + (Math.random() - 0.5) * 0.08;
    AR.set([Math.cos(a) * rr, Math.sin(a) * rr * 0.36 + 0.2, Math.sin(a) * 0.25], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(src.P.subarray(0, k * 3), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(src.C.subarray(0, k * 3), 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(src.S.subarray(0, k), 1));
  geo.setAttribute("aStart", new THREE.BufferAttribute(A0, 3));
  geo.setAttribute("aRing", new THREE.BufferAttribute(AR, 3));
  // depth on: the dots at the front hide the ones behind them, so the face reads as one surface instead of speckle
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: true, vertexColors: true, uniforms, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG });
  const group = new THREE.Group(); group.add(new THREE.Points(geo, mat));
  const pivot = new THREE.Group(); pivot.position.set(0, 0.42, 0); pivot.rotation.set(0.32, 0, 0.12); group.add(pivot);
  return { group, pivot };
}
