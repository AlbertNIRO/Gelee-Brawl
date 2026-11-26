// ui.js – Menüs, Lobby, Kostüm-Editor, Map-Auswahl, HUD und Touch-Steuerung.
// Reine DOM-Schicht ohne Abhängigkeiten. main.js, costumes.js, network.js und controls.js
// sprechen nur über die öffentliche API unten mit ihr.

export const COLORS = [
  { id: 'lime',    name: 'Limette',    hex: '#9dff2e' },
  { id: 'sun',     name: 'Sonne',      hex: '#ffd23f' },
  { id: 'orange',  name: 'Mandarine',  hex: '#ff8a1f' },
  { id: 'berry',   name: 'Himbeere',   hex: '#ff3b6b' },
  { id: 'pink',    name: 'Kaugummi',   hex: '#ff7ad9' },
  { id: 'purple',  name: 'Traube',     hex: '#9b5cff' },
  { id: 'blue',    name: 'Blaubeere',  hex: '#3d6bff' },
  { id: 'sky',     name: 'Himmel',     hex: '#34c8ff' },
  { id: 'mint',    name: 'Minze',      hex: '#2de3b0' },
  { id: 'green',   name: 'Waldmeister',hex: '#1faa4a' },
  { id: 'white',   name: 'Vanille',    hex: '#f4f0e6' },
  { id: 'cherry',  name: 'Kirsche',    hex: '#c2142f' },
  { id: 'peach',   name: 'Pfirsich',   hex: '#ffb38a' },
  { id: 'slate',   name: 'Gewitter',   hex: '#5a6b8c' },
];

export const COSTUMES = [
  { id: 'none',     name: 'Nackt-Gelee' },
  { id: 'boxer',    name: 'Boxer' },
  { id: 'ninja',    name: 'Ninja' },
  { id: 'knight',   name: 'Ritter' },
  { id: 'builder',  name: 'Bauarbeiter' },
  { id: 'shark',    name: 'Hai' },
  { id: 'tophat',   name: 'Zylinder' },
  { id: 'viking',   name: 'Wikingerhelm' },
  { id: 'hero',     name: 'Superheld' },
  { id: 'police',   name: 'Polizist' },
  { id: 'chef',     name: 'Koch' },
  { id: 'astronaut',name: 'Astronaut' },
  { id: 'pirate',   name: 'Pirat' },
];

export const MAPS = [
  { id: 'ring',       name: 'Ring',        desc: 'Wrestling-Ring mit Federseilen',             c: ['#ff3b6b', '#ffd23f'] },
  { id: 'grind',      name: 'Grind',       desc: 'Steg über rotierenden Fleischwalzen',        c: ['#6b7280', '#ff3b3b'] },
  { id: 'incinerator',name: 'Incinerator', desc: 'Förderbänder in den Glutofen',               c: ['#ff8a1f', '#3b1d1d'] },
  { id: 'gondola',    name: 'Gondola',     desc: 'Zwei Gondeln, Seile können reißen',          c: ['#34c8ff', '#a8e6ff'] },
  { id: 'trucks',     name: 'Trucks',      desc: 'Fahrende LKWs, Schilder rasen heran',        c: ['#4b5563', '#ffd23f'] },
  { id: 'wheel',      name: 'Wheel',       desc: 'Riesenrad am Pier, lose Planken',            c: ['#9b5cff', '#ff7ad9'] },
  { id: 'blimp',      name: 'Blimp',       desc: 'Rutschiges Luftschiff',                      c: ['#f4f0e6', '#3d6bff'] },
  { id: 'containers', name: 'Containers',  desc: 'Schaukelnde Container am Hafenkran',         c: ['#1faa4a', '#ff8a1f'] },
  { id: 'fans',       name: 'Fans',        desc: 'Aufwinde und Ventilatoren',                  c: ['#2de3b0', '#5a6b8c'] },
  { id: 'subway',     name: 'Subway',      desc: 'Gleise, auf denen Züge einfahren',           c: ['#374151', '#ffd23f'] },
  { id: 'towers',     name: 'Towers',      desc: 'Hohes Baugerüst',                            c: ['#ff8a1f', '#9ca3af'] },
  { id: 'billboard',  name: 'Billboard',   desc: 'Kippende Werbetafel',                        c: ['#ff3b6b', '#3d6bff'] },
  { id: 'aquarium',   name: 'Aquarium',    desc: 'Wasser, Ertrinken, kaputte Geländer',        c: ['#34c8ff', '#1f5fbf'] },
  { id: 'lighthouse', name: 'Lighthouse',  desc: 'Küste mit zerstörbaren Geländern',           c: ['#f4f0e6', '#c2142f'] },
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('gb_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gb_' + k, JSON.stringify(v)); } catch { /* Speicher gesperrt */ } },
};

