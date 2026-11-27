// controls.js – führt Tastatur, Maus und das Touch-HUD (ui.input) zu einem Eingabezustand zusammen.
// Tasten: WASD/Pfeile bewegen · Q sprinten · Leertaste springen · Linksklick/Rechtsklick Hände
//         (halten = greifen) · Shift Kopfstoß · E oder Strg hochheben/werfen.
import { ui } from './ui.js';

const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'head', ShiftRight: 'head',
  KeyE: 'lift', ControlLeft: 'lift', ControlRight: 'lift', KeyQ: 'sprint',
};

export class Controls {
  constructor() {
    this.keys = new Set();
    this.mouse = { lh: false, rh: false };
    this.out = { moveX: 0, moveY: 0, sprint: false, lh: false, rh: false, jump: false, head: false, lift: false };

    addEventListener('keydown', e => {
      const a = KEYS[e.code]; if (!a) return;
      if (ui.inHUD) e.preventDefault();
      this.keys.add(a);
    });
    addEventListener('keyup', e => { const a = KEYS[e.code]; if (a) this.keys.delete(a); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.lh = this.mouse.rh = false; });

    addEventListener('mousedown', e => {
      if (!ui.inHUD || e.target.closest('button')) return;
      if (e.button === 0) this.mouse.lh = true;
      if (e.button === 2) this.mouse.rh = true;
      e.preventDefault();
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.lh = false;
      if (e.button === 2) this.mouse.rh = false;
    });
  }

  // Wird pro Frame aufgerufen. Touch-HUD und Tastatur funktionieren gleichzeitig.
  poll() {
    const k = this.keys, t = ui.input, o = this.out;
    const clamp = v => Math.max(-1, Math.min(1, v));
    o.moveX = clamp((k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0) + t.moveX);
    o.moveY = clamp((k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0) + t.moveY);
    o.sprint = k.has('sprint') || t.sprint;
    o.jump = k.has('jump') || t.jump;
    o.head = k.has('head') || t.head;
    o.lift = k.has('lift') || t.lift;
    o.lh = this.mouse.lh || t.lh;
    o.rh = this.mouse.rh || t.rh;
    return o;
  }
}
