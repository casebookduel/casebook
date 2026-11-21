// The two agents' colours and the small maths the scene shares.
import type { Pal } from "./sample";
export { mix3, sstep, type Pal } from "./sample";
export const EMERALD: Pal = { deep: [0.03, 0.3, 0.19], mid: [0.25, 0.88, 0.58], hi: [0.86, 0.99, 0.9], core: [0.5, 1, 0.72] };
export const SILVER: Pal = { deep: [0.22, 0.24, 0.27], mid: [0.74, 0.78, 0.82], hi: [0.97, 0.98, 1.0], core: [1, 1, 1] };
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
