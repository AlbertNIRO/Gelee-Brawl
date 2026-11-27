// network.js – Multiplayer über PeerJS (WebRTC) mit 4-stelligem Raum-Code.
// Der Host simuliert die gesamte Physik und sendet 20-mal pro Sekunde den Zustand aller Figuren und Map-Objekte.
// Gäste senden nur ihre Eingaben (30-mal pro Sekunde) und zeigen den empfangenen Zustand an.
// Einstieg: handleUIEvent(evt, data, game) – wird von main.js für host | join | leave | start aufgerufen.
import { CANNON } from './physics.js';
import { COLORS } from './ui.js';

const PREFIX = 'gelee-brawl-', MAX = 4, RATE_S = 1 / 20, RATE_I = 1 / 30;
const hexOf = id => (COLORS.find(c => c.id === id) || COLORS[0]).hex;
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;

let G = null, ui = null, peer = null, role = null, roomCode = '', hostConn = null, guests = [], nextId = 0;
let self = { hex: COLORS[0].hex, costume: 'none' }, lastStart = null;
let accS = 0, accI = 0, joinTimer = 0, idc = 0, initialCount = 0;
const ids = new Map(), hud = { dirty: false, time: 0, scores: [] };
const tmpV = new CANNON.Vec3(), tmpQ = new CANNON.Quaternion();

const send = (c, m) => {
  try { if (c && c.open && !(m.t === 's' && c.dataChannel && c.dataChannel.bufferedAmount > 65536)) c.send(m); } catch { /* Verbindung weg */ }
};
const broadcast = m => guests.forEach(g => send(g.conn, m));

export function handleUIEvent(evt, data, game) {
  G = game; ui = game.ui;
  if (evt === 'host') return host(data);
  if (evt === 'join') return join(data);
  if (evt === 'leave') return teardown();
  if (evt === 'start') return hostStart(data);
}

/* ================= Host ================= */
function host(cfg) {
  teardown();
  if (!window.Peer) return fail('PeerJS konnte nicht geladen werden. Bist du online?');
  role = 'host'; guests = [];
  self = { hex: hexOf(cfg.color), costume: cfg.costume };
  G.hooks.quit = teardown; G.hooks.matchStarted = hostMatchStarted; G.hooks.hostTick = hostTick;
  G.hooks.rematch = () => lastStart && hostStart(lastStart);
  openRoom(0);
}

function openRoom(n) {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  const p = peer = new window.Peer(PREFIX + code);
  p.on('open', () => { roomCode = code; ui.showLobby(code, true); refreshLobby(); });
  p.on('connection', onGuest);
  p.on('error', e => {
    if (e.type === 'unavailable-id' && n < 6) { p.destroy(); openRoom(n + 1); }
    else fail(`Verbindung fehlgeschlagen (${e.type}).`);
  });
}

function onGuest(conn) {
  const g = { conn, id: ++nextId, hex: '', costume: 'none', ready: false, input: null };
  conn.on('open', () => {
    if (guests.length >= MAX - 1 || G.match) { send(conn, { t: 'full' }); setTimeout(() => { try { conn.close(); } catch { /* egal */ } }, 300); }
  });
  conn.on('data', m => onGuestMsg(g, m));
  conn.on('close', () => dropGuest(g));
  conn.on('error', () => dropGuest(g));
}

function onGuestMsg(g, m) {
  if (m.t === 'hello' && !g.ready) {
    if (guests.length >= MAX - 1 || G.match) return;
    const used = new Set([self.hex, ...guests.map(x => x.hex)]), want = hexOf(m.color);
    g.hex = used.has(want) ? (COLORS.find(c => !used.has(c.hex)) || COLORS[0]).hex : want;
    g.costume = m.costume || 'none'; g.ready = true; guests.push(g); refreshLobby();
  } else if (m.t === 'input' && g.ready && Array.isArray(m.i)) {
    const a = m.i, p = G.players.find(q => q.netId === g.id);
    if (p) p.rag.setInput({ moveX: a[0], moveY: a[1], sprint: !!a[2], lh: !!a[3], rh: !!a[4], jump: !!a[5], head: !!a[6], lift: !!a[7] }, 0);
  }
}

function dropGuest(g) {
  const i = guests.indexOf(g); if (i < 0) return;
  guests.splice(i, 1);
  if (G.match && !G.match.over) {
    const p = G.players.find(q => q.netId === g.id);
    if (p) {
      p.lives = 0; p.rag.alive = false; p.rag.group.visible = false;
      if (!G.match.out.includes(p)) G.match.out.push(p);
      ui.toast(`${p.name} hat das Spiel verlassen`, 1600);
    }
  } else refreshLobby();
}

