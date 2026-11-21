// GLSL for the duel. Comments inside the strings use /* */ only: a // in a one-line string would swallow code.
export const BODY_VERT = `
attribute float seed; attribute vec3 aStart; attribute vec3 aRing;
uniform float uTime; uniform float uSize; uniform float uGather; uniform float uForm; uniform float uFade;
uniform vec2 uPointer; uniform float uHover; uniform vec3 uTap; uniform float uAspect;
varying vec3 vC; varying float vA;
float easeOut(float x){ return x >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * x); }
void main(){
  float g = easeOut(clamp(uGather * 1.35 - seed * 0.35, 0.0, 1.0));
  float f = easeOut(clamp(uForm * 1.35 - seed * 0.35, 0.0, 1.0));
  vec3 p = mix(mix(aStart, aRing, g), position, f);
  float tw = 0.95 + 0.05 * sin(uTime * 0.8 + seed * 40.0);
  float band = exp(-pow((position.y - (mod(uTime * 0.22, 2.4) - 1.2)) * 9.0, 2.0)) * f;
  vC = mix(color, vec3(0.93, 0.95, 0.90), 0.35 * band);
  vA = uFade * tw * mix(1.0, smoothstep(-0.95, -0.35, position.y), f);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 cl = projectionMatrix * mv;
  vec2 ndc = cl.xy / cl.w;
  vec2 dv = (ndc - uPointer) * vec2(uAspect, 1.0);
  float near = uHover * f * exp(-dot(dv, dv) / 0.02);                      /* under the finger: lift toward you */
  float since = uTime - uTap.z;
  vec2 dt = (ndc - uTap.xy) * vec2(uAspect, 1.0);
  float tap = f * step(0.0, since) * exp(-since * 2.2) * exp(-pow((length(dt) - since * 0.9) * 14.0, 2.0));   /* a tap: a ripple runs out */
  mv.z += 0.16 * near + 0.1 * tap;
  mv.xy += normalize(dv + vec2(1e-5)) * 0.02 * near;
  vC = mix(vC, vec3(0.95, 1.0, 0.97), clamp(0.22 * near + 0.5 * tap, 0.0, 0.6));
  gl_PointSize = uSize * (2.4 / -mv.z) * (0.75 + 0.5 * seed) * (1.0 + 0.6 * near + 0.5 * tap);
  gl_Position = projectionMatrix * mv;
}`;
export const BODY_FRAG = `
varying vec3 vC; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; float e = 1.0 - smoothstep(0.12, 0.25, r); gl_FragColor = vec4(vC * (0.8 + 0.2 * e), vA * (0.6 + 0.4 * e)); }`;
// rings, bolts and sparks: every dot carries its own size and alpha
export const FX_VERT = `
attribute float size; attribute float alpha;
uniform float uSize; uniform float uFade;
varying vec3 vC; varying float vA;
void main(){
  vC = color; vA = alpha * uFade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * size * (2.4 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
export const FX_FRAG = `
varying vec3 vC; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vC, vA * (1.0 - smoothstep(0.1, 0.25, r))); }`;

export const ARENA_VERT = `
attribute float ang; attribute float rad; attribute float hy; attribute float seed;
uniform float uTime; uniform float uSize; uniform float uFade; uniform float uRot; uniform float uScatter; uniform float uScale; uniform vec3 uPulse;
varying vec3 vC; varying float vA;
void main(){
  float a = ang + uRot;
  float side = smoothstep(-0.3, 0.3, cos(a));   /* 0 on Holmes's half (left), 1 on Moriarty's (right) */
  float loose = side * step(0.6, seed);         /* on Moriarty's half a share of the dots break loose */
  float drift = loose * fract(seed * 13.7 + uTime * 0.04) * (1.0 + 2.0 * uScatter);
  float r = rad + drift * 0.09;
  vec3 p = vec3(cos(a) * r, hy + drift * (seed - 0.8) * 0.12, sin(a) * r);
  vec3 em = mix(vec3(0.04, 0.36, 0.22), vec3(0.25, 0.88, 0.58), seed);
  vec3 si = vec3(0.6, 0.65, 0.7) * (0.75 + 0.25 * seed);
  float since = max(0.0, uTime - uPulse.y);
  float wave = uPulse.z * exp(-since * 1.3) * exp(-pow((abs(p.x * uScale - uPulse.x) - since * 5.0) * 0.8, 2.0));
  vC = mix(mix(em, si, side), vec3(0.9, 1.0, 0.94), clamp(wave, 0.0, 1.0) * 0.7);
  vA = uFade * (0.34 + 0.26 * (1.0 - side) + 0.6 * wave) * (1.0 - 0.6 * smoothstep(0.0, 0.5, drift));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(1.0, uSize * (2.4 / -mv.z) * (0.55 + 0.9 * seed) * (1.0 + wave));
  gl_Position = projectionMatrix * mv;
}`;
