// maps.js – Teil 1 der Arenen: Ring, Grind, Incinerator, Gondola, Trucks, Wheel, Blimp.
// Die übrigen Maps (Containers, Fans, Subway, Towers, Billboard, Aquarium, Lighthouse) liegen in maps2.js,
// das hier bei Bedarf automatisch nachgeladen wird. Die Hilfsklasse Kit wird von maps2.js mitbenutzt.
// buildMap(id, ctx) → { spawns:[[x,y,z]], killY, update(dt,t), dispose() }
import * as THREE from 'three';
import { CANNON, GROUP } from './physics.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const PARTS = ['hips', 'chest', 'head', 'uL', 'hL', 'uR', 'hR', 'tL', 'fL', 'tR', 'fR'];
export const rags = () => (window.__game ? window.__game.players.map(p => p.rag) : []);
export const eachBody = (rag, fn) => { for (const n of PARTS) fn(rag.parts[n].body, n); };
export const killRag = rag => eachBody(rag, b => { b.position.y = -100; b.velocity.setZero(); });
export const say = t => { if (window.__game) window.__game.ui.toast(t, 1400); };

/* ---------- Baukasten für alle Maps ---------- */
export class Kit {
  constructor(ctx) {
    this.ctx = ctx; this.physics = ctx.physics; this.scene = ctx.scene; this.updaters = []; this.mats = new Map();
  }
  mat(color, o = {}) {
    const key = [color, o.rough, o.metal, o.emissive, o.ei, o.opacity].join('|');
    if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? .6, metalness: o.metal ?? 0, emissive: o.emissive ?? '#000000', emissiveIntensity: o.ei ?? 1,
      transparent: o.opacity != null, opacity: o.opacity ?? 1,
    }));
    return this.mats.get(key);
  }
  mesh(geo, pos, color, o = {}) {
    const m = new THREE.Mesh(geo, this.mat(color, o));
    m.position.set(...pos); if (o.rot) m.rotation.set(...o.rot);
    m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
    (o.parent || this.scene).add(m); return m;
  }
  deco(size, pos, color, o) { return this.mesh(new THREE.BoxGeometry(...size), pos, color, o); }
  // Quader mit Physik. mass 0 = fest, kin = bewegt per Geschwindigkeit, sonst dynamisch.
  solid(o) {
    const { size, pos = [0, 0, 0], rot = [0, 0, 0], color = '#888', mat = 'floor', mass = 0, kin = false } = o;
    const body = this.physics.box({ size, pos, rot, mass, material: mat, kinematic: kin });
    const mesh = this.mesh(new THREE.BoxGeometry(...size), pos, color, { ...o, rot });
    if (mass > 0 || kin) this.physics.link(body, mesh);
    return { body, mesh };
  }
  sky(color, near = 50, far = 150) {
    const s = this.ctx.sceneRoot; s.background = new THREE.Color(color);
    if (s.fog) { s.fog.color.set(color); s.fog.near = near; s.fog.far = far; }
  }
  light(color, intensity, pos, dist = 40) {
    const l = new THREE.PointLight(color, intensity, dist); l.position.set(...pos); this.scene.add(l); return l;
  }
  // Federnde Seilbegrenzung (Ring): bewegt sich nur senkrecht zu seiner Länge und federt zurück.
  rope(pos, axis, color) {
    const len = 14.4, size = axis === 'x' ? [len, .14, .14] : [.14, .14, len];
    const { body } = this.solid({ size, pos, color, mass: 4, mat: 'prop' });
    const n = axis === 'x' ? 'z' : 'x', rest = pos[n === 'z' ? 2 : 0];
    body.linearDamping = .4; body.angularFactor.set(0, 0, 0);
    body.linearFactor.set(n === 'x' ? 1 : 0, 0, n === 'z' ? 1 : 0);
    this.physics.onStep(() => { body.force[n] += (rest - body.position[n]) * 420 - body.velocity[n] * 40; });
  }
  build(spawns, killY) {
    const ctx = this.ctx, s = ctx.sceneRoot;
    const orig = { bg: s.background && s.background.clone(), fog: s.fog && s.fog.color.clone(), near: s.fog && s.fog.near, far: s.fog && s.fog.far, sun: ctx.sun.color.clone(), hemi: ctx.hemi.intensity };
    return {
      spawns, killY,
      update: (dt, t) => { for (const u of this.updaters) u(dt, t); },
      dispose: () => {
        if (orig.bg) s.background = orig.bg;
        if (s.fog && orig.fog) { s.fog.color.copy(orig.fog); s.fog.near = orig.near; s.fog.far = orig.far; }
        ctx.sun.color.copy(orig.sun); ctx.hemi.intensity = orig.hemi;
      },
    };
  }
}

