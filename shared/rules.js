// Pure Pokémon math and move classification shared by sim, renderer and tests.
export const TYPE_COLORS = {
  normal: '#a8a878', fire: '#f08030', water: '#6890f0', electric: '#f8d030', grass: '#78c850', ice: '#98d8d8',
  fighting: '#c03028', poison: '#a040a0', ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
  rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', dark: '#705848', steel: '#b8b8d0', fairy: '#ee99ac',
};

export const calcStat = (base, lvl, isHp, iv = 31) => Math.floor((2 * base + iv) * lvl / 100) + (isHp ? lvl + 10 : 5);

// Natures in canonical order; index n raises NAT_ORDER[n/5|0] and lowers NAT_ORDER[n%5] (same stat = neutral).
export const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];
const NAT_ORDER = [0, 1, 4, 2, 3]; // atk, def, spe, spa, spd -> indices into [atk, def, spa, spd, spe]
export const natureMul = (n, i) => (NAT_ORDER[n / 5 | 0] === NAT_ORDER[n % 5] ? 1 : NAT_ORDER[n / 5 | 0] === i ? 1.1 : NAT_ORDER[n % 5] === i ? 0.9 : 1);

export const UPGRADE_MAX = 15, UPGRADE_STEP = 0.04;

export const calcDamage = (lvl, power, atk, def, mul = 1) =>
  Math.max(1, Math.floor((Math.floor(Math.floor(2 * lvl / 5 + 2) * power * atk / def) / 50 + 2) * mul));

export const typeMul = (chart, atkType, defTypes) => defTypes.reduce((m, t) => m * (chart[atkType]?.[t] ?? 1), 1);

export const stageMul = s => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));

// Strong, low-PP moves recharge slowly; weak spammable ones are quick (Tackle ~1s, Hyper Beam ~3.5s).
export const cooldown = (pp, power = 0) => 0.35 + 9 / (pp || 10) + (power || 0) / 110;

export const CRIT = [1 / 24, 1 / 8, 1 / 2, 1];

export const WEATHER = {
  'rain-dance': 'water', 'sunny-day': 'fire', sandstorm: 'rock', hail: 'ice', snowscape: 'ice', 'chilly-reception': 'ice',
  'electric-terrain': 'electric', 'grassy-terrain': 'grass', 'psychic-terrain': 'psychic', 'misty-terrain': 'fairy',
};

const SELF = new Set(['user', 'users-field', 'user-and-allies', 'ally', 'user-or-ally', 'all-allies']);
const AOE = new Set(['all-opponents', 'all-other-pokemon', 'all-pokemon', 'entire-field', 'opponents-field']);
const PROTECT = /^(protect|detect|kings-shield|spiky-shield|baneful-bunker|obstruct|silk-trap|burning-bulwark|max-guard|endure|wide-guard|quick-guard|mat-block|crafty-shield)$/;
const HAZARD = /^(spikes|toxic-spikes|stealth-rock|sticky-web|fire-spin|whirlpool|sand-tomb|magma-storm|infestation|thunder-cage|toxic-debris)$/;
const STRIKE = /^(thunder|hurricane|future-sight|doom-desire|draco-meteor|meteor-beam|sky-attack|fissure|sheer-cold|wildbolt-storm|bleakwind-storm|sandsear-storm|springtide-storm|blizzard|rock-slide|stone-edge|magnitude|bolt-strike|blue-flare|precipice-blades|diamond-storm)$/;
const BEAM = /beam|pump|thrower|thunderbolt|cannon|^hyper-voice$|pulse|^aurora|scald|water-gun|inferno|tri-attack|dazzling|moongeist|prismatic|photon|spacial-rend|roar-of-time|core-enforcer|eternabeam|^psychic$|^bubble-beam$|^overheat$|^focus-blast$|^energy-ball$|^snipe-shot$|^steam-eruption$/;

// Game archetype of a move. Order matters: named specials first, then targeting, then damage class.
export function moveKind(m, n = '') {
  if (PROTECT.test(n)) return 'shield';
  if (WEATHER[n]) return 'weather';
  if (HAZARD.test(n)) return 'zone';
  if (SELF.has(m.tg)) return 'self';
  if (STRIKE.test(n)) return 'strike';
  if (AOE.has(m.tg)) return m.c !== 'status' && m.t === 'ground' ? 'quake' : 'aoe';
  if (m.c === 'status') return 'proj';
  if (m.mh?.[1] > 1) return 'multi';
  if (m.c === 'special' && BEAM.test(n)) return 'beam';
  return m.c === 'physical' ? 'melee' : 'proj';
}

export function meleeStyle(n) {
  if (/punch|hammer-arm|mach|jab|fist|uppercut|knuckle|meteor-mash|close-combat/.test(n)) return 'punch';
  if (/kick|stomp|jump|axe|trop/.test(n)) return 'kick';
  if (/bite|fang|crunch|jaw|chomp/.test(n)) return 'bite';
  if (/claw|slash|cut|scratch|swipe|blade|scissor|sword|razor|cross|aerial|edge|false-swipe|fury/.test(n)) return 'claw';
  if (/horn|drill|peck|spear|smart-strike|megahorn|pin|needle/.test(n)) return 'horn';
  if (/tail|whip|slam|wing|lash|hammer/.test(n)) return 'tail';
  return 'tackle';
}

export const KIND = {
  self: { label: 'BOOST', range: Infinity }, shield: { label: 'GUARD', range: 160 }, weather: { label: 'WEATHER', range: Infinity },
  zone: { label: 'ZONE', range: 360 }, strike: { label: 'STRIKE', range: 380 }, aoe: { label: 'BURST', range: 150 },
  quake: { label: 'QUAKE', range: 150 }, proj: { label: 'SHOT', range: 460 }, multi: { label: 'VOLLEY', range: 420 },
  beam: { label: 'BEAM', range: 400 }, melee: { label: 'MELEE', range: 90 },
};

// Annotate moves once with archetype (k) and melee style (st). Safe to call repeatedly.
export function prep(d) {
  if (d.prepped) return d;
  for (const [n, m] of Object.entries(d.moves)) { m.k = moveKind(m, n); m.st = meleeStyle(n); }
  d.prepped = true;
  return d;
}
