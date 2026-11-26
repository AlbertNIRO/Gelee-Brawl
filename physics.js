// physics.js – Cannon-es-Welt mit festem Zeitschritt, Materialien, Kollisionsgruppen und Helfern.
import * as CANNON from 'cannon-es';
export { CANNON };

export const FIXED_DT = 1 / 60;
// Gruppe 1 = Welt (Boden, Maps, Kisten). Jede Figur bekommt ein eigenes Bit (Slot 0 bis 7),
// damit sich die Körperteile einer Figur nicht gegenseitig stoßen, andere Figuren aber schon.
export const GROUP = {
  WORLD: 1,
  ALL_RAGDOLLS: 0x1fe,
  ragdoll: slot => 2 << slot,
};

export class Physics {
  constructor() {
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = false;
    w.solver.iterations = 14;
    w.defaultContactMaterial.friction = 0.4;
    w.defaultContactMaterial.restitution = 0;

    const m = this.materials = {
      jelly:    new CANNON.Material('jelly'),
      floor:    new CANNON.Material('floor'),
      slippery: new CANNON.Material('slippery'),   // z. B. Luftschiff-Oberseite
      prop:     new CANNON.Material('prop'),
    };
    const pair = (a, b, friction, restitution = 0) =>
      w.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution, contactEquationStiffness: 5e7, contactEquationRelaxation: 4 }));
    pair(m.jelly, m.floor, 0.9);
    pair(m.jelly, m.slippery, 0.06);
    pair(m.jelly, m.prop, 0.6);
    pair(m.jelly, m.jelly, 0.35);
    pair(m.prop, m.floor, 0.5);
    pair(m.prop, m.prop, 0.4);
    pair(m.prop, m.slippery, 0.05);

    this.hooks = [];       // Funktionen, die vor jedem Physikschritt laufen: fn(dt, time)
    this.links = [];       // { body, mesh } – Körper, deren Mesh automatisch nachgeführt wird
    this.acc = 0;
    this.time = 0;
  }

  // Registriert eine Funktion pro festem Schritt. Gibt eine Funktion zum Abmelden zurück.
  onStep(fn) {
    this.hooks.push(fn);
    return () => { this.hooks = this.hooks.filter(h => h !== fn); };
  }

  // Wird einmal pro gerendertem Frame aufgerufen.
  update(frameDt) {
    this.acc += Math.min(frameDt, 0.1);
    let n = 0;
    while (this.acc >= FIXED_DT && n < 5) {
      this.time += FIXED_DT;
      for (const h of this.hooks) h(FIXED_DT, this.time);
      this.world.step(FIXED_DT);
      this.acc -= FIXED_DT; n++;
    }
    if (n === 5) this.acc = 0;
    this.syncLinks();
  }

  syncLinks() {
    for (const { body, mesh } of this.links) {
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    }
  }
  link(body, mesh) { this.links.push({ body, mesh }); return body; }
  unlink(body) { this.links = this.links.filter(l => l.body !== body); }

  add(body) { this.world.addBody(body); return body; }
  remove(body) { this.unlink(body); this.world.removeBody(body); }

  // Quader: size = [Breite, Höhe, Tiefe] (volle Maße), mass 0 = statisch, rot = [x,y,z] in Radiant
  box({ size, pos = [0, 0, 0], rot = [0, 0, 0], mass = 0, material = 'floor', kinematic = false }) {
    const b = new CANNON.Body({ mass, material: this.materials[material] || this.materials.floor });
    b.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
    b.position.set(pos[0], pos[1], pos[2]);
    b.quaternion.setFromEuler(rot[0], rot[1], rot[2]);
    if (kinematic) { b.type = CANNON.Body.KINEMATIC; b.updateMassProperties(); }
    b.collisionFilterGroup = GROUP.WORLD;
    b.collisionFilterMask = -1;
    return this.add(b);
  }

  sphere({ radius, pos = [0, 0, 0], mass = 0, material = 'prop' }) {
    const b = new CANNON.Body({ mass, material: this.materials[material] });
    b.addShape(new CANNON.Sphere(radius));
    b.position.set(pos[0], pos[1], pos[2]);
    b.collisionFilterGroup = GROUP.WORLD;
    b.collisionFilterMask = -1;
    return this.add(b);
  }

  // Nächster Treffer entlang eines Strahls (nur Welt). Gibt null oder { point, distance, body } zurück.
  raycast(from, to, mask = GROUP.WORLD) {
    const res = new CANNON.RaycastResult();
    this.world.raycastClosest(
      new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z),
      { collisionFilterMask: mask, skipBackfaces: true }, res);
    return res.hasHit ? { point: res.hitPointWorld.clone(), distance: res.distance, body: res.body } : null;
  }
}
