import { genMap } from '/shared/sim.js';

const DELAY = 100;
const lerp = (a, b, k) => a + (b - a) * k;

export class Net {
  constructor(onChat) {
    this.onChat = onChat; this.orbs = new Map(); this.buf = []; this.fx = []; this.lan = true; this.meState = null;
  }

  connect(name, sp, opts) {
    return new Promise((resolve, reject) => {
      const ws = this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, sp, opts }));
      ws.onerror = () => reject(new Error('Could not reach the LAN server.'));
      ws.onclose = e => { if (!this.map) reject(new Error(e.reason || 'Server closed the connection.')); else this.onChat({ s: 'Disconnected from server.' }); };
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.t === 'init') {
          this.id = m.id; this.map = genMap(m.seed); this.towns = this.map.towns; this.mode = m.mode;
          for (const o of m.orbs) this.orbs.set(o.id, o);
          resolve();
        } else if (m.t === 's') {
          for (const o of m.oa) this.orbs.set(o.id, o);
          for (const id of m.or) this.orbs.delete(id);
          this.fx.push(...m.c.fx);
          this.meState = m.me;
          this.buf.push({ at: performance.now(), s: m.c });
          if (this.buf.length > 10) this.buf.shift();
        } else if (m.t === 'chat') this.onChat(m);
      };
    });
  }

  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }

  input(i) {
    const now = performance.now(), key = `${i.ix.toFixed(2)},${i.iy.toFixed(2)},${i.aim.toFixed(2)},${i.use},${i.dodge},${i.throw}`;
    if (key === this.lastKey && now - this.lastSent < 250) return;
    if (now - (this.lastSent || 0) < 33) return;
    this.lastKey = key; this.lastSent = now;
    this.send({ t: 'in', ...i });
  }
  learn(slot) { this.send({ t: 'learn', slot }); }
  respawn(sp, opts) { this.send({ t: 'respawn', sp, opts }); }
  swap(i) { this.send({ t: 'swap', i }); }
  fly(town) { this.send({ t: 'fly', town }); }
  reward(kind) { this.send({ t: 'reward', kind }); }
  challenge(id, badges) { this.send({ t: 'challenge', id, badges }); }
  upgrade(i) { this.send({ t: 'up', i }); }
  chat(s) { this.send({ t: 'chat', s }); }

  frame() {
    const fx = this.fx; this.fx = [];
    const t = performance.now() - DELAY, b = this.buf;
    if (!b.length) return { snap: { p: [], pr: [], fx: [] }, me: this.meState, fx };
    let i = b.length - 1;
    while (i > 0 && b[i - 1].at > t) i--;
    const s1 = b[i], s0 = b[i - 1];
    if (!s0 || t >= s1.at) return { snap: s1.s, me: this.meState, fx };
    // Interpolate between the two snapshots around the render time.
    const k = Math.max(0, Math.min(1, (t - s0.at) / (s1.at - s0.at)));
    const prevP = new Map(s0.s.p.map(p => [p.id, p])), prevB = new Map(s0.s.pr.map(p => [p.id, p]));
    const mix = (list, prev) => list.map(o => { const a = prev.get(o.id); return a ? { ...o, x: lerp(a.x, o.x, k), y: lerp(a.y, o.y, k) } : o; });
    return { snap: { ...s1.s, p: mix(s1.s.p, prevP), pr: mix(s1.s.pr, prevB) }, me: this.meState, fx };
  }
}
