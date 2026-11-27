// maps2.js – Teil 2 der Arenen: Containers, Fans, Subway, Towers, Billboard, Aquarium, Lighthouse.
// Wird von maps.js bei Bedarf nachgeladen: buildMap2(id, kit) → Map-Objekt oder null.
import * as THREE from 'three';
import { CANNON, GROUP } from './physics.js';
import { rags, eachBody, killRag, say } from './maps.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const addBody = (k, b) => { b.collisionFilterGroup = GROUP.WORLD; b.collisionFilterMask = -1; return k.physics.add(b); };
const kinBody = (k, mat = 'floor') => new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: k.physics.materials[mat] });

// Körper an Seilfedern aufhängen (nur Zug, kein Druck). locals = Anhängepunkte am Körper, anchors = feste Punkte oben.
function hang(k, body, locals, anchors, L, kS = 6000, c = 250) {
  const w = V(), d = V(), n = V(), rel = V(), f = V();
  const lines = anchors.map(() => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#222222' }));
    l.frustumCulled = false; k.scene.add(l); return l;
  });
  k.physics.onStep(() => {
    locals.forEach((loc, i) => {
      body.pointToWorldFrame(loc, w); anchors[i].vsub(w, d);
      const dist = d.length(); if (dist < 1e-6 || dist <= L) return;
      d.scale(1 / dist, n); body.getVelocityAtWorldPoint(w, rel);
      n.scale(Math.max(0, kS * (dist - L) - c * rel.dot(n)), f); w.vsub(body.position, rel); body.applyForce(f, rel);
    });
  });
  k.updaters.push(() => locals.forEach((loc, i) => {
    body.pointToWorldFrame(loc, w); const p = lines[i].geometry.attributes.position;
    p.setXYZ(0, anchors[i].x, anchors[i].y, anchors[i].z); p.setXYZ(1, w.x, w.y, w.z); p.needsUpdate = true;
  }));
}

// Zerstörbares Geländer: hält per Feder an seinem Platz und bricht los, wenn es zu weit gedrückt wird.
function rail(k, pos, size) {
  const { body } = k.solid({ size, pos, color: '#e8e8ee', mass: 3, mat: 'prop', metal: .4 });
  const rest = body.position.clone(); let broken = false;
  body.angularFactor.set(0, 0, 0);
  k.physics.onStep(() => {
    if (broken) return;
    const dx = rest.x - body.position.x, dy = rest.y - body.position.y, dz = rest.z - body.position.z;
    body.force.x += dx * 700 - body.velocity.x * 30; body.force.y += dy * 700 - body.velocity.y * 30; body.force.z += dz * 700 - body.velocity.z * 30;
    if (Math.hypot(dx, dy, dz) > .8) { broken = true; body.angularFactor.set(1, 1, 1); }
  });
}

/* ---------- 8. Containers: schaukelnde Container am Hafenkran ---------- */
function containers(k) {
  k.sky('#7fb3d9', 70, 240);
  k.deco([240, .2, 240], [0, -22, 0], '#1d5c8a', { cast: false, opacity: .9 });
  k.deco([40, 1.2, 1.6], [0, 17.6, 0], '#f2b705');
  for (const sx of [-1, 1]) k.deco([1.6, 44, 1.6], [sx * 19, -4, 0], '#f2b705');
  k.deco([44, 5, 16], [0, -17, -10], '#3a4a5a');
  const make = (cx, col, ph) => {
    const body = new CANNON.Body({ mass: 60, material: k.physics.materials.floor, linearDamping: .25, angularDamping: .6 });
    body.addShape(new CANNON.Box(V(4, .25, 1.6))); body.position.set(cx, 4, 0); addBody(k, body);
    const g = new THREE.Group(); k.scene.add(g);
    k.mesh(new THREE.BoxGeometry(8, .5, 3.2), [0, 0, 0], col, { parent: g });
    k.mesh(new THREE.BoxGeometry(8, 2.6, 3.2), [0, -1.55, 0], col, { parent: g, rough: .8 });
    for (let i = -3; i <= 3; i++) k.mesh(new THREE.BoxGeometry(.12, 2.4, 3.3), [i * 1.1, -1.55, 0], '#222222', { parent: g, cast: false });
    k.physics.link(body, g);
    const loc = [V(3.8, .25, 1.4), V(-3.8, .25, 1.4), V(3.8, .25, -1.4), V(-3.8, .25, -1.4)];
    hang(k, body, loc, loc.map(p => V(cx + p.x, 16.75, p.z)), 12.4);
    k.physics.onStep((dt, t) => { body.force.x += Math.sin(t * 1.25 + ph) * 140; });
  };
  make(-5.5, '#c2142f', 0); make(5.5, '#2f6fd1', 2.2);
  return k.build([[-8, 4.4, 0], [-3, 4.4, 0], [3, 4.4, 0], [8, 4.4, 0]], -22);
}

