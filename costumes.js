// costumes.js – 12 Kostüme aus Three.js-Geometrien und die Live-Vorschau des Kostüm-Editors.
//   applyCostume(ragdoll, id)  hängt ein Kostüm an die Meshes der Figur (ersetzt das alte)
//   createPreview(mount, cfg)  drehende 3D-Vorschau; gibt { setConfig(cfg), dispose() } zurück
import * as THREE from 'three';
import { Physics } from './physics.js';
import { Ragdoll } from './ragdoll.js';
import { COLORS } from './ui.js';

const PI = Math.PI;
const mats = new Map();
const mat = (c, o = {}) => {
  const k = c + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: .45, ...o }));
  return mats.get(k);
};
const mk = (geo, c, pos = [0, 0, 0], rot = [0, 0, 0], o) => {
  const m = new THREE.Mesh(geo, mat(c, o)); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; return m;
};
const sph = (r, c, pos, o, sc) => { const m = mk(new THREE.SphereGeometry(r, 20, 14), c, pos, undefined, o); if (sc) m.scale.set(...sc); return m; };
const cyl = (rt, rb, h, c, pos, rot, o) => mk(new THREE.CylinderGeometry(rt, rb, h, 24), c, pos, rot, o);
const box = (w, h, d, c, pos, rot, o) => mk(new THREE.BoxGeometry(w, h, d), c, pos, rot, o);
const cone = (r, h, c, pos, rot, o) => mk(new THREE.ConeGeometry(r, h, 16), c, pos, rot, o);
const ring = (r, t, c, y) => mk(new THREE.TorusGeometry(r, t, 8, 28), c, [0, y, 0], [PI / 2, 0, 0]);
const dome = (r, y, c, o) => { const m = mk(new THREE.SphereGeometry(r, 28, 14, 0, PI * 2, 0, PI / 2), c, [0, y, 0], undefined, o); m.scale.y = .85; return m; };
const METAL = { metalness: .85, roughness: .3 };

