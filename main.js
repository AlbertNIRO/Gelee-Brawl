// main.js – Renderer mit Bloom und Schatten, Spielschleife, Match-Ablauf, Kamera.
// Optionale Module werden dynamisch geladen und fügen sich ein, sobald sie auf GitHub liegen:
//   maps.js     → export function buildMap(id, ctx) → { spawns:[[x,y,z]], killY, update?(dt,t), dispose?() }
//   costumes.js → export function applyCostume(ragdoll, id); export function createPreview(mount, config) → { setConfig(c), dispose() }
//   bots.js     → export class Bot { constructor(ragdoll, getPlayers); update(dt) }
//   network.js  → export function handleUIEvent(evt, data, game)   (evt: host | join | leave | start)
// Bis dahin gibt es eine Test-Arena und einen einfachen Bot.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Physics } from './physics.js';
import { Ragdoll } from './ragdoll.js';
import { Controls } from './controls.js';
import { ui, COLORS } from './ui.js';

const opt = async f => { try { return await import(f); } catch (e) { console.warn(f, 'nicht gefunden:', e.message); return null; } };
const LIVES = 3, MATCH_SECONDS = 150, MAX_PLAYERS = 8;

/* ---------- Renderer, Szene, Licht ---------- */
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fc8ff);
scene.fog = new THREE.Fog(0x7fc8ff, 45, 130);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
const hemi = new THREE.HemisphereLight(0xcfeaff, 0x806040, 0.85); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 0.85));
composer.addPass(new OutputPass());
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

/* ---------- Zustand ---------- */
const controls = new Controls();
let mods = { maps: null, bots: null, costumes: null };
let physics = null, root = null, map = null, match = null, players = [], paused = false, lastParams = null;
const camTarget = new THREE.Vector3(), camLook = new THREE.Vector3();

/* ---------- Einfacher Bot (wird von bots.js ersetzt, falls vorhanden) ---------- */
class SimpleBot {
  constructor(rag, getPlayers) { this.rag = rag; this.getPlayers = getPlayers; this.t = Math.random() * 3; }
  update(dt) {
    const r = this.rag, inp = { moveX: 0, moveY: 0, sprint: false, lh: false, rh: false, jump: false, head: false, lift: false };
    this.t += dt;
    if (r.ko) inp.jump = Math.floor(this.t * 9) % 2 === 0;
    else {
      let best = null, bd = 1e9;
      for (const p of this.getPlayers()) {
        if (p.rag === r || !p.rag.alive || p.lives <= 0) continue;
        const d = Math.hypot(p.rag.position.x - r.position.x, p.rag.position.z - r.position.z);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        const dx = best.rag.position.x - r.position.x, dz = best.rag.position.z - r.position.z;
        inp.moveX = dx / bd; inp.moveY = -dz / bd;              // Kamera-Yaw 0: vorwärts = −z
        if (bd < 1.5) { inp.moveX *= .2; inp.moveY *= .2; inp.lh = this.t % 1.1 < .22; inp.rh = (this.t + .55) % 1.1 < .22; inp.head = this.t % 3 < .05; }
      }
    }
    r.setInput(inp, 0);
  }
}

/* ---------- Test-Arena (Ersatz, bis maps.js da ist) ---------- */
function testArena(ctx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd98a, roughness: 0.6 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(26, 1, 26), mat);
  floor.position.y = -0.5; floor.receiveShadow = true; ctx.scene.add(floor);
  ctx.physics.box({ size: [26, 1, 26], pos: [0, -0.5, 0], material: 'floor' });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.7 });
  for (const [x, z] of [[-5, -4], [5, 3], [0, 6]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), crateMat); m.castShadow = m.receiveShadow = true; ctx.scene.add(m);
    ctx.physics.link(ctx.physics.box({ size: [1, 1, 1], pos: [x, 0.5, z], mass: 3, material: 'prop' }), m);
  }
  const spawns = [[-6, 0.1, 0], [6, 0.1, 0], [0, 0.1, -6], [0, 0.1, 6], [-4, 0.1, -4], [4, 0.1, 4], [-4, 0.1, 4], [4, 0.1, -4]];
  return { spawns, killY: -14 };
}

/* ---------- Spieler ---------- */
const hexOf = id => (COLORS.find(c => c.id === id) || COLORS[0]).hex;

function addPlayer(o) {
  if (players.length >= MAX_PLAYERS) return null;
  const slot = players.length, sp = map.spawns[slot % map.spawns.length];
  const rag = new Ragdoll(physics, { slot, color: o.color, name: o.name, pos: sp, remote: !!o.remote });
  root.add(rag.group);
  if (mods.costumes && mods.costumes.applyCostume) mods.costumes.applyCostume(rag, o.costume || 'none');
  rag.onKO = v => { if (match && !match.over) ui.toast(`${v.name} ist K.o.!`, 1200); };
  const p = { rag, name: o.name, color: o.color, lives: LIVES, isLocal: !!o.isLocal, bot: null, respawnT: 0, slot, remote: !!o.remote };
  if (o.bot) { const Bot = (mods.bots && mods.bots.Bot) || SimpleBot; p.bot = new Bot(rag, () => players); }
  players.push(p);
  return p;
}

/* ---------- Match-Ablauf ---------- */
function clearMatch() {
  if (map && map.dispose) map.dispose();
  if (root) {
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    scene.remove(root);
  }
  physics = null; root = null; map = null; match = null; players = []; paused = false;
}