/* ---------- 9. Fans: Aufwinde und Ventilatoren ---------- */
function fans(k) {
  k.sky('#0f2a2e', 30, 90); k.light('#7fe0ff', 60, [0, 8, 0], 40);
  k.solid({ size: [24, 1, 16], pos: [0, -.5, 0], color: '#5d6874', metal: .6, rough: .4 });
  k.deco([26, 10, 1], [0, 5, -8.8], '#2a3138');
  const blades = [];
  for (const x of [-8, 0, 8]) {
    k.mesh(new THREE.TorusGeometry(3, .25, 8, 32), [x, 5, -8.2], '#9aa3ad', { metal: .6 });
    const g = new THREE.Group(); g.position.set(x, 5, -8.1); k.scene.add(g); blades.push(g);
    for (let i = 0; i < 4; i++) k.mesh(new THREE.BoxGeometry(2.8, .7, .1), [0, 0, 0], '#cfd5dc', { parent: g, rot: [0, 0, i * PI / 4] });
  }
  for (const [x, dir] of [[-7, 1], [7, -1]]) {                    // Schwenkarme in Kniehöhe
    const b = kinBody(k); b.addShape(new CANNON.Box(V(3.5, .35, .25)));
    b.position.set(x, .6, 2); b.angularVelocity.set(0, dir * 1.5, 0); addBody(k, b);
    const g = new THREE.Group(); k.scene.add(g);
    k.mesh(new THREE.BoxGeometry(7, .7, .5), [0, 0, 0], '#ff3b6b', { parent: g });
    k.mesh(new THREE.CylinderGeometry(.5, .5, .9, 16), [0, 0, 0], '#444a52', { parent: g });
    k.physics.link(b, g);
  }
  const ups = [[0, 0, 2.4], [-8, -4, 1.6], [8, -4, 1.6]];
  for (const [x, z, r] of ups) {
    k.mesh(new THREE.CylinderGeometry(r, r, 14, 24, 1, true), [x, 7, z], '#7fe0ff', { opacity: .12, cast: false });
    k.mesh(new THREE.CylinderGeometry(r, r, .1, 24), [x, .05, z], '#1b2025', { cast: false });
  }
  k.physics.onStep(() => {
    for (const r of rags()) eachBody(r, b => {
      if (b.mass <= 0) return;
      for (const [x, z, rad] of ups) if (Math.hypot(b.position.x - x, b.position.z - z) < rad && b.position.y < 16) b.force.y += b.mass * 40 * (1 - b.position.y / 16);
    });
  });
  k.updaters.push(dt => blades.forEach((g, i) => { g.rotation.z += dt * (4 + i); }));
  return k.build([[-9, .1, -4], [9, .1, -4], [0, .1, 5], [-4, .1, 5], [4, .1, 5]], -12);
}

