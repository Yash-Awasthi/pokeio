// Trainer profile kept in this browser: Pokédex, unlocked starters, per-line catch mastery, shiny unlocks, lifetime stats.
const KEY = 'pokeio-profile';
export const STARTERS = ['bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile', 'treecko', 'torchic', 'mudkip',
  'turtwig', 'chimchar', 'piplup', 'snivy', 'tepig', 'oshawott', 'chespin', 'fennekin', 'froakie', 'rowlet', 'litten', 'popplio',
  'grookey', 'scorbunny', 'sobble', 'sprigatito', 'fuecoco', 'quaxly', 'pichu', 'eevee'];
export const SHINY_AT = 10;

export class Profile {
  constructor(data) {
    this.d = data;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
    this.p = { seen: {}, caught: {}, lines: {}, shiny: {}, best: 0, kos: 0, wins: 0, raids: 0, games: 0, ...saved };
    this.dirty = false;
  }

  save() {
    if (!this.dirty) return;
    this.dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(this.p)); } catch {}
  }

  root(sp) { let s = sp; while (this.d.species[s]?.from && this.d.species[this.d.species[s].from]) s = this.d.species[s].from; return s; }
  unlocked(sp) { return STARTERS.includes(sp) || (this.p.lines[sp] || 0) > 0; }
  catches(sp) { return this.p.lines[this.root(sp)] || 0; }
  // 1, 3, 7, 15, 31 catches of a line give mastery 1-5; each level pre-unlocks 8 more levels of its learnset.
  mastery(sp) { return Math.min(5, Math.floor(Math.log2(this.catches(sp) + 1))); }
  shinyOk(sp) { return !!this.p.shiny[this.root(sp)] || this.catches(sp) >= SHINY_AT; }
  starterIds() { return Object.keys(this.d.species).filter(sp => this.unlocked(sp) && this.d.pokemon[this.d.species[sp].base] && !this.d.species[sp].from); }

  see(sp) { if (!this.p.seen[sp]) { this.p.seen[sp] = 1; this.dirty = true; } }

  // Returns a list of milestone messages so the UI can celebrate them.
  caught(sp, shiny) {
    const r = this.root(sp), news = [], before = this.p.lines[r] || 0, mBefore = this.mastery(r), shinyBefore = this.shinyOk(r);
    this.see(sp);
    this.p.caught[sp] = (this.p.caught[sp] || 0) + 1;
    this.p.lines[r] = before + 1;
    if (shiny) this.p.shiny[r] = 1;
    const name = this.d.species[r].n;
    if (!before && !STARTERS.includes(r)) news.push(`${name} unlocked as a starter!`);
    if (this.mastery(r) > mBefore) news.push(`${name} mastery ${'★'.repeat(this.mastery(r))}: starts with stronger moves!`);
    if (this.shinyOk(r) && !shinyBefore) news.push(`Shiny ${name} unlocked!`);
    this.dirty = true;
    return news;
  }

  badges(region) { return this.p.badges?.[region] || []; }
  badge(region, idx) {
    const b = ((this.p.badges ??= {})[region] ??= []);
    if (!b.includes(idx)) { b.push(idx); this.dirty = true; }
  }
  champion(region) { (this.p.champs ??= {})[region] = (this.p.champs[region] || 0) + 1; this.dirty = true; }
  champs(region) { return this.p.champs?.[region] || 0; }

  bump(k, v = 1) { this.p[k] = (this.p[k] || 0) + v; this.dirty = true; }
  best(lvl) { if (lvl > this.p.best) { this.p.best = lvl; this.dirty = true; } }
}