const lobbyList = () => [{ name: 'Spieler 1', color: self.hex }, ...guests.map((g, i) => ({ name: `Spieler ${i + 2}`, color: g.hex }))];
function refreshLobby() {
  const list = lobbyList();
  ui.setLobbyPlayers(list.map((p, i) => ({ ...p, host: i === 0, you: i === 0 })));
  ui.setLobbyStatus(list.length < 2 ? 'Teile den Code mit deinen Freunden.' : `${list.length} von ${MAX} Spielern, der Host startet.`);
  guests.forEach((g, i) => send(g.conn, { t: 'lobby', players: list, you: i + 1 }));
}

function hostStart(data) {
  lastStart = data;
  if (guests.length === 0) {
    ui.show('lobby', { push: false });
    ui.setLobbyStatus('Mindestens 2 Spieler nötig. Warte auf deine Freunde.');
    return;
  }
  const players = [
    { name: 'Spieler 1', color: self.hex, costume: self.costume, isLocal: true },
    ...guests.map((g, i) => ({ name: `Spieler ${i + 2}`, color: g.hex, costume: g.costume, netId: g.id })),
  ];
  G.startMatch({ map: data.map, mode: 'host', role: 'host', config: data.config, players });
}

// Wird von main.startMatch aufgerufen, sobald Map und Figuren stehen.
function hostMatchStarted(params) {
  if (params.role !== 'host') return;
  for (const k of ['setScores', 'setTimer', 'toast', 'showResults']) delete ui[k];
  const o = { setScores: ui.setScores.bind(ui), setTimer: ui.setTimer.bind(ui), toast: ui.toast.bind(ui), showResults: ui.showResults.bind(ui) };
  ui.setScores = l => { o.setScores(l); hud.scores = l; hud.dirty = true; };
  ui.setTimer = s => { o.setTimer(s); hud.time = s; hud.dirty = true; };
  ui.toast = (t, ms) => { o.toast(t, ms); broadcast({ t: 'toast', text: t, ms }); };
  ui.showResults = r => { o.showResults(r); broadcast({ t: 'end', ranking: r }); };
  ids.clear(); idc = 0;
  G.physics.links.forEach(l => { l.id = ++idc; ids.set(l.id, l); });
  initialCount = idc; accS = 0; hud.dirty = true;
  const roster = params.players.map(({ name, color, costume }) => ({ name, color, costume }));
  guests.forEach((g, i) => send(g.conn, { t: 'start', map: params.map, players: roster, me: i + 1 }));
}

function hostTick(dt) {
  accS += dt; if (accS < RATE_S) return; accS = 0;
  const m = { t: 's', f: [], a: [], L: [], o: [], d: [] };
  for (const p of G.players) {
    m.f.push(Array.from(p.rag.serialize(), r3));
    m.a.push(p.rag.alive && p.lives > 0 ? 1 : 0); m.L.push(p.lives);
  }
  for (const l of G.physics.links) {
    if (!l.id) {                                         // neues Objekt zur Laufzeit (z. B. Schild): Beschreibung mitsenden
      l.id = ++idc; ids.set(l.id, l);
      const geo = l.mesh.geometry && l.mesh.geometry.parameters;
      if (geo && geo.width) m.d.push([l.id, geo.width, geo.height, geo.depth, l.mesh.material.color.getHex()]);
    }
    const p = l.body.position, q = l.body.quaternion;
    m.o.push([l.id, r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)]);
  }
  if (hud.dirty) { m.h = { time: hud.time, scores: hud.scores }; hud.dirty = false; }
  broadcast(m);
}

/* ================= Gast ================= */
function join(data) {
  teardown();
  if (!window.Peer) return failJoin('PeerJS konnte nicht geladen werden. Bist du online?');
  role = 'client';
  G.hooks.quit = teardown; G.hooks.clientTick = clientTick; G.hooks.matchStarted = clientMatchStarted; G.hooks.rematch = () => {};
  joinTimer = setTimeout(() => failJoin(`Keine Antwort von Raum ${data.code}.`), 10000);
  peer = new window.Peer();
  peer.on('open', () => {
    const c = hostConn = peer.connect(PREFIX + data.code, { reliable: true, serialization: 'json' });
    c.on('open', () => {
      clearTimeout(joinTimer); roomCode = data.code;
      send(c, { t: 'hello', color: data.config.color, costume: data.config.costume });
    });
    c.on('data', onHostMsg); c.on('close', hostLost); c.on('error', hostLost);
  });
  peer.on('error', e => failJoin(e.type === 'peer-unavailable' ? 'Raum nicht gefunden.' : `Verbindungsfehler (${e.type}).`));
}

