"use client";
// The hero. Holmes (emerald) and Moriarty (silver) are point clouds sampled from their busts.
// Opening: scattered dots gather into rings, then form both agents.
// Then the scene replays the latest graded hour, one exchange per question: both fire at once; a right answer lands on
// the other's ring, a wrong one comes apart halfway, and when both are right the two bolts meet and break apart.
// After the last question the hour ends: Holmes's ring tightens and keeps its dots, Moriarty's blows apart.
// Holmes's ring is orderly (a bright band writes its way round, kept answers spiral in); Moriarty's wobbles and leaks.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildBody } from "./duel/body";
import { decodePoints } from "./duel/sample";
import { clamp, EMERALD, mix3, SILVER, type Pal } from "./duel/palette";
import { Pool } from "./duel/pool";
import { ARENA_VERT, FX_FRAG, FX_VERT } from "./duel/shaders";

export type Exchange = { h: boolean; m: boolean };

const EX = 2.4;    // seconds per replayed question
const END = 2.8;   // the end-of-hour beat
const FIRE = 0.14, FLY = 0.34, FIZZLE = 0.42;  // inside one exchange: when both fire, the flight's share, where a wrong bolt dies

export default function DuelScene({ exchanges = [] }: { exchanges?: Exchange[] }) {
  const box = useRef<HTMLDivElement>(null);
  const key = exchanges.map((e) => `${+e.h}${+e.m}`).join("");
  useEffect(() => {
    const el = box.current; if (!el) return;
    const seq: Exchange[] = key ? key.match(/../g)!.map((s) => ({ h: s[0] === "1", m: s[1] === "1" })) : [];
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = el.clientWidth < 700;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });   // soft round points need no MSAA
    renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.25 : 1.5));   // glowing points look the same, at about half the fill
    renderer.setSize(el.clientWidth, el.clientHeight); el.appendChild(renderer.domElement);
    const dpr = renderer.getPixelRatio();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, el.clientWidth / Math.max(1, el.clientHeight), 0.01, 100);
    const body: Record<string, THREE.IUniform> = {
      uTime: { value: 0 }, uSize: { value: (small ? 3.2 : 3.6) * dpr }, uGather: { value: still ? 1 : 0 }, uForm: { value: still ? 1 : 0 }, uFade: { value: 1 }, uAspect: { value: 1 },
    };
    const fxU = { uSize: { value: 4.2 * dpr }, uFade: { value: still ? 1 : 0 } };
    const fxMat = (additive: boolean) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true, uniforms: fxU, vertexShader: FX_VERT, fragmentShader: FX_FRAG,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    // the arena behind them: built before the models load, so it is there from the first frame of the opening
    const pulse = new THREE.Vector3(0, -99, 0);
    const arenaU = { uTime: { value: 0 }, uSize: { value: 7.5 * dpr }, uFade: { value: still ? 1 : 0 }, uRot: { value: 0 }, uScatter: { value: 0 }, uScale: { value: 6.6 }, uPulse: { value: pulse } };
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const arena = (() => {
      const N = small ? 5000 : 11000, ang = new Float32Array(N), rad = new Float32Array(N), hy = new Float32Array(N), seed = new Float32Array(N);
      for (let i = 0; i < N; i++) { ang[i] = Math.random() * Math.PI * 2; rad[i] = 1 + gauss() * 0.012; hy[i] = gauss() * 0.006; seed[i] = Math.random(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      for (const [k, v] of [["ang", ang], ["rad", rad], ["hy", hy], ["seed", seed]] as const) g.setAttribute(k, new THREE.BufferAttribute(v, 1));
      const pts = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: arenaU, vertexShader: ARENA_VERT, fragmentShader: FX_FRAG }));
      pts.frustumCulled = false; pts.renderOrder = 1; pts.rotation.x = 0.1; return pts;
    })();
    scene.add(arena);
    const stage = el.parentElement as HTMLElement | null;

    // framing: the whole duel, both agents and both rings, always fits the width, so nothing is cut at the sides;
    // on wide screens the agents stand further apart and the exchange gets the room
    const L = { gap: 1.28, k: 0.82, y: 0.5, ringY: 0.84, R: 0.57, arc: 0.62, z: 5.9 };
    let holmes: ReturnType<typeof buildBody> | null = null, moriarty: ReturnType<typeof buildBody> | null = null;
    let ready = false, sink = 0;
    const fit = () => {
      const w = el.clientWidth, h = Math.max(1, el.clientHeight), aspect = w / h, phone = w < 700;
      camera.fov = phone ? 30 : 28; camera.aspect = aspect; body.uAspect.value = aspect;
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      L.k = phone ? 1.0 : 0.82; L.R = 0.7 * L.k;
      L.gap = phone ? 0.66 : clamp(0.62 + 0.38 * aspect, 0.95, 1.5);
      L.y = phone ? 0.18 : 0.5; L.ringY = L.y + 0.42 * L.k; L.arc = phone ? 0.5 : 0.62;
      L.z = Math.max(phone ? 5.4 : 5.9, (L.gap + L.R + (phone ? 0.12 : 0.2)) / (tan * aspect));
      // the head tops stay about 13% from the top of the frame, whatever the distance
      const top = L.y + 0.875 * L.k;
      camera.position.set(0, phone ? 0.3 + (L.z - 5.4) * 0.05 : top - 0.74 * tan * L.z, L.z);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      // the arena ring always runs past both edges of the screen
      const RG = Math.max(6.6, tan * (L.z + 8) * aspect * 1.12);
      arena.scale.setScalar(RG); arena.position.set(0, L.ringY - 0.15, -8); arenaU.uScale.value = RG;
      // where the agents stand on screen, for the name plates above their heads
      const half = tan * L.z * aspect;
      stage?.style.setProperty("--hx", `${(50 - (25 * L.gap) / half * 2).toFixed(2)}%`);
      stage?.style.setProperty("--mx", `${(50 + (25 * L.gap) / half * 2).toFixed(2)}%`);
      if (holmes && moriarty) {
        holmes.group.position.set(-L.gap, L.y, 0); moriarty.group.position.set(L.gap, L.y, 0);
        holmes.group.scale.setScalar(L.k); moriarty.group.scale.setScalar(L.k);
      }
      if (still && ready) renderer.render(scene, camera);
    };
    fit();

    let raf = 0, disposed = false, visible = true;
    const pointer = new THREE.Vector2(0, 0), smooth = new THREE.Vector2(0, 0);
    // look-at input: the pointer across the whole window, always inside -1..1. (Measuring it against the hero's box
    // gave huge values once the hero had scrolled away, which turned the busts upside down on the way back up.)
    const ptr = { x: -9999, y: -9999 }, off = [0, 0], vel = [0, 0];
    let over = -1, drag = -1, downX = 0, downT = 0, lastX = 0, lastT = 0;
    let poke: (k: number, x: number, y: number) => void = () => {};
    const onMove = (e: PointerEvent) => {
      pointer.set(clamp((e.clientX / innerWidth) * 2 - 1, -1, 1), clamp(-(e.clientY / innerHeight) * 2 + 1, -1, 1));
      ptr.x = e.clientX; ptr.y = e.clientY;
      if (drag < 0) return;   // dragging a bust turns it; letting go springs it back
      const now = performance.now(), d = ((e.clientX - lastX) / innerWidth) * 4;
      off[drag] += d; vel[drag] = d / Math.max(0.008, (now - lastT) / 1000); lastX = e.clientX; lastT = now;
    };
    const ndcOf = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
    const onDown = (e: PointerEvent) => { if (over < 0) return; drag = over; downX = lastX = e.clientX; downT = lastT = performance.now(); };
    const onUp = (e: PointerEvent) => {
      if (drag < 0) return;
      const k = drag; drag = -1;
      if (e.type === "pointerup" && Math.abs(e.clientX - downX) < 6 && performance.now() - downT < 350) { const [x, y] = ndcOf(e); poke(k, x, y); }
    };
    const onTap = (e: Event) => poke((e as CustomEvent<string>).detail === "m" ? 1 : 0, NaN, NaN);   // a plate was pressed
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onUp);
    window.addEventListener("duel:tap", onTap);
    window.addEventListener("pointermove", onMove);
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }); io.observe(el);
    const ro = new ResizeObserver(fit); ro.observe(el);
    const hero = el.closest(".hero") as HTMLElement | null;

    const load = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.arrayBuffer(); }).then(decodePoints);
    Promise.all([load("/points/holmes.bin"), load("/points/moriarty.bin")]).then(([hg, mg]) => {
      if (disposed) return;
      const count = small ? 32000 : 66000;
      // each agent has its own touch state on top of the shared uniforms
      const touch = () => ({ uPointer: { value: new THREE.Vector2(9, 9) }, uHover: { value: 0 }, uTap: { value: new THREE.Vector3(0, 0, -99) } });
      const hT = touch(), mT = touch();
      const H = buildBody(hg, count, { ...body, ...hT }), M = buildBody(mg, count, { ...body, ...mT });
      const hv = new THREE.Vector3(), head = [new THREE.Vector2(), new THREE.Vector2()];
      poke = (k, x, y) => {   // a ripple through the bust from where it was touched (or from the face), and a word from the agent
        const T = k ? mT : hT, at = Number.isNaN(x) ? head[k] : new THREE.Vector2(x, y);
        (T.uTap.value as THREE.Vector3).set(at.x, at.y, clock.getElapsedTime());
        if (k) hitM = Math.max(hitM, 0.5); else glowH = 1;
        window.dispatchEvent(new CustomEvent("duel:poke", { detail: k ? "m" : "h" }));
      };
      holmes = H; moriarty = M;
      scene.add(H.group, M.group);
      fit();

      // the two memory rings, each in its agent's ring pivot (local radius 0.7)
      const RING = 640;
      const ring = (pal: Pal, pivot: THREE.Group) => {
        const pool = new Pool(RING, fxMat(false)); pivot.add(pool.points);
        const a = new Float32Array(RING), rr = new Float32Array(RING), ry = new Float32Array(RING), sd = new Float32Array(RING), base: number[][] = [];
        for (let i = 0; i < RING; i++) { a[i] = Math.random() * Math.PI * 2; rr[i] = 0.7 * (1 + (Math.random() - 0.5) * 0.09); ry[i] = (Math.random() - 0.5) * 0.035; sd[i] = Math.random(); base.push(mix3(pal.mid, pal.hi, 0.3 + 0.5 * Math.random())); }
        return { pool, a, rr, ry, sd, base };
      };
      const hr = ring(EMERALD, H.pivot), mr = ring(SILVER, M.pivot);
      // kept answers: dots that spiral into Holmes's ring when his bolt lands
      const FL = 60, fl = new Pool(FL, fxMat(true)); H.pivot.add(fl.points);
      const flT = new Float32Array(FL).fill(-9), flA = new Float32Array(FL), flY = new Float32Array(FL);
      let flNext = 0;
      // bolts and sparks live in world space
      const TRAIL = small ? 130 : 220, HEAD = 2, PER = TRAIL + HEAD, bolts = new Pool(PER * 2, fxMat(true)); scene.add(bolts.points);
      const FLASH = 6, flash = new Pool(FLASH, fxMat(true)); scene.add(flash.points);
      const fxT = new Float32Array(FLASH).fill(-9), fxC: number[][] = Array.from({ length: FLASH }, () => [1, 1, 1]); let flashNext = 0;
      const flashAt = (x: number, y: number, z: number, c: number[], t: number) => { const i = flashNext; flashNext = (flashNext + 1) % FLASH; flash.pos[i * 3] = x; flash.pos[i * 3 + 1] = y; flash.pos[i * 3 + 2] = z; fxT[i] = t; fxC[i] = c; };
      const SP = small ? 900 : 1800, sp = new Pool(SP, fxMat(true)); scene.add(sp.points);
      const spV = new Float32Array(SP * 3), spL = new Float32Array(SP), spM = new Float32Array(SP).fill(1);
      const spC: number[][] = Array.from({ length: SP }, () => [1, 1, 1]);
      let spNext = 0;
      const spark = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, c: number[]) => {
        const i = spNext; spNext = (spNext + 1) % SP;
        sp.pos[i * 3] = x; sp.pos[i * 3 + 1] = y; sp.pos[i * 3 + 2] = z; spV[i * 3] = vx; spV[i * 3 + 1] = vy; spV[i * 3 + 2] = vz;
        spL[i] = life; spM[i] = life; spC[i] = c;
      };
      const burst = (x: number, y: number, z: number, n: number, speed: number, cs: number[][], dir = 0) => {
        for (let j = 0; j < n; j++) {
          const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), v = speed * (0.35 + 0.65 * Math.random());
          let vx = Math.sin(ph) * Math.cos(th) * v; const vy = Math.cos(ph) * v * 0.8, vz = Math.sin(ph) * Math.sin(th) * v * 0.6;
          if (dir) vx = Math.abs(vx) * dir;
          spark(x, y, z, vx, vy, vz, 0.6 + 0.5 * Math.random(), cs[j % cs.length]);
        }
      };
      const shock = (x: number, y: number, z: number, n: number, cs: number[][]) => {   // a ring of sparks opening in the picture plane
        for (let j = 0; j < n; j++) { const th = (j / n) * Math.PI * 2 + Math.random() * 0.08, v = 1.05 * (0.82 + 0.36 * Math.random()); spark(x, y, z, Math.cos(th) * v, Math.sin(th) * v, (Math.random() - 0.5) * 0.3, 0.42 + 0.2 * Math.random(), cs[j % cs.length]); }
      };

      // a bolt flies on an arc from the inner side of one ring to the inner side of the other
      const q = new THREE.Vector3();
      const arcAt = (from: number, u: number, out: THREE.Vector3) => {   // from = -1 for Holmes, +1 for Moriarty
        const ax = from * (L.gap - L.R * 0.8), dx = -ax, w = 1 - u, y0 = L.ringY - sink;
        out.set(w * w * ax + u * u * dx, y0 + 2 * w * u * L.arc, 0.15 + 0.25 * Math.sin(u * Math.PI));
        return out;
      };
      // charge (0..1) gathers a glow at the launch point before the shot; alive draws the bolt in flight
      const drawBolt = (slot: number, from: number, head: number, alive: boolean, charge: number, pal: Pal) => {
        const o = slot * PER;
        for (let j = 0; j < PER; j++) bolts.alpha[o + j] = 0;
        if (!alive && charge <= 0) return;
        arcAt(from, alive ? head : 0, q);
        bolts.set(o, q.x, q.y, q.z, pal.mid, alive ? 12 : 10 * charge, alive ? 0.3 : 0.26 * charge);   // soft halo
        bolts.set(o + 1, q.x, q.y, q.z, pal.core, alive ? 4.4 : 3.6 * charge, alive ? 1 : charge);      // bright core
        if (!alive) return;
        const len = Math.min(head, 0.4);   // the tail reaches back at most this far along the arc
        for (let j = 0; j < TRAIL; j++) {
          const f = j / (TRAIL - 1), u = head - f * len, taper = 1 - f;
          arcAt(from, u, q);
          bolts.set(o + HEAD + j, q.x, q.y, q.z, mix3(pal.core, pal.mid, Math.min(1, f * 1.8)), 0.5 + 2.7 * taper * taper, 0.8 * taper ** 1.7);
        }
      };
      const fizzle = (from: number, head: number, pal: Pal) => {   // a wrong answer: the bolt comes apart into dust
        for (let j = 0; j < TRAIL; j += 4) {
          arcAt(from, Math.max(0, head - (j / TRAIL) * 0.4), q);
          const k = 1 - j / TRAIL;
          spark(q.x, q.y, q.z, (Math.random() - 0.5) * 0.28 * k, (Math.random() - 0.3) * 0.24 * k, (Math.random() - 0.5) * 0.18, 0.8 + 0.6 * Math.random(), mix3(pal.mid, [0.42, 0.47, 0.45], 0.3));
        }
      };

      const clock = new THREE.Clock();
      let last = 0, ex = -2, fired = { mid: false, hEnd: false, mEnd: false };
      let hitH = 0, hitM = 0, glowH = 0, p = 0;
      const t0 = 2.8;   // the replay starts once the agents have formed
      const cycle = Math.max(1, seq.length) * EX + END;
      ready = true;
      const loop = () => {
        if (!still) raf = requestAnimationFrame(loop);
        if (!visible) return;
        const t = still ? 3.9 : clock.getElapsedTime(), dt = still ? 0 : Math.min(0.05, t - last); last = t;
        body.uTime.value = t;
        if (!still) { body.uGather.value = Math.min(1, t / 1.1); body.uForm.value = clamp((t - 1.0) / 1.5, 0, 1); }
        const fxIn = still ? 1 : clamp(((body.uForm.value as number) - 0.6) * 2.5, 0, 1);

        // scrolling the hero away: the camera eases back, the agents sink and the dots dim
        if (hero && !still) {
          const np = clamp(window.scrollY / Math.max(1, hero.offsetHeight), 0, 1);
          if (Math.abs(np - p) > 0.001) { p = np; hero.style.setProperty("--p", p.toFixed(3)); }
          if (p > 0.999) return;   // the next section covers the hero completely: nothing to draw
        }
        sink = 0.35 * p;
        camera.position.z = L.z * (1 + 0.22 * p);
        body.uFade.value = 1 - 0.7 * p; fxU.uFade.value = fxIn * (1 - 0.8 * p);
        const bgIn = still ? 1 : clamp(t / 1.6, 0, 1);
        arenaU.uTime.value = t; arenaU.uRot.value = t * 0.025; arenaU.uFade.value = bgIn * (1 - 0.5 * p);
        H.group.position.y = M.group.position.y = L.y - sink;

        // which question is being replayed
        let i = -1, s = 0;
        if (!still && seq.length && t > t0) {
          const T = (t - t0) % cycle; i = Math.floor(T / EX);
          if (i >= seq.length) { i = -1; s = (T - seq.length * EX) / END; } else s = (T - i * EX) / EX;
          if (i !== ex) { ex = i; fired = { mid: false, hEnd: false, mEnd: false }; window.dispatchEvent(new CustomEvent("duel:exchange", { detail: i })); }
        }
        const e = i >= 0 ? seq[i] : null;
        const lin = e ? clamp((s - FIRE) / FLY, 0, 1) : 0, u = (1 - Math.cos(Math.PI * lin)) / 2, flying = !!e && s >= FIRE;
        // where each bolt stops: it lands (1), meets the other one at the top of the arc (0.5), or dies (FIZZLE)
        const hEnd = e ? (e.h ? (e.m ? 0.5 : 1) : FIZZLE) : 0, mEnd = e ? (e.m ? (e.h ? 0.5 : 1) : FIZZLE) : 0;
        const charge = e && s < FIRE ? s / FIRE : 0;
        drawBolt(0, -1, Math.min(u, hEnd), flying && u < hEnd, charge, EMERALD);
        drawBolt(1, 1, Math.min(u, mEnd), flying && u < mEnd, charge, SILVER);
        bolts.flush();
        if (e && flying && u >= hEnd && !fired.hEnd) {
          fired.hEnd = true;
          if (!e.h) fizzle(-1, hEnd, EMERALD);
          else if (!e.m) { arcAt(-1, 1, q); burst(q.x, q.y, q.z, 90, 1.0, [EMERALD.mid, EMERALD.mid, EMERALD.hi], 1); shock(q.x, q.y, q.z, 60, [EMERALD.mid]); flashAt(q.x, q.y, q.z, EMERALD.core, t); hitM = 1; pulse.set(L.gap, t, 1); }
          if (e.h) {   // a right answer from Holmes: kept dots spiral into his ring
            glowH = 1;
            for (let j = 0; j < 20; j++) { const f = flNext; flNext = (flNext + 1) % FL; flT[f] = t + j * 0.04; flA[f] = Math.random() * Math.PI * 2; flY[f] = (Math.random() - 0.5) * 0.5; }
          }
        }
        if (e && flying && u >= mEnd && !fired.mEnd) {
          fired.mEnd = true;
          if (!e.m) fizzle(1, mEnd, SILVER);
          else if (!e.h) { arcAt(1, 1, q); burst(q.x, q.y, q.z, 90, 1.0, [SILVER.hi, SILVER.mid, [1, 1, 1]], -1); shock(q.x, q.y, q.z, 60, [SILVER.hi]); flashAt(q.x, q.y, q.z, SILVER.core, t); hitH = 1; pulse.set(-L.gap, t, 1); }
        }
        if (e && e.h && e.m && flying && u >= 0.5 && !fired.mid) {   // both right: the bolts meet and break apart
          fired.mid = true; arcAt(-1, 0.5, q);
          burst(q.x, q.y, q.z, 160, 1.3, [EMERALD.mid, SILVER.hi, EMERALD.mid, SILVER.mid, EMERALD.hi]); shock(q.x, q.y, q.z, 80, [EMERALD.mid, SILVER.hi]); flashAt(q.x, q.y, q.z, [0.85, 1, 0.92], t); pulse.set(0, t, 1.4);
        }
        hitH = Math.max(0, hitH - dt * 2); hitM = Math.max(0, hitM - dt * 2); glowH = Math.max(0, glowH - dt * 1.2);
        const endEnv = i === -1 && !still && t > t0 ? Math.sin(Math.min(1, s) * Math.PI) : 0;
        arenaU.uScatter.value = endEnv;

        // Holmes's ring: steady, with a bright band that writes its way round; it tightens and brightens as the hour ends
        const wTh = t * 1.25;
        for (let j = 0; j < RING; j++) {
          const a = hr.a[j] + t * 0.22, r = hr.rr[j] * (1 - 0.08 * endEnv + 0.1 * hitH);
          const d = Math.abs((((a - wTh) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
          const w = Math.min(1, Math.exp(-((d / 0.38) ** 2)) * (0.55 + 0.45 * glowH) + 0.5 * endEnv);
          hr.pool.set(j, Math.cos(a) * r, hr.ry[j], Math.sin(a) * r, mix3(mix3(hr.base[j], SILVER.hi, hitH * 0.5), [0.95, 1, 0.96], w * 0.85), 1 + 1.6 * w, 0.7 + 0.3 * w);
        }
        hr.pool.flush();
        // Moriarty's ring: it wobbles, leaks dust all the time, and blows apart as the hour ends
        for (let j = 0; j < RING; j++) {
          const sd = mr.sd[j], a = mr.a[j] + t * 0.16 + 0.18 * Math.sin(t * 0.8 + sd * 7);
          const lk = (t * (0.05 + 0.08 * sd) + sd * 13) % 1, leak = lk > 0.88 ? (lk - 0.88) / 0.12 : 0;
          const r = mr.rr[j] * (1 + 0.035 * Math.sin(t * 2.6 + j)) + 0.5 * leak + 1.26 * endEnv * (0.4 + sd) + 0.08 * hitM;
          const y = mr.ry[j] + leak * (sd - 0.3) * 0.35 + endEnv * (sd - 0.5) * 1.1;
          mr.pool.set(j, Math.cos(a) * r, y, Math.sin(a) * r, mix3(mr.base[j], EMERALD.mid, hitM * 0.75), 1 + 0.6 * hitM, (1 - leak) * (0.8 - 0.25 * endEnv));
        }
        mr.pool.flush();
        // kept dots spiralling in
        for (let j = 0; j < FL; j++) {
          const k = (t - flT[j]) / 1.1;
          if (k < 0 || k > 1) { fl.alpha[j] = 0; continue; }
          const e2 = 1 - Math.pow(1 - k, 3), a = flA[j] + e2 * 2.2, r = 0.7 * (1.9 - 0.9 * e2);
          fl.set(j, Math.cos(a) * r, flY[j] * (1 - e2), Math.sin(a) * r, mix3([1, 1, 0.97], EMERALD.mid, e2), 3.2 - 1.6 * e2, Math.sin(k * Math.PI) * 0.95 + 0.05);
        }
        fl.flush();
        // sparks drift, slow down and fade
        const drag = Math.max(0, 1 - 2.2 * dt);
        for (let j = 0; j < SP; j++) {
          if (spL[j] <= 0) { sp.alpha[j] = 0; continue; }
          spL[j] -= dt; const lf = Math.max(0, spL[j] / spM[j]);
          spV[j * 3] *= drag; spV[j * 3 + 1] *= drag; spV[j * 3 + 2] *= drag;
          sp.pos[j * 3] += spV[j * 3] * dt; sp.pos[j * 3 + 1] += spV[j * 3 + 1] * dt; sp.pos[j * 3 + 2] += spV[j * 3 + 2] * dt;
          const c = spC[j]; sp.col[j * 3] = c[0]; sp.col[j * 3 + 1] = c[1]; sp.col[j * 3 + 2] = c[2];
          sp.size[j] = 0.6 + 1.9 * lf; sp.alpha[j] = lf * lf * (3 - 2 * lf);
        }
        sp.flush();
        for (let j = 0; j < FLASH; j++) {
          const k = (t - fxT[j]) / 0.38;
          if (k < 0 || k > 1) { flash.alpha[j] = 0; continue; }
          flash.size[j] = 8 + 26 * Math.sqrt(k); flash.alpha[j] = (1 - k) ** 2 * 0.9;
          flash.col[j * 3] = fxC[j][0]; flash.col[j * 3 + 1] = fxC[j][1]; flash.col[j * 3 + 2] = fxC[j][2];
        }
        flash.flush();

        // they face each other, glance at the pointer, and flinch when the other one lands a hit
        const kf = still ? 1 : 1 - Math.pow(0.94, dt * 60);
        if (!still) smooth.lerp(pointer, kf);
        // touch: which bust is under the pointer, the drag springs, and a little breathing so they are never still
        const rc = el.getBoundingClientRect(), nx = ((ptr.x - rc.left) / rc.width) * 2 - 1, ny = -((ptr.y - rc.top) / rc.height) * 2 + 1;
        const half = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect, rx = (0.62 * L.k) / half;
        over = -1;
        [H, M].forEach((A, k) => {
          hv.set(A.group.position.x, A.group.position.y + 0.3 * L.k, 0).project(camera);
          head[k].set(hv.x, hv.y);
          if (!still && Math.abs(nx - hv.x) < rx && ny > hv.y - 0.85 && ny < hv.y + 0.55) over = k;
          const T = k ? mT : hT;
          T.uHover.value += ((over === k || drag === k ? 1 : 0) - (T.uHover.value as number)) * (1 - Math.pow(0.85, dt * 60));
          (T.uPointer.value as THREE.Vector2).set(nx, ny);
          if (drag !== k) { vel[k] += (-26 * off[k] - 7 * vel[k]) * dt; off[k] += vel[k] * dt; }
          A.group.scale.setScalar(L.k * (1 + (still ? 0 : 0.007 * Math.sin(t * 1.15 + k * 1.7))));
        });
        el.style.cursor = drag >= 0 ? "grabbing" : over >= 0 ? "grab" : "";
        const face = small ? 0.26 : 0.36;   // Holmes turns a little less: his model already leans toward Moriarty
        const sway = (k: number) => (still ? 0 : 0.035 * Math.sin(t * 0.45 + k * 2.1));
        H.group.rotation.y += ((face * 0.85 + smooth.x * 0.25 - hitH * 0.12 + off[0] + sway(0)) - H.group.rotation.y) * kf;
        M.group.rotation.y += ((-face * 1.15 + smooth.x * 0.25 + hitM * 0.14 + off[1] + sway(1)) - M.group.rotation.y) * kf;
        H.group.rotation.x = M.group.rotation.x = -smooth.y * 0.08;
        M.pivot.rotation.z = 0.12 + 0.07 * Math.sin(t * 0.9);
        renderer.render(scene, camera);
      };
      loop();
    }).catch(() => { /* models missing: the page still reads; the hero just stays empty */ });

    return () => {
      disposed = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      window.removeEventListener("pointermove", onMove); el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); window.removeEventListener("duel:tap", onTap);
      scene.traverse((o) => {
        const m = o as THREE.Points;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      renderer.dispose(); el.innerHTML = "";
    };
  }, [key]);
  return <div ref={box} className="scene" aria-hidden="true" />;
}