// Jede Funktion liefert Paare [Körperteil, Objekt]. Koordinaten sind lokal zum Körperteil-Mesh.
const BUILD = {
  none: () => [],
  boxer: () => [
    ['hL', sph(.2, '#e02424')], ['hR', sph(.2, '#e02424')],
    ['head', ring(.26, .035, '#ffffff', .1)],
    ['hips', box(.5, .22, .34, '#e02424', [0, -.03, 0])], ['hips', box(.52, .05, .35, '#ffffff', [0, .08, 0])],
  ],
  ninja: () => [
    ['head', mk(new THREE.SphereGeometry(.285, 28, 14, 0, PI * 2, PI * .56, PI * .44), '#15151c')],
    ['head', ring(.235, .04, '#d11f3a', .14)],
    ['head', box(.05, .05, .3, '#d11f3a', [.05, .14, -.32], [.3, 0, 0])],
    ['head', box(.05, .05, .3, '#d11f3a', [-.05, .14, -.32], [-.2, 0, 0])],
    ['chest', box(.58, .09, .37, '#d11f3a', [0, -.12, 0])],
  ],
  knight: () => [
    ['head', mk(new THREE.SphereGeometry(.3, 28, 16, PI / 2 + .75, PI * 2 - 1.5, 0, PI * .62), '#c3ccd6', [0, 0, 0], [0, 0, 0], METAL)],
    ['head', box(.05, .2, .4, '#d11f3a', [0, .33, -.02])],
    ['chest', box(.6, .4, .38, '#c3ccd6', [0, .04, 0], [0, 0, 0], METAL)],
    ['chest', sph(.14, '#c3ccd6', [.34, .2, 0], METAL)], ['chest', sph(.14, '#c3ccd6', [-.34, .2, 0], METAL)],
  ],
  builder: () => [
    ['head', dome(.3, .15, '#ffd23f')], ['head', cyl(.34, .34, .03, '#ffd23f', [0, .15, 0])],
    ['chest', box(.58, .44, .37, '#ff8a1f', [0, 0, 0])],
    ['chest', box(.6, .05, .38, '#f4f0e6', [0, .1, 0])], ['chest', box(.6, .05, .38, '#f4f0e6', [0, -.08, 0])],
  ],
  shark: () => [
    ['head', dome(.31, .12, '#6f8fa8')],
    ['head', cone(.12, .4, '#5d7a90', [0, .42, -.05])],
    ['chest', sph(.2, '#f2f6f8', [0, 0, .1], undefined, [1, 1.2, .55])],
    ['chest', cone(.14, .4, '#5d7a90', [0, -.05, -.3], [-PI / 2, 0, 0])],
  ],
  tophat: () => [
    ['head', cyl(.2, .2, .34, '#16161a', [0, .42, 0])], ['head', cyl(.36, .36, .03, '#16161a', [0, .26, 0])],
    ['head', cyl(.205, .205, .07, '#c2142f', [0, .32, 0])],
    ['chest', cone(.08, .16, '#c2142f', [.1, .2, .17], [0, 0, PI / 2])],
    ['chest', cone(.08, .16, '#c2142f', [-.1, .2, .17], [0, 0, -PI / 2])],
  ],
  viking: () => [
    ['head', dome(.3, .13, '#8d939c', METAL)],
    ['head', cone(.07, .32, '#f3e9c6', [.3, .27, 0], [0, 0, -1])], ['head', cone(.07, .32, '#f3e9c6', [-.3, .27, 0], [0, 0, 1])],
    ['head', sph(.15, '#c0702a', [0, -.17, .15], undefined, [1, 1.1, .8])],
    ['hips', box(.5, .07, .34, '#5a3a1a', [0, .02, 0])],
  ],
  hero: () => [
    ['chest', box(.64, .8, .04, '#d11f3a', [0, -.3, -.2], [.12, 0, 0])],
    ['chest', sph(.1, '#ffd23f', [0, .06, .17], undefined, [1, 1, .3])],
    ['fL', sph(.18, '#d11f3a')], ['fR', sph(.18, '#d11f3a')],
    ['hips', box(.5, .2, .34, '#d11f3a', [0, -.05, 0])],
  ],
  police: () => [
    ['head', dome(.29, .14, '#1d3f9c')], ['head', box(.36, .03, .2, '#0f1530', [0, .14, .32])],
    ['head', sph(.045, '#ffd23f', [0, .3, .23])],
    ['chest', box(.58, .42, .37, '#1d3f9c', [0, .02, 0])],
    ['chest', sph(.05, '#ffd23f', [.12, .1, .19], undefined, [1, 1, .3])],
    ['hips', box(.5, .07, .34, '#111111', [0, .03, 0])],
  ],
  chef: () => [
    ['head', cyl(.2, .22, .28, '#ffffff', [0, .38, 0])], ['head', sph(.27, '#ffffff', [0, .58, 0], undefined, [1, .8, 1])],
    ['chest', box(.52, .55, .03, '#ffffff', [0, -.05, .19])], ['chest', sph(.07, '#d11f3a', [0, .24, .14])],
  ],
  astronaut: () => [
    ['head', mk(new THREE.SphereGeometry(.37, 28, 20), '#9fd8ff', [0, 0, 0], [0, 0, 0], { transparent: true, opacity: .28, roughness: .05, metalness: .2 })],
    ['head', ring(.2, .04, '#e8e8ee', -.25)],
    ['chest', box(.42, .52, .2, '#e8e8ee', [0, .02, -.28])], ['chest', box(.44, .06, .21, '#ff8a1f', [0, .1, -.28])],
    ['chest', box(.2, .12, .03, '#ff8a1f', [0, .08, .18])], ['chest', sph(.03, '#34c8ff', [-.05, -.1, .18])], ['chest', sph(.03, '#ff3b6b', [.05, -.1, .18])],
  ],
  pirate: () => [
    ['head', dome(.3, .15, '#1b1b1f')], ['head', cyl(.38, .38, .03, '#1b1b1f', [0, .15, 0])],
    ['head', sph(.05, '#f4f0e6', [0, .3, .25])], ['head', sph(.09, '#111111', [.1, .06, .235])],
    ['hips', box(.5, .12, .34, '#d11f3a', [0, .02, 0])],
    ['hR', cone(.045, .22, '#c9ced6', [0, -.22, 0], [PI, 0, 0])],
  ],
};

export function removeCostume(rag) {
  for (const [, obj] of rag.costumeObjs || []) { obj.removeFromParent(); obj.geometry.dispose(); }
  rag.costumeObjs = [];
}

export function applyCostume(rag, id) {
  removeCostume(rag);
  const list = (BUILD[id] || BUILD.none)();
  for (const [part, obj] of list) rag.parts[part].mesh.add(obj);
  rag.costumeObjs = list;
}

const hexOf = id => (COLORS.find(c => c.id === id) || COLORS[0]).hex;

export function createPreview(mount, config) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(34, 1, .1, 50);
  cam.position.set(0, 1.25, 5); cam.lookAt(0, .98, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a6a9a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.ShadowMaterial({ opacity: .3 }));
  floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);

  // Die Figur wird nur aufgebaut, nie simuliert: sie steht in Ausgangspose.
  const physics = new Physics();
  const rag = new Ragdoll(physics, { slot: 0, color: hexOf(config.color) });
  scene.add(rag.group);
  applyCostume(rag, config.costume);
  rag.update();

  const resize = () => {
    const w = mount.clientWidth || 300, h = mount.clientHeight || 300;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(mount); resize();

  let drag = false, lastX = 0, raf = 0, last = performance.now();
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { drag = true; lastX = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (drag) { rag.group.rotation.y += (e.clientX - lastX) * .012; lastX = e.clientX; } });
  el.addEventListener('pointerup', () => { drag = false; });
  el.addEventListener('pointercancel', () => { drag = false; });

  const loop = now => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!drag) rag.group.rotation.y += dt * .6;
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(loop);

  return {
    setConfig(cfg) { rag.setColor(hexOf(cfg.color)); applyCostume(rag, cfg.costume); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      removeCostume(rag); rag.dispose(); renderer.dispose(); el.remove();
    },
  };
}
