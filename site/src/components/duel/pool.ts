import * as THREE from "three";

// A fixed set of dots, each with its own position, colour, size and alpha, rewritten on the CPU every frame.
export class Pool {
  pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array; geo: THREE.BufferGeometry; points: THREE.Points;
  constructor(public n: number, mat: THREE.Material) {
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1));
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false; this.points.renderOrder = 2;
  }
  set(i: number, x: number, y: number, z: number, c: number[], s: number, a: number) {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2]; this.size[i] = s; this.alpha[i] = a;
  }
  flush() { for (const k of ["position", "color", "size", "alpha"]) this.geo.attributes[k].needsUpdate = true; }
}
