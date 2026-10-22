// Mouse steering, WASD, gamepad and touch joystick, all reduced to analog {ix, iy, aim, ad, use}.
const DEAD = 0.2;

export class Input {
  constructor(canvas, moveButtons) {
    this.keys = new Set(); this.mouse = { x: innerWidth / 2, y: innerHeight / 2, l: false, r: false, seen: false };
    this.held = -1; this.follow = true; this.dodgeHeld = false; this.throwHeld = false;
    this.touch = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
    addEventListener('keydown', e => { if (e.target.tagName !== 'INPUT') this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; this.held = -1; });
    canvas.addEventListener('mousemove', e => { Object.assign(this.mouse, { x: e.clientX, y: e.clientY, seen: true }); this.usedTouch = false; this.usedPad = false; });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) this.mouse.l = true; if (e.button === 2) this.mouse.r = true; });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('mouseleave', () => { this.mouse.seen = false; });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      this.usedTouch = true;
      for (const t of e.changedTouches) {
        if (this.touch.id === null) Object.assign(this.touch, { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 });
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.touch.id) continue;
        const dx = t.clientX - this.touch.ox, dy = t.clientY - this.touch.oy, L = Math.hypot(dx, dy), k = Math.min(L, 50) / 50 / (L || 1);
        this.touch.dx = dx * k; this.touch.dy = dy * k;
      }
    }, { passive: false });
    const end = e => { for (const t of e.changedTouches) if (t.identifier === this.touch.id) Object.assign(this.touch, { active: false, id: null, dx: 0, dy: 0 }); };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    moveButtons.forEach((b, i) => {
      const down = e => { e.preventDefault(); this.held = i; if (e.type === 'touchstart') this.usedTouch = true; };
      const up = () => { if (this.held === i) this.held = -1; };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('touchend', up);
      b.addEventListener('mouseup', up);
      b.addEventListener('mouseleave', up);
    });
  }

  bindDodge(b) {
    const down = e => { e.preventDefault(); this.dodgeHeld = true; };
    const up = () => { this.dodgeHeld = false; };
    for (const [ev, fn] of [['touchstart', down], ['mousedown', down], ['touchend', up], ['mouseup', up], ['mouseleave', up]]) b.addEventListener(ev, fn, { passive: false });
  }

  bindThrow(b) {
    const down = e => { e.preventDefault(); this.throwHeld = true; };
    const up = () => { this.throwHeld = false; };
    for (const [ev, fn] of [['touchstart', down], ['mousedown', down], ['touchend', up], ['mouseup', up], ['mouseleave', up]]) b.addEventListener(ev, fn, { passive: false });
  }

  pad() {
    for (const gp of navigator.getGamepads?.() || []) if (gp?.connected) return gp;
    return null;
  }

  nearest(me, players, maxD) {
    let best = null, bd = maxD;
    for (const p of players) {
      if (p.id === me.id || p.d) continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  read(renderer, me, players) {
    if (!me) return { ix: 0, iy: 0, aim: 0, ad: 250, use: -1, dodge: false, throw: false };
    const k = c => this.keys.has(c);
    let ix = (k('KeyD') || k('ArrowRight')) - (k('KeyA') || k('ArrowLeft'));
    let iy = (k('KeyS') || k('ArrowDown')) - (k('KeyW') || k('ArrowUp'));
    const keyMove = ix || iy;
    if (keyMove) { const L = Math.hypot(ix, iy); ix /= L; iy /= L; }
    const [wx, wy] = renderer.screenToWorld(this.mouse.x, this.mouse.y);
    let aim = Math.atan2(wy - me.y, wx - me.x), ad = Math.hypot(wx - me.x, wy - me.y), use = -1;
    // Soft lock-on: the foe nearest the cursor (within a forgiving radius) gets every attack.
    this.lock = null;
    let best = 130 / renderer.cam.z;
    for (const p of players) {
      if (p.id === me.id || p.d || (p.np && p.np[3])) continue;
      const d = Math.hypot(p.x - wx, p.y - wy) - p.r;
      if (d < best) { best = d; this.lock = p.id; aim = Math.atan2(p.y - me.y, p.x - me.x); ad = Math.hypot(p.x - me.x, p.y - me.y); }
    }

    const gp = this.pad();
    let dodge = k('KeyQ') || this.dodgeHeld || !!gp?.buttons[5]?.pressed;
    if (gp) {
      const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0, rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (Math.hypot(lx, ly) > DEAD) { ix = lx; iy = ly; this.usedPad = true; }
      if (Math.hypot(rx, ry) > DEAD) { aim = Math.atan2(ry, rx); ad = 300; this.usedPad = true; }
      else if (this.usedPad) { const t = this.nearest(me, players, 520); aim = t ? Math.atan2(t.y - me.y, t.x - me.x) : Math.hypot(ix, iy) > DEAD ? Math.atan2(iy, ix) : me.fa; ad = t ? Math.hypot(t.x - me.x, t.y - me.y) : 250; }
      [0, 1, 2, 3].forEach(i => { if (gp.buttons[i]?.pressed) use = i; });
      if (use < 0 && gp.buttons[7]?.pressed) use = 0;
      if (use < 0 && gp.buttons[6]?.pressed) use = 1;
      if (use >= 0) this.usedPad = true;
    }
    if (this.usedTouch) {
      if (this.touch.active) { ix = this.touch.dx; iy = this.touch.dy; }
      const t = this.nearest(me, players, 520);
      aim = t ? Math.atan2(t.y - me.y, t.x - me.x) : Math.hypot(ix, iy) > DEAD ? Math.atan2(iy, ix) : me.fa;
      ad = t ? Math.hypot(t.x - me.x, t.y - me.y) : 250;
    } else if (this.follow && !keyMove && !this.usedPad && this.mouse.seen) {
      // Slither-style steering: head toward the cursor, easing off as it gets close.
      const dx = wx - me.x, dy = wy - me.y, L = Math.hypot(dx, dy);
      if (L > me.r * 0.8) { const s = Math.min(1, (L - me.r * 0.8) / 120); ix = dx / L * s; iy = dy / L * s; }
    }
    if (use < 0) use = this.held;
    if (!k('ShiftLeft') && !k('ShiftRight')) for (let i = 0; i < 4; i++) if (k('Digit' + (i + 1)) || k('Numpad' + (i + 1))) use = i;
    if (use < 0 && this.mouse.l) use = 0;
    if (use < 0 && this.mouse.r) use = 1;
    if (use < 0 && k('Space')) use = 2;
    if (use < 0 && k('KeyE')) use = 3;
    const thr = k('KeyC') || this.throwHeld || !!gp?.buttons[4]?.pressed;
    return { ix, iy, aim, ad, use, dodge, throw: thr };
  }
}