/* ---------- 10. Subway: einfahrende Züge ---------- */
function subway(k) {
  k.sky('#10131c', 25, 90);
  for (const x of [-10, 0, 10]) k.light('#d8f0ff', 30, [x, 5, 0], 25);
  for (const z of [-5.5, 5.5]) k.solid({ size: [32, 1, 5], pos: [0, -.5, z], color: '#aab4bd', rough: .5 });
  k.solid({ size: [60, 1, 6], pos: [0, -1.7, 0], color: '#2a2d33' });
  k.deco([34, 10, 1], [0, 5, -8.5], '#cfd8dc');
  const lamps = [];
  for (const x of [-10, 0, 10]) for (const z of [-3.3, 3.3]) {
    k.solid({ size: [.6, 4, .6], pos: [x, 2, z], color: '#6b727c' });
    const l = k.mesh(new THREE.SphereGeometry(.22, 12, 10), [x, 4.2, z], '#ff2a2a', { emissive: '#ff2a2a', ei: 0, cast: false });
    l.material = l.material.clone(); lamps.push(l);
  }
  const train = k.solid({ size: [24, 3, 4.2], pos: [-60, .45, 0], color: '#cfd5dc', kin: true, mat: 'prop', metal: .3 });
  k.mesh(new THREE.BoxGeometry(24.1, .7, 4.3), [0, .5, 0], '#2a3350', { parent: train.mesh, emissive: '#ffe9a8', ei: .8, cast: false });
  k.mesh(new THREE.BoxGeometry(.2, .6, .6), [12.1, -.3, 1.2], '#ffffff', { parent: train.mesh, emissive: '#ffffff', ei: 3, cast: false });
  let phase = 'wait', timer = 5, blink = 0;
  k.updaters.push(dt => {
    timer -= dt; blink += dt;
    const on = phase === 'warn' && Math.floor(blink * 6) % 2 === 0;
    lamps.forEach(l => { l.material.emissiveIntensity = on ? 4 : 0; });
    const b = train.body;
    if (phase === 'wait' && timer <= 0) { phase = 'warn'; timer = 2.2; say('Zug fährt ein!'); }
    else if (phase === 'warn' && timer <= 0) { phase = 'run'; b.position.x = -45; b.velocity.set(26, 0, 0); }
    else if (phase === 'run') {
      for (const r of rags()) {
        const h = r.position;
        if (Math.abs(h.x - b.position.x) < 12.3 && Math.abs(h.z) < 2.5 && h.y < 2.6) killRag(r);   // überfahren
        else if (Math.abs(h.z) < 6 && Math.abs(h.x - b.position.x) < 13) eachBody(r, bd => { if (bd.mass > 0 && bd.position.y < 2) bd.force.z -= Math.sign(bd.position.z) * bd.mass * 5; });
      }
      if (b.position.x > 45) { b.velocity.set(0, 0, 0); b.position.x = -60; phase = 'wait'; timer = 6 + Math.random() * 3; }
    }
  });
  return k.build([[-8, .1, -5.5], [8, .1, -5.5], [-8, .1, 5.5], [8, .1, 5.5], [0, .1, 5.5]], -9);
}

/* ---------- 11. Towers: Baugerüst mit Abrissbirne ---------- */
function towers(k) {
  k.sky('#e8a56a', 60, 200); k.ctx.sun.color.set('#ffc890');
  for (let i = 0; i < 14; i++) k.deco([6 + Math.random() * 6, 20 + Math.random() * 40, 6], [-60 + i * 9, -20, -40 - Math.random() * 15], '#4a4f66', { emissive: '#ffd890', ei: .15, cast: false });
  k.solid({ size: [18, .5, 9], pos: [0, -.25, 0], color: '#8a8f98', metal: .4 });
  const th = .44, Lr = 6.1;
  for (const s of [-1, 1]) {
    const c = Math.cos(th), sn = Math.sin(th), mx = s * 5.7, my = 1.3;
    k.solid({ size: [Lr, .3, 3], pos: [mx + s * .06, my - .15 * c, 3], rot: [0, 0, s * th], color: '#b88a5a', rough: .9 });
    k.solid({ size: [9, .4, 7], pos: [s * 13, 2.4, 0], color: '#8a8f98', metal: .4 });
    for (const [px, pz] of [[-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3]]) k.deco([.25, 40, .25], [s * 13 + px, -17.5, pz], '#d9a21b', { cast: false });
    for (const y of [-6, -12]) k.deco([9, .2, .2], [s * 13, y, 3], '#d9a21b', { cast: false });
  }
  for (const [px, pz] of [[-8.5, -4], [8.5, -4], [-8.5, 4], [8.5, 4]]) k.deco([.25, 6, .25], [px, 3, pz], '#d9a21b');
  const anchor = new CANNON.Body({ mass: 0 }); anchor.position.set(0, 12, 0); anchor.collisionFilterMask = 0; k.physics.add(anchor);
  const ball = new CANNON.Body({ mass: 80, material: k.physics.materials.prop, linearDamping: .01 });
  ball.addShape(new CANNON.Sphere(1.2)); ball.position.set(-8, 6, 0); addBody(k, ball);
  k.physics.world.addConstraint(new CANNON.DistanceConstraint(anchor, ball, 10));
  const bm = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 18), k.mat('#2b2f36', { metal: .8, rough: .3 })); bm.castShadow = true; k.scene.add(bm); k.physics.link(ball, bm);
  const chain = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 12, 0), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#222222' }));
  chain.frustumCulled = false; k.scene.add(chain);
  k.deco([14, .6, .6], [0, 12.3, 0], '#d9a21b');
  k.physics.onStep(() => { if (ball.velocity.length() < 9) { ball.force.x += ball.velocity.x * 12; ball.force.y += ball.velocity.y * 12; ball.force.z += ball.velocity.z * 12; } });
  k.updaters.push(() => { const p = chain.geometry.attributes.position; p.setXYZ(1, ball.position.x, ball.position.y, ball.position.z); p.needsUpdate = true; });
  return k.build([[-4, .1, -2], [4, .1, -2], [-13, 2.7, 0], [13, 2.7, 0], [0, .1, 3]], -30);
}