/* ---------- 1. Ring ---------- */
function ring(k) {
  k.sky('#1a1030', 30, 90);
  k.light('#ffd9a0', 90, [0, 11, 0], 40);
  k.solid({ size: [16, 1, 16], pos: [0, -.5, 0], color: '#e4dcc8' });
  k.deco([18, .8, 18], [0, -1.4, 0], '#c2142f');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.solid({ size: [.5, 2.2, .5], pos: [sx * 7.7, 1.1, sz * 7.7], color: '#9aa3ad', metal: .6 });
  const cols = ['#e02424', '#f4f0e6', '#3d6bff'];
  [.55, 1.05, 1.55].forEach((h, i) => {
    for (const s of [-1, 1]) { k.rope([0, h, s * 7.7], 'x', cols[i]); k.rope([s * 7.7, h, 0], 'z', cols[i]); }
  });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * PI * 2;
    k.mesh(new THREE.SphereGeometry(.25, 10, 8), [Math.cos(a) * 14, 3 + (i % 3), Math.sin(a) * 14], '#ffd23f', { emissive: '#ffb000', ei: 2, cast: false });
  }
  return k.build([[-4, .1, -4], [4, .1, -4], [-4, .1, 4], [4, .1, 4], [0, .1, 0]], -4);
}

/* ---------- 2. Grind: Achter-Steg über rotierenden Walzen ---------- */
function grind(k) {
  k.sky('#2a1210', 25, 80);
  k.light('#ff6a3a', 70, [0, 3, 0], 40);
  const seg = (x, z, w, d) => k.solid({ size: [w, .4, d], pos: [x, -.2, z], color: '#7b8591', metal: .6, rough: .4 });
  for (const cx of [-5, 5]) { seg(cx, -4, 10, 2); seg(cx, 4, 10, 2); }
  for (const x of [-9, 0, 9]) seg(x, 0, 2, 10);
  const rollers = [];
  for (let i = 0; i < 8; i++) {
    const x = -10.5 + i * 3, body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: k.physics.materials.floor });
    body.addShape(new CANNON.Box(V(1, 1, 6.5)));
    body.addShape(new CANNON.Box(V(1, 1, 6.5)), V(), new CANNON.Quaternion().setFromEuler(0, 0, PI / 4));
    body.position.set(x, -2.4, 0); body.angularVelocity.set(0, 0, (i % 2 ? 1 : -1) * 2.6);
    body.collisionFilterGroup = GROUP.WORLD; body.collisionFilterMask = -1; k.physics.add(body);
    const g = new THREE.Group(); k.scene.add(g);
    k.mesh(new THREE.BoxGeometry(2, 2, 13), [0, 0, 0], '#8c2b2b', { parent: g, metal: .7, rough: .35 });
    k.mesh(new THREE.BoxGeometry(2, 2, 13), [0, 0, 0], '#8c2b2b', { parent: g, metal: .7, rough: .35, rot: [0, 0, PI / 4] });
    k.physics.link(body, g); rollers.push(body);
  }
  k.updaters.push(() => {
    for (const r of rags()) {
      const h = r.position;
      if (h.y < -.9 && Math.abs(h.x) < 12 && Math.abs(h.z) < 6.5) killRag(r);     // eingezogen
    }
  });
  return k.build([[-7, .1, 4], [7, .1, 4], [-7, .1, -4], [7, .1, -4], [0, .1, 0]], -8);
}

