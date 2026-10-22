// Rotating objectives kept in the profile. Three are active at a time; finishing one pays out and rolls a new one.
import { REGIONS } from '/shared/sim.js';

const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const REWARDS = { balls: '4 Poké Balls', candy: 'Rare Candy', item: 'a held item', exp: 'bonus EXP' };
const pick = a => a[Math.random() * a.length | 0];
const cap = s => s[0].toUpperCase() + s.slice(1);

function roll(ctx) {
  const n = (lo, hi) => lo + (Math.random() * (hi - lo + 1) | 0), reward = pick(Object.keys(REWARDS)), r = ctx.region ?? 0;
  const t = pick(TYPES), other = pick(REGIONS.map((_, i) => i).filter(i => i !== r));
  const q = pick([
    () => ({ k: 'catchType', type: t, need: n(1, 3), text: `Catch ${'$N'} ${cap(t)}-type Pokémon` }),
    () => ({ k: 'catch', need: n(2, 4), text: 'Catch $N Pokémon' }),
    () => ({ k: 'koTrainer', need: n(2, 5), text: 'KO $N trainers' }),
    () => ({ k: 'koWild', need: n(4, 8), text: 'Defeat $N wild Pokémon' }),
    () => ({ k: 'badge', need: 1, text: 'Earn a gym badge or beat a boss challenge' }),
    () => ({ k: 'evolve', need: 1, text: 'Evolve a Pokémon' }),
    () => ({ k: 'level', need: Math.min(100, (ctx.lvl || 5) + n(4, 8)), text: 'Reach Lv $N' }),
    () => ({ k: 'visit', region: other, need: 1, text: `Travel to ${REGIONS[other].n}` }),
    () => ({ k: 'towns', need: n(2, 4), seen: [], text: 'Visit $N different towns' }),
    () => ({ k: 'combo', need: n(1, 3), text: 'Land $N combo hits (x3 chain or better)' }),
  ])();
  return { ...q, have: 0, reward };
}

export class Quests {
  constructor(profile) { this.profile = profile; }
  get list() { return (this.profile.p.quests ??= []); }

  fill(ctx) {
    while (this.list.length < 3) this.list.push(roll(ctx));
    this.profile.dirty = true;
  }

  label(q) { return q.text.replace('$N', q.need) + ` · reward: ${REWARDS[q.reward]}`; }

  // Feed game events in; returns finished quests (already removed and replaced).
  on(ev, ctx) {
    const done = [];
    for (const q of this.list) {
      const before = q.have;
      if (ev.k === 'catch' && (q.k === 'catch' || (q.k === 'catchType' && ev.types?.includes(q.type)))) q.have++;
      else if (ev.k === 'ko' && ((q.k === 'koTrainer' && !ev.wild) || (q.k === 'koWild' && ev.wild))) q.have++;
      else if (ev.k === q.k && (q.k === 'badge' || q.k === 'evolve' || q.k === 'combo')) q.have++;
      else if (ev.k === 'tick') {
        if (q.k === 'level') q.have = Math.min(q.need, ctx.lvl || 0);
        if (q.k === 'visit' && ctx.region === q.region) q.have = 1;
        if (q.k === 'towns' && ctx.town && !q.seen.includes(ctx.town)) { q.seen.push(ctx.town); q.have = q.seen.length; }
      }
      if (q.have !== before) this.profile.dirty = true;
      if (q.have >= q.need) done.push(q);
    }
    if (!done.length) return done;
    this.profile.p.quests = this.list.filter(q => !done.includes(q));
    this.profile.bump('questsDone', done.length);
    this.fill(ctx);
    return done;
  }
}