async function startMatch(params) {
  lastParams = params; clearMatch();
  root = new THREE.Group(); scene.add(root);
  physics = new Physics();
  const ctx = { THREE, scene: root, sceneRoot: scene, physics, renderer, camera, sun, hemi };
  map = (mods.maps && mods.maps.buildMap && await mods.maps.buildMap(params.map, ctx)) || testArena(ctx);
  match = { time: 0, over: false, out: [], hudT: 0 };

  addPlayer({ name: 'Du', color: hexOf(params.config.color), costume: params.config.costume, isLocal: true });
  const free = COLORS.filter(c => c.id !== params.config.color).sort(() => Math.random() - .5);
  for (let i = 0; i < 3; i++) addPlayer({ name: `Bot ${i + 1}`, color: free[i].hex, costume: ['boxer', 'ninja', 'pirate', 'chef', 'knight'][Math.floor(Math.random() * 5)], bot: true });

  centerCamera(true);
  ui.showHUD(); ui.toast('LOS!', 1000);
}

function finish(ranking) {
  match.over = true; ui.hideHUD();
  ui.showResults(ranking.map(p => ({ name: p.name, color: p.color, note: p.lives > 0 ? '♥'.repeat(p.lives) : '' })));
}

function simulate(dt) {
  const m = match; m.time += dt;
  for (const p of players) {
    if (p.bot && p.rag.alive) p.bot.update(dt);
    else if (p.isLocal && p.rag.alive) p.rag.setInput(controls.poll(), 0);
  }
  physics.update(dt);
  if (map.update) map.update(dt, physics.time);
  for (const p of players) p.rag.update(dt);

  for (const p of players) {
    if (p.lives <= 0) continue;
    if (!p.rag.alive) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        p.rag.respawn(map.spawns[Math.floor(Math.random() * map.spawns.length)]);
        p.rag.group.visible = true;
      }
    } else if (p.rag.position.y < map.killY) {
      p.lives--; p.rag.alive = false; p.respawnT = 2; p.rag.group.visible = false;
      ui.toast(p.lives > 0 ? `${p.name} ist runtergefallen!` : `${p.name} ist raus!`, 1400);
      if (p.lives <= 0) m.out.push(p);
    }
  }

  const left = players.filter(p => p.lives > 0), timeLeft = MATCH_SECONDS - m.time;
  if (left.length <= 1 || timeLeft <= 0) {
    const ranking = [...left].sort((a, b) => b.lives - a.lives).concat([...m.out].reverse());
    return finish(ranking);
  }

  m.hudT -= dt;
  if (m.hudT <= 0) {
    m.hudT = 0.3; ui.setTimer(timeLeft);
    ui.setScores(players.map(p => ({ name: p.name, color: p.color, lives: '♥'.repeat(Math.max(0, p.lives)), alive: p.lives > 0 })));
  }
  const me = players.find(p => p.isLocal);
  ui.showKO(!!(me && me.rag.ko && me.lives > 0));
}

/* ---------- Kamera ---------- */
function centerCamera(snap, dt = 0) {
  const act = players.filter(p => p.lives > 0 && p.rag.alive);
  if (!act.length) return;
  const c = new THREE.Vector3();
  for (const p of act) c.add(new THREE.Vector3(p.rag.position.x, p.rag.position.y, p.rag.position.z));
  c.divideScalar(act.length);
  let spread = 0;
  for (const p of act) spread = Math.max(spread, Math.hypot(p.rag.position.x - c.x, p.rag.position.z - c.z));
  const dist = 11 + spread * 1.1, k = snap ? 1 : 1 - Math.exp(-dt * 3);
  const desired = new THREE.Vector3(c.x, c.y + dist * 0.75 + 3, c.z + dist);
  if (snap) { camera.position.copy(desired); camLook.copy(c); } else { camera.position.lerp(desired, k); camLook.lerp(c, k); }
  camera.lookAt(camLook);
  sun.position.set(c.x + 12, 24, c.z + 10); sun.target.position.copy(c); sun.target.updateMatrixWorld();
}

/* ---------- Schleife ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!match) return;
  if (!paused && !match.over) simulate(dt);
  centerCamera(false, dt);
  composer.render();
}

/* ---------- UI-Verbindung ---------- */
const game = { ui, THREE, scene, addPlayer, startMatch, get players() { return players; }, get physics() { return physics; }, get map() { return map; }, get match() { return match; } };
window.__game = game;

ui.on('start', async data => {
  if (data.mode === 'solo') return startMatch(data);
  const net = await opt('./network.js');
  if (net && net.handleUIEvent) net.handleUIEvent('start', data, game); else alert('Multiplayer (network.js) fehlt noch.');
});
for (const evt of ['host', 'join', 'leave']) {
  ui.on(evt, async data => {
    const net = await opt('./network.js');
    if (net && net.handleUIEvent) return net.handleUIEvent(evt, data, game);
    if (evt !== 'leave') { alert('Multiplayer (network.js) fehlt noch.'); ui.show('menu', { push: false }); }
  });
}
ui.on('pause', () => { paused = true; });
ui.on('resume', () => { paused = false; });
ui.on('quit', () => clearMatch());
ui.on('rematch', () => lastParams && startMatch(lastParams));

let preview = null;
ui.on('screen', name => {
  if (preview && name !== 'costume') { preview.dispose(); preview = null; }
  if (name === 'costume' && !preview && mods.costumes && mods.costumes.createPreview) preview = mods.costumes.createPreview(ui.previewMount, ui.getConfig());
});
ui.on('preview', cfg => { if (preview) preview.setConfig(cfg); });

/* ---------- Start ---------- */
(async () => {
  ui.setProgress(0.2, 'Physik wird aufgewärmt …');
  const [maps, bots, costumes] = await Promise.all([opt('./maps.js'), opt('./bots.js'), opt('./costumes.js')]);
  mods = { maps, bots, costumes };
  ui.setProgress(0.8, 'Gelee wird eingefärbt …');
  requestAnimationFrame(frame);
  ui.setProgress(1, 'Fertig!');
})();