/* ---------- 3. Incinerator: Förderbänder in den Ofen ---------- */
function incinerator(k) {
  k.sky('#24120d', 25, 85);
  const glow = k.light('#ff7a1f', 120, [13, 3, 0], 45);
  k.solid({ size: [24, 1, 16], pos: [0, -.5, 0], color: '#4a4f57', metal: .5 });
  k.solid({ size: [1, 3, 16], pos: [-12.5, 1.5, 0], color: '#3a3f46' });
  k.deco([4, 4, 14], [14.2, 1.6, 0], '#1e1412');
  k.deco([.3, 2.8, 12], [12.2, 1.5, 0], '#ff7a1f', { emissive: '#ff5a00', ei: 3, cast: false });
  const stripes = [];
  for (const z of [-5.5, 5.5]) {
    k.deco([24, .06, 5], [0, .03, z], '#22252a', { cast: false });
    for (let i = 0; i < 12; i++) stripes.push(k.deco([.5, .08, 5], [-12 + i * 2, .06, z], '#f2b705', { cast: false }));
  }
  k.deco([24, .06, 5.6], [0, .02, 0], '#6b727c', { cast: false });
  for (const [x, z, s] of [[-6, 0, 1], [-3, 1.2, 1], [0, -1, 1.4], [3, .5, 1], [6, -1.5, 1]])
    k.solid({ size: [s, s, s], pos: [x, s / 2 + .01, z], color: '#c98a4b', mass: 3, mat: 'prop', rough: .8 });
  k.physics.onStep(() => {
    for (const r of rags()) eachBody(r, b => {
      if (b.mass > 0 && b.position.y < 1.6 && Math.abs(b.position.z) > 3 && Math.abs(b.position.z) < 8 && Math.abs(b.position.x) < 12.5)
        b.force.x += (3.4 - b.velocity.x) * b.mass * 4;                   // Band schiebt Richtung Ofen
    });
  });
  k.updaters.push(dt => {
    for (const s of stripes) { s.position.x += 3.4 * dt; if (s.position.x > 12) s.position.x -= 24; }
    glow.intensity = 100 + Math.random() * 40;
    for (const r of rags()) if (r.position.x > 11.8) killRag(r);          // verbrannt
  });
  return k.build([[-9, .1, -5.5], [-9, .1, 5.5], [-6, .1, 0], [-2, .1, -5.5], [-2, .1, 5.5]], -8);
}