/* ---------- 12. Billboard: kippende Werbetafel ---------- */
function billboard(k) {
  k.sky('#1b2340', 60, 220);
  for (let i = 0; i < 16; i++) k.deco([5 + Math.random() * 5, 25 + Math.random() * 45, 5], [-70 + i * 9, -20, -45 - Math.random() * 20], '#232a45', { emissive: '#ffd890', ei: .18, cast: false });
  const board = new CANNON.Body({ mass: 80, material: k.physics.materials.floor, linearDamping: .1, angularDamping: .3 });
  board.addShape(new CANNON.Box(V(8, .3, 4.5))); board.position.set(0, 6, 0); addBody(k, board);
  const anchor = new CANNON.Body({ mass: 0 }); anchor.position.set(0, 6, 0); anchor.collisionFilterMask = 0; k.physics.add(anchor);
  k.physics.world.addConstraint(new CANNON.HingeConstraint(anchor, board, { pivotA: V(), axisA: V(0, 0, 1), pivotB: V(), axisB: V(0, 0, 1), maxForce: 1e5 }));
  const g = new THREE.Group(); k.scene.add(g);
  k.mesh(new THREE.BoxGeometry(16, .6, 9), [0, 0, 0], '#c9ced6', { parent: g, metal: .3 });
  k.mesh(new THREE.BoxGeometry(15, .02, .3), [0, .31, 0], '#ffd23f', { parent: g, cast: false });
  for (const sz of [-1, 1]) k.mesh(new THREE.BoxGeometry(16, .5, .3), [0, .45, sz * 4.5], '#ff3b6b', { parent: g });
  k.physics.link(board, g);
  k.deco([1.6, 14, 1.6], [0, -1.4, 0], '#4a4f57', { metal: .5 });
  const ads = [['#ff3b6b', -9], ['#34c8ff', 0], ['#ffd23f', 9]];
  for (const [c, x] of ads) k.deco([8, 6, .4], [x, 11, -7], c, { emissive: c, ei: 1.6, cast: false });
  k.light('#ff9ad0', 80, [0, 12, -3], 40);
  k.physics.onStep(() => {
    const sinT = board.quaternion.vmult(V(1, 0, 0)).y;
    board.torque.z += -sinT * 3500 - board.angularVelocity.z * 900;
  });
  return k.build([[-4, 6.4, 0], [4, 6.4, 0], [-2, 6.4, 2.5], [2, 6.4, -2.5]], -30);
}

/* ---------- 13. Aquarium: Wasserbecken mit Ertrinken ---------- */
function aquarium(k) {
  k.sky('#0b3a52', 20, 80); k.light('#7fe0ff', 70, [0, 8, 0], 40);
  const W = (x, z, sx, sz) => k.solid({ size: [sx, 3.5, sz], pos: [x, -1.75, z], color: '#d9e6ee', rough: .4 });
  W(0, -8, 22, 6); W(0, 8, 22, 6); W(-8, 0, 6, 10); W(8, 0, 6, 10);
  k.solid({ size: [10, 1, 10], pos: [0, -4, 0], color: '#e8d9a8' });
  k.deco([10, 2.9, 10], [0, -2.05, 0], '#34c8ff', { opacity: .55, rough: .1, cast: false });
  for (const [x, z, sx, sz] of [[0, -5.3, 4.6, .2], [0, 5.3, 4.6, .2], [-5.3, 0, .2, 4.6], [5.3, 0, .2, 4.6]]) rail(k, [x === 0 ? -2.6 : x, .7, z === 0 ? -2.6 : z], [sx, .3, sz]);
  for (const [x, z, sx, sz] of [[0, -5.3, 4.6, .2], [0, 5.3, 4.6, .2], [-5.3, 0, .2, 4.6], [5.3, 0, .2, 4.6]]) rail(k, [x === 0 ? 2.6 : x, .7, z === 0 ? 2.6 : z], [sx, .3, sz]);
  const fish = [];
  for (let i = 0; i < 7; i++) fish.push(k.mesh(new THREE.SphereGeometry(.3, 10, 8), [0, -2.3, 0], ['#ff8a1f', '#ffd23f', '#ff3b6b'][i % 3], { cast: false }));
  const shark = k.mesh(new THREE.SphereGeometry(.7, 14, 10), [0, -3, 0], '#8a9aa8', { cast: false }); shark.scale.set(2.4, .7, .8);
  const inPool = p => Math.abs(p.x) < 5 && Math.abs(p.z) < 5;
  const under = new Map();
  k.physics.onStep(() => {
    for (const r of rags()) eachBody(r, b => {
      if (b.mass > 0 && inPool(b.position) && b.position.y < -.6) {
        b.force.y += b.mass * 34; b.velocity.x *= .97; b.velocity.z *= .97; b.velocity.y *= .96;
      }
    });
  });
  k.updaters.push((dt, t) => {
    fish.forEach((f, i) => { const a = t * (.5 + i * .07) + i; f.position.set(Math.cos(a) * 3.6, -2.2 - (i % 3) * .5, Math.sin(a) * 3.6); f.scale.x = 1.5; f.rotation.y = -a; });
    shark.position.set(Math.cos(t * .35) * 2.4, -3, Math.sin(t * .35) * 2.4); shark.rotation.y = -t * .35 + PI / 2;
    for (const r of rags()) {
      const h = r.parts.head.body.position, cur = under.get(r) || 0;
      const t2 = (inPool(h) && h.y < -.7) ? cur + dt : Math.max(0, cur - dt * 2);
      under.set(r, t2);
      if (t2 > 3.5) { under.set(r, 0); killRag(r); say(`${r.name} ist ertrunken!`); }
    }
  });
  return k.build([[-8, .1, -8], [8, .1, -8], [-8, .1, 8], [8, .1, 8], [-8, .1, 0]], -12);
}

