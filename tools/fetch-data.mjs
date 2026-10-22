// Builds data/game.json and downloads sprites from PokeAPI. Safe to rerun: responses are cached in .cache/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://pokeapi.co/api/v2/';
const CACHE = path.join(ROOT, '.cache');
const SPR = path.join(ROOT, 'public/sprites');
const ITEMS = path.join(ROOT, 'public/items');
const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const ITEM_SPRITES = {
  'oran-berry': ['oran-berry'], 'sitrus-berry': ['sitrus-berry'], 'lum-berry': ['lum-berry'], 'rare-candy': ['rare-candy'],
  'fire-stone': ['fire-stone'], 'water-stone': ['water-stone'], 'thunder-stone': ['thunder-stone'], 'leaf-stone': ['leaf-stone'],
  'moon-stone': ['moon-stone'], 'sun-stone': ['sun-stone'], 'shiny-stone': ['shiny-stone'], 'dusk-stone': ['dusk-stone'],
  'dawn-stone': ['dawn-stone'], 'ice-stone': ['ice-stone'], mega: ['key-stone', 'mega-ring', 'charizardite-x'],
  dmax: ['dynamax-band', 'wishing-piece', 'max-mushrooms'],
  'poke-ball': ['poke-ball'],
  ...Object.fromEntries(['choice-band', 'choice-specs', 'choice-scarf', 'leftovers', 'life-orb', 'focus-sash', 'shell-bell', 'quick-claw',
    'expert-belt', 'rocky-helmet', 'scope-lens', 'lucky-egg', 'assault-vest', 'eviolite'].map(n => [n, [n]])),
};

await fs.mkdir(CACHE, { recursive: true });
for (const d of ['shiny', 'back', 'back/shiny']) await fs.mkdir(path.join(SPR, d), { recursive: true });
await fs.mkdir(ITEMS, { recursive: true });

async function get(url, pick, ver = '') {
  const file = path.join(CACHE, url.replace(API, '').replace(/[^a-z0-9]+/gi, '_') + ver + '.json');
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const out = pick(await r.json());
      await fs.writeFile(file, JSON.stringify(out));
      return out;
    } catch (e) {
      if (i >= 4) throw e;
      await new Promise(res => setTimeout(res, 1000 * (i + 1)));
    }
  }
}