/* ---------- 4. Gondola: zwei Gondeln an Seilen, Seile können reißen ---------- */
function gondola(k) {
  k.sky('#8fd0ff', 60, 220);
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const g2 = cv.getContext('2d'); g2.fillStyle = '#10131c'; g2.fillRect(0, 0, 128, 256);
  for (let y = 4; y < 256; y += 16) for (let x = 4; x < 128; x += 16) { g2.fillStyle = Math.random() < .55 ? '#ffe9a8' : '#2a3350'; g2.fillRect(x, y, 10, 10); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 8); tex.colorSpace = THREE.SRGBColorSpace;
  for (const [x, w, h] of [[0, 60, 90], [-46, 30, 70], [46, 30, 80]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: .5 }));
    b.position.set(x, h / 2 - 30, -10); k.scene.add(b);
  }
  const L = 10.9, STRENGTH = 1400, ropes = [];
  const make = cx => {
    const body = new CANNON.Body({ mass: 30, material: k.physics.materials.floor, linearDamping: .3, angularDamping: .6 });
    body.addShape(new CANNON.Box(V(4, .2, 1.8)));
    body.addShape(new CANNON.Box(V(4, .45, .08)), V(0, .65, -1.7));
    body.addShape(new CANNON.Box(V(.08, .45, 1.8)), V(3.9, .65, 0));
    body.addShape(new CANNON.Box(V(.08, .45, 1.8)), V(-3.9, .65, 0));
    body.position.set(cx, 3, 0); body.collisionFilterGroup = GROUP.WORLD; body.collisionFilterMask = -1; k.physics.add(body);
    const g = new THREE.Group(); k.scene.add(g);
    for (const [s, p, c] of [[[8, .4, 3.6], [0, 0, 0], '#d9dde3'], [[8, .9, .16], [0, .65, -1.7], '#e04b3a'], [[.16, .9, 3.6], [3.9, .65, 0], '#e04b3a'], [[.16, .9, 3.6], [-3.9, .65, 0], '#e04b3a']])
      k.mesh(new THREE.BoxGeometry(...s), p, c, { parent: g });
    k.physics.link(body, g);
    for (const dx of [-3.6, 3.6]) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#1a1a1a' }));
      line.frustumCulled = false; k.scene.add(line);
      ropes.push({ body, local: V(dx, .6, 0), anchor: V(cx + dx, 14.6, 0), line, broken: false, over: 0 });
    }
  };
  make(-5.5); make(5.5);
  const w = V(), d = V(), n = V(), rel = V(), f = V();
  k.physics.onStep(dt => {
    for (const r of ropes) {
      if (r.broken) continue;
      r.body.pointToWorldFrame(r.local, w); r.anchor.vsub(w, d);
      const dist = d.length(); if (dist < 1e-6) continue;
      d.scale(1 / dist, n); r.body.getVelocityAtWorldPoint(w, rel);
      const T = dist > L ? Math.max(0, 6000 * (dist - L) - 250 * rel.dot(n)) : 0;
      n.scale(T, f); w.vsub(r.body.position, rel); r.body.applyForce(f, rel);
      r.over = T > STRENGTH ? r.over + dt : Math.max(0, r.over - dt);
      if (r.over > .25) { r.broken = true; r.line.visible = false; say('Ein Seil reißt!'); }
    }
  });
  k.updaters.push(() => {
    for (const r of ropes) {
      if (r.broken) continue;
      r.body.pointToWorldFrame(r.local, w);
      const p = r.line.geometry.attributes.position; p.setXYZ(0, r.anchor.x, r.anchor.y, r.anchor.z); p.setXYZ(1, w.x, w.y, w.z); p.needsUpdate = true;
    }
  });
  return k.build([[-8, 3.3, 0], [-3, 3.3, 0], [3, 3.3, 0], [8, 3.3, 0]], -25);
}

/* ---------- 5. Trucks: zwei LKWs, Schilder rasen heran ---------- */
function trucks(k) {
  k.sky('#9ad0ff', 60, 200);
  k.solid({ size: [200, 1, 18], pos: [0, -.5, 0], color: '#2c2f36', rough: .9 });
  k.deco([200, .2, 120], [0, -.4, -70], '#5fa35a', { cast: false });
  const cabs = ['#d11f3a', '#3d6bff'];
  [-2.6, 2.6].forEach((z, i) => {
    k.solid({ size: [13.5, .4, 3.4], pos: [1.25, 1.4, z], color: '#c9ced6', metal: .3 });
    k.solid({ size: [2.8, 3.4, 3.4], pos: [-6.9, 1.7, z], color: cabs[i] });
    k.deco([13.5, .6, 3.0], [1.25, .9, z], '#2a2d33');
    k.deco([.1, 1.1, 3.0], [-8.3, 2.4, z], '#9fd8ff', { opacity: .5 });
    for (const x of [-6.6, -1, 1.2, 6.5]) for (const s of [-1, 1])
      k.mesh(new THREE.CylinderGeometry(.6, .6, .5, 20), [x, .6, z + s * 1.55], '#15161a', { rot: [PI / 2, 0, 0] });
  });
  const dashes = [], posts = [];
  for (let i = 0; i < 14; i++) dashes.push(k.deco([3, .02, .25], [-32 + i * 4.6, .02, 0], '#f4f0e6', { cast: false }));
  for (let i = 0; i < 10; i++) for (const s of [-1, 1]) posts.push(k.deco([.25, 6, .25], [-36 + i * 8, 3, s * 9.5], '#6b727c'));
  const signs = []; let timer = 2.5;
  k.updaters.push(dt => {
    for (const d of dashes) { d.position.x += 13 * dt; if (d.position.x > 32) d.position.x -= 64.4; }
    for (const p of posts) { p.position.x += 13 * dt; if (p.position.x > 40) p.position.x -= 80; }
    timer -= dt;
    if (timer <= 0) {
      timer = 2.8 + Math.random() * 1.4;
      const s = k.solid({ size: [.5, 1.2, 9.6], pos: [-34, 2.2, 0], color: '#ff8a1f', kin: true, mat: 'prop', emissive: '#ff5a00', ei: .5 });
      s.mesh.add(new THREE.Mesh(new THREE.BoxGeometry(.52, .25, 9.7), k.mat('#ffffff')));
      s.body.velocity.set(13, 0, 0); signs.push(s);
    }
    for (let i = signs.length - 1; i >= 0; i--) {
      if (signs[i].body.position.x > 34) { k.physics.remove(signs[i].body); signs[i].mesh.removeFromParent(); signs.splice(i, 1); }
    }
  });
  return k.build([[-2, 1.7, -2.6], [4, 1.7, -2.6], [-2, 1.7, 2.6], [4, 1.7, 2.6]], 1.2);
}