/* ---------- 14. Lighthouse: Küste mit Leuchtturm und Wellen ---------- */
function lighthouse(k) {
  k.sky('#7fa8c9', 50, 180); k.ctx.hemi.intensity = .9;
  k.deco([300, .2, 300], [0, -8, 0], '#1f5a8a', { opacity: .92, rough: .2, cast: false });
  k.solid({ size: [22, 1, 14], pos: [0, -.5, 0], color: '#8f8a80', rough: .9 });
  k.deco([26, 6, 18], [0, -4, 0], '#6d685f');
  k.solid({ size: [3, 14, 3], pos: [0, 7, 0], color: '#f4f0e6' });
  for (let i = 0; i < 4; i++) k.deco([3.05, 1.7, 3.05], [0, 1.5 + i * 3.4, 0], '#d11f3a');
  k.deco([3.6, .5, 3.6], [0, 14.2, 0], '#444a52');
  k.deco([2.2, 1.6, 2.2], [0, 15.3, 0], '#fff3b0', { emissive: '#ffe680', ei: 3, cast: false });
  k.light('#ffe9a0', 120, [0, 15.5, 0], 50);
  const arm = kinBody(k); arm.addShape(new CANNON.Box(V(4.5, .3, .25)));
  arm.position.set(0, 1, 0); arm.angularVelocity.set(0, 1.2, 0); addBody(k, arm);
  const ag = new THREE.Group(); k.scene.add(ag);
  k.mesh(new THREE.BoxGeometry(9, .6, .5), [0, 0, 0], '#ffe680', { parent: ag, emissive: '#ffcc33', ei: 1.2 });
  k.physics.link(arm, ag);
  for (const [x, z, sx, sz] of [[-6, -6.8, 5, .2], [6, -6.8, 5, .2], [-6, 6.8, 5, .2], [6, 6.8, 5, .2], [-10.8, -3.5, .2, 5], [-10.8, 3.5, .2, 5], [10.8, -3.5, .2, 5], [10.8, 3.5, .2, 5]])
    rail(k, [x, .7, z], [sx, .3, sz]);
  const wave = k.solid({ size: [3, 1.8, 24], pos: [-30, .9, 0], color: '#bfe9ff', kin: true, mat: 'prop', opacity: .8, rough: .1, cast: false });
  let phase = 'wait', timer = 8;
  k.updaters.push(dt => {
    timer -= dt; const b = wave.body;
    if (phase === 'wait' && timer <= 0) { phase = 'warn'; timer = 1.8; say('Welle kommt!'); b.position.x = -30; }
    else if (phase === 'warn' && timer <= 0) { phase = 'run'; b.velocity.set(9, 0, 0); }
    else if (phase === 'run' && b.position.x > 30) { b.velocity.set(0, 0, 0); b.position.x = -60; phase = 'wait'; timer = 9 + Math.random() * 4; }
  });
  return k.build([[-8, .1, -4], [8, .1, -4], [-8, .1, 4], [8, .1, 4], [0, .1, -5.5]], -9);
}

const MAPS2 = { containers, fans, subway, towers, billboard, aquarium, lighthouse };
export function buildMap2(id, k) { return MAPS2[id] ? MAPS2[id](k) : null; }
