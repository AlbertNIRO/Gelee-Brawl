// ragdoll.js – Active-Ragdoll-Figur: Selbst-Balance, Laufen, Schlagen, Greifen (beide Hände),
// Hochheben und Werfen, Kopfstoß, K.o. mit Sternchen und Aufwachen durch Tastenhämmern.
//
// Nutzung (main.js):
//   const r = new Ragdoll(physics, { slot: 0, color: '#9dff2e', name: 'Albert', pos: [0, 2, 0] });
//   scene.add(r.group);
//   r.setInput(ui.input, cameraYaw);   // jedes Frame; Felder wie ui.input
//   r.update(dt);                       // jedes Frame (Meshes nachführen)
// Der Physik-Teil läuft automatisch im festen Schritt (physics.onStep).
// costumes.js hängt Kostüme an r.parts.head.mesh bzw. r.parts.chest.mesh.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CANNON, GROUP } from './physics.js';

const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const UP = V(0, 1, 0), FWD = V(0, 0, 1);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Körperteile: Form (box/sph), halbe Maße bzw. Radius, Masse, Startposition.
// Linke Seite = +x in Figurenkoordinaten (von hinten gesehen die linke Hand).
const SPEC = {
  hips:  { s: 'box', d: [.23, .15, .15], m: 2.2, p: [0, .95, 0] },
  chest: { s: 'box', d: [.27, .25, .17], m: 2.4, p: [0, 1.35, 0] },
  head:  { s: 'sph', d: [.27],           m: 1.1, p: [0, 1.86, 0] },
  uL: { s: 'box', d: [.08, .21, .08], m: .5, p: [.4, 1.34, 0] },
  hL: { s: 'sph', d: [.14],            m: .5, p: [.4, 1.03, 0] },
  uR: { s: 'box', d: [.08, .21, .08], m: .5, p: [-.4, 1.34, 0] },
  hR: { s: 'sph', d: [.14],            m: .5, p: [-.4, 1.03, 0] },
  tL: { s: 'box', d: [.1, .26, .1],   m: .8, p: [.12, .54, 0] },
  fL: { s: 'sph', d: [.15],            m: .4, p: [.12, .15, 0] },
  tR: { s: 'box', d: [.1, .26, .1],   m: .8, p: [-.12, .54, 0] },
  fR: { s: 'sph', d: [.15],            m: .4, p: [-.12, .15, 0] },
};
const NAMES = Object.keys(SPEC);
// [Körper A, Körper B, Gelenkpunkt, Achse, Kegelwinkel, Twist]
const JOINTS = [
  ['hips', 'chest', [0, 1.12, 0], [0, 1, 0], .45, .35],
  ['chest', 'head', [0, 1.6, 0], [0, 1, 0], .65, .7],
  ['chest', 'uL', [.36, 1.53, 0], [0, -1, 0], 2.3, 1],
  ['chest', 'uR', [-.36, 1.53, 0], [0, -1, 0], 2.3, 1],
  ['uL', 'hL', [.4, 1.13, 0], [0, -1, 0], 1.4, .4],
  ['uR', 'hR', [-.4, 1.13, 0], [0, -1, 0], 1.4, .4],
  ['hips', 'tL', [.12, .8, 0], [0, -1, 0], 1.0, .4],
  ['hips', 'tR', [-.12, .8, 0], [0, -1, 0], 1.0, .4],
  ['tL', 'fL', [.12, .29, 0], [0, -1, 0], .6, .3],
  ['tR', 'fR', [-.12, .29, 0], [0, -1, 0], .6, .3],
];
const INPUT_KEYS = ['moveX', 'moveY', 'sprint', 'lh', 'rh', 'jump', 'head', 'lift'];
const STATE_LEN = NAMES.length * 7 + 3;

const starGeo = new THREE.OctahedronGeometry(.09);
const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14a });
const eyeGeo = new THREE.SphereGeometry(.075, 12, 10), pupilGeo = new THREE.SphereGeometry(.04, 10, 8);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .2 });
const _q = new THREE.Quaternion();