/* ---------- 6. Wheel: Riesenrad am Pier ---------- */
function wheel(k) {
  k.sky('#ff9a6b', 50, 160); k.ctx.sun.color.set('#ffb070'); k.ctx.hemi.intensity = .7;
  k.deco([160, .2, 100], [0, -2.6, 0], '#2a78b5', { opacity: .8, metal: .3, rough: .2, cast: false });
  k.solid({ size: [10, .6, 8], pos: [0, -.2, 0], color: '#b88a5a', rough: .8 });
  for (const sx of [-1, 1]) {
    for (const z of [-3.2, 3.2]) k.solid({ size: [6.4, .3, .5], pos: [sx * 8.2, -.25, z], color: '#6b4a2b' });
    for (let i = 0; i < 5; i++) k.solid({ size: [.96, .2, 7.4], pos: [sx * (5.6 + i), 0, 0], color: i % 2 ? '#c99a64' : '#b88a5a', mass: 4, mat: 'prop', rough: .8 });
  }
  const R = 7, cy = 7.6, cz = -6.2, N = 8, OMEGA = .35, wheelG = new THREE.Group();
  wheelG.position.set(0, cy, cz); k.scene.add(wheelG);
  for (const z of [-1.4, 1.4]) k.mesh(new THREE.TorusGeometry(R, .15, 8, 64), [0, 0, z], '#e8e8ee', { parent: wheelG, metal: .4 });
  for (let i = 0; i < 12; i++) k.mesh(new THREE.BoxGeometry(.1, R * 2, .1), [0, 0, 0], '#e8e8ee', { parent: wheelG, rot: [0, 0, i * PI / 12] });
  k.mesh(new THREE.SphereGeometry(.7, 16, 12), [0, 0, 0], '#ff3b6b', { parent: wheelG });
  for (const sx of [-1, 1]) k.deco([.4, cy + 1, .4], [sx * 3.5, (cy - 1) / 2, cz - 1.6], '#9aa3ad', { rot: [0, 0, -sx * .45] });
  const cars = [];
  for (let i = 0; i < N; i++) {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: k.physics.materials.floor });
    body.addShape(new CANNON.Box(V(1.4, .15, 1.2)));
    body.addShape(new CANNON.Box(V(.08, .4, 1.2)), V(1.35, .45, 0)); body.addShape(new CANNON.Box(V(.08, .4, 1.2)), V(-1.35, .45, 0));
    body.collisionFilterGroup = GROUP.WORLD; body.collisionFilterMask = -1; k.physics.add(body);
    const g = new THREE.Group(); k.scene.add(g);
    const col = ['#ff3b6b', '#ffd23f', '#34c8ff', '#9dff2e'][i % 4];
    k.mesh(new THREE.BoxGeometry(2.8, .3, 2.4), [0, 0, 0], col, { parent: g });
    for (const sx of [-1, 1]) k.mesh(new THREE.BoxGeometry(.16, .8, 2.4), [sx * 1.35, .45, 0], col, { parent: g });
    k.physics.link(body, g); cars.push(body);
  }
  const place = (b, i, t, dt) => {
    const a = OMEGA * t + i * 2 * PI / N, tx = R * Math.sin(a), ty = cy - R * Math.cos(a);
    b.velocity.set((tx - b.position.x) / dt, (ty - b.position.y) / dt, 0);
    b.quaternion.setFromEuler(0, 0, .3 * Math.sin(t * 1.3 + i));            // Gondel kippt hin und her
  };
  cars.forEach((b, i) => { b.position.set(0, cy - R, cz); });
  k.physics.onStep((dt, t) => cars.forEach((b, i) => { b.position.z = cz; place(b, i, t, dt); }));
  k.updaters.push((dt, t) => { wheelG.rotation.z = OMEGA * t; });
  return k.build([[-3, .2, 0], [3, .2, 0], [-3, .2, 2.5], [3, .2, 2.5], [0, .2, 0]], -4.5);
}