async function pool(items, fn, n = 10) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      await fn(items[i++]);
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${items.length}\r`);
    }
  }));
  console.log(`  ${items.length}/${items.length}`);
}

async function download(url, file) {
  try { await fs.access(file); return true; } catch {}
  if (!url) return false;
  const r = await fetch(url).catch(() => null);
  if (!r?.ok) return false;
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
  return true;
}

const vgId = d => +d.version_group.url.split('/').at(-2);
// Colosseum, XD, Let's Go and the Japanese Red/Green/Blue releases carry old Gen 1-3 learnsets despite high ids.
const SIDE_VG = new Set([12, 13, 19, 28, 29]);

console.log('types');
const types = {};
for (const t of TYPES) {
  const rel = await get(API + 'type/' + t, j => j.damage_relations);
  const row = {};
  for (const d of rel.double_damage_to) row[d.name] = 2;
  for (const d of rel.half_damage_to) row[d.name] = 0.5;
  for (const d of rel.no_damage_to) row[d.name] = 0;
  types[t] = row;
}

console.log('growth rates');
const growth = {};
for (let i = 1; i <= 6; i++) {
  const g = await get(API + 'growth-rate/' + i, j => ({ name: j.name, levels: j.levels }));
  const arr = [0];
  for (const l of g.levels) arr[l.level] = l.experience;
  growth[g.name] = arr;
}

console.log('moves');
const moves = {};
const moveNames = await get(API + 'move?limit=3000', j => j.results.map(r => r.name));
await pool(moveNames, async name => {
  const m = await get(API + 'move/' + name, j => ({
    n: j.names.find(x => x.language.name === 'en')?.name || j.name,
    t: j.type.name, p: j.power, pp: j.pp, c: j.damage_class?.name || 'status', tg: j.target.name,
    ail: j.meta?.ailment?.name || 'none', ac: j.meta?.ailment_chance || 0, dr: j.meta?.drain || 0,
    hl: j.meta?.healing || 0, cr: j.meta?.crit_rate || 0, fl: j.meta?.flinch_chance || 0,
    sc: j.stat_changes.map(s => [s.stat.name, s.change]), sp: j.meta?.stat_chance || 0,
    mh: [j.meta?.min_hits || 1, j.meta?.max_hits || 1],
  }), '_v2');
  if (m && TYPES.includes(m.t)) moves[name] = m;
});

console.log('pokemon');
const pokemon = {};
const pokeNames = await get(API + 'pokemon?limit=3000', j => j.results.map(r => r.name));
await pool(pokeNames, async name => {
  const p = await get(API + 'pokemon/' + name, j => {
    // Use one game's learnset (the newest that has one) so moves from different generations don't mix.
    const levelUp = j.moves.flatMap(m => m.version_group_details.filter(d => d.move_learn_method.name === 'level-up').map(d => [m.move.name, vgId(d), d.level_learned_at]));
    const main = levelUp.filter(x => !SIDE_VG.has(x[1])), top = Math.max(0, ...(main.length ? main : levelUp).map(x => x[1]));
    const best = new Map(levelUp.filter(x => x[1] === top).map(([mv, , lvl]) => [mv, { lvl }]));
    const v = j.sprites.versions || {};
    const g3 = v['generation-iii'] || {}, bw = v['generation-v']?.['black-white'] || {};
    const pickSprite = k => g3['firered-leafgreen']?.[k] || g3.emerald?.[k] || g3['ruby-sapphire']?.[k] || bw[k] || j.sprites[k];
    return {
      id: j.id, sp: j.species.name, t: j.types.map(t => t.type.name), s: j.stats.map(s => s.base_stat),
      m: [...best].map(([mv, b]) => [Math.max(1, b.lvl), mv]).sort((a, b) => a[0] - b[0]),
      img: pickSprite('front_default'), shiny: pickSprite('front_shiny'), bk: pickSprite('back_default'), bks: pickSprite('back_shiny'),
      h: j.height, w: j.weight, ab: j.abilities.map(a => [a.ability.name, a.is_hidden ? 1 : 0]),
    };
  }, '_v5');
  if (p) pokemon[name] = p;
});

console.log('abilities');
const abilities = {};
const abNames = [...new Set(Object.values(pokemon).flatMap(p => p.ab.map(a => a[0])))];
await pool(abNames, async name => {
  const a = await get(API + 'ability/' + name, j => ({
    n: j.names.find(x => x.language.name === 'en')?.name || j.name,
    e: j.effect_entries.find(x => x.language.name === 'en')?.short_effect
      || j.flavor_text_entries.findLast(x => x.language.name === 'en')?.flavor_text?.replace(/\s+/g, ' ') || '',
  }));
  if (a) abilities[name] = a;
});

console.log('species');
const species = {};
const spNames = [...new Set(Object.values(pokemon).map(p => p.sp))];
await pool(spNames, async name => {
  const s = await get(API + 'pokemon-species/' + name, j => ({
    n: j.names.find(x => x.language.name === 'en')?.name || j.name,
    g: j.growth_rate.name, from: j.evolves_from_species?.name || null, chain: j.evolution_chain?.url || null,
    v: j.varieties.map(x => x.pokemon.name), base: j.varieties.find(x => x.is_default).pokemon.name,
    leg: j.is_legendary || j.is_mythical,
  }));
  if (s) species[name] = s;
});

console.log('evolution chains');
const evoRule = (to, details) => {
  const lvl = details.find(d => d.min_level)?.min_level;
  if (lvl) return { to, lvl };
  const item = details.find(d => d.trigger.name === 'use-item' && d.item)?.item.name;
  if (item) return { to, item };
  return { to, lvl: 30 }; // trade/friendship/time-based evolutions have no map equivalent
};
const chainUrls = [...new Set(Object.values(species).map(s => s.chain).filter(Boolean))];
await pool(chainUrls, async url => {
  const c = await get(url, j => j.chain);
  const walk = node => {
    for (const next of node.evolves_to) {
      const s = species[node.species.name];
      if (s && species[next.species.name]) (s.evo ||= []).push(evoRule(next.species.name, next.evolution_details));
      walk(next);
    }
  };
  walk(c);
});

for (const s of Object.values(species)) {
  s.mega = s.v.filter(n => /-(mega|primal)/.test(n) && pokemon[n]);
  s.gmax = s.v.find(n => n.endsWith('-gmax') && pokemon[n]) || null;
  delete s.v; delete s.chain;
}

console.log('sprites');
await pool(Object.values(pokemon), async p => {
  p.img = (await download(p.img, path.join(SPR, p.id + '.png'))) ? 1 : 0;
  p.shiny = (await download(p.shiny, path.join(SPR, 'shiny', p.id + '.png'))) ? 1 : 0;
  p.bk = (await download(p.bk, path.join(SPR, 'back', p.id + '.png'))) ? 1 : 0;
  p.bks = (await download(p.bks, path.join(SPR, 'back/shiny', p.id + '.png'))) ? 1 : 0;
});

console.log('item sprites');
for (const [key, names] of Object.entries(ITEM_SPRITES)) {
  for (const n of names) {
    const url = await get(API + 'item/' + n, j => j.sprites.default);
    if (await download(url, path.join(ITEMS, key + '.png'))) break;
  }
}

// Forms like megas often list no learnset of their own; borrow the default form's.
for (const p of Object.values(pokemon)) {
  p.m = p.m.filter(([, mv]) => moves[mv]);
  const base = pokemon[species[p.sp]?.base];
  if (!p.m.length && base) p.m = base.m;
  if (!p.img && base?.img) p.imgOf = base.id;
}

await fs.writeFile(path.join(ROOT, 'data/game.json'), JSON.stringify({ pokemon, species, moves, types, growth, abilities }));
console.log(`done: ${Object.keys(pokemon).length} pokemon, ${Object.keys(species).length} species, ${Object.keys(moves).length} moves`);