function onHostMsg(m) {
  switch (m.t) {
    case 'full': failJoin('Der Raum ist voll oder das Spiel läuft schon.'); break;
    case 'lobby':
      if (ui.screen !== 'lobby') ui.showLobby(roomCode, false);
      ui.setLobbyPlayers(m.players.map((p, i) => ({ ...p, host: i === 0, you: i === m.you })));
      ui.setLobbyStatus('Warte, bis der Host startet …'); break;
    case 'start':
      G.startMatch({ map: m.map, mode: 'guest', role: 'client', config: ui.getConfig(), players: m.players.map((p, i) => ({ ...p, remote: true, isLocal: i === m.me })) });
      break;
    case 's': applyState(m); break;
    case 'toast': ui.toast(m.text, m.ms); break;
    case 'end': if (G.match) G.match.over = true; ui.hideHUD(); ui.showResults(m.ranking); break;
  }
}

function clientMatchStarted(params) {
  if (params.role !== 'client') return;
  ids.clear(); idc = 0;
  G.physics.links.forEach(l => {                         // Map-Objekte folgen nur noch dem Host
    l.id = ++idc; ids.set(l.id, l);
    const b = l.body; b.type = CANNON.Body.KINEMATIC; b.mass = 0; b.updateMassProperties(); b.velocity.setZero(); b.angularVelocity.setZero();
  });
  initialCount = idc; accI = 0;
}

function makeObj(id, w, h, d, color) {
  if (ids.has(id)) return;
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC }); G.physics.add(body);
  const mesh = new G.THREE.Mesh(new G.THREE.BoxGeometry(w, h, d), new G.THREE.MeshStandardMaterial({ color, roughness: .6 }));
  mesh.castShadow = true; G.root.add(mesh); G.physics.link(body, mesh);
  ids.set(id, { body, mesh });
}

function applyState(m) {
  if (!G.match || G.match.role !== 'client') return;
  const P = G.players;
  m.f.forEach((a, i) => { if (P[i]) P[i].rag.apply(a); });
  m.a.forEach((v, i) => { const p = P[i]; if (p) { p.lives = m.L[i]; p.rag.alive = !!v; p.rag.group.visible = !!v; } });
  for (const [id, w, h, d, c] of m.d) makeObj(id, w, h, d, c);
  const seen = new Set();
  for (const [id, x, y, z, qx, qy, qz, qw] of m.o) {
    const l = ids.get(id); if (!l) continue;
    seen.add(id);
    if (!l.tp) { l.body.position.set(x, y, z); l.body.quaternion.set(qx, qy, qz, qw); }
    l.tp = [x, y, z]; l.tq = [qx, qy, qz, qw];
  }
  for (const [id, l] of ids) {
    if (id > initialCount && !seen.has(id)) { G.physics.remove(l.body); l.mesh.removeFromParent(); ids.delete(id); }
  }
  if (m.h) { ui.setScores(m.h.scores); ui.setTimer(m.h.time); }
  const me = P.find(p => p.isLocal);
  ui.showKO(!!(me && me.rag.ko && me.rag.alive));
}

function clientTick(dt, inp) {
  accI += dt;
  if (accI >= RATE_I) {
    accI = 0;
    send(hostConn, { t: 'input', i: [r2(inp.moveX), r2(inp.moveY), +inp.sprint, +inp.lh, +inp.rh, +inp.jump, +inp.head, +inp.lift] });
  }
  const k = 1 - Math.exp(-dt * 18);                      // Objekte weich zum Host-Zustand nachführen
  for (const l of ids.values()) {
    if (!l.tp) continue;
    tmpV.set(l.tp[0], l.tp[1], l.tp[2]); l.body.position.lerp(tmpV, k, l.body.position);
    tmpQ.set(l.tq[0], l.tq[1], l.tq[2], l.tq[3]); l.body.quaternion.slerp(tmpQ, k, l.body.quaternion);
  }
}

function hostLost() {
  if (role !== 'client') return;
  const inMatch = !!G.match;
  teardown();
  if (inMatch) { ui.hideHUD(); ui.emit('quit'); }
  ui.show('menu', { push: false });
  alert('Verbindung zum Host verloren.');
}

/* ================= Aufräumen ================= */
function fail(msg) { teardown(); ui.show('menu', { push: false }); alert(msg); }
function failJoin(msg) { teardown(); ui.error(msg); }

function teardown() {
  role = null; clearTimeout(joinTimer);
  const gs = guests; guests = [];
  gs.forEach(g => { try { g.conn.close(); } catch { /* egal */ } });
  try { if (hostConn) hostConn.close(); } catch { /* egal */ }
  hostConn = null;
  try { if (peer) peer.destroy(); } catch { /* egal */ }
  peer = null;
  if (ui) for (const k of ['setScores', 'setTimer', 'toast', 'showResults']) delete ui[k];
  if (G) { const h = G.hooks; h.matchStarted = h.hostTick = h.clientTick = h.quit = h.rematch = null; }
  ids.clear(); hud.dirty = false;
}