/* ---------- 7. Blimp: rutschige Oberseite eines Zeppelins ---------- */
function blimp(k) {
  k.sky('#6fb7ff', 80, 260);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), k.mat('#e8e2d0', { rough: .5 }));
  body.scale.set(12, 4.6, 5.2); body.position.set(0, -4.6, 0); body.castShadow = body.receiveShadow = true; k.scene.add(body);
  for (const [r, s] of [[0, 1], [PI / 2, 1]]) k.deco([3, .2, 4.5], [-12, -4.6, 0], '#c2142f', { rot: [r, 0, 0] });
  k.deco([2, 2.5, .2], [-12, -4.6 + 2.2, 0], '#c2142f');
  const prop = k.deco([.2, 3, .3], [-13.2, -4.6, 0], '#444444', { cast: false });
  k.deco([8, .1, 5], [0, -.05, 0], '#e8e2d0', { cast: false });
  const S = 'slippery';
  k.solid({ size: [12, 1, 4], pos: [0, -.5, 0], color: '#e8e2d0', mat: S, rough: .3, cast: false });
  for (const sg of [-1, 1]) {
    const th = .5, w = 3.2, t = .6, c = Math.cos(th), s = Math.sin(th);
    const cz = sg * (2 + (w / 2) * c - (t / 2) * s), cy = -(w / 2) * s - (t / 2) * c;
    k.solid({ size: [12, t, w], pos: [0, cy, cz], rot: [sg * th, 0, 0], color: '#d8d2c0', mat: S, rough: .3, cast: false });
  }
  const clouds = [];
  for (let i = 0; i < 14; i++) clouds.push(k.mesh(new THREE.SphereGeometry(2 + Math.random() * 2.5, 12, 10), [-40 + i * 6.5, -14 - Math.random() * 6, (Math.random() - .5) * 40], '#ffffff', { opacity: .85, cast: false }));
  let gust = { phase: 'wait', t: 4 + Math.random() * 3, dir: 1 };
  k.physics.onStep(() => {
    if (gust.phase !== 'blow') return;
    for (const r of rags()) eachBody(r, b => { b.force.z += gust.dir * b.mass * 9; });
  });
  k.updaters.push(dt => {
    prop.rotation.x += dt * 25;
    for (const c of clouds) { c.position.x -= dt * 2.5; if (c.position.x < -45) c.position.x += 90; }
    gust.t -= dt;
    if (gust.t <= 0) {
      if (gust.phase === 'wait') { gust = { phase: 'warn', t: 1, dir: Math.random() < .5 ? 1 : -1 }; say('Windböe!'); }
      else if (gust.phase === 'warn') gust = { phase: 'blow', t: 1.6, dir: gust.dir };
      else gust = { phase: 'wait', t: 5 + Math.random() * 4, dir: 1 };
    }
  });
  return k.build([[-4, .1, -.8], [4, .1, -.8], [-4, .1, .8], [4, .1, .8], [0, .1, 0]], -30);
}

const MAPS = { ring, grind, incinerator, gondola, trucks, wheel, blimp };

export function buildMap(id, ctx) {
  const k = new Kit(ctx);
  if (MAPS[id]) return MAPS[id](k);
  return import('./maps2.js').then(m => m.buildMap2(id, k)).catch(() => null);
}