export class UI {
  constructor() {
    this.handlers = {};
    this.screen = null;
    this.history = [];
    this.mode = 'solo';              // 'solo' | 'host' | 'guest'
    this.selectedMap = null;
    this.config = store.get('config', { color: COLORS[0].id, costume: 'none' });
    this.mapGuess = null;
    // Gemeinsamer Eingabezustand – controls.js liest ihn jeden Frame
    this.input = { moveX: 0, moveY: 0, sprint: false, lh: false, rh: false, jump: false, head: false, lift: false };
    this.inputMode = (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) ? 'touch' : 'desktop';
    this.inHUD = false;
    this.toastTimer = 0;

    this.buildColors();
    this.buildCostumes();
    this.buildMaps();
    this.bindMenu();
    this.bindTouch();
    this.bindInputSwitch();
    this.applyInputMode();
  }

  /* ---------- Events ---------- */
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt, data) { (this.handlers[evt] || []).forEach(fn => fn(data)); }

  /* ---------- Screens ---------- */
  show(name, { push = true } = {}) {
    if (push && this.screen && this.screen !== name) this.history.push(this.screen);
    $$('.screen').forEach(s => s.classList.remove('active', 'overlay'));
    this.screen = name;
    if (name) $('#screen-' + name).classList.add('active');
    if (name === 'pause' || name === 'results') $('#screen-' + name).classList.add('overlay');
    this.emit('screen', name);
  }
  back() { this.show(this.history.pop() || 'menu', { push: false }); }

  setProgress(p, text) {
    $('#load-fill').style.width = Math.round(p * 100) + '%';
    if (text) $('#load-text').textContent = text;
    if (p >= 1) setTimeout(() => this.show('menu', { push: false }), 250);
  }

  /* ---------- Menü & Navigation ---------- */
  bindMenu() {
    const actions = {
      'solo':         () => { this.mode = 'solo'; this.openMaps(); },
      'host':         () => { this.mode = 'host'; this.emit('host', this.getConfig()); },
      'open-join':    () => { $('#join-error').textContent = ''; this.show('join'); $('#join-code').focus(); },
      'join':         () => this.tryJoin(),
      'open-costume': () => { this.show('costume'); this.emit('preview', this.getConfig()); },
      'save-costume': () => { store.set('config', this.config); this.emit('config', this.getConfig()); this.back(); },
      'open-maps':    () => this.openMaps(),
      'back-menu':    () => this.show('menu', { push: false }),
      'back-previous':() => this.back(),
      'leave-lobby':  () => { this.emit('leave'); this.show('menu', { push: false }); },
      'start':        () => this.selectedMap && this.emit('start', { map: this.selectedMap, mode: this.mode, config: this.getConfig() }),
      'resume':       () => this.resume(),
      'quit':         () => { this.hideHUD(); this.emit('quit'); this.show('menu', { push: false }); },
      'rematch':      () => this.emit('rematch'),
    };
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (el && actions[el.dataset.action]) actions[el.dataset.action]();
    });
    const code = $('#join-code');
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 4); });
    code.addEventListener('keydown', e => { if (e.key === 'Enter') this.tryJoin(); });
    $('#btn-pause').addEventListener('click', () => this.pause());
    addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.inHUD) this.screen === 'pause' ? this.resume() : this.pause();
    });
  }

  tryJoin() {
    const code = $('#join-code').value;
    if (code.length !== 4) return this.error('Der Code hat 4 Ziffern.');
    this.error('');
    this.mode = 'guest';
    this.emit('join', { code, config: this.getConfig() });
  }
  error(msg) { $('#join-error').textContent = msg || ''; }
  pause() { if (!this.inHUD) return; this.show('pause', { push: false }); this.emit('pause'); }
  resume() { this.show(null, { push: false }); this.emit('resume'); }
  getConfig() { return { ...this.config }; }

  /* ---------- Lobby ---------- */
  showLobby(code, isHost) {
    this.mode = isHost ? 'host' : 'guest';
    $('#lobby-code').textContent = code;
    $('#btn-lobby-start').classList.toggle('hidden', !isHost);
    this.setLobbyStatus(isHost ? 'Teile den Code mit deinen Freunden.' : 'Warte, bis der Host startet …');
    this.show('lobby', { push: false });
  }
  setLobbyStatus(t) { $('#lobby-status').textContent = t; }
  // players: [{ name, color: 'hex', host: bool, you: bool }]
  setLobbyPlayers(players) {
    const ul = $('#lobby-players');
    ul.replaceChildren(...players.map(p => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="dot"></span><span class="nm"></span><span class="tag"></span>';
      li.firstChild.style.background = p.color;
      li.children[1].textContent = p.name;
      li.children[2].textContent = [p.host && 'Host', p.you && 'Du'].filter(Boolean).join(' · ');
      return li;
    }));
  }

  /* ---------- Farben, Kostüme, Maps ---------- */
  buildColors() {
    const grid = $('#color-grid');
    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = c.hex; b.title = c.name; b.setAttribute('aria-label', c.name);
      b.addEventListener('click', () => { this.config.color = c.id; this.refreshEditor(); this.emit('preview', this.getConfig()); });
      b.dataset.id = c.id; grid.append(b);
    });
    this.refreshEditor();
  }
  buildCostumes() {
    const grid = $('#costume-grid');
    COSTUMES.forEach(c => {
      const b = document.createElement('button');
      b.className = 'chip'; b.textContent = c.name; b.dataset.id = c.id;
      b.addEventListener('click', () => { this.config.costume = c.id; this.refreshEditor(); this.emit('preview', this.getConfig()); });
      grid.append(b);
    });
    this.refreshEditor();
  }
  refreshEditor() {
    $$('.swatch').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === this.config.color));
    $$('.chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === this.config.costume));
  }
  get previewMount() { return $('#preview-mount'); }   // main.js hängt hier den Vorschau-Renderer ein

  buildMaps() {
    const grid = $('#map-grid');
    MAPS.forEach(m => {
      const b = document.createElement('button');
      b.className = 'map-card'; b.dataset.id = m.id;
      b.innerHTML = `<div class="thumb" style="background:linear-gradient(135deg,${m.c[0]},${m.c[1]})"></div><b></b><small></small>`;
      b.children[1].textContent = m.name; b.children[2].textContent = m.desc;
      b.addEventListener('click', () => this.selectMap(m.id));
      grid.append(b);
    });
  }
  openMaps() {
    this.selectedMap = null;
    $$('.map-card').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#btn-start').disabled = true;
    this.show('maps');
  }
  selectMap(id) {
    this.selectedMap = id;
    $$('.map-card').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
    $('#btn-start').disabled = false;
  }

  /* ---------- HUD ---------- */
  showHUD() {
    this.inHUD = true; this.show(null, { push: false });
    $('#hud').classList.remove('hidden');
    this.applyInputMode();
  }
  hideHUD() { this.inHUD = false; $('#hud').classList.add('hidden'); this.resetInput(); }
  // scores: [{ name, color, lives, alive }]
  setScores(list) {
    $('#hud-scores').replaceChildren(...list.map(p => {
      const d = document.createElement('div');
      d.className = 'score' + (p.alive === false ? ' out' : '');
      d.innerHTML = '<span class="dot"></span><span></span>';
      d.firstChild.style.background = p.color;
      d.lastChild.textContent = `${p.name} ${p.lives ?? ''}`.trim();
      return d;
    }));
  }
  setTimer(sec) {
    const s = Math.max(0, Math.ceil(sec));
    $('#hud-timer').textContent = sec == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  toast(text, ms = 1600) {
    const t = $('#hud-toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  showKO(on) { $('#hud-ko').classList.toggle('hidden', !on); }
  // ranking: [{ name, color, note }] – Platz 1 zuerst
  showResults(ranking) {
    $('#result-title').textContent = ranking[0] ? `${ranking[0].name} gewinnt!` : 'Unentschieden';
    $('#result-list').replaceChildren(...ranking.map((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="dot"></span><span></span><span class="tag"></span>';
      li.firstChild.style.background = p.color;
      li.children[1].textContent = `${i + 1}. ${p.name}`;
      li.children[2].textContent = p.note || '';
      return li;
    }));
    this.show('results', { push: false });
  }

  /* ---------- Eingabe-Umschaltung Touch / Maus+Tastatur ---------- */
  bindInputSwitch() {
    addEventListener('touchstart', () => this.setInputMode('touch'), { passive: true });
    addEventListener('keydown', e => { if (!['Escape', 'Enter'].includes(e.key)) this.setInputMode('desktop'); });
    addEventListener('mousemove', e => { if (e.movementX || e.movementY) this.setInputMode('desktop'); });
  }
  setInputMode(m) {
    if (m === this.inputMode) return;
    this.inputMode = m; this.resetInput(); this.applyInputMode();
    this.emit('inputmode', m);
  }
  applyInputMode() {
    const touch = this.inputMode === 'touch';
    $('#touch').classList.toggle('hidden', !(touch && this.inHUD));
    $('#hint-controls').textContent = touch
      ? 'Links: Stick zum Laufen. Rechts: Hände greifen und schlagen, springen, Kopfstoß, hochheben.'
      : 'WASD bewegen · Linksklick / Rechtsklick Hände · Leertaste springen · Shift Kopfstoß · E hochheben';
  }
  resetInput() {
    Object.assign(this.input, { moveX: 0, moveY: 0, sprint: false, lh: false, rh: false, jump: false, head: false, lift: false });
    $$('.tb.pressed').forEach(b => b.classList.remove('pressed'));
    $('#stick-knob').style.transform = '';
  }

  /* ---------- Virtueller Stick und Aktions-Buttons ---------- */
  bindTouch() {
    const stick = $('#stick'), knob = $('#stick-knob');
    let pid = null;
    const R = 62;                                   // Knauf-Radius in px
    const move = e => {
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1, k = Math.min(1, len / R);
      dx = dx / len * k; dy = dy / len * k;
      knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      this.input.moveX = Math.abs(dx) < 0.12 ? 0 : dx;
      this.input.moveY = Math.abs(dy) < 0.12 ? 0 : -dy;   // nach oben = vorwärts
      this.input.sprint = k > 0.92;
    };
    stick.addEventListener('pointerdown', e => { pid = e.pointerId; stick.setPointerCapture(pid); move(e); e.preventDefault(); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
    const end = e => {
      if (e.pointerId !== pid) return;
      pid = null; knob.style.transform = '';
      Object.assign(this.input, { moveX: 0, moveY: 0, sprint: false });
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);

    $$('.tb').forEach(b => {
      const key = b.dataset.key;
      const set = v => { this.input[key] = v; b.classList.toggle('pressed', v); };
      b.addEventListener('pointerdown', e => { b.setPointerCapture(e.pointerId); set(true); e.preventDefault(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, () => set(false)));
    });
    // Kontextmenü und Pinch-Zoom auf iPadOS unterdrücken
    addEventListener('contextmenu', e => e.preventDefault());
    ['gesturestart', 'gesturechange'].forEach(t => addEventListener(t, e => e.preventDefault()));
    document.addEventListener('touchmove', e => { if (!e.target.closest('.maps, .panel, .screen')) e.preventDefault(); }, { passive: false });
  }
}

// Sofort starten und global verfügbar machen. main.js importiert { ui } und meldet den Ladefortschritt.
export const ui = new UI();
window.__ui = ui;
// Ohne main.js (z. B. beim ersten Test) kommt man nach kurzer Zeit trotzdem ins Menü.
setTimeout(() => { if (ui.screen === null && !ui.inHUD) return; if (ui.screen === 'loading' || ui.screen === null) ui.setProgress(1); }, 1200);
ui.show('loading', { push: false });