export class Ragdoll {
  constructor(physics, { slot = 0, color = '#9dff2e', name = 'Spieler', pos = [0, 0, 0], remote = false } = {}) {
    this.physics = physics; this.slot = slot; this.name = name; this.remote = remote;
    this.alive = true; this.ko = false; this.koT = 0; this.wake = 0; this.stun = 0;
    this.lifted = 0; this.lifting = false; this.wasLifting = false;
    this.headT = 0; this.headCd = 0; this.yaw = 0; this.camYaw = 0; this.phase = 0; this.grounded = false;
    this.inp = Object.fromEntries(INPUT_KEYS.map(k => [k, k.startsWith('move') ? 0 : false]));
    this.prev = { ...this.inp };
    this.onKO = null; this.onHit = null;          // Rückrufe: onKO(opfer, angreifer), onHit(opfer, angreifer, teil)
    this.rc = new CANNON.RaycastResult();
    this.parts = {}; this.joints = []; this.group = new THREE.Group();

    this.mat = new THREE.MeshPhysicalMaterial({ color, roughness: .28, clearcoat: 1, clearcoatRoughness: .15, sheen: .4 });
    const own = GROUP.ragdoll(slot), mask = GROUP.WORLD | (GROUP.ALL_RAGDOLLS & ~own);
    for (const n of NAMES) {
      const sp = SPEC[n], b = new CANNON.Body({ mass: remote ? 0 : sp.m, material: physics.materials.jelly });
      let geo;
      if (sp.s === 'box') {
        b.addShape(new CANNON.Box(V(...sp.d)));
        geo = new RoundedBoxGeometry(sp.d[0] * 2, sp.d[1] * 2, sp.d[2] * 2, 3, Math.min(...sp.d) * .8);
      } else {
        b.addShape(new CANNON.Sphere(sp.d[0]));
        geo = new THREE.SphereGeometry(sp.d[0], 28, 20);
      }
      b.position.set(pos[0] + sp.p[0], pos[1] + sp.p[1], pos[2] + sp.p[2]);
      b.linearDamping = .06; b.angularDamping = .25;
      b.collisionFilterGroup = own; b.collisionFilterMask = mask;
      if (remote) { b.type = CANNON.Body.KINEMATIC; b.updateMassProperties(); }
      b.userData = { rag: this, part: n };
      physics.add(b);
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      this.parts[n] = { body: b, mesh };
    }
    // Gesicht
    const head = this.parts.head.mesh;
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(sx * .1, .06, .22);
      const p = new THREE.Mesh(pupilGeo, pupilMat); p.position.set(sx * .1, .06, .27);
      head.add(e, p);
    }
    // Sternchen über dem Kopf (nur sichtbar im K.o.)
    this.stars = new THREE.Group(); this.stars.visible = false;
    for (let i = 0; i < 4; i++) this.stars.add(new THREE.Mesh(starGeo, starMat));
    this.group.add(this.stars);

