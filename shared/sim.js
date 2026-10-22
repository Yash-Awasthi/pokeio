// Authoritative game simulation. Runs in the browser for offline play and on the server for LAN.
import { calcStat, calcDamage, typeMul, stageMul, cooldown, CRIT, KIND, WEATHER, prep, natureMul, UPGRADE_MAX, UPGRADE_STEP } from './rules.js';
import { ABIL, pickAbility } from './abilities.js';
import { HELD, HELD_NAMES } from './items.js';
import { TILE, MAP, WORLD, RS, T, SOLID, TREES, BIOMES, REGIONS, genMap } from './map.js';

export { TILE, MAP, WORLD, T, BIOMES, REGIONS, genMap } from './map.js';

const ORBS = 6000, WILDS = 200, NEAR = 3200, FAR = 7500, CELL = 512, BOSS_EVERY = 150, SPAWN_PROT = 3, PARTY_MAX = 2, BALLS_MAX = 10;
const STONES = ['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'sun-stone', 'shiny-stone', 'dusk-stone', 'dawn-stone', 'ice-stone'];
const STAT_KEY = { attack: 0, defense: 1, 'special-attack': 2, 'special-defense': 3, speed: 4 };
const ABSORB_STAT = { atk: [0, 1], def: [1, 2], spa: [2, 1], spe: [4, 1] };
const AILMENT_TIME = { burn: 6, poison: 6, paralysis: 5, sleep: 2.5, freeze: 2, confusion: 3, trap: 3, 'leech-seed': 6 };
const DOT = { burn: 1 / 16, poison: 1 / 10, 'leech-seed': 1 / 16 };
const MON_KEYS = ['rf', 'sp', 'form', 'lvl', 'exp', 'hp', 'mh', 'moves', 'cd', 'iv', 'nat', 'up', 'pts', 'status', 'statusT', 'st', 'shiny', 'item', 'pending'];
const DAY = 360;
// Weather each region can roll; snowy/desert/sea-heavy regions bias toward their own.
const SKIES = ['clear', 'clear', 'rain', 'sun', 'fog'];
const SKY_BOOST = { rain: { water: 1.3, fire: 0.7 }, sun: { fire: 1.3, water: 0.7, grass: 1.1 }, sand: { rock: 1.2, ground: 1.2, steel: 1.2 }, snow: { ice: 1.3 }, fog: { ghost: 1.2, psychic: 1.1 } };
const STREAK_TITLES = { 3: 'on a roll', 5: 'on a rampage', 10: 'unstoppable', 15: 'godlike', 20: 'legendary' };
const BOT_NAMES = ['Youngster Joey', 'Lass Janice', 'Bug Catcher Rick', 'Hiker Marcos', 'Ace Trainer Lola', 'Swimmer Luis', 'Picnicker Kelsey', 'Camper Liam', 'Biker Jaren', 'Gentleman Arthur', 'Beauty Bridget', 'Super Nerd Jovan', 'Juggler Dalton', 'Psychic Tyron', 'Black Belt Koichi', 'Bird Keeper Sebastian', 'Fisherman Ned', 'Rocket Grunt', 'Cooltrainer Mary', 'Sailor Edmond', 'Tamer Phil', 'Burglar Quinn', 'Engineer Baily', 'Gambler Hugo', 'Ruin Maniac Larry', 'Channeler Hope', 'Pokémaniac Mark', 'Blackbelt Hitoshi', 'Rival Blue', 'Lass Robin'];

const pick = a => a[Math.random() * a.length | 0];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

function rollItem() {
  const r = Math.random();
  if (r < 0.88) return 'e';
  if (r < 0.92) return r < 0.905 ? 'oran-berry' : r < 0.915 ? 'sitrus-berry' : 'lum-berry';
  if (r < 0.926) return 'rare-candy';
  if (r < 0.946) return pick(STONES);
  if (r < 0.955) return 'mega';
  if (r < 0.964) return 'dmax';
  if (r < 0.98) return 'poke-ball';
  return pick(HELD_NAMES);
}

// Body radius from real height (decimetres): compressed so a 14 m Wailord stays playable next to a 0.3 m Joltik.
export const bodySize = (h, lvl) => clamp(8 + 16 * ((h || 10) / 10) ** 0.6, 11, 80) * (0.85 + lvl * 0.003);

export const starterList = d => Object.keys(d.species).filter(n => { const s = d.species[n]; return d.pokemon[s.base] && !s.from && !s.leg; });

export class World {
  constructor(data, { seed = Math.random() * 2 ** 31 | 0, wilds = WILDS, mode = 'ffa' } = {}) {
    this.d = prep(data); this.seed = seed; this.mode = mode;
    // Lazily generated chunk world; everything that lives in it spawns around players.
    this.world = genMap(seed);
    this.map = this.world; this.towns = this.world.towns;
    this.players = new Map(); this.proj = []; this.zones = []; this.strikes = []; this.orbs = new Map(); this.pending = []; this.og = new Map();
    this.fx = []; this.added = []; this.removed = [];
    this.nid = 1; this.oid = 1; this.pid = 1; this.time = 0; this.ambient = 0; this.round = 1; this.over = 0;
    this.wildTarget = wilds; this.bossT = BOSS_EVERY / 2;
    this.starters = starterList(data);
    this.starterSet = new Set(this.starters);
    this.legends = Object.keys(data.species).filter(n => data.species[n].leg && data.pokemon[data.species[n].base]);
    this.legendSet = new Set(this.legends);
    if (mode === 'br') this.initZone();
    this.sky = REGIONS.map(() => ({ k: 'clear', t: 20 + Math.random() * 60 }));
    if (mode !== 'br') this.spawnLeaders();
  }

  tile(x, y) { return this.world.tile(Math.floor(x / TILE), Math.floor(y / TILE)); }
  biomeAt(x, y) { return this.world.biome(x / TILE | 0, y / TILE | 0); }
  regionOf(x, y) { return this.world.regionAt(clamp(x / TILE | 0, 0, MAP - 1), clamp(y / TILE | 0, 0, MAP - 1)); }

  // Living things cluster around anchors (humans, or bots when nobody is playing) so the huge world stays lively where it matters.
  anchors() {
    const t = this.time;
    if (this.anchorT !== t) {
      this.anchorT = t;
      const humans = [...this.players.values()].filter(p => !p.bot && !p.dead);
      this.anchorList = humans.length ? humans : [...this.players.values()].filter(p => p.bot && !p.wild && !p.npc && !p.dead).slice(0, 3);
    }
    return this.anchorList;
  }
  nearAnchor(x, y, d) { return this.anchors().some(a => Math.abs(a.x - x) < d && Math.abs(a.y - y) < d); }
  nearSpot(p, x, y, r0, r1) {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, d = r0 + Math.random() * (r1 - r0), sx = clamp(x + Math.cos(a) * d, TILE * 4, WORLD - TILE * 4), sy = clamp(y + Math.sin(a) * d, TILE * 4, WORLD - TILE * 4);
      if (!this.solid(p, sx, sy) && this.tile(sx, sy) !== T.LAVA && this.inZone(sx, sy, 60)) return [sx, sy];
    }
    return null;
  }
  spotNearAnchor(p, r0 = 900, r1 = NEAR) {
    const a = pick(this.anchors());
    return (a && this.nearSpot(p, a.x, a.y, r0, r1)) || this.freeSpot(p);
  }
  // Home region of a species = the region of the generation that introduced it.
  speciesRegion(sp) {
    const id = this.d.pokemon[this.d.species[sp].base].id;
    return Math.max(0, REGIONS.findIndex(r => r.gen.some(([lo, hi]) => id >= lo && id <= hi)));
  }
  nearTown(x, y, d = 170) { return this.towns.find(t => Math.hypot(t.x - x, t.y - y) < d); }
  lavaSafe(p) { return p.types.includes('fire') || p.types.includes('flying') || !!p.A.hover; }
  solid(p, x, y) {
    const t = this.tile(x, y);
    return SOLID.has(t) || (t === T.WATER && !p?.swim) || (t === T.LAVA && (!p || (p.bot && !this.lavaSafe(p))));
  }
  expAt(sp, lvl) { return this.d.growth[this.d.species[sp].g][lvl]; }
  spName(p) { return this.d.species[p.sp].n; }
  label(p) { return p.boss ? `Legendary ${this.spName(p)}` : p.wild ? `Wild ${this.spName(p)}` : `${p.name}'s ${this.spName(p)}`; }
  abName(p) { return this.d.abilities?.[p.ab]?.n || p.ab; }
  held(p) { return HELD[p.item] || {}; }
  trainers() { return [...this.players.values()].filter(p => !p.wild && !p.npc); }

  crowded(p, x, y, d) {
    for (const q of this.players.values()) if (q !== p && !q.dead && !q.wild && Math.hypot(q.x - x, q.y - y) < d) return true;
    return false;
  }

  inZone(x, y, margin = 0) { const z = this.zone; return !z || Math.hypot(x - z.x, y - z.y) < z.r - margin; }

  freeSpot(p, prefer, region) {
    if (this.zone) return this.nearSpot(p, this.zone.x, this.zone.y, 0, this.zone.r - 100) || [this.zone.x, this.zone.y];
    if (region === undefined) region = Math.random() * REGIONS.length | 0;
    const [ox, oy] = this.world.regionBox(region), span = RS;
    for (let i = 0; i < 200; i++) {
      const x = TILE * (ox + 8 + Math.random() * (span - 16)), y = TILE * (oy + 8 + Math.random() * (span - 16));
      if (this.solid(p, x, y) || this.tile(x, y) === T.LAVA) continue;
      if (i < 160 && !this.inZone(x, y, 60)) continue;
      if (prefer !== undefined && i < 80 && this.tile(x, y) !== prefer) continue;
      if (p && !p.wild && i < 120 && this.crowded(p, x, y, 700)) continue;
      return [x, y];
    }
    return this.zone ? [this.zone.x, this.zone.y] : [WORLD / 2, WORLD / 2];
  }

  spawnOrb(k, x, y, v = 1) {
    const o = { id: this.oid++, k, x, y, v };
    if (!k) { o.k = rollItem(); [o.x, o.y] = this.spotNearAnchor(null, 150, NEAR); o.a = 1; this.ambient++; }
    o.x = Math.round(clamp(o.x, TILE * 3, WORLD - TILE * 3)); o.y = Math.round(clamp(o.y, TILE * 3, WORLD - TILE * 3));
    o.ck = (o.x / CELL | 0) * 1000 + (o.y / CELL | 0);
    if (!this.og.has(o.ck)) this.og.set(o.ck, new Set());
    this.og.get(o.ck).add(o);
    this.orbs.set(o.id, o); this.added.push(o);
  }
  removeOrb(o) { this.orbs.delete(o.id); this.og.get(o.ck)?.delete(o); this.removed.push(o.id); if (o.a) this.ambient--; }
  // Orbs live in a coarse grid so pickups and bot foraging only look at nearby cells.
  *orbsNear(x, y, rad) {
    const x0 = (x - rad) / CELL | 0, x1 = (x + rad) / CELL | 0, y0 = (y - rad) / CELL | 0, y1 = (y + rad) / CELL | 0;
    for (let cx = Math.max(0, x0); cx <= x1; cx++) for (let cy = Math.max(0, y0); cy <= y1; cy++) {
      const b = this.og.get(cx * 1000 + cy);
      if (b) yield* b;
    }
  }

  addPlayer(name, sp, o = {}) {
    const p = { id: this.nid++, name, bot: !!(o.bot || o.wild || o.npc), wild: !!o.wild, boss: !!o.boss, kills: 0, pref: sp, opts: o.opts || {}, npc: o.npc || null };
    this.players.set(p.id, p);
    this.reset(p, sp, o.lvl || 5, o.at || (p.bot ? [0, 0] : null));
    return p;
  }

  addBots(n) {
    for (let i = 0; i < n; i++) this.spawnTiered(this.addPlayer(pick(BOT_NAMES), pick(this.starters), { bot: true }));
  }

  depthOf(sp) { let d = 0; for (let s = this.d.species[sp]; s.from && this.d.species[s.from]; s = this.d.species[s.from]) d++; return d; }
  maxDepth(sp) {
    this.depths ??= new Map();
    if (!this.depths.has(sp)) { const e = this.d.species[sp].evo; this.depths.set(sp, e?.length ? 1 + Math.max(...e.map(x => this.maxDepth(x.to))) : 0); }
    return this.depths.get(sp);
  }

  // Level and evolution stage of a random living human: same stage, or one off 1 time in 25, never further.
  tier() {
    const ref = pick([...this.players.values()].filter(p => !p.bot && !p.dead));
    if (!ref) return { lvl: 5 + (Math.random() * 6 | 0), stage: 0, region: Math.random() * REGIONS.length | 0 };
    let stage = this.depthOf(ref.sp);
    if (Math.random() < 1 / 25) stage = Math.max(0, stage + (Math.random() < 0.5 ? -1 : 1));
    return { lvl: clamp(ref.lvl + Math.round((Math.random() * 2 - 1) * 3), 3, 100), stage, region: this.regionOf(ref.x, ref.y) };
  }

  // Walk one random evolution branch from a stage-1 species whose line is long enough; `ok` narrows the base (e.g. biome type).
  lineAt(stage, ...filters) {
    for (let s = stage; s >= 0; s--) {
      for (const f of [...filters, () => true]) {
        const pool = this.starters.filter(b => f(b) && this.maxDepth(b) >= s);
        if (!pool.length) continue;
        let sp = pick(pool);
        const base = sp;
        for (let i = 0; i < s; i++) sp = pick(this.d.species[sp].evo.filter(e => this.maxDepth(e.to) >= s - i - 1)).to;
        return { base, sp };
      }
    }
  }

  inGen(base, region) { const id = this.d.pokemon[this.d.species[base].base].id; return REGIONS[region].gen.some(([lo, hi]) => id >= lo && id <= hi); }
  // Regional variants (Alolan Vulpix, Galarian Meowth, Hisuian Growlithe, Paldean Wooper) for wilds born in those regions.
  regionalSuffix(sp, region) {
    const ok = (REGIONS[region].forms || []).filter(x => this.d.pokemon[`${this.d.species[sp].base}-${x}`]);
    return ok.length ? pick(ok) : null;
  }
  formFor(sp, rf) {
    const f = rf && `${this.d.species[sp].base}-${rf}`;
    return f && this.d.pokemon[f] ? f : this.d.species[sp].base;
  }
  typed(base, types) { return this.d.pokemon[this.d.species[base].base].t.some(t => types.includes(t)); }

  spawnTiered(p, lvlShift = 0) {
    const { lvl, stage } = this.tier(), L = clamp(lvl + lvlShift, 3, 100);
    const [x, y] = this.spotNearAnchor(p.wild ? null : p, p.wild ? 900 : 1600, p.wild ? NEAR : 4200), here = this.regionOf(x, y), types = BIOMES[this.biomeAt(x, y)].types;
    // Wilds are natives: their region's generation, matching the local biome's types when possible.
    const night = p.wild && this.isNight() && Math.random() < 0.4;
    const filters = night ? [b => this.typed(b, ['ghost', 'dark']) && this.inGen(b, here), b => this.typed(b, ['ghost', 'dark'])] : p.wild
      ? [b => (this.inGen(b, here) || this.regionalSuffix(b, here)) && (!types.length || this.typed(b, types)), b => this.inGen(b, here) || this.regionalSuffix(b, here), ...(types.length ? [b => this.typed(b, types)] : [])]
      : [];
    const { base, sp } = this.lineAt(stage, ...filters);
    this.place(p, base, sp, L, x, y);
    if (p.wild) {
      const rf = this.regionalSuffix(base, here) || this.regionalSuffix(sp, here);
      if (rf) { p.rf = rf; p.form = this.formFor(sp, rf); p.moves = this.startMoves(p.form, L); p.mh = 0; this.recalc(p); }
    }
    return p;
  }

  place(p, base, sp, L, x, y) {
    this.reset(p, base, L, [x, y]);
    p.sp = sp; p.form = this.d.species[sp].base; p.exp = this.expAt(sp, L);
    p.moves = this.startMoves(p.form, L); p.mh = 0;
    this.recalc(p);
    p.pts = Math.max(0, L - 5);
    this.autoUpgrade(p);
    p.x = p.hx = x; p.y = p.hy = y;
    return p;
  }

  followerPos(p, i) {
    const t = p.trail, k = Math.min(t.length - 1, (i + 1) * 3);
    return k >= 0 ? t[t.length - 1 - k] : [p.x, p.y];
  }

  followers(p, dt) {
    const last = p.trail[p.trail.length - 1];
    if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 14) { p.trail.push([p.x, p.y]); if (p.trail.length > 30) p.trail.shift(); }
    if ((p.supT = (p.supT ?? 2) - dt) > 0) return;
    p.supT = 2.5;
    p.party.forEach((m, i) => {
      if (m.fainted) return;
      const [fx, fy] = this.followerPos(p, i);
      let foe = null, fd = 320;
      for (const q of this.players.values()) {
        if (q === p || q.dead || q.prot > 0 || q.catching > 0) continue;
        const d = Math.hypot(q.x - fx, q.y - fy);
        if (d < fd) { fd = d; foe = q; }
      }
      const mv = m.moves.filter(n => this.d.moves[n].p).sort((a, b) => this.d.moves[b].p - this.d.moves[a].p)[0];
      if (!foe || !mv) return;
      const ang = Math.atan2(foe.y - fy, foe.x - fx), b = this.shoot(p, mv, this.d.moves[mv].t, ang, 0.6, 0.12, fx, fy);
      b.sup = 0.5;
    });
  }

  // Low-level native that bursts out of grass, water or a shaken tree and goes for the trainer who disturbed it.
  ambush(p, types, how, x, y) {
    if ([...this.players.values()].filter(q => q.wild).length > this.wildTarget + 20) return;
    const region = this.regionOf(p.x, p.y), L = clamp(p.lvl - 2 - (Math.random() * 4 | 0), 2, 100);
    const { base, sp } = this.lineAt(0, b => this.inGen(b, region) && this.typed(b, types), b => this.typed(b, types));
    const w = this.place(this.addPlayer('', base, { wild: true }), base, sp, L, x, y);
    w.aggro = p.id; w.aggroT = 6;
    this.fx.push({ k: 'txt', id: w.id, s: `A wild ${this.spName(w)} ${how}!` });
    return w;
  }

  dropTreat(p, x, y) {
    const r = Math.random(), k = r < 0.5 ? 'oran-berry' : r < 0.75 ? 'sitrus-berry' : r < 0.87 ? 'lum-berry' : 'rare-candy';
    this.spawnOrb(k, x, y);
    this.fx.push({ k: 'txt', id: p.id, s: 'Something dropped!' });
  }

  // Running through tall grass, surfing, or bumping trees shakes things loose: rare treats and the odd ambush.
  forage(p, dt) {
    const bump = p.bump;
    p.bump = null;
    if ((p.rustT -= dt) > 0 || Math.hypot(p.vx, p.vy) < 80) return;
    p.rustT = 0.5;
    const t = this.tile(p.x, p.y), ahead = [p.x + Math.cos(p.face) * (p.r + 45), p.y + Math.sin(p.face) * (p.r + 45)];
    const side = p.face + (Math.random() < 0.5 ? 1.2 : -1.2), beside = [p.x + Math.cos(side) * (p.r + 70), p.y + Math.sin(side) * (p.r + 70)];
    if (t === T.TALL) {
      this.fx.push({ k: 'rustle', x: Math.round(p.x), y: Math.round(p.y + p.r * 0.6) });
      if (Math.random() < 0.015) this.dropTreat(p, ...ahead);
      else if (Math.random() < 0.03) this.ambush(p, ['bug', 'grass', 'normal'], 'jumped out of the grass', ...beside);
    } else if (t === T.WATER) {
      this.fx.push({ k: 'splash', x: Math.round(p.x), y: Math.round(p.y + p.r * 0.6) });
      if (Math.random() < 0.01) this.dropTreat(p, ...ahead);
      else if (Math.random() < 0.03) this.ambush(p, ['water'], 'surfaced', ...beside);
    }
    if (bump && (p.bumpCd ?? 0) <= this.time) {
      const [tx, ty] = bump, behind = [p.x - Math.cos(p.face) * 30, p.y - Math.sin(p.face) * 30];
      p.bumpCd = this.time + 1.2;
      this.fx.push({ k: 'shake', tx, ty, x: tx * TILE + 16, y: ty * TILE + 16 });
      if (Math.random() < 0.12) this.dropTreat(p, ...behind);
      else if (Math.random() < 0.05) this.ambush(p, ['bug', 'flying', 'grass'], 'fell out of the tree', ...beside);
    }
  }

  removePlayer(id) { this.players.delete(id); }

  reset(p, sp, lvl = 5, at = null) {
    // Legends are only offered by the client once unlocked; LAN friends are trusted not to spoof that.
    const ok = p.wild || p.npc || this.starterSet.has(sp) || (!p.bot && this.legendSet.has(sp));
    if (!ok) sp = pick(this.starters);
    Object.assign(p, {
      sp, form: this.d.species[sp].base, lvl, shiny: Math.random() < 1 / 512, cd: [0, 0, 0, 0], st: [0, 0, 0, 0, 0], stT: 0,
      status: null, statusT: 0, temp: null, dead: false, deadT: 0, pending: null, stun: 0, flash: 0, dash: 0, mh: 0,
      aggro: 0, aggroT: 0, ix: 0, iy: 0, aim: 0, ad: 250, use: -1, think: 0, killer: null, killerId: 0, wander: 0,
      vx: 0, vy: 0, kx: 0, ky: 0, face: Math.PI / 2, faceT: 0, prot: p.wild ? 0 : SPAWN_PROT, shield: 0, wx: null,
      calm: 0, sbT: 0, intT: 1, ffire: false, lastHit: 0, roll: 0, dodgeCd: 0, wantDodge: false,
      iv: Array.from({ length: 6 }, () => Math.random() * 32 | 0), nat: Math.random() * 25 | 0, up: [0, 0, 0, 0, 0, 0], pts: 0,
      rf: null, item: null, balls: p.bot ? 0 : 3, party: [], swapCd: 0, streak: 0, wet: 0, chain: { id: 0, n: 0, t: 0 },
      throwCd: 0, wantThrow: false, catching: 0, place: 0, lavaT: 0, rustT: 0.5, bump: null, townT: 0, town: null,
    });
    p.exp = this.expAt(sp, lvl);
    // Mastery (from catching this line) pre-unlocks moves from later in the learnset.
    const mastery = p.bot ? 0 : clamp(p.opts?.mastery | 0, 0, 5);
    p.moves = this.startMoves(p.form, lvl + mastery * 8);
    if (!p.bot && p.opts?.shiny) p.shiny = true;
    this.recalc(p);
    p.trail = [];
    // Humans start in their partner's home region: Charmander in Kanto, Sprigatito in Paldea.
    [p.x, p.y] = at || this.freeSpot(p, undefined, this.speciesRegion(sp));
    p.hx = p.x; p.hy = p.y;
  }

  // How useful a move is for this Pokémon in real-time play: damage per second shaped by STAB, its attacking stat and quirks.
  moveScore(pk, mv) {
    const m = this.d.moves[mv];
    if (!m) return 0;
    if (m.c === 'status') {
      if (m.hl > 0) return 55;
      if (m.k === 'shield') return 40;
      if (m.k === 'weather') return pk.t.includes(WEATHER[mv]) ? 45 : 15;
      const selfBoost = m.k === 'self' && m.sc.some(([, ch]) => ch > 0);
      if (selfBoost) return 35 + 8 * m.sc.reduce((s, [, ch]) => s + Math.max(0, ch), 0);
      if (['sleep', 'paralysis'].includes(m.ail)) return 40;
      if (m.ail !== 'none' || m.k === 'zone') return 30;
      return 12;
    }
    const hits = m.mh[1] > 1 ? (m.mh[0] + m.mh[1]) / 2 * 0.75 : 1, phys = m.c === 'physical';
    const fit = Math.sqrt(pk.s[phys ? 1 : 3] / Math.max(1, pk.s[phys ? 3 : 1]));
    let s = (m.p || 50) * hits * (pk.t.includes(m.t) ? 1.5 : 1) * Math.min(1.4, Math.max(0.6, fit));
    if (m.dr < 0) s *= 0.9;
    if (m.dr > 0 || m.ail !== 'none' || m.fl) s *= 1.08;
    return s / cooldown(m.pp, m.p) ** 0.35;
  }

  // Score a whole moveset: needs real damage, rewards type coverage, allows at most one status move.
  setScore(pk, moves) {
    let total = 0, status = 0, dmg = 0;
    const seen = {};
    for (const mv of moves) {
      const m = this.d.moves[mv];
      let s = this.moveScore(pk, mv);
      if (m.c === 'status') { if (status++) s *= 0.3; } else { dmg++; s *= 0.85 ** (seen[m.t] || 0); seen[m.t] = (seen[m.t] || 0) + 1; }
      total += s;
    }
    return dmg ? total : total * 0.2;
  }

  bestSet(pk, pool) {
    const set = [];
    for (let k = 0; k < 4 && pool.length; k++) {
      let best = null, bs = -1;
      for (const mv of pool) {
        if (set.includes(mv)) continue;
        const s = this.setScore(pk, [...set, mv]);
        if (s > bs) { bs = s; best = mv; }
      }
      if (!best) break;
      set.push(best);
    }
    return set;
  }

  startMoves(form, lvl) {
    const pk = this.d.pokemon[form];
    const pool = [...new Set(pk.m.filter(([l]) => l <= lvl).map(([, m]) => m))].filter(m => this.d.moves[m]);
    const ms = this.bestSet(pk, pool);
    if (!ms.some(m => this.d.moves[m].c !== 'status')) { if (ms.length >= 4) ms.pop(); ms.unshift('tackle'); }
    return ms;
  }

  recalc(p) {
    const pk = this.d.pokemon[p.form], s = pk.s, old = p.mh, gmax = p.temp?.k === 'gmax';
    p.types = pk.t; p.base = s; p.kg = (pk.w || 100) / 10;
    p.ab = pickAbility(pk.ab); p.A = ABIL[p.ab] || {};
    p.kg *= p.A.heavy || 1;
    const upMul = i => 1 + p.up[i] * UPGRADE_STEP;
    p.mh = Math.round(calcStat(s[0], p.lvl, true, p.iv[0]) * upMul(0) * (p.npc ? 1.6 : 1)) * (gmax ? 2 : 1) * (p.boss ? 3 : 1);
    p.stat = [1, 2, 3, 4, 5].map(i => Math.round(calcStat(s[i], p.lvl, false, p.iv[i]) * natureMul(p.nat, i - 1) * upMul(i)));
    p.hp = old ? clamp(p.hp + p.mh - old, 1, p.mh) : p.mh;
    let r = bodySize(pk.h, p.lvl);
    if (gmax) r = Math.min(Math.max(r, bodySize(this.d.pokemon[this.d.species[p.sp].base].h, p.lvl) * 1.8) * 1.2, 130);
    p.r = r * (p.boss ? 1.3 : 1);
    p.swim = gmax || !!p.A.hover || p.types.includes('water') || p.types.includes('flying');
    if (p.A.weather) p.wx = { t: p.A.weather, time: Infinity };
    else if (p.wx?.time === Infinity) p.wx = null;
  }

  setInput(p, i) {
    const n = (v, lo, hi) => (Number.isFinite(v) ? clamp(v, lo, hi) : 0);
    p.ix = n(i.ix, -1, 1); p.iy = n(i.iy, -1, 1);
    const L = Math.hypot(p.ix, p.iy);
    if (L > 1) { p.ix /= L; p.iy /= L; }
    p.aim = n(i.aim, -7, 7);
    p.ad = n(i.ad, 0, 2000) || 250;
    p.use = Number.isInteger(i.use) && i.use >= 0 && i.use < 4 ? i.use : -1;
    p.wantDodge = !!i.dodge;
    p.wantThrow = !!i.throw;
  }
  upgrade(p, i) {
    if (!(p.pts > 0) || !Number.isInteger(i) || i < 0 || i > 5 || p.up[i] >= UPGRADE_MAX) return;
    p.pts--; p.up[i]++;
    this.recalc(p);
    if (i === 0) p.hp = Math.min(p.mh, p.hp + p.mh * UPGRADE_STEP);
  }
  learnMove(p, slot) {
    if (!p.pending) return;
    if (Number.isInteger(slot) && slot >= 0 && slot < p.moves.length) { p.moves[slot] = p.pending; p.cd[slot] = 0; }
    p.pending = null;
  }
  reward(p, kind) {
    if (p.dead || p.wild) return;
    if (kind === 'balls') p.balls = Math.min(BALLS_MAX, p.balls + 4);
    else if (kind === 'candy') this.spawnOrb('rare-candy', p.x + 30, p.y);
    else if (kind === 'item') this.spawnOrb(pick(HELD_NAMES), p.x - 30, p.y);
    else if (kind === 'exp') this.gain(p, this.lvlChunk(p) * 12);
    else return;
    this.fx.push({ k: 'txt', id: p.id, s: 'Quest reward!' });
  }

  respawn(p, sp, opts) {
    if (!p.dead || p.deadT <= 1.5 || (this.mode === 'br' && !this.over)) return;
    p.pref = sp; if (opts) p.opts = opts;
    this.reset(p, sp);
  }

  // Party: the active Pokémon lives on the player object; benched ones are plain snapshots of MON_KEYS.
  pack(p) {
    if (p.temp) { p.temp = null; p.form = this.formFor(p.sp, p.rf); this.recalc(p); }
    const m = {};
    for (const k of MON_KEYS) m[k] = p[k];
    m.fainted = p.hp <= 0;
    return m;
  }
  load(p, m) {
    for (const k of MON_KEYS) p[k] = m[k];
    p.temp = null; p.wet = 0; p.chain = { id: 0, n: 0, t: 0 };
    const hp = m.hp;
    p.mh = 0; this.recalc(p);
    p.hp = clamp(hp, 1, p.mh);
  }
  swapTo(p, i) {
    const m = p.party[i];
    if (p.dead || p.swapCd > 0 || !m || m.fainted || p.catching > 0) return false;
    const cur = this.pack(p);
    this.load(p, m);
    p.party[i] = cur;
    p.swapCd = 1.5;
    this.fx.push({ k: 'swap', id: p.id, s: `Go! ${this.spName(p)}!` });
    return true;
  }

  tick(dt) {
    this.time += dt;
    for (const p of this.players.values()) this.step(p, dt);
    this.stepProj(dt);
    this.stepAreas(dt);
    this.pending = this.pending.filter(c => {
      if ((c.t -= dt) > 0) return true;
      const q = this.players.get(c.q);
      if (q) this.resolveCatch(q, this.players.get(c.a), c.p);
      return false;
    });
    if (this.zone) this.stepZone(dt);
    this.stepSky(dt);
    const want = Math.min(ORBS, 1000 * Math.max(1, this.anchors().length));
    for (let i = 0; i < 40 && this.ambient < want; i++) this.spawnOrb();
    this.recycle();
    this.upkeepWild(dt);
  }

  // A few far-away ambient orbs and idle wilds are recycled each tick so population follows the players.
  recycle() {
    if (!this.orbIt) this.orbIt = this.orbs.values();
    for (let i = 0; i < 40; i++) {
      let n = this.orbIt.next();
      if (n.done) { this.orbIt = this.orbs.values(); n = this.orbIt.next(); if (n.done) break; }
      if (n.value.a && !this.nearAnchor(n.value.x, n.value.y, FAR)) this.removeOrb(n.value);
    }
    if (Math.random() < 0.2) for (const p of this.players.values()) if (p.wild && !p.boss && !p.aggro && !this.nearAnchor(p.x, p.y, FAR)) this.players.delete(p.id);
  }

  fly(p, townId) {
    const t = this.towns[townId];
    if (!t || p.dead || p.wild || this.zone || p.calm < 4 || (p.flyCd ?? 0) > this.time) return this.fx.push({ k: 'txt', id: p.id, s: p.calm < 4 ? "Can't fly mid-battle!" : 'Fly is recharging' });
    p.x = t.x; p.y = t.y + TILE * 6; p.vx = p.vy = p.kx = p.ky = 0; p.prot = 2; p.flyCd = this.time + 30; p.trail = [];
    this.fx.push({ k: 'fly', id: p.id, s: `Flew to ${t.n}!` });
  }

  // 0 = midnight, 1 = noon. A full day lasts DAY seconds.
  daylight() { return 0.5 - 0.5 * Math.cos((this.time / DAY) * Math.PI * 2 + Math.PI * 0.6); }
  isNight() { return this.daylight() < 0.3; }
  stepSky(dt) {
    this.sky.forEach((s, i) => {
      if ((s.t -= dt) > 0) return;
      const mix = REGIONS[i].mix.map(b => BIOMES[b].n), own = [];
      if (mix.includes('Snowfield')) own.push('snow');
      if (mix.includes('Desert')) own.push('sand');
      if (mix.filter(n => n === 'Islands' || n === 'Beach').length) own.push('rain');
      if (mix.includes('Volcano')) own.push('sun');
      const k = pick([...SKIES, ...own, ...own]);
      if (k !== s.k && k !== 'clear') this.fx.push({ k: 'feed', s: `${REGIONS[i].n}: ${{ rain: 'It started to rain', sun: 'The sunlight turned harsh', sand: 'A sandstorm kicked up', snow: 'It started to snow', fog: 'A thick fog rolled in' }[k]}!`, sky: 1 });
      s.k = k; s.t = 70 + Math.random() * 80;
    });
  }
  skyAt(x, y) { return this.sky[this.regionOf(x, y)].k; }

  speedMul(p) {
    const A = p.A, t = this.tile(p.x, p.y);
    let k = p.status === 'paralysis' || p.status === 'trap' ? 0.5 : 1;
    if (A.wSpeed && p.wx?.t === A.wSpeed) k *= 1.5;
    if (A.quickFeet && p.status) k *= 1.5 / (p.status === 'paralysis' ? 0.5 : 1);
    if (t === T.SWAMP && !p.A.hover && !['poison', 'water', 'flying'].some(x => p.types.includes(x))) k *= 0.65;
    if (t === T.SNOW && !p.types.includes('ice')) k *= 0.9;
    if (t === T.PAVE) k *= 1.15;
    if (t === T.ICE && !p.types.includes('ice')) k *= 1.25;
    return k * (A.speed || 1) * (this.held(p).speed || 1);
  }

  step(p, dt) {
    if (p.dead) {
      p.deadT += dt;
      if (p.wild) this.players.delete(p.id);
      else if (p.bot && p.deadT > 3 && this.mode !== 'br') this.spawnTiered(p);
      return;
    }
    if (p.npc && this.stepLeader(p, dt)) return;
    if (p.catching > 0) {
      p.vx = p.vy = 0;
      if ((p.catching -= dt) <= 0) this.resolveCatch(p);
      return;
    }
    const A = p.A, I = this.held(p);
    for (let i = 0; i < 4; i++) p.cd[i] -= dt;
    p.stun -= dt; p.flash -= dt; p.dash -= dt; p.aggroT -= dt; p.wander -= dt; p.prot -= dt; p.shield -= dt; p.faceT -= dt;
    p.calm += dt; p.roll -= dt; p.dodgeCd -= dt; p.swapCd -= dt; p.throwCd -= dt; p.wet -= dt;
    if ((p.stT += dt) > 8) { p.stT = 0; p.st = p.st.map(s => s - Math.sign(s)); }
    if (p.wx && (p.wx.time -= dt) <= 0) p.wx = null;
    if (A.speedBoost && (p.sbT += dt) > 6 && p.st[4] < 3) { p.sbT = 0; this.stage(p, 4, 1); }
    if (A.regen && p.calm > 3) p.hp = Math.min(p.mh, p.hp + p.mh * A.regen * dt);
    if (I.regen) p.hp = Math.min(p.mh, p.hp + p.mh * I.regen * dt);
    for (const m of p.party) {
      m.hp = Math.min(m.mh, m.hp + m.mh * 0.01 * dt);
      if (m.fainted && m.hp >= m.mh * 0.5) m.fainted = false;
    }
    if (A.intimidate && (p.intT -= dt) <= 0) {
      p.intT = 12;
      let any = false;
      for (const q of this.players.values()) {
        if (q !== p && !q.dead && !q.wild && Math.hypot(q.x - p.x, q.y - p.y) < 260) { this.stage(q, 0, -1, true); any = true; }
      }
      if (any) this.fx.push({ k: 'txt', id: p.id, s: 'Intimidate!' });
    }
    if (p.status) {
      if ((p.statusT -= dt) <= 0) p.status = null;
      else if (DOT[p.status] && !A.magicGuard) {
        if (A.poisonHeal && p.status === 'poison') p.hp = Math.min(p.mh, p.hp + p.mh / 10 * dt);
        else this.damage(p, p.mh * DOT[p.status] * dt, p.statusBy);
      }
      if (p.dead) return;
    }
    if (this.tile(p.x, p.y) === T.LAVA && !this.lavaSafe(p)) {
      this.damage(p, p.mh * 0.06 * dt, 0);
      if (Math.random() < dt * 0.3) this.applyStatus(p, 'burn', null);
      if ((p.lavaT -= dt) <= 0) { p.lavaT = 1; this.fx.push({ k: 'txt', id: p.id, s: 'Hot!' }); }
      if (p.dead) return;
    }
    if (p.temp && (p.temp.t -= dt) <= 0) { p.temp = null; p.form = this.formFor(p.sp, p.rf); this.recalc(p); }
    if (p.bot) this.think(p, dt);

    const busy = p.stun > 0 || p.status === 'sleep' || p.status === 'freeze';
    let ix = p.ix, iy = p.iy;
    if (p.status === 'confusion') { ix = -ix; iy = -iy; }
    let spd = (100 + p.base[5] * 0.55) * (1 + p.up[5] * 0.03) * natureMul(p.nat, 4) * stageMul(p.st[4]) * this.speedMul(p);
    if (p.wild && !p.aggro) spd *= 0.4;
    if (busy) spd = 0;
    // Velocity eases toward the input direction so analog input gives smooth 360° turns.
    // Heavy bodies take longer to get going and to turn; light ones are twitchy.
    // Ice is slippery: anyone but an Ice type keeps sliding and turns slowly.
    const slip = this.tile(p.x, p.y) === T.ICE && !p.types.includes('ice') ? 0.12 : 1;
    const acc = Math.min(1, dt * 12 * slip * clamp(Math.sqrt(30 / p.kg), 0.35, 1.3)), decay = Math.max(0, 1 - dt * 7);
    if (p.wantDodge && p.dodgeCd <= 0 && !busy) this.dodge(p, ix, iy);
    p.vx += (ix * spd - p.vx) * acc; p.vy += (iy * spd - p.vy) * acc;
    let mx = p.vx + p.kx, my = p.vy + p.ky;
    if (p.dash > 0) { const ds = p.roll > 0 ? p.rollSpd : 420; mx = p.dx * ds + p.kx; my = p.dy * ds + p.ky; }
    p.kx *= decay; p.ky *= decay;
    this.moveBy(p, mx * dt, my * dt);
    if (p.faceT > 0) p.face = p.aim;
    else if (Math.hypot(p.vx, p.vy) > 25) p.face = Math.atan2(p.vy, p.vx);
    if (!busy && p.use >= 0) { this.useMove(p, p.use); if (p.bot) p.use = -1; }
    if (!busy && p.wantThrow && p.throwCd <= 0 && p.balls > 0) this.throwBall(p);
    if (!p.bot) this.forage(p, dt);
    if (p.party.length) this.followers(p, dt);
    if (!p.wild && (p.townT -= dt) <= 0) { p.townT = 0.5; p.town = this.nearTown(p.x, p.y)?.n || null; }
    // Pokémon Centers: standing in town slowly heals the whole party (not in Battle Royale).
    if (p.town && !this.zone) { p.hp = Math.min(p.mh, p.hp + p.mh * 0.04 * dt); for (const m of p.party) m.hp = Math.min(m.mh, m.hp + m.mh * 0.04 * dt); }

    if (p.wild) return;
    for (const o of [...this.orbsNear(p.x, p.y, p.r + 10)]) {
      const dx = o.x - p.x, dy = o.y - p.y, rr = p.r + 10;
      if (dx * dx + dy * dy < rr * rr) this.pickup(p, o);
      if (p.dead) return;
    }
  }

  moveBy(p, mx, my) {
    const stuck = this.solid(p, p.x, p.y), e = Math.min(p.r * 0.5, 20);
    const nx = p.x + mx + Math.sign(mx) * e, ny = p.y + my + Math.sign(my) * e;
    if (stuck || !this.solid(p, nx, p.y)) p.x = clamp(p.x + mx, TILE * 3, WORLD - TILE * 3);
    else if (mx && TREES.has(this.tile(nx, p.y))) p.bump = [nx / TILE | 0, p.y / TILE | 0];
    if (stuck || !this.solid(p, p.x, ny)) p.y = clamp(p.y + my, TILE * 3, WORLD - TILE * 3);
    else if (my && TREES.has(this.tile(p.x, ny))) p.bump = [p.x / TILE | 0, ny / TILE | 0];
  }

  // Dodge roll: brief invulnerability. Light, small, fast Pokémon roll farther and recharge sooner.
  dodge(p, ix, iy) {
    const L = Math.hypot(ix, iy), a = L > 0.1 ? Math.atan2(iy, ix) : p.face;
    p.dx = Math.cos(a); p.dy = Math.sin(a); p.dash = 0.22; p.roll = 0.3; p.prot = 0;
    p.rollSpd = 380 + p.base[5] * 1.4;
    p.dodgeCd = clamp(1 + Math.sqrt(p.kg) / 8 + p.r / 60, 1.2, 4.5);
    this.fx.push({ k: 'roll', id: p.id, a: +a.toFixed(2) });
  }

  // Passive evasion vs aimed attacks: tiny bodies slip through, big ones never do.
  sizeEvade(q) { return clamp((24 - q.r) / 60, 0, 0.15); }

  pressured(p) {
    for (const q of this.players.values()) if (q !== p && !q.dead && q.A.pressure && Math.hypot(q.x - p.x, q.y - p.y) < 260) return true;
    return false;
  }

  // Snap a human's aim onto the closest target inside a narrow cone, so near-misses still connect.
  assist(p, kind, wildOnly = false) {
    const range = { melee: p.r + 110, beam: 430, proj: 500, multi: 460, ball: 480 }[kind];
    if (!range) return;
    let best = null, bs = 0.6;
    for (const q of this.players.values()) {
      if (q === p || q.dead || (wildOnly && !q.wild)) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d > range + q.r) continue;
      const da = angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.aim) - Math.atan2(q.r, d) * 0.5;
      if (da < bs) { bs = da; best = q; }
    }
    if (best) p.aim = Math.atan2(best.y - p.y, best.x - p.x);
  }

  moveType(a, m) { return m.t === 'normal' && a.A.ate ? a.A.ate : m.t; }

  useMove(p, slot) {
    const name = p.moves[slot], m = this.d.moves[name];
    if (!m || p.cd[slot] > 0) return;
    let cd = cooldown(m.pp, m.p) * (p.boss ? 1.5 : 1) * (p.A.truant ? 1.5 : 1) * (this.held(p).cd || 1);
    if (m.c === 'status' && p.A.prankster) cd *= 0.5;
    if (this.pressured(p)) cd *= 1.25;
    p.cd[slot] = cd; p.prot = 0; p.faceT = 0.35;
    if (p.status === 'paralysis' && Math.random() < 0.25) return this.fx.push({ k: 'txt', id: p.id, s: 'Paralyzed!' });
    const kind = m.k;
    if (!p.bot) this.assist(p, kind);
    p.face = p.aim;
    const ax = Math.cos(p.aim), ay = Math.sin(p.aim), type = this.moveType(p, m);
    const f = { k: kind, mv: name, t: type, id: p.id, x: Math.round(p.x), y: Math.round(p.y), a: +p.aim.toFixed(2), r: Math.round(p.r) };
    const hitIn = (cx, cy, rad, o) => {
      for (const q of this.players.values()) if (q !== p && !q.dead && Math.hypot(q.x - cx, q.y - cy) < rad + q.r) this.hit(p, q, m, o);
    };
    const target = () => { const d = clamp(p.ad, 60, KIND[kind].range); return [p.x + ax * d, p.y + ay * d]; };
    if (kind === 'self') {
      this.effects(p, p, m);
      if (m.hl > 0) p.hp = Math.min(p.mh, p.hp + p.mh * m.hl / 100);
    } else if (kind === 'shield') {
      p.shield = 1.2;
    } else if (kind === 'weather') {
      p.wx = { t: WEATHER[name], time: 20 };
      f.s = { water: 'Rain', fire: 'Harsh sun', rock: 'Sandstorm', ice: 'Snow' }[WEATHER[name]] || 'Terrain';
    } else if (kind === 'melee') {
      p.dash = 0.12; p.dx = ax; p.dy = ay;
      const cx = p.x + ax * (p.r + 40), cy = p.y + ay * (p.r + 40), rad = 45 + p.r * 0.6;
      Object.assign(f, { x: Math.round(cx), y: Math.round(cy), r: Math.round(rad), st: m.st });
      hitIn(cx, cy, rad, { contact: 1 });
    } else if (kind === 'aoe' || kind === 'quake') {
      f.r = Math.round(130 + p.r * 1.5);
      hitIn(p.x, p.y, f.r);
    } else if (kind === 'beam') {
      const len = 400 + p.r, w = (12 + p.r * 0.3 + (m.p || 40) / 12) * (p.A.bigShot ? 1.3 : 1);
      let L = len;
      for (let s = p.r; s < len; s += 12) if (SOLID.has(this.tile(p.x + ax * s, p.y + ay * s))) { L = s; break; }
      for (const q of this.players.values()) {
        if (q === p || q.dead) continue;
        const dx = q.x - p.x, dy = q.y - p.y, along = dx * ax + dy * ay;
        if (along > 0 && along < L + q.r && Math.abs(dx * ay - dy * ax) < w + q.r) this.hit(p, q, m);
      }
      Object.assign(f, { l: Math.round(L), w: Math.round(w) });
    } else if (kind === 'strike') {
      const [x, y] = target(), r = 70 + (m.p || 60) / 4;
      this.strikes.push({ x, y, r, t: 0.5, o: p.id, mv: name });
      Object.assign(f, { x: Math.round(x), y: Math.round(y), r: Math.round(r) });
    } else if (kind === 'zone') {
      const [x, y] = target();
      this.zones.push({ id: this.pid++, x: Math.round(x), y: Math.round(y), r: 90, t: 5, tick: 0, o: p.id, mv: name, ty: type });
      Object.assign(f, { x: Math.round(x), y: Math.round(y), r: 90 });
    } else if (kind === 'multi') {
      const [lo, hi] = m.mh, n = Math.min(5, p.A.skillLink ? hi : lo + (Math.random() * (hi - lo + 1) | 0));
      for (let i = 0; i < n; i++) this.shoot(p, name, type, p.aim + (i - (n - 1) / 2) * 0.13, 0.75, 0.15);
    } else {
      this.shoot(p, name, type, p.aim, 1, 0.35);
    }
    this.fx.push(f);
  }

  shoot(p, name, type, ang, scale, cap, ox, oy) {
    const m = this.d.moves[name], pw = Math.min(m.p || 40, 150), spd = 560 - pw * 1.3, big = p.A.bigShot ? 1.3 : 1;
    const from = ox === undefined ? p.r : 10;
    const b = {
      id: this.pid++, o: p.id, mv: name, t: type, cap, ttl: 1.1 * big,
      x: (ox ?? p.x) + Math.cos(ang) * from, y: (oy ?? p.y) + Math.sin(ang) * from, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      r: (7 + pw / 12 + p.r * 0.12) * scale * big,
    };
    this.proj.push(b);
    return b;
  }

  throwBall(p) {
    p.balls--; p.throwCd = 1; p.prot = 0; p.faceT = 0.35;
    if (!p.bot) this.assist(p, 'ball', true);
    const ax = Math.cos(p.aim), ay = Math.sin(p.aim);
    this.proj.push({ id: this.pid++, o: p.id, ball: 1, mv: 'poke-ball', t: 'normal', ttl: 1, r: 9, x: p.x + ax * p.r, y: p.y + ay * p.r, vx: ax * 520, vy: ay * 520 });
    this.fx.push({ k: 'throw', id: p.id, a: +p.aim.toFixed(2) });
  }

  catchChance(a, q) {
    const status = q.status === 'sleep' || q.status === 'freeze' ? 1.6 : q.status ? 1.3 : 1;
    return clamp((1 - 0.85 * q.hp / q.mh) * status * Math.min(1, (a.lvl + 3) / q.lvl) * (q.boss ? 0.15 : 1) * (q.wild ? 1 : 0.6), 0.03, 0.95);
  }

  resolveCatch(q, a = this.players.get(q.catchBy), p = q.catchP) {
    const trainer = !q.wild;
    if (!a || a.dead || q.dead || Math.random() >= p) {
      if (!trainer) { q.stun = 0; q.aggro = q.catchBy; q.aggroT = 12; }
      return this.fx.push({ k: 'txt', id: q.id, s: trainer ? 'Dodged the ball!' : 'It broke free!' }, { k: 'free', id: q.id, x: Math.round(q.x), y: Math.round(q.y) });
    }
    if (!trainer) this.players.delete(q.id);
    const mh = Math.round(q.mh / (q.boss ? 3 : 1) / (q.temp?.k === 'gmax' ? 2 : 1));
    const mon = {
      rf: q.rf, sp: q.sp, form: this.formFor(q.sp, q.rf), lvl: q.lvl, exp: this.expAt(q.sp, q.lvl), hp: mh, mh, moves: [...q.moves], cd: [0, 0, 0, 0],
      iv: [...q.iv], nat: q.nat, up: [...q.up], pts: 0, status: null, statusT: 0, st: [0, 0, 0, 0, 0], shiny: q.shiny, item: null, pending: null, fainted: false,
    };
    const room = a.party.length < PARTY_MAX;
    if (room) a.party.push(mon);
    const whose = trainer ? `a copy of ${q.name}'s ${this.spName(q)}` : this.spName(q);
    this.fx.push({ k: 'catch', id: a.id, sp: q.sp, boss: q.boss ? 1 : 0, x: Math.round(q.x), y: Math.round(q.y),
      s: `Gotcha! ${whose} was caught!${room ? '' : ' Party full, sent to the PC.'}` });
    if (trainer) this.fx.push({ k: 'feed', s: `${a.name} caught a copy of ${q.name}'s ${this.spName(q)}!` });
  }

  stepProj(dt) {
    // Accuracy stat is ignored: aiming the projectile is the accuracy check.
    this.proj = this.proj.filter(b => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if ((b.ttl -= dt) <= 0 || SOLID.has(this.tile(b.x, b.y))) return false;
      for (const q of this.players.values()) {
        if (q.id === b.o || q.dead || q.catching > 0 || (b.ball && q.npc)) continue;
        const rr = q.r + b.r;
        if ((q.x - b.x) ** 2 + (q.y - b.y) ** 2 >= rr * rr) continue;
        const a = this.players.get(b.o);
        if (b.ball) {
          if (!a || a.dead) return false;
          if (q.hp < q.mh * 0.05) { this.fx.push({ k: 'txt', id: q.id, s: 'Too weak to catch!' }); return false; }
          const chance = this.catchChance(a, q);
          if (q.wild) { q.catching = 0.5; q.catchBy = a.id; q.catchP = chance; q.stun = 0.5; }
          else this.pending.push({ t: 0.3, a: a.id, q: q.id, p: chance });
          this.fx.push({ k: 'ball', id: q.id, x: Math.round(q.x), y: Math.round(q.y), tr: q.wild ? 0 : 1 });
          return false;
        }
        if (a && !a.dead) this.hit(a, q, this.d.moves[b.mv], { cap: b.cap, pw: b.sup ? (this.d.moves[b.mv].p || 50) * b.sup : 0 });
        this.fx.push({ k: 'pop', x: Math.round(b.x), y: Math.round(b.y), t: b.t, mv: b.mv });
        return false;
      }
      return true;
    });
  }

  stepAreas(dt) {
    this.strikes = this.strikes.filter(s => {
      if ((s.t -= dt) > 0) return true;
      const a = this.players.get(s.o), m = this.d.moves[s.mv];
      if (a && !a.dead) {
        for (const q of this.players.values()) if (q !== a && !q.dead && Math.hypot(q.x - s.x, q.y - s.y) < s.r + q.r) this.hit(a, q, m);
      }
      this.fx.push({ k: 'boom', x: Math.round(s.x), y: Math.round(s.y), r: Math.round(s.r), t: m.t, mv: s.mv });
      return false;
    });
    this.zones = this.zones.filter(z => {
      z.t -= dt;
      if ((z.tick -= dt) <= 0) {
        z.tick = 0.5;
        const a = this.players.get(z.o), m = this.d.moves[z.mv];
        if (a && !a.dead) {
          for (const q of this.players.values()) {
            if (q === a || q.dead || Math.hypot(q.x - z.x, q.y - z.y) > z.r + q.r * 0.5) continue;
            this.hit(a, q, m, { pw: m.p ? m.p * 0.35 : 20, cap: 0.08, zone: 1 });
            if (z.mv === 'toxic-spikes' || z.mv === 'toxic-debris') this.applyStatus(q, 'poison', a);
            if (z.mv === 'sticky-web' && q.st[4] > -2) this.stage(q, 4, -1, true);
          }
        }
      }
      return z.t > 0;
    });
  }

  // Battle Royale: the safe circle waits, then shrinks toward a random smaller circle inside it; outside hurts more each phase.
  initZone() {
    const [x, y] = this.world.regionCenter(Math.random() * REGIONS.length | 0);
    this.zone = { x, y, r: 4200, ph: 0, wait: 40, shrink: 0 };
    this.nextZone();
  }
  nextZone() {
    const z = this.zone, tr = Math.max(160, z.r * 0.6), a = Math.random() * Math.PI * 2, d = Math.random() * (z.r - tr);
    z.tx = clamp(z.x + Math.cos(a) * d, tr, WORLD - tr); z.ty = clamp(z.y + Math.sin(a) * d, tr, WORLD - tr); z.tr = tr;
  }
  stepZone(dt) {
    const z = this.zone;
    if (this.over > 0) { if ((this.over -= dt) <= 0) this.newRound(); return; }
    if (z.shrink > 0) {
      const k = Math.min(1, dt / z.shrink);
      z.x += (z.tx - z.x) * k; z.y += (z.ty - z.y) * k; z.r += (z.tr - z.r) * k;
      if ((z.shrink -= dt) <= 0) { z.ph++; z.wait = 30; if (z.r > 161) this.nextZone(); }
    } else if ((z.wait -= dt) <= 0 && z.r > 161) {
      z.shrink = 18;
      this.fx.push({ k: 'feed', s: 'The zone is closing in!' });
    }
    const hurt = 0.02 + 0.015 * z.ph;
    for (const p of this.players.values()) if (!p.dead && Math.hypot(p.x - z.x, p.y - z.y) > z.r) this.damage(p, p.mh * hurt * dt, 0);
    const all = this.trainers(), alive = all.filter(p => !p.dead);
    if (all.length >= 2 && alive.length <= 1) {
      this.over = 8;
      const w = alive[0];
      if (w) w.place = 1;
      this.fx.push({ k: 'win', id: w?.id ?? 0, s: w ? `${w.name} wins the Battle Royale!` : 'Nobody survived!' });
    }
  }
  newRound() {
    this.round++; this.over = 0;
    for (const p of [...this.players.values()]) if (p.wild) this.players.delete(p.id);
    this.proj = []; this.zones = []; this.strikes = [];
    this.initZone();
    const ts = this.trainers();
    for (const p of ts) if (!p.bot) this.reset(p, p.pref);
    for (const p of ts) if (p.bot) this.spawnTiered(p);
    this.fx.push({ k: 'feed', s: `Round ${this.round} begins!` });
  }

  atkMul(a, phys) {
    const A = a.A, I = this.held(a);
    if (!phys) return (A.spa || 1) * (I.spa || 1) * (A.solar && a.wx?.t === 'fire' ? 1.5 : 1);
    return (A.atk || 1) * (I.atk || 1) * (A.guts && a.status ? 1.5 : 1);
  }

  defMul(q, phys) {
    const A = q.A, I = this.held(q), evio = I.evio && this.d.species[q.sp].evo?.length ? 1.5 : 1;
    return (A.def || 1) * evio * (phys ? (A.furCoat ? 2 : 1) * (A.marvel && q.status ? 1.5 : 1) : (A.iceScales ? 2 : 1) * (I.spd || 1));
  }

  powMul(a, m, type, o, eff) {
    const A = a.A, I = this.held(a), pw = o.pw || m.p || 50, low = a.hp / a.mh;
    let k = (A.power || 1) * (I.power || 1) * (a.wx?.t === type ? 1.5 : 1);
    if (BIOMES[this.biomeAt(a.x, a.y)].types.includes(type)) k *= 1.3;
    k *= SKY_BOOST[this.skyAt(a.x, a.y)]?.[type] || 1;
    if ((type === 'ghost' || type === 'dark') && this.isNight()) k *= 1.2;
    if (I.expert && eff > 1) k *= I.expert;
    if (A.pinch === type && low < 1 / 3) k *= 1.5;
    if (A.pinchAll && low < 0.5) k *= 1.3;
    if (A.defeatist && low < 0.5) k *= 0.6;
    if (A.boost?.[0] === type) k *= A.boost[1];
    if (A.technician && pw <= 60) k *= 1.5;
    if (A.sheerForce && (m.ail !== 'none' || m.sc.length || m.fl)) k *= 1.3;
    if (A.ironFist && m.st === 'punch' && m.k === 'melee') k *= 1.2;
    if (A.strongJaw && m.st === 'bite' && m.k === 'melee') k *= 1.5;
    if (A.sharpness && m.st === 'claw' && m.k === 'melee') k *= 1.5;
    if (A.toughClaws && o.contact) k *= 1.3;
    if (o.contact && o.q) k *= clamp((a.kg / o.q.kg) ** 0.08, 0.85, 1.25);
    if (A.megaLauncher && m.k === 'beam') k *= 1.5;
    if (A.reckless && m.dr < 0) k *= 1.2;
    if (A.ate && m.t === 'normal') k *= 1.2;
    if (A.tintedLens && eff < 1) k *= 2;
    if (a.ffire && type === 'fire') k *= 1.5;
    return k;
  }

  takeMul(q, a, type, eff, o) {
    const A = a.A.moldBreaker ? {} : q.A;
    let k = 1;
    if (A.resist?.includes(type)) k *= 0.5;
    if (A.multiscale && q.hp >= q.mh) k *= 0.5;
    if (A.filter && eff > 1) k *= 0.75;
    if (A.fluffy) k *= (o.contact ? 0.5 : 1) * (type === 'fire' ? 2 : 1);
    if (q.ab === 'dry-skin' && type === 'fire') k *= 1.25;
    return k;
  }

  // Combos reward setting up: soak then shock, exploit a disabled target, keep hitting the same foe.
  combo(a, q, type) {
    let k = 1, s = null;
    if (q.wet > 0 && type === 'electric') { k *= 1.5; s = 'Conducted!'; q.wet = 0; }
    else if (q.wet > 0 && type === 'fire') { k *= 0.7; s = 'Steam!'; q.wet = 0; }
    else if (q.status === 'leech-seed' && type === 'fire') { k *= 1.5; s = 'Ignite!'; }
    else if (q.status === 'sleep' || q.status === 'freeze' || q.status === 'paralysis') { k *= 1.25; s = 'Exploit!'; }
    const c = a.chain;
    if (c.id === q.id && this.time - c.t < 1.5) c.n++; else { c.id = q.id; c.n = 1; }
    c.t = this.time;
    k *= 1 + 0.05 * Math.min(c.n - 1, 5);
    if (s) this.fx.push({ k: 'txt', id: q.id, s });
    return k;
  }

  hit(a, q, m, o = {}) {
    if (q.dead || q.catching > 0) return;
    if (q.prot > 0) return;
    if (q.roll > 0) return this.fx.push({ k: 'txt', id: q.id, s: 'Dodged!' });
    if (q.shield > 0 && !a.A.infiltrator) return this.fx.push({ k: 'txt', id: q.id, s: 'Protected!' });
    if (q.wild) { q.aggro = a.id; q.aggroT = 12; }
    q.lastHit = a.id; q.calm = 0;
    const type = this.moveType(a, m), qA = a.A.moldBreaker ? {} : q.A, I = this.held(a);
    if (qA.immune?.includes(type)) return this.absorb(q, type);
    const aimed = !o.zone && m.k !== 'aoe' && m.k !== 'quake';
    if (Math.random() < (qA.dodge || 0) + (aimed ? this.sizeEvade(q) : 0)) return this.fx.push({ k: 'txt', id: q.id, s: 'Missed!' });
    if (m.c !== 'status' || o.pw) {
      const phys = m.c === 'physical', wasWet = q.wet > 0;
      let atk = a.stat[phys ? 0 : 2] * stageMul(a.st[phys ? 0 : 2]) * this.atkMul(a, phys);
      const def = q.stat[phys ? 1 : 3] * stageMul(q.st[phys ? 1 : 3]) * this.defMul(q, phys);
      if (phys && a.status === 'burn' && !a.A.guts) atk /= 2;
      let eff = typeMul(this.d.types, type, q.types);
      if (eff === 0 && a.A.scrappy && (type === 'normal' || type === 'fighting')) eff = 1;
      if (qA.wonderGuard && eff <= 1) return this.fx.push({ k: 'dmg', id: q.id, x: Math.round(q.x), y: Math.round(q.y - q.r), v: 0, e: 0 });
      const crit = !qA.noCrit && Math.random() < CRIT[Math.min(3, m.cr + (a.A.superLuck ? 1 : 0) + (I.crit || 0))];
      const stab = a.types.includes(type) || a.A.protean ? (a.A.adaptability ? 2 : 1.5) : 1;
      const mul = stab * eff * (crit ? (a.A.sniper ? 2.25 : 1.5) : 1) * (0.85 + Math.random() * 0.15) * (a.temp?.k === 'gmax' ? 1.3 : 1)
        * this.powMul(a, m, type, { ...o, q }, eff) * this.takeMul(q, a, type, eff, o) * this.combo(a, q, type);
      // Per-hit cap keeps big level gaps from one-shotting: every fight lasts at least three hits.
      let dmg = eff === 0 ? 0 : Math.min(calcDamage(a.lvl, o.pw || m.p || 50, atk, def, mul), Math.ceil(q.mh * (o.cap || 0.35)));
      if (dmg >= q.hp && q.hp >= q.mh) {
        if (qA.sturdy) { dmg = q.hp - 1; this.fx.push({ k: 'txt', id: q.id, s: `${this.abName(q)}!` }); }
        else if (q.item === 'focus-sash') { dmg = q.hp - 1; q.item = null; this.fx.push({ k: 'txt', id: q.id, s: 'Focus Sash!' }); }
      }
      this.fx.push({ k: 'dmg', id: q.id, by: a.id, x: Math.round(q.x), y: Math.round(q.y - q.r), v: dmg, e: eff, c: crit ? 1 : 0, cb: a.chain.n });
      q.flash = 0.15;
      if (!o.zone && !q.A.anchor && dmg > 0) {
        const ang = Math.atan2(q.y - a.y, q.x - a.x), kb = (120 + (o.pw || m.p || 40) * 2) * clamp(4 / Math.sqrt(q.kg), 0.15, 1.5) * (phys ? 1.3 : 1);
        q.kx += Math.cos(ang) * kb; q.ky += Math.sin(ang) * kb;
      }
      if (type === 'water' && dmg > 0) q.wet = 4;
      if (q.boss && !a.wild) (q.raid ??= {})[a.id] = (q.raid[a.id] || 0) + dmg;
      this.damage(q, dmg, a.id);
      if (wasWet && type === 'ice' && !q.dead && Math.random() < 0.35 && this.applyStatus(q, 'freeze', a)) this.fx.push({ k: 'txt', id: q.id, s: 'Frozen solid!' });
      if (m.dr > 0) a.hp = Math.min(a.mh, a.hp + dmg * m.dr / 100);
      if (I.bell) a.hp = Math.min(a.mh, a.hp + dmg * I.bell);
      if (m.dr < 0 && !a.A.rockHead && !a.A.magicGuard) this.damage(a, -dmg * m.dr / 100, q.id);
      if (I.recoil && !a.A.magicGuard && dmg > 0) this.damage(a, dmg * I.recoil, q.id);
      if (o.contact && !q.dead) this.contact(a, q);
      if (!q.dead && dmg > 0) this.reactHit(q, type, phys);
      if (a.A.stench && Math.random() < 0.1 && !q.A.noFlinch) q.stun = Math.max(q.stun, 0.4);
    }
    if (!q.dead && !a.dead && !o.zone) {
      if (m.c === 'status' && q.A.magicBounce && q !== a) { this.fx.push({ k: 'txt', id: q.id, s: 'Magic Bounce!' }); this.effects(q, a, m); }
      else this.effects(a, q, m);
    }
  }

  absorb(q, type) {
    const how = q.A.absorb;
    if (how === 'heal') q.hp = Math.min(q.mh, q.hp + q.mh / 4);
    else if (how === 'fire') q.ffire = true;
    else if (ABSORB_STAT[how]) this.stage(q, ...ABSORB_STAT[how]);
    this.fx.push({ k: 'txt', id: q.id, s: `${this.abName(q)}!` });
  }

  contact(a, q) {
    const A = q.A, I = this.held(q);
    if (A.contact && Math.random() * 100 < A.contact[1]) {
      const ail = A.contact[0] === 'spore' ? pick(['sleep', 'paralysis', 'poison']) : A.contact[0];
      if (this.applyStatus(a, ail, q)) this.fx.push({ k: 'txt', id: q.id, s: `${this.abName(q)}!` });
    }
    if (A.spiky && !a.A.magicGuard) this.damage(a, a.mh / 8, q.id);
    if (I.helmet && !a.A.magicGuard) this.damage(a, a.mh * I.helmet, q.id);
    if (A.gooey) this.stage(a, 4, -1, true);
    if (a.A.poisonTouch && Math.random() < 0.3) this.applyStatus(q, 'poison', a);
  }

  reactHit(q, type, phys) {
    const A = q.A;
    if (A.justified && type === 'dark') this.stage(q, 0, 1);
    if (A.rattled && ['bug', 'ghost', 'dark'].includes(type)) this.stage(q, 4, 1);
    if (A.stamina && q.st[1] < 4) this.stage(q, 1, 1);
    if (A.weakArmor && phys) { this.stage(q, 1, -1); this.stage(q, 4, 2); }
  }

  stage(p, i, ch, byOther = false) {
    if (byOther && ch < 0 && p.A.clearBody) return;
    if (p.A.simple) ch *= 2;
    if (p.A.contrary) ch = -ch;
    p.st[i] = clamp(p.st[i] + ch, -6, 6); p.stT = 0;
    this.fx.push({ k: 'stat', id: p.id, up: ch > 0 ? 1 : 0 });
    if (byOther && ch < 0 && !p.A.contrary) {
      if (p.A.defiant) this.stage(p, 0, 2);
      if (p.A.competitive) this.stage(p, 2, 2);
    }
  }

  applyStatus(q, ail, by) {
    if (q.status || !AILMENT_TIME[ail] || q.A.noStatus?.includes(ail)) return false;
    q.status = ail; q.statusT = AILMENT_TIME[ail] * (q.A.shortStatus ? 0.5 : 1); q.statusBy = by?.id;
    if (q.A.synchronize && by && by !== q && ['burn', 'poison', 'paralysis'].includes(ail)) this.applyStatus(by, ail, q);
    return true;
  }

  effects(a, q, m) {
    const serene = a.A.serene ? 2 : 1, guarded = m.c !== 'status' && q.A.shieldDust;
    const roll = c => Math.random() * 100 < c * serene;
    if (m.sc.length && roll(m.sp || 100)) {
      // PokeAPI doesn't say who a damaging move's drop hits; guaranteed drops on 100+ power (Close Combat, Overheat) hit the user.
      const selfDrop = (m.sp || 100) >= 100 && (m.p || 0) >= 100;
      for (const [stat, ch] of m.sc) {
        const i = STAT_KEY[stat];
        if (i === undefined) continue;
        const tgt = m.c === 'status' ? q : ch > 0 || selfDrop ? a : q;
        if (tgt !== a && guarded) continue;
        this.stage(tgt, i, ch, tgt !== a);
      }
    }
    if (q !== a && !guarded && m.ail !== 'none' && roll(m.ac || (m.c === 'status' ? 100 : 0))) this.applyStatus(q, m.ail, a);
    if (q !== a && !guarded && m.fl && !q.A.noFlinch && roll(m.fl)) q.stun = Math.max(q.stun, 0.4);
  }

  damage(p, amt, byId) {
    if (p.dead) return;
    p.hp -= amt;
    if (p.hp <= 0) this.ko(p, this.players.get(byId));
  }

  raidReward(boss) {
    const crew = Object.entries(boss.raid).filter(([, d]) => d >= boss.mh * 0.05).map(([id]) => this.players.get(+id)).filter(q => q && !q.dead);
    for (const q of crew) {
      this.gain(q, boss.exp * 0.4 / crew.length);
      this.spawnOrb('rare-candy', q.x + 40, q.y);
      this.spawnOrb(pick(HELD_NAMES), q.x - 40, q.y);
      this.fx.push({ k: 'raid', id: q.id, sp: boss.sp });
    }
    if (crew.length) this.fx.push({ k: 'feed', s: `Raid cleared! ${crew.map(q => q.name).join(', ')} defeated ${this.spName(boss)}!`, boss: 1 });
  }

  dropExp(p, frac) {
    const total = p.exp * frac * (p.shiny ? 2 : 1) * (1 + 0.15 * Math.min(p.streak, 10));
    const n = clamp(Math.round(Math.sqrt(total) / 6), 4, 40);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * (p.r * 2 + 30);
      this.spawnOrb('x', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, total / n);
    }
  }

  ko(p, k) {
    const killer = k && k !== p ? k : null;
    if (killer) {
      killer.kills++;
      if (!killer.wild) {
        killer.streak++;
        if (STREAK_TITLES[killer.streak]) this.fx.push({ k: 'feed', s: `${killer.name} is ${STREAK_TITLES[killer.streak]}! (${killer.streak} KOs)`, streak: killer.streak });
      }
      if (!killer.dead) {
        if (killer.A.moxie) this.stage(killer, 0, 1);
        if (killer.A.moxieSpa) this.stage(killer, 2, 1);
        if (killer.A.beastBoost) { const i = killer.stat.indexOf(Math.max(...killer.stat)); this.stage(killer, i, 1); }
        if (p.A.aftermath && !killer.A.magicGuard && Math.hypot(killer.x - p.x, killer.y - p.y) < p.r + killer.r + 60) this.damage(killer, killer.mh / 4, p.id);
      }
    }
    if (p.boss && p.raid) this.raidReward(p);
    this.fx.push({ k: 'ko', id: p.id, x: Math.round(p.x), y: Math.round(p.y), by: killer?.id ?? 0, sp: p.sp, b: p.boss ? 1 : 0, w: p.wild ? 1 : 0 });
    const label = this.label(p);
    const next = p.wild ? -1 : p.party.findIndex(m => !m.fainted);
    if (next < 0 && p.npc) return this.leaderDefeated(p);
    if (next >= 0) {
      // A healthy teammate steps in: the fainted one goes to the bench and the trainer stays in the fight.
      this.dropExp(p, 0.3);
      p.streak = 0;
      const cur = this.pack(p);
      cur.hp = 0; cur.fainted = true;
      this.load(p, p.party[next]);
      p.party[next] = cur;
      p.prot = 1.5; p.swapCd = 1.5; p.status = null;
      this.fx.push({ k: 'feed', s: killer ? `${this.label(killer)} KO'd ${label}` : `${label} fainted` }, { k: 'swap', id: p.id, s: `Go! ${this.spName(p)}!` });
      return;
    }
    p.dead = true; p.deadT = 0; p.hp = 0; p.killer = killer ? this.label(killer) : null; p.killerId = killer?.id ?? 0;
    this.dropExp(p, p.boss ? 1.5 : p.wild ? 0.5 : 0.6);
    if (this.mode === 'br' && !p.wild) p.place = this.trainers().filter(q => !q.dead).length + 1;
    if (!p.wild || p.boss || (killer && !killer.bot)) {
      this.fx.push({ k: 'feed', s: p.killer ? `${p.killer} KO'd ${label}` : `${label} fainted` });
    }
  }

  pickup(p, o) {
    const k = o.k, S = this.d.species[p.sp], chunk = this.lvlChunk(p), I = this.held(p);
    if (HELD[k] && p.bot && p.item) return;
    this.removeOrb(o);
    if (!p.bot) this.fx.push({ k: 'pick', id: p.id, it: k });
    const boost = (p.A.pickup ? 1.2 : 1) * (I.exp || 1) * (1 + 0.1 * Math.min(p.streak, 10));
    if (k === 'e') return this.gain(p, chunk * o.v * boost);
    if (k === 'x') return this.gain(p, o.v * (I.exp || 1) * (1 + 0.1 * Math.min(p.streak, 10)));
    if (k === 'poke-ball') { p.balls = Math.min(BALLS_MAX, p.balls + 2); return; }
    if (HELD[k]) {
      if (p.item) {
        const a = p.face + Math.PI;
        this.spawnOrb(p.item, p.x + Math.cos(a) * (p.r + 50), p.y + Math.sin(a) * (p.r + 50));
      }
      p.item = k;
      return this.fx.push({ k: 'txt', id: p.id, s: HELD[k].n });
    }
    if (k === 'oran-berry' || k === 'sitrus-berry') { p.hp = Math.min(p.mh, p.hp + p.mh * (k === 'oran-berry' ? 0.25 : 0.5)); return; }
    if (k === 'lum-berry') { p.status = null; p.st = p.st.map(s => Math.max(0, s)); return; }
    if (k === 'rare-candy') return p.lvl < 100 && this.gain(p, this.expAt(p.sp, p.lvl + 1) - p.exp);
    if (k === 'mega' || k === 'dmax') {
      const forms = k === 'mega' ? S.mega : [S.gmax || p.form];
      if (!p.temp && forms.length) {
        p.temp = { k: k === 'mega' ? 'mega' : 'gmax', t: k === 'mega' ? 30 : 20 };
        p.form = pick(forms);
        this.recalc(p);
        this.fx.push({ k: 'form', id: p.id, s: `${this.label(p)} ${k === 'mega' ? 'Mega Evolved' : 'Dynamaxed'}!` });
        return;
      }
      return this.gain(p, chunk * 3);
    }
    const evo = !p.temp && S.evo?.find(e => e.item === k);
    if (evo) return this.evolve(p, evo.to);
    this.gain(p, chunk * 2);
  }

  // Orbs are worth a fixed slice of the Medium Fast curve, so Fast growers out-level Slow ones on the same food.
  lvlChunk(p) { const ref = this.d.growth.medium; return p.lvl >= 100 ? 0 : (ref[p.lvl + 1] - ref[p.lvl]) / 8; }

  autoUpgrade(p) {
    while (p.pts > 0) {
      const open = [0, 1, 2, 3, 4, 5].filter(i => p.up[i] < UPGRADE_MAX);
      if (!open.length) return;
      const w = open.map(i => p.base[i] ** 2), r = Math.random() * w.reduce((a, b) => a + b, 0);
      let acc = 0;
      this.upgrade(p, open.find((i, k) => (acc += w[k]) >= r) ?? open[0]);
    }
  }

  gain(p, amt) {
    if (p.dead || p.wild || !(amt > 0)) return;
    p.exp += amt;
    while (p.lvl < 100 && p.exp >= this.expAt(p.sp, p.lvl + 1)) { p.lvl++; this.levelUp(p); }
  }

  levelUp(p) {
    p.pts++;
    if (p.bot) this.autoUpgrade(p);
    this.learn(p, p.lvl);
    const evo = !p.temp && this.d.species[p.sp].evo?.find(e => e.lvl && p.lvl >= e.lvl);
    if (evo) this.evolve(p, evo.to); else this.recalc(p);
    this.fx.push({ k: 'lvl', id: p.id });
  }

  evolve(p, to) {
    const from = this.label(p);
    p.sp = to; p.form = this.formFor(to, p.rf);
    this.recalc(p); this.learn(p, p.lvl);
    p.exp = Math.max(p.exp, this.expAt(to, p.lvl));
    this.fx.push({ k: 'evo', id: p.id, sp: to, s: `${from} evolved into ${this.d.species[to].n}!` });
  }

  // A new move only gets in if the whole set gets stronger, so movesets never get worse as you level.
  learn(p, lvl) {
    const pk = this.d.pokemon[p.form];
    for (const [l, mv] of pk.m) {
      if (l !== lvl || p.moves.includes(mv) || !this.d.moves[mv]) continue;
      if (p.moves.length < 4) {
        if (this.setScore(pk, [...p.moves, mv]) > this.setScore(pk, p.moves)) { p.moves.push(mv); this.learned(p, mv, null); }
        continue;
      }
      let best = -1, bs = this.setScore(pk, p.moves);
      p.moves.forEach((_, i) => {
        const s = this.setScore(pk, p.moves.map((x, j) => (j === i ? mv : x)));
        if (s > bs) { bs = s; best = i; }
      });
      if (best < 0) continue;
      const old = p.moves[best];
      p.moves[best] = mv; p.cd[best] = 0;
      this.learned(p, mv, old);
    }
  }

  learned(p, mv, old) {
    if (p.bot) return;
    const n = this.d.moves[mv].n;
    this.fx.push({ k: 'learn', id: p.id, s: old ? `${this.spName(p)} forgot ${this.d.moves[old].n} and learned ${n}!` : `${this.spName(p)} learned ${n}!` });
  }

  think(p, dt) {
    if ((p.think -= dt) > 0) return;
    p.think = 0.15 + Math.random() * 0.1;
    if (p.npc) return this.thinkLeader(p);
    if (p.wander > 0) return;
    const moved = Math.hypot(p.x - (p.lx ?? 0), p.y - (p.ly ?? 0));
    p.lx = p.x; p.ly = p.y;
    if (moved < 3 && (p.ix || p.iy) && !p.wild) { this.steer(p, Math.random() - 0.5, Math.random() - 0.5); p.wander = 1; return; }
    if (p.wild) return this.thinkWild(p);
    const z = this.zone;
    if (z && Math.hypot(p.x - z.x, p.y - z.y) > z.r * 0.85) return this.steer(p, z.x - p.x, z.y - p.y);

    let foe = null, fd = 480;
    for (const q of this.players.values()) {
      if (q === p || q.dead || q.prot > 0 || q.catching > 0) continue;
      const provoked = p.lastHit === q.id || q.aggro === p.id;
      // Bots leave much weaker trainers alone unless provoked, so fresh spawns get room to grow.
      if (!provoked && (q.lvl < p.lvl - 8 || (q.wild && q.lvl > p.lvl + 3))) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < fd) { foe = q; fd = d; }
    }
    const hpR = p.hp / p.mh;
    if (foe && hpR < 0.3 && foe.lvl >= p.lvl - 5) return this.steer(p, p.x - foe.x, p.y - foe.y);
    if (foe && (foe.lvl <= p.lvl + 4 || p.lastHit === foe.id)) return this.fight(p, foe, fd);
    let best = null, bd = Infinity;
    for (const o of this.orbsNear(p.x, p.y, 1200)) {
      if (z && !this.inZone(o.x, o.y, 40)) continue;
      let d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (o.k !== 'e') d *= hpR < 0.6 && o.k.endsWith('berry') ? 0.1 : 0.5;
      if (d < bd) { bd = d; best = o; }
    }
    if (best) this.steer(p, best.x - p.x, best.y - p.y);
  }

  thinkWild(p) {
    const f = p.aggro && this.players.get(p.aggro);
    if (f && !f.dead && p.aggroT > 0) return this.fight(p, f, Math.hypot(f.x - p.x, f.y - p.y));
    p.aggro = 0;
    if (p.boss) {
      for (const q of this.players.values()) {
        if (!q.wild && !q.dead && q.prot <= 0 && Math.hypot(q.x - p.x, q.y - p.y) < 380) { p.aggro = q.id; p.aggroT = 8; return; }
      }
    }
    if (Math.hypot(p.x - p.hx, p.y - p.hy) > 220) return this.steer(p, p.hx - p.x, p.hy - p.y);
    if (Math.random() < 0.15) { if (Math.random() < 0.4) { p.ix = p.iy = 0; } else this.steer(p, Math.random() - 0.5, Math.random() - 0.5); }
  }

  fight(p, f, d) {
    p.aim = Math.atan2(f.y - p.y, f.x - p.x);
    p.ad = d;
    let best = -1, score = 0;
    p.moves.forEach((mv, i) => {
      const m = this.d.moves[mv], k = m.k, range = k === 'melee' ? p.r + 85 + f.r : k === 'aoe' || k === 'quake' ? 130 + p.r * 1.5 + f.r : KIND[k].range;
      if (p.cd[i] > 0 || d > range) return;
      if (k === 'shield' && (d > 200 || Math.random() < 0.7)) return;
      const s = m.c === 'status' ? Math.random() * 30 : (m.p || 50) * typeMul(this.d.types, m.t, f.types) * (p.types.includes(m.t) ? 1.5 : 1);
      if (s > score) { score = s; best = i; }
    });
    p.use = best;
    const melee = p.moves.some(mv => this.d.moves[mv].p && this.d.moves[mv].k === 'melee');
    if (melee || d > 320) this.steer(p, f.x - p.x, f.y - p.y);
    else this.steer(p, -(f.y - p.y) + (d < 200 ? p.x - f.x : 0), f.x - p.x);
  }

  steer(p, dx, dy) { const L = Math.hypot(dx, dy) || 1; p.ix = dx / L; p.iy = dy / L; }

  upkeepWild(dt) {
    if (this.over) return;
    let n = 0, boss = false;
    for (const p of this.players.values()) if (p.wild && !p.dead) { n++; boss ||= p.boss; }
    const target = Math.min(this.wildTarget, 45 * Math.max(1, this.anchors().length));
    if (n < target && Math.random() < dt * 4) this.spawnWild(false);
    if (!boss && this.legends.length && (this.bossT -= dt) <= 0) { this.bossT = BOSS_EVERY; this.spawnWild(true); }
  }

  spawnWild(boss) {
    if (!boss) return this.spawnTiered(this.addPlayer('', pick(this.starters), { wild: true }), -2);
    const p = this.addPlayer('', pick(this.legends), { wild: true, boss, lvl: 60 + (Math.random() * 20 | 0), at: this.spotNearAnchor(null, 1500, NEAR) });
    this.fx.push({ k: 'feed', s: `A ${this.label(p)} appeared in ${REGIONS[this.regionOf(p.x, p.y)].n}!`, boss: 1, x: Math.round(p.x), y: Math.round(p.y) });
    return p;
  }

  // ---- Leagues: gym leaders, Elite Four and champions as real-time boss trainers ----
  rootOf(sp) { let s = sp; while (this.d.species[s].from && this.d.species[this.d.species[s].from]) s = this.d.species[s].from; return s; }
  leaderInfo(L) {
    const n = L.npc;
    if (n.kind === 'gym') return { name: n.name, type: n.type, ace: n.ace, title: n.badge };
    const [name, type, ace] = n.members[n.stage];
    return { name, type, ace, title: n.league };
  }

  spawnLeaders() {
    for (const t of this.towns) {
      const reg = REGIONS[t.region], spots = [...t.gyms.map(gi => ['gym', gi]), ...(t.league ? [['league', 0]] : [])];
      spots.forEach(([kind, gi], k) => {
        const g = reg.gyms[gi], npc = kind === 'gym'
          ? { kind, region: t.region, idx: gi, name: g[0], type: g[1], badge: g[2], ace: g[4] }
          : { kind, region: t.region, idx: 0, stage: 0, members: reg.league.members, league: reg.league.n };
        const L = this.addPlayer(kind === 'gym' ? g[0] : reg.league.n, this.starters[0], { npc });
        L.home = [t.x + (k - (spots.length - 1) / 2) * 90, t.y + TILE * 2.5];
        this.idle(L, 0);
      });
    }
  }

  idle(L, cool) {
    L.npc.stage = 0;
    const { name, ace } = this.leaderInfo(L), sp = this.d.species[ace] ? ace : this.starters[0];
    this.place(L, this.rootOf(sp), sp, 30, ...L.home);
    Object.assign(L, { name: L.npc.kind === 'gym' ? name : L.npc.league, dormant: true, cool, prot: 1e9, challenger: 0, party: [], dead: false, face: Math.PI / 2 });
  }

  challenge(p, id, badges) {
    const L = this.players.get(id);
    if (!L?.npc || !L.dormant || L.cool > 0 || p.dead || p.wild || Math.hypot(L.x - p.x, L.y - p.y) > 340) return;
    const need = Math.min(8, REGIONS[L.npc.region].gyms.length);
    if (L.npc.kind === 'league' && (badges | 0) < need) return this.fx.push({ k: 'txt', id: L.id, s: `Come back with ${need} ${REGIONS[L.npc.region].n} badges!` });
    L.npc.stage = 0;
    this.wake(L, p);
  }

  wake(L, ch) {
    const { name, type, ace } = this.leaderInfo(L), league = L.npc.kind === 'league';
    const lvl = clamp(ch.lvl + 2 + (league ? 3 + L.npc.stage : L.npc.idx >> 1), 5, 100);
    const stage = clamp(this.depthOf(ch.sp) + (league || L.npc.idx >= 5 ? 1 : 0), 0, 2);
    const picks = [0, 1].map(() => this.lineAt(stage, b => this.typed(b, [type]) && this.inGen(b, L.npc.region), b => this.typed(b, [type])).sp);
    const team = [...picks, this.d.species[ace] ? ace : picks[0]].map((sp, i) => {
      this.place(L, this.rootOf(sp), sp, lvl + (i === 2 ? 2 : 0), ...L.home);
      return this.pack(L);
    });
    this.load(L, team[0]);
    Object.assign(L, { party: team.slice(1), name, dormant: false, prot: 0, challenger: ch.id, aggro: ch.id, aggroT: 1e9, chT: 150, dead: false });
    L.hp = L.mh;
    this.fx.push({ k: 'challenge', id: ch.id, s: `${name} wants to battle! (${type.toUpperCase()})` }, { k: 'feed', s: `${ch.name} challenged ${name}!` });
  }

  stepLeader(L, dt) {
    if (L.dormant) {
      L.cool -= dt; L.vx = L.vy = 0; L.hp = L.mh; [L.x, L.y] = L.home;
      return true;
    }
    const ch = this.players.get(L.challenger);
    if (!ch || ch.dead || (L.chT -= dt) <= 0 || Math.hypot(ch.x - L.home[0], ch.y - L.home[1]) > 1400) {
      this.fx.push({ k: 'feed', s: `${L.name} won! ${ch?.name || 'The challenger'} must train harder.` });
      this.idle(L, 5);
      return true;
    }
    return false;
  }

  thinkLeader(L) {
    const ch = this.players.get(L.challenger);
    if (!ch) return;
    if (Math.hypot(L.x - L.home[0], L.y - L.home[1]) > 600) return this.steer(L, L.home[0] - L.x, L.home[1] - L.y);
    if (L.party.length && L.hp < L.mh * 0.25 && L.swapCd <= 0) { const i = L.party.findIndex(m => !m.fainted); if (i >= 0) return this.swapTo(L, i); }
    this.fight(L, ch, Math.hypot(ch.x - L.x, ch.y - L.y));
  }

  leaderDefeated(L) {
    const ch = this.players.get(L.challenger), n = L.npc, reg = REGIONS[n.region], info = this.leaderInfo(L);
    const reward = big => { if (!ch || ch.dead) return; this.gain(ch, this.lvlChunk(ch) * (big ? 40 : 16)); this.spawnOrb('rare-candy', ch.x + 40, ch.y); this.spawnOrb(pick(HELD_NAMES), ch.x - 40, ch.y); ch.hp = Math.min(ch.mh, ch.hp + ch.mh * 0.4); };
    this.fx.push({ k: 'ko', id: L.id, x: Math.round(L.x), y: Math.round(L.y), by: ch?.id ?? 0, sp: L.sp, b: 0, w: 0 });
    if (n.kind === 'gym') {
      reward(false);
      if (ch) this.fx.push({ k: 'badge', id: ch.id, region: n.region, idx: n.idx, kind: 'gym', s: `You defeated ${info.name} and earned the ${n.badge}!` }, { k: 'feed', s: `${ch.name} earned the ${n.badge} from ${info.name}!`, boss: 1 });
      return this.idle(L, 20);
    }
    if (++n.stage < n.members.length && ch && !ch.dead) {
      reward(false);
      this.fx.push({ k: 'feed', s: `${ch.name} defeated ${info.name}! ${n.members[n.stage][0]} steps up!`, boss: 1 });
      return this.wake(L, ch);
    }
    reward(true);
    if (ch) this.fx.push({ k: 'badge', id: ch.id, region: n.region, kind: 'champion', s: `${ch.name} conquered the ${reg.league.n}!` }, { k: 'win', id: ch.id, s: `${ch.name} is the ${reg.league.n} Champion!` });
    this.idle(L, 30);
  }

  snapshot() {
    const P = [];
    for (const p of this.players.values()) {
      P.push({
        id: p.id, n: p.name, f: p.form, sp: p.sp, l: p.lvl, hp: Math.ceil(p.hp), mh: p.mh, x: Math.round(p.x), y: Math.round(p.y),
        a: +p.aim.toFixed(2), fa: +p.face.toFixed(2), mv: Math.hypot(p.vx, p.vy) > 25 || p.dash > 0 ? 1 : 0, r: Math.round(p.r),
        d: p.dead ? 1 : 0, s: p.status, tm: p.temp?.k || null, w: p.wild ? 1 : 0, b: p.boss ? 1 : 0, sh: p.shiny ? 1 : 0,
        k: p.kills, e: Math.round(p.exp), fl: p.flash > 0 ? 1 : 0, bt: p.bot && !p.wild ? 1 : 0,
        pt: p.prot > 0 ? 1 : 0, rl: p.roll > 0 ? 1 : 0, sd: p.shield > 0 ? 1 : 0, wx: p.wx?.t || null,
        ks: p.streak || 0, wt: p.wet > 0 ? 1 : 0, cb: p.catching > 0 ? 1 : 0,
        np: p.npc ? [p.npc.kind === 'gym' ? 1 : 2, p.npc.region, p.npc.idx, p.dormant ? 1 : 0, p.cool > 0 ? 1 : 0, p.npc.stage || 0] : undefined,
        pf: p.party?.length ? p.party.map(m => [m.form, m.shiny ? 1 : 0, m.fainted ? 1 : 0]) : undefined,
      });
    }
    const pr = this.proj.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.r), t: b.t, mv: b.mv, a: +Math.atan2(b.vy, b.vx).toFixed(2), ball: b.ball || 0 }));
    const z = this.zones.map(q => ({ id: q.id, x: q.x, y: q.y, r: q.r, t: q.ty, mv: q.mv }));
    const zn = this.zone;
    const br = zn && {
      x: Math.round(zn.x), y: Math.round(zn.y), r: Math.round(zn.r), tx: Math.round(zn.tx), ty: Math.round(zn.ty), tr: Math.round(zn.tr),
      ph: zn.ph, wait: Math.ceil(Math.max(0, zn.wait)), shrink: zn.shrink > 0 ? 1 : 0,
      alive: this.trainers().filter(p => !p.dead).length, over: Math.ceil(this.over), round: this.round,
    };
    return { t: this.time, p: P, pr, z, br, fx: this.fx, day: +this.daylight().toFixed(3), sky: this.sky.map(s => s.k) };
  }

  mine(p) {
    let spec = 0;
    if (p.dead) {
      const k = this.players.get(p.killerId);
      spec = k && !k.dead ? k.id : this.trainers().filter(q => !q.dead).sort((a, b) => b.exp - a.exp)[0]?.id ?? 0;
    }
    return {
      id: p.id, moves: p.moves, cd: p.cd.map(c => Math.max(0, +c.toFixed(2))), pending: p.pending, exp: p.exp,
      lo: this.expAt(p.sp, p.lvl), hi: p.lvl < 100 ? this.expAt(p.sp, p.lvl + 1) : p.exp, killer: p.killer,
      dead: p.dead, deadT: p.deadT, st: p.st, temp: p.temp && { k: p.temp.k, t: Math.ceil(p.temp.t) },
      ab: p.ab, stat: p.stat, mh: p.mh, iv: p.iv, nat: p.nat, up: p.up, pts: p.pts, dcd: Math.max(0, +p.dodgeCd.toFixed(2)),
      dmax: clamp(1 + Math.sqrt(p.kg) / 8 + p.r / 60, 1.2, 4.5), wx: p.wx && { t: p.wx.t, s: Number.isFinite(p.wx.time) ? Math.ceil(p.wx.time) : 0 },
      item: p.item, balls: p.balls, streak: p.streak, swapCd: Math.max(0, +p.swapCd.toFixed(1)), place: p.place, spec, mode: this.mode,
      biome: this.biomeAt(p.x, p.y), region: this.regionOf(p.x, p.y), town: p.town,
      party: p.party.map(m => ({ sp: m.sp, form: m.form, lvl: m.lvl, hp: Math.ceil(m.hp), mh: m.mh, sh: m.shiny ? 1 : 0, fainted: m.fainted ? 1 : 0, item: m.item })),
    };
  }

  flush() { this.fx = []; this.added = []; this.removed = []; }
}
