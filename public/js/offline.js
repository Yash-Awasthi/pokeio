import { World } from '/shared/sim.js';

const STEP = 1 / 60;

export class Offline {
  constructor(data, name, sp, mode = 'ffa', opts = {}) {
    this.w = new World(data, { mode });
    this.me = name === null ? null : this.w.addPlayer(name, sp, { opts });
    this.w.addBots(mode === 'br' ? 19 : 24);
    this.map = this.w.world; this.towns = this.w.towns;
    this.orbs = this.w.orbs;
    this.acc = 0;
    this.lan = false;
  }
  input(i) { this.w.setInput(this.me, i); }
  learn(slot) { this.w.learnMove(this.me, slot); }
  respawn(sp, opts) { this.w.respawn(this.me, sp, opts); }
  swap(i) { this.w.swapTo(this.me, i); }
  fly(town) { this.w.fly(this.me, town); }
  reward(kind) { this.w.reward(this.me, kind); }
  challenge(id, badges) { this.w.challenge(this.me, id, badges); }
  upgrade(i) { this.w.upgrade(this.me, i); }
  chat() {}
  frame(dt) {
    const fx = [];
    if (this.paused) dt = 0;
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= STEP) {
      this.w.tick(STEP);
      fx.push(...this.w.fx);
      this.w.flush();
      this.acc -= STEP;
    }
    return { snap: this.w.snapshot(), me: this.me && this.w.mine(this.me), fx };
  }
}