    if (!remote) {
      for (const [a, bn, pt, ax, angle, twist] of JOINTS) {
        const A = this.parts[a].body, B = this.parts[bn].body, w = V(pos[0] + pt[0], pos[1] + pt[1], pos[2] + pt[2]);
        const c = new CANNON.ConeTwistConstraint(A, B, {
          pivotA: A.pointToLocalFrame(w, V()), pivotB: B.pointToLocalFrame(w, V()),
          axisA: V(...ax), axisB: V(...ax), angle, twistAngle: twist, maxForce: 1e5,
        });
        c.collideConnected = false;
        physics.world.addConstraint(c); this.joints.push(c);
      }
      this.hands = [
        { key: 'lh', sg: 1, hb: this.parts.hL.body, ub: this.parts.uL.body, held: false, heldT: 0, punch: 0, cd: 0, grip: null, gripBody: null },
        { key: 'rh', sg: -1, hb: this.parts.hR.body, ub: this.parts.uR.body, held: false, heldT: 0, punch: 0, cd: 0, grip: null, gripBody: null },
      ];
      for (const h of this.hands) h.hb.addEventListener('collide', e => this._onHand(h, e));
      this.parts.head.body.addEventListener('collide', e => this._onHead(e));
      this.unhook = physics.onStep(dt => this._step(dt));
    }
  }

  get position() { return this.parts.hips.body.position; }
  setColor(hex) { this.mat.color.set(hex); }
  setInput(inp, camYaw = 0) { for (const k of INPUT_KEYS) if (k in inp) this.inp[k] = inp[k]; this.camYaw = camYaw; }
  mash() { if (this.ko) this.wake += .13; }           // zusätzlicher Weck-Impuls (z. B. vom Netzwerk)

  /* ---------- Physik-Schritt (fest 60 Hz) ---------- */
  _step(dt) {
    if (!this.alive) return;
    const P = this.parts, B = n => P[n].body, hips = B('hips'), chest = B('chest'), head = B('head');
    const I = this.inp, edge = k => I[k] && !this.prev[k];
    this.stun = Math.max(0, this.stun - 14 * dt);
    this.headT = Math.max(0, this.headT - dt); this.headCd = Math.max(0, this.headCd - dt);
    this.lifted = Math.max(0, this.lifted - dt);

    if (this.ko) {                                     // bewusstlos: schlaff, Hämmern weckt auf
      this.koT += dt; this.wake = Math.max(0, this.wake - .35 * dt);
      if (edge('jump') || edge('lh') || edge('rh') || edge('head')) this.wake += .13;
      this._releaseAll(); this._remember();
      if (this.wake >= 1 || this.koT > 9) this._wakeUp();
      return;
    }

    const tilt = hips.quaternion.vmult(UP).y;
    const bal = (tilt > .35 ? 1 : .3) * (this.stun > 70 ? .5 : 1) * (this.lifted > 0 ? .15 : 1);

    // Bodenkontakt per Strahl nach unten
    const hp = hips.position, res = this.rc; res.reset();
    this.physics.world.raycastClosest(hp, V(hp.x, hp.y - 1.3, hp.z), { collisionFilterMask: GROUP.WORLD, skipBackfaces: true }, res);
    const dist = res.distance, grounded = res.hasHit && dist < 1.25;
    this.grounded = grounded;

    // Bewegungsrichtung relativ zur Kamera
    const s = Math.sin(this.camYaw), c = Math.cos(this.camYaw);
    let dx = -s * I.moveY + c * I.moveX, dz = -c * I.moveY - s * I.moveX;
    const len = Math.hypot(dx, dz); if (len > 1) { dx /= len; dz /= len; }
    const mv = Math.min(1, len);
    if (mv > .1) this.yaw = Math.atan2(dx, dz);
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);   // Blickrichtung (sinY, cosY), Seite (cosY, -sinY)

    // Sprung
    if (edge('jump') && grounded && dist < 1.15) for (const n of NAMES) { const v = B(n).velocity; v.y = Math.max(v.y, 0) + 8.5; }

    // Standfeder an der Hüfte, Gegenkraft auf die Füße
    if (grounded) {
      const f = Math.max(0, Math.min(520, 900 * (1.12 - dist) - 70 * hips.velocity.y)) * bal;
      hips.force.y += f; B('fL').force.y -= f / 2; B('fR').force.y -= f / 2;
    }

    // Laufen
    const ctl = grounded ? 1 : .25, spd = (I.sprint ? 7 : 4.6) * mv;
    for (const b of [hips, chest]) {
      b.force.x += (dx * spd - b.velocity.x) * 30 * ctl * bal;
      b.force.z += (dz * spd - b.velocity.z) * 30 * ctl * bal;
    }

    // Aufrichten und Drehen
    const upr = (b, k, d) => {
      const ax = b.quaternion.vmult(UP).cross(UP), w = b.angularVelocity;
      b.torque.x += (ax.x * k - w.x * d) * bal; b.torque.z += (ax.z * k - w.z * d) * bal;
    };
    const turn = (b, k, d) => {
      const f = b.quaternion.vmult(FWD);
      b.torque.y += (wrap(this.yaw - Math.atan2(f.x, f.z)) * k - b.angularVelocity.y * d) * bal;
    };
    upr(hips, 150, 15); upr(chest, 125, 12); upr(head, 40, 5); upr(B('tL'), 30, 4); upr(B('tR'), 30, 4);
    turn(hips, 60, 7); turn(chest, 40, 5); turn(head, 20, 3);

    // Beinschritte
    if (mv > .1) this.phase += dt * 2.3 * Math.max(1, spd);
    for (const sg of [1, -1]) {
      const f = B(sg > 0 ? 'fL' : 'fR'), ph = this.phase + (sg > 0 ? 0 : Math.PI);
      const sw = mv > .1 ? Math.sin(ph) * .42 : 0, lift = mv > .1 ? Math.max(0, Math.cos(ph)) * .24 : 0;
      const tx = hp.x + sinY * sw + cosY * sg * .13, tz = hp.z + cosY * sw - sinY * sg * .13, k = grounded ? 170 : 35;
      f.force.x += (tx - f.position.x) * k * bal - f.velocity.x * 9;
      f.force.z += (tz - f.position.z) * k * bal - f.velocity.z * 9;
      if (lift > .02) f.force.y += (.15 + lift - f.position.y) * k;
    }

    // Kopfstoß
    if (edge('head') && this.headCd <= 0) {
      this.headT = .3; this.headCd = .7;
      head.velocity.x += sinY * 8; head.velocity.z += cosY * 8; head.velocity.y += 1;
      chest.velocity.x += sinY * 3; chest.velocity.z += cosY * 3;
    }
    if (this.headT > 0) { chest.torque.x += cosY * 38; chest.torque.z += -sinY * 38; }

    // Hände: Schlag beim Drücken, Greifen beim Halten
    const anyGrip = this.hands.some(h => h.grip);
    this.lifting = I.lift && anyGrip;
    for (const h of this.hands) {
      const hold = I[h.key];
      if (hold && !h.held) { h.held = true; h.heldT = 0; h.punch = .22; }
      if (!hold && h.held) { h.held = false; this._release(h); }
      if (h.held) h.heldT += dt;
      h.punch = Math.max(0, h.punch - dt); h.cd = Math.max(0, h.cd - dt);
      const sh = chest.quaternion.vmult(V(h.sg * .38, .2, 0)); sh.vadd(chest.position, sh);
      let tx, ty, tz, k;
      if (this.lifting) { tx = sh.x + sinY * .3; ty = sh.y + 1; tz = sh.z + cosY * .3; k = 120; }
      else if (h.grip) { k = 0; }
      else if (h.held) {
        const r = h.punch > 0 ? 1.15 : .85;
        tx = sh.x + sinY * r; ty = sh.y + (h.punch > 0 ? .05 : .2); tz = sh.z + cosY * r; k = h.punch > 0 ? 300 : 150;
      } else { tx = sh.x + cosY * h.sg * .12; ty = sh.y - .55; tz = sh.z - sinY * h.sg * .12; k = 25; }
      if (k > 0) {
        const hb = h.hb, ub = h.ub, kd = k > 100 ? 14 : 5;
        hb.force.x += (tx - hb.position.x) * k - hb.velocity.x * kd;
        hb.force.y += (ty - hb.position.y) * k - hb.velocity.y * kd;
        hb.force.z += (tz - hb.position.z) * k - hb.velocity.z * kd;
        if (k > 100) {
          ub.force.x += ((sh.x + tx) / 2 - ub.position.x) * k * .4 - ub.velocity.x * 4;
          ub.force.y += ((sh.y + ty) / 2 - ub.position.y) * k * .4 - ub.velocity.y * 4;
          ub.force.z += ((sh.z + tz) / 2 - ub.position.z) * k * .4 - ub.velocity.z * 4;
        }
      }
    }

    // Hochheben (Gegner) bzw. Hochziehen (feste Welt)
    if (this.lifting) {
      for (const h of this.hands) {
        if (!h.gripBody) continue;
        const t = h.gripBody.userData && h.gripBody.userData.rag;
        if (t && t !== this) { t.lifted = .35; t.parts.hips.body.force.y += 150; t.parts.chest.body.force.y += 150; }
        else if (!t && h.gripBody.mass === 0) hips.force.y += 90 * bal;
      }
    }
    // Werfen beim Loslassen von „Heben"
    if (this.wasLifting && !I.lift) this._throw(sinY, cosY);
    this.wasLifting = this.lifting;

    this._remember();
  }

  _remember() { for (const k of INPUT_KEYS) this.prev[k] = this.inp[k]; }

  _throw(sinY, cosY) {
    const seen = new Set();
    for (const h of this.hands) {
      const t = h.gripBody && h.gripBody.userData && h.gripBody.userData.rag;
      if (t && t !== this && !seen.has(t)) {
        seen.add(t); t.lifted = 0;
        for (const n of NAMES) { const v = t.parts[n].body.velocity; v.x += sinY * 11; v.z += cosY * 11; v.y += 6; }
      }
    }
    this._releaseAll();
  }

  /* ---------- Greifen ---------- */
  _grab(h, other) {
    if (h.grip) return;
    const c = new CANNON.LockConstraint(h.hb, other, { maxForce: 700 });
    c.collideConnected = false;
    this.physics.world.addConstraint(c); h.grip = c; h.gripBody = other;
  }
  _release(h) {
    if (h.grip) { this.physics.world.removeConstraint(h.grip); h.grip = null; h.gripBody = null; }
  }
  _releaseAll() { for (const h of this.hands) { h.held = false; this._release(h); } this.lifting = false; this.wasLifting = false; }

  /* ---------- Treffer ---------- */
  _onHand(h, e) {
    if (this.ko || !this.alive) return;
    const o = e.body, ud = o.userData;
    if (ud && ud.rag === this) return;
    if (ud && ud.rag && h.punch > 0 && h.cd <= 0) { this._hit(ud.rag, ud.part, 13, 4); h.cd = .35; }
    if (h.held && h.heldT > .3 && !h.grip) {
      const ni = e.contact && e.contact.ni;
      if (o.mass === 0 && ni && Math.abs(ni.y) > .6) return;   // nicht am Boden festkleben
      this._grab(h, o);
    }
  }
  _onHead(e) {
    if (this.ko || this.headT <= 0 || this.headCd > .5) return;
    const ud = e.body.userData;
    if (ud && ud.rag && ud.rag !== this) { this._hit(ud.rag, ud.part, 26, 6); this.headT = 0; }
  }
  _hit(victim, part, dmg, push) {
    if (victim.ko || victim.remote) return;
    victim.stun += dmg * (part === 'head' ? 1.7 : 1);
    const a = this.position, b = victim.position;
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (const n of ['chest', 'head', 'hips']) { const v = victim.parts[n].body.velocity; v.x += dx * push; v.z += dz * push; v.y += 1.2; }
    if (this.onHit) this.onHit(victim, this, part);
    if (victim.stun >= 100) victim._knockOut(this);
  }
  _knockOut(by) {
    this.ko = true; this.koT = 0; this.wake = 0; this.lifted = 0;
    this._releaseAll();
    if (this.onKO) this.onKO(this, by);
  }
  _wakeUp() {
    this.ko = false; this.stun = 0; this.wake = 0;
    for (const n of NAMES) this.parts[n].body.velocity.y += 2;
  }

  /* ---------- Neu starten ---------- */
  respawn(pos = [0, 2, 0]) {
    if (!this.remote) this._releaseAll();
    this.ko = false; this.stun = 0; this.wake = 0; this.lifted = 0; this.alive = true; this.yaw = 0;
    for (const n of NAMES) {
      const b = this.parts[n].body, p = SPEC[n].p;
      b.position.set(pos[0] + p[0], pos[1] + p[1], pos[2] + p[2]);
      b.quaternion.set(0, 0, 0, 1); b.velocity.setZero(); b.angularVelocity.setZero();
      b.force.setZero(); b.torque.setZero();
    }
  }

  /* ---------- Netzwerk: Host sendet Zustand, Clients wenden ihn an ---------- */
  serialize() {
    const a = new Float32Array(STATE_LEN); let i = 0;
    for (const n of NAMES) {
      const b = this.parts[n].body, p = b.position, q = b.quaternion;
      a[i++] = p.x; a[i++] = p.y; a[i++] = p.z; a[i++] = q.x; a[i++] = q.y; a[i++] = q.z; a[i++] = q.w;
    }
    a[i++] = this.ko ? 1 : 0; a[i++] = this.stun; a[i] = this.wake;
    return a;
  }
  apply(a) {
    let i = 0;
    for (const n of NAMES) {
      const b = this.parts[n].body;
      b.position.set(a[i++], a[i++], a[i++]); b.quaternion.set(a[i++], a[i++], a[i++], a[i++]);
    }
    this.ko = a[i++] > .5; this.stun = a[i++]; this.wake = a[i];
  }

  /* ---------- Darstellung (jedes Frame) ---------- */
  update(dt = 1 / 60) {
    for (const n of NAMES) {
      const { body: b, mesh } = this.parts[n];
      if (this.remote) {
        mesh.position.lerp(b.position, .45);
        _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); mesh.quaternion.slerp(_q, .45);
      } else {
        mesh.position.set(b.position.x, b.position.y, b.position.z);
        mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      }
    }
    this.stars.visible = this.ko;
    if (this.ko) {
      const hm = this.parts.head.mesh, t = performance.now() / 1000 * 4;
      this.stars.children.forEach((s, i) => {
        const a = t + i * Math.PI / 2;
        s.position.set(hm.position.x + Math.cos(a) * .38, hm.position.y + .5 + Math.sin(t * 2 + i) * .04, hm.position.z + Math.sin(a) * .38);
        s.rotation.y = a * 2; s.rotation.x = a;
      });
    }
  }

  dispose() {
    if (this.unhook) this.unhook();
    if (this.hands) this._releaseAll();
    for (const c of this.joints) this.physics.world.removeConstraint(c);
    for (const n of NAMES) { this.physics.remove(this.parts[n].body); this.parts[n].mesh.geometry.dispose(); }
    this.mat.dispose(); this.group.removeFromParent(); this.alive = false;
  }
}
