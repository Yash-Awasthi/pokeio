import { TILE, MAP, T, BIOMES, REGIONS, bodySize } from '/shared/sim.js';
import { TREES, GRID } from '/shared/map.js';
import { TYPE_COLORS } from '/shared/rules.js';

const FONT = '"Press Start 2P", monospace';
const STATUS = { burn: ['BRN', '#f08030'], poison: ['PSN', '#a040a0'], paralysis: ['PAR', '#d8b800'], sleep: ['SLP', '#8898a8'], freeze: ['FRZ', '#68c8e8'], confusion: ['CNF', '#f85888'], trap: ['TRP', '#a8a878'], 'leech-seed': ['SED', '#78c850'] };
const ITEMS = ['oran-berry', 'sitrus-berry', 'lum-berry', 'rare-candy', 'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'sun-stone', 'shiny-stone', 'dusk-stone', 'dawn-stone', 'ice-stone', 'mega', 'dmax', 'poke-ball',
  'choice-band', 'choice-specs', 'choice-scarf', 'leftovers', 'life-orb', 'focus-sash', 'shell-bell', 'quick-claw', 'expert-belt', 'rocky-helmet', 'scope-lens', 'lucky-egg', 'assault-vest', 'eviolite'];
const LIFE = { ball: 0.4, free: 0.4, catch: 1.2, raid: 1.2, melee: 0.28, aoe: 0.45, quake: 0.7, self: 0.6, shield: 0.3, weather: 1.2, beam: 0.32, strike: 0.5, boom: 0.6, zone: 0.3, pop: 0.3, dmg: 0.9, ko: 0.7, evo: 1.4, lvl: 1, stat: 0.8, txt: 1, form: 1.4 };
const ATTACKS = new Set(['melee', 'aoe', 'quake', 'self', 'shield', 'weather', 'beam', 'strike', 'zone', 'proj', 'multi']);
const LIGHT = { fire: '#f8f8a0', water: '#c8e8ff', electric: '#ffffff', grass: '#c8f8a0', ice: '#ffffff', psychic: '#ffd0e8', ghost: '#c8a8f8', dragon: '#c8b0ff', fairy: '#fff0f8', poison: '#e0a0e0', dark: '#a89888', steel: '#ffffff', rock: '#e8d8a0', ground: '#f8e8b0', fighting: '#f8c0a0', flying: '#ffffff', bug: '#e0f080', normal: '#ffffff' };

function rng(s) { return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function paint(rows, pal, under) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  if (under) g.drawImage(under, 0, 0);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}

function speckle(base, dots, seed, n, tuft) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 16, 16);
  for (let i = 0; i < n; i++) {
    const x = r() * 15 | 0, y = r() * 15 | 0;
    g.fillStyle = dots[r() * dots.length | 0];
    if (tuft) { g.fillRect(x, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x + 1, y + 1, 1, 1); } else g.fillRect(x, y, 1, 1);
  }
  return c;
}

const TREE = [
  '.....oooooo.....', '...oohhhhggoo...', '..ohhhgggggggo..', '.ohhgggggggggso.', '.ohggggggggggso.', 'ohgggggggggggsso',
  'ohggggggggggssso', 'oggggggggggsssso', 'ogggggggggssssso', '.ogggggggsssssso', '.oggsssssssssso.', '..ooosssssssoo..',
  '....oottttoo....', '.....ottto......', '....oottttoo....', '................',
];
const TALL = [
  '..d.......d.....', '.dLd.....dLd....', '.dLLd...dLLd....', 'dLLLLd.dLLLLd...', 'dLGGLddLGGLLd...', 'dGGGGddGGGGGd...', '.dddd..ddddd....', '................',
  '......d.......d.', '.....dLd.....dLd', '....dLLd....dLLd', '...dLLLLd..dLLLL', '...dLGGLd.dLGGLL', '...dGGGGd.dGGGGG', '....dddd...dddd.', '................',
];
const FLOWER = [
  '................', '..rr............', '.rwwr...........', '.rwyr......rr...', '..rr......rwwr..', '..........rwyr..', '...........rr...', '................',
  '................', '.....rr.........', '....rwwr........', '....rwyr........', '.....rr.........', '................', '................', '................',
];

function makeTiles() {
  const grass = [0, 1, 2, 3].map(i => speckle('#88d070', ['#68b050', '#78c060'], 11 + i, 5, true));
  const water = [0, 1].map(f => {
    const c = speckle('#5098f8', ['#4888e8'], 99, 10);
    const g = c.getContext('2d');
    g.fillStyle = '#a8d0f8';
    for (const [x, y] of [[2, 3], [9, 6], [4, 11], [12, 13]]) g.fillRect((x + f * 2) % 14, y, 3, 1);
    return c;
  });
  const tall = paint(TALL, { '.': '#58a848', d: '#306830', L: '#88d860', G: '#60b048' });
  return {
    [T.GRASS]: grass,
    [T.TALL]: [tall],
    [T.TREE]: [paint(TREE, { o: '#204820', h: '#70c060', g: '#409040', s: '#2c6c2c', t: '#8a5a2a' }, grass[0])],
    [T.WATER]: water,
    [T.SAND]: [speckle('#f0dca0', ['#d8c088', '#f8ecc0'], 5, 14)],
    [T.FLOWER]: [0, 1].map(f => paint(FLOWER, { r: f ? '#f8f8f8' : '#f85858', w: f ? '#f8f8f8' : '#f8a8a8', y: '#f8d030' }, grass[f])),
    [T.PATH]: [speckle('#e0c890', ['#c8a868', '#f0dca8'], 7, 16)],
    blades: paint(TALL.map(r => r.replace(/\./g, ' ')), { d: '#306830', L: '#88d860', G: '#60b048' }),
  };
}

const ROCKWALL = [
  '..oooooooooooo..', '.ohhhhggggggggo.', 'ohhggggggggggsso', 'ohgggggggggggsso', 'oggggggsgggggsso', 'ogggggssggggssso', 'ogggggsgggggssso', 'oggggggggggsssso',
  'ogggggggggssssso', 'oggsgggggsssssso', 'ogsssgggsssssso.', 'ossssssssssssso.', '.osssssssssssoo.', '..oooooooooooo..', '................', '................',
];
const CACTUS = [
  '................', '......oo........', '.....oggo.......', '.....oggo..oo...', '.oo..oggo.oggo..', 'oggo.oggo.oggo..', 'oggo.oggooogo...', 'oggooogggggo....',
  '.oggggggoo......', '..ooooggo.......', '.....oggo.......', '.....oggo.......', '.....oggo.......', '....oggggo......', '................', '................',
];
function makeBiomeTiles(t) {
  const snow = speckle('#f0f8f8', ['#d0e0e8', '#ffffff'], 21, 14), ash = speckle('#5a4a48', ['#4a3a38', '#6a5a50'], 22, 18);
  const cave = speckle('#4a4038', ['#3a3028', '#5a5048'], 23, 18), sand = t[T.SAND][0];
  t[T.ASH] = [ash];
  t[T.LAVA] = [0, 1].map(f => { const c = speckle('#e85020', ['#f8b030', '#c83010'], 30 + f, 26); const g = c.getContext('2d'); g.fillStyle = '#f8f070'; g.fillRect((3 + f * 5) % 14, 5, 3, 2); g.fillRect((10 + f * 3) % 14, 11, 2, 2); return c; });
  t[T.ROCK] = [paint(ROCKWALL, { o: '#383028', h: '#a89888', g: '#787068', s: '#585048' }, cave)];
  t[T.SNOW] = [snow];
  t[T.SNOWTREE] = [paint(TREE, { o: '#203848', h: '#ffffff', g: '#d0e4f0', s: '#98b0c8', t: '#6a4a2a' }, snow)];
  t[T.SWAMP] = [0, 1].map(f => { const c = speckle('#506848', ['#405838', '#5a7050'], 40, 14); const g = c.getContext('2d'); g.fillStyle = '#7a9070'; g.fillRect((4 + f * 3) % 13, 6, 3, 1); g.fillRect((9 + f * 2) % 13, 12, 3, 1); return c; });
  t[T.CAVE] = [cave];
  t[T.CACTUS] = [paint(CACTUS, { o: '#205020', g: '#48a048' }, sand)];
  t[T.MUD] = [speckle('#5a7a4a', ['#486838', '#6a8a58'], 50, 8, true)];
  t[T.BUILD] = t[T.PATH];
  const hill = speckle('#9ac070', ['#7aa058', '#b0d088'], 60, 10, true), dead = speckle('#6a6878', ['#585668', '#7a7888'], 61, 12, true);
  t[T.HILL] = [hill];
  t[T.ICE] = [(() => { const c = speckle('#b8e0f8', ['#d8f0ff', '#a0d0f0'], 62, 10); const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(3, 4, 5, 1); g.fillRect(9, 11, 4, 1); return c; })()];
  t[T.PAVE] = [speckle('#b8b8c0', ['#a8a8b0', '#c8c8d0'], 63, 10)];
  t[T.HOUSE] = ['#5878c8', '#c86848', '#58a868', '#a858a8'].map(roof => paint(HOUSE, { o: '#383838', r: roof, d: '#202020', w: '#f8f8f0', b: '#88c0f8' }));
  t[T.DEADGRASS] = [dead];
  t[T.GRAVE] = [paint(GRAVE, { o: '#383848', s: '#a8a8b8', d: '#787888' }, dead)];
  t[T.DEADTREE] = [paint(TREE, { o: '#201828', h: '#685878', g: '#483858', s: '#382848', t: '#4a3a2a' }, dead)];
  t[T.PALM] = [paint(PALM, { o: '#205020', g: '#48a048', h: '#78d058', t: '#a07040' }, sand)];
}
const HOUSE = [
  'oooooooooooooooo', 'orrrrrrrrrrrrrro', 'orrrrrrrrrrrrrro', 'orrrrrrrrrrrrrro', 'oooooooooooooooo', 'owwwwwwwwwwwwwwo', 'owbbwwwwwwwwbbwo', 'owbbwwwwwwwwbbwo',
  'owwwwwwwwwwwwwwo', 'owwwwwwddwwwwwwo', 'owbbwwwddwwwbbwo', 'owbbwwwddwwwbbwo', 'owwwwwwddwwwwwwo', 'oooooooooooooooo', '................', '................',
];
const GRAVE = [
  '................', '................', '.....oooooo.....', '....osssssso....', '...osssssssso...', '...ossdsdssso...', '...osssdsssso...', '...ossdsdssso...',
  '...osssssssso...', '...osssssssso...', '...osssssssso...', '..oooooooooooo..', '..odddddddddddo.', '..oooooooooooo..', '................', '................',
];
const PALM = [
  '..oo........oo..', '.ogho.oooo.ohgo.', '..oggoggggoggo..', '...oggghhgggo...', '..ogg.ottto.ggo.', '.og...ottto...go', '......ottto.....', '......ottto.....',
  '......ottto.....', '.....ottto......', '.....ottto......', '.....ottto......', '....otttto......', '...ootttttoo....', '................', '................',
];

// FireRed-style Pokémon Center drawn once, 4x3 tiles.
function makeCenter() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48;
  const g = c.getContext('2d'), R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R('#383838', 0, 4, 64, 44); R('#e84038', 1, 5, 62, 18); for (let y = 7; y < 22; y += 4) R('#c02820', 1, y, 62, 1);
  R('#f8f8f8', 2, 23, 60, 23); R('#c8c8d0', 2, 44, 60, 2);
  R('#5890f8', 6, 27, 12, 8); R('#5890f8', 46, 27, 12, 8); R('#383838', 26, 30, 12, 16); R('#a8d0f8', 27, 31, 10, 15);
  R('#f8f8f8', 26, 9, 12, 10); R('#e84038', 29, 10, 6, 8); R('#e84038', 27, 12, 10, 4);
  return c;
}

// Gym: grey walls with a roof in the leader's type colour and a Poké Ball emblem; the league uses purple and gold.
function makeGym(roof, emblem) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48;
  const g = c.getContext('2d'), R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R('#383838', 0, 2, 64, 46); R(roof, 1, 3, 62, 16); for (let x = 4; x < 62; x += 6) R('rgba(0,0,0,0.18)', x, 3, 2, 16);
  R('#a8a8b8', 2, 19, 60, 27); R('#888898', 2, 44, 60, 2);
  R('#5890f8', 6, 24, 10, 7); R('#5890f8', 48, 24, 10, 7); R('#383838', 25, 28, 14, 18); R('#d8d8e8', 26, 29, 12, 17);
  g.fillStyle = emblem; g.beginPath(); g.arc(32, 11, 6, 0, 7); g.fill();
  g.strokeStyle = '#383838'; g.lineWidth = 1.5; g.beginPath(); g.arc(32, 11, 6, 0, 7); g.moveTo(26, 11); g.lineTo(38, 11); g.stroke();
  return c;
}

const MINI = { [T.GRASS]: '#88d070', [T.TALL]: '#58a848', [T.TREE]: '#306830', [T.WATER]: '#5098f8', [T.SAND]: '#f0dca0', [T.FLOWER]: '#88d070', [T.PATH]: '#e0c890',
  [T.ASH]: '#5a4a48', [T.LAVA]: '#e85020', [T.ROCK]: '#787068', [T.SNOW]: '#f0f8f8', [T.SNOWTREE]: '#98b0c8', [T.SWAMP]: '#506848', [T.CAVE]: '#4a4038',
  [T.CACTUS]: '#48a048', [T.MUD]: '#5a7a4a', [T.BUILD]: '#e84038',
  [T.HILL]: '#9ac070', [T.ICE]: '#b8e0f8', [T.PAVE]: '#b8b8c0', [T.HOUSE]: '#7878a8', [T.GRAVE]: '#a8a8b8', [T.DEADGRASS]: '#6a6878', [T.DEADTREE]: '#483858', [T.PALM]: '#48a048' };

function star(g, x, y, r1, r2, n, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

function zigzag(g, x1, y1, x2, y2, jag, segs = 7) {
  g.beginPath(); g.moveTo(x1, y1);
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i < segs; i++) {
    const k = i / segs, o = (Math.random() - 0.5) * jag * 2;
    g.lineTo(x1 + dx * k + nx * o, y1 + dy * k + ny * o);
  }
  g.lineTo(x2, y2);
}

export class Renderer {
  constructor(canvas, mini, data) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.mini = mini; this.d = data;
    this.tiles = makeTiles(); makeBiomeTiles(this.tiles); this.center = makeCenter(); this.imgs = new Map(); this.boxes = new Map();
    this.tails = new Map(); this.shakes = new Map(); this.towns = []; this.gyms = new Map();
    this.leagueArt = makeGym('#7838c8', '#f8d030');
    this.fx = []; this.parts = []; this.ent = new Map(); this.anim = new Map(); this.hurt = new Map(); this.trails = new Map();
    this.cam = { x: 0, y: 0, z: 1 }; this.shake = 0;
    this.opts = { particles: 'high', shake: true, names: true };
    this.night = document.createElement('canvas');
    this.drops = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 })); this.last = performance.now() / 1000;
    this.items = Object.fromEntries(ITEMS.map(k => [k, this.img(`/items/${k}.png`)]));
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  gymArt(type) {
    if (!this.gyms.has(type)) this.gyms.set(type, makeGym(TYPE_COLORS[type] || '#888888', '#f8f8f8'));
    return this.gyms.get(type);
  }

  // Whole-world overview for the world map; the corner minimap is redrawn locally from real chunks.
  setMap(world) {
    this.world = world; this.towns = world.towns; this.miniAt = -1e9;
    const ov = world.overview(), c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = c.height = ov.n;
    const img = g.createImageData(ov.n, ov.n);
    ov.tiles.forEach((t, i) => { const n = parseInt(MINI[t].slice(1), 16); img.data.set([n >> 16, n >> 8 & 255, n & 255, 255], i * 4); });
    g.putImageData(img, 0, 0);
    this.miniBg = c;
    this.localMini = document.createElement('canvas');
  }

  // Local minimap: 360×360 tiles around the camera, sampled every 3 tiles.
  refreshLocalMini() {
    const W = 120, STEP = 3, c = this.localMini, g = c.getContext('2d');
    if (c.width !== W) c.width = c.height = W;
    const img = g.createImageData(W, W), cx = (this.cam.x / TILE | 0) - W * STEP / 2, cy = (this.cam.y / TILE | 0) - W * STEP / 2;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const n = parseInt(MINI[this.world.tile(cx + x * STEP, cy + y * STEP)].slice(1), 16);
      img.data.set([n >> 16, n >> 8 & 255, n & 255, 255], (y * W + x) * 4);
    }
    g.putImageData(img, 0, 0);
    this.localOrigin = [cx * TILE, cy * TILE, W * STEP * TILE];
  }

  resize() {
    this.dpr = devicePixelRatio || 1;
    this.W = innerWidth; this.H = innerHeight;
    this.c.width = this.W * this.dpr; this.c.height = this.H * this.dpr;
  }

  img(src) {
    let i = this.imgs.get(src);
    if (!i) { i = new Image(); i.src = src; this.imgs.set(src, i); }
    return i;
  }

  // Sprite sheets from different generations pad differently; crop to the opaque box so sizes compare fairly.
  box(img) {
    let b = this.boxes.get(img);
    if (b) return b;
    const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    b = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w, h };
    this.boxes.set(img, b);
    return b;
  }

  sprite(form, shiny, back) {
    const p = this.d.pokemon[form];
    if (!p) return null;
    const id = p.img ? p.id : p.imgOf ?? this.d.pokemon[this.d.species[p.sp].base].id;
    if (back && p.bk) return this.img(shiny && p.bks ? `/sprites/back/shiny/${p.id}.png` : `/sprites/back/${p.id}.png`);
    return this.img(shiny ? `/sprites/shiny/${id}.png` : `/sprites/${id}.png`);
  }

  label(p) {
    const n = this.d.species[p.sp]?.n || p.sp;
    return p.b ? `★ ${n}` : p.w ? n : `${p.n}`;
  }

  screenToWorld(sx, sy) { return [this.cam.x + (sx - this.W / 2) / this.cam.z, this.cam.y + (sy - this.H / 2) / this.cam.z]; }

  emit(x, y, n, col, o = {}) {
    const now = performance.now() / 1000;
    if (this.opts.particles === 'low') n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * Math.PI * 2, s = (o.spd ?? 120) * (0.4 + Math.random() * 0.8);
      this.parts.push({ x: x + (Math.random() - 0.5) * (o.jit ?? 0), y: y + (Math.random() - 0.5) * (o.jit ?? 0), vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up ?? 0),
        t0: now, life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.6), col: Array.isArray(col) ? col[Math.random() * col.length | 0] : col, size: o.size ?? 4, g: o.grav ?? 0, sh: o.shape });
    }
  }

  addFx(f, players, meId) {
    const p = f.id !== undefined && players.get(f.id), now = performance.now() / 1000, col = TYPE_COLORS[f.t] || '#fff', mp = players.get(meId);
    if (f.x === undefined && p) { f.x = p.x; f.y = p.y - p.r; }
    const nearMe = mp && f.x !== undefined && Math.hypot(f.x - mp.x, f.y - mp.y) < 700;
    if (p && ATTACKS.has(f.k)) this.anim.set(f.id, { t0: now, a: f.a ?? p.fa, k: f.k });
    if (f.k === 'dmg') {
      this.hurt.set(f.id, now);
      if (f.v > 0) this.emit(f.x, f.y + 10, f.e > 1 || f.c ? 14 : 7, ['#fff', '#f8f8a0', '#f8a040'], { spd: 220, life: 0.35, size: 3 });
      if (f.id === meId && f.v > 0) this.shake = Math.max(this.shake, Math.min(12, 3 + f.v / (mp?.mh || 50) * 30));
    } else if (f.k === 'quake' || f.k === 'boom') {
      if (nearMe) this.shake = Math.max(this.shake, f.k === 'quake' ? 10 : 7);
      this.emit(f.x, f.y, 26, [col, LIGHT[f.t] || '#fff', '#806040'], { spd: 260, life: 0.6, size: 5, grav: 300 });
    } else if (f.k === 'beam') {
      const ex = f.x + Math.cos(f.a) * f.l, ey = f.y + Math.sin(f.a) * f.l;
      this.emit(ex, ey, 16, [col, LIGHT[f.t]], { spd: 200, life: 0.4 });
    } else if (f.k === 'aoe') this.emit(f.x, f.y, 30, [col, LIGHT[f.t]], { spd: f.r * 2.2, life: 0.45, size: 5 });
    else if (f.k === 'self') this.emit(f.x, f.y + 10, 18, [col, LIGHT[f.t]], { spd: 40, up: 140, life: 0.8, jit: 50, size: 4, shape: this.d.moves[f.mv]?.hl > 0 ? 'plus' : null });
    else if (f.k === 'roll' && p) this.emit(p.x, p.y + p.r * 0.7, 10, ['rgba(255,255,255,0.8)', 'rgba(200,180,140,0.8)'], { dir: f.a + Math.PI, spread: 1.2, spd: 120, life: 0.4, size: p.r * 0.2 });
    else if (f.k === 'rustle') this.emit(f.x, f.y, 4, ['#58b848', '#88d860', '#306830'], { spd: 70, up: 50, life: 0.45, size: 3 });
    else if (f.k === 'splash') this.emit(f.x, f.y, 4, ['#a8d0f8', '#ffffff'], { spd: 70, up: 60, life: 0.4, size: 3, grav: 200 });
    else if (f.k === 'shake') { this.shakes.set(f.ty * MAP + f.tx, now); this.emit(f.x, f.y - 10, 6, ['#409040', '#70c060'], { spd: 50, up: 30, life: 0.6, size: 3, grav: 120 }); }
    else if (f.k === 'catch' || f.k === 'raid') this.emit(f.x ?? p?.x, (f.y ?? p?.y) - 10, 30, ['#f8e030', '#ffffff', '#f85858'], { spd: 180, up: 60, life: 1, size: 4, shape: 'star' });
    else if (f.k === 'free') this.emit(f.x, f.y, 16, ['#ffffff', '#e83030'], { spd: 200, life: 0.4, size: 4 });
    else if (f.k === 'pop') this.emit(f.x, f.y, 10, [col, LIGHT[f.t]], { spd: 160, life: 0.3 });
    else if (f.k === 'ko') this.emit(f.x, f.y, 30, ['#fff', '#e0e0e0', '#c0c0c0'], { spd: 120, up: 40, life: 0.9, size: 7 });
    else if (f.k === 'evo' || f.k === 'form' || f.k === 'lvl') this.emit(f.x, f.y + 20, f.k === 'lvl' ? 12 : 40, f.k === 'form' ? ['#f85888', '#f8d030', '#58c8f8', '#78c850'] : ['#fff', '#f8f0a0'], { spd: 160, up: 60, life: 1, size: 4, shape: 'star' });
    if (LIFE[f.k] && f.x !== undefined) this.fx.push({ ...f, t0: now, life: LIFE[f.k] });
  }

  draw(snap, me, orbs, touch, input) {
    const { g, W, H, dpr } = this, now = performance.now() / 1000, dt = Math.min(0.1, now - this.last);
    this.last = now;
    let mp = snap.p.find(p => p.id === me?.id);
    if (mp?.d && me?.spec) mp = snap.p.find(p => p.id === me.spec) || mp;
    if (mp) {
      const z = Math.max(0.42, Math.min(1.3, 1.35 - (mp.r - 18) / 80)) * Math.min(1.2, Math.max(0.65, Math.min(W, H) / 800));
      if (!this.camInit) { this.cam.x = mp.x; this.cam.y = mp.y; this.cam.z = z; this.camInit = true; }
      this.cam.x += (mp.x - this.cam.x) * 0.25; this.cam.y += (mp.y - this.cam.y) * 0.25; this.cam.z += (z - this.cam.z) * 0.05;
    }
    this.shake = this.opts.shake ? this.shake * Math.max(0, 1 - dt * 8) : 0;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    const { x: cx, y: cy, z } = this.cam;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#306830'; g.fillRect(0, 0, W, H);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cx * z + sx), dpr * (H / 2 - cy * z + sy));

    const x0 = Math.max(0, Math.floor((cx - W / 2 / z) / TILE)), x1 = Math.min(MAP - 1, Math.ceil((cx + W / 2 / z) / TILE));
    const y0 = Math.max(0, Math.floor((cy - H / 2 / z) / TILE)), y1 = Math.min(MAP - 1, Math.ceil((cy + H / 2 / z) / TILE));
    const wf = Math.floor(now * 1.5) % 2;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = this.world.tile(tx, ty), v = this.tiles[t];
      const anim = t === T.WATER || t === T.LAVA || t === T.SWAMP;
      const img = anim ? v[(wf + tx + ty) % 2] : v[((tx * 73856093) ^ (ty * 19349663)) >>> 0 & (v.length - 1)] || v[0];
      const sh = TREES.has(t) && this.shakes.get(ty * MAP + tx);
      const off = sh && now - sh < 0.5 ? Math.sin((now - sh) * 50) * 3 * (1 - (now - sh) * 2) : 0;
      if (off) g.drawImage(this.tiles[T.GRASS][0], tx * TILE, ty * TILE, TILE + 0.5, TILE + 0.5);
      g.drawImage(img, tx * TILE + off, ty * TILE, TILE + 0.5, TILE + 0.5);
    }

    const vis = (x, y, pad = 60) => Math.abs(x - cx) < W / 2 / z + pad && Math.abs(y - cy) < H / 2 / z + pad;
    for (const t of this.towns) {
      if (!vis(t.x, t.y, 200)) continue;
      const art = t.league ? this.leagueArt : t.gyms.length ? this.gymArt(REGIONS[t.region].gyms[t.gyms[0]][1]) : this.center;
      g.drawImage(art, (t.tx - 2) * TILE, (t.ty - 3) * TILE - 16, 4 * TILE, 3 * TILE + 16);
      g.font = `${10 / z}px ${FONT}`; g.textAlign = 'center'; g.lineWidth = 4 / z; g.strokeStyle = '#202020'; g.fillStyle = '#f8f8a0';
      g.strokeText(t.n, t.x, (t.ty - 3) * TILE - 24); g.fillText(t.n, t.x, (t.ty - 3) * TILE - 24); g.textAlign = 'left';
      g.globalAlpha = 0.12 + Math.sin(now * 2) * 0.05; g.fillStyle = '#f8a0c0'; g.beginPath(); g.arc(t.x, t.y, 170, 0, 7); g.fill(); g.globalAlpha = 1;
    }
    for (const zn of snap.z || []) if (vis(zn.x, zn.y, 120)) this.drawZone(zn, now);
    for (const o of orbs.values()) if (vis(o.x, o.y)) this.drawOrb(o, now);

    const seen = new Set();
    for (const b of snap.pr) {
      seen.add(b.id);
      const tr = this.trails.get(b.id) || [];
      tr.push([b.x, b.y]);
      if (tr.length > 7) tr.shift();
      this.trails.set(b.id, tr);
      if (vis(b.x, b.y)) this.drawProj(b, tr, now);
    }
    for (const id of this.trails.keys()) if (!seen.has(id)) this.trails.delete(id);

    const list = snap.p.filter(p => !p.d && vis(p.x, p.y, 400)).sort((a, b) => a.y - b.y);
    for (const p of list) this.drawTail(p, now);
    for (const p of list) this.drawPoke(p, p.id === me?.id, now, dt);
    if (snap.br) this.drawZone2(snap.br, cx, cy, z, now);

    this.drawFx(now);
    this.drawParts(now, dt);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = { Cave: 'rgba(0,0,0,0.85)', 'Haunted Grounds': 'rgba(30,10,50,0.7)' }[BIOMES[me?.biome]?.n];
    if (dark) {
      const grd = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, Math.max(W, H) * 0.6);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, dark);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
    this.drawSky(snap, me, mp, now, dt);
    if (input && mp && !mp.d) this.drawAim(input, snap, now);
    if (touch?.active) {
      g.globalAlpha = 0.35; g.fillStyle = '#fff';
      g.beginPath(); g.arc(touch.ox, touch.oy, 55, 0, 7); g.fill();
      g.globalAlpha = 0.7; g.beginPath(); g.arc(touch.ox + touch.dx * 50, touch.oy + touch.dy * 50, 24, 0, 7); g.fill();
      g.globalAlpha = 1;
    }
    this.drawMini(snap, me);
  }

  // Night darkens everything except pools of light around Pokémon; dusk and dawn tint warm. Weather is drawn over the top.
  drawSky(snap, me, mp, now, dt) {
    const g = this.g, { W, H } = this, day = snap.day ?? 1, dark = Math.max(0, 0.62 - day * 1.1);
    if (dark > 0.01) {
      const n = this.night, ng = n.getContext('2d');
      if (n.width !== W || n.height !== H) { n.width = W; n.height = H; }
      ng.globalCompositeOperation = 'source-over';
      ng.clearRect(0, 0, W, H);
      ng.fillStyle = `rgba(10,14,48,${dark})`; ng.fillRect(0, 0, W, H);
      ng.globalCompositeOperation = 'destination-out';
      const { x: cx, y: cy, z } = this.cam;
      const light = (wx, wy, r, a = 1) => {
        const sx = (wx - cx) * z + W / 2, sy = (wy - cy) * z + H / 2, R = r * z;
        if (sx < -R || sy < -R || sx > W + R || sy > H + R) return;
        const grd = ng.createRadialGradient(sx, sy, 0, sx, sy, R);
        grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
        ng.fillStyle = grd; ng.fillRect(sx - R, sy - R, R * 2, R * 2);
      };
      for (const p of snap.p) if (!p.d) light(p.x, p.y, p.id === me?.id ? 300 : 130 + p.r * 2, p.id === me?.id ? 1 : 0.7);
      for (const t of this.towns) light(t.x, t.y, 260, 0.9);
      for (const b of snap.pr) light(b.x, b.y, 70, 0.8);
      g.drawImage(n, 0, 0);
    } else if (day < 0.5) {
      g.fillStyle = `rgba(248,140,60,${(0.5 - day) * 0.25})`; g.fillRect(0, 0, W, H);
    }
    const sky = mp && snap.sky?.[me?.region];
    if (!sky || sky === 'clear') return;
    const many = this.opts.particles === 'low' ? 50 : this.drops.length;
    if (sky === 'rain' || sky === 'snow' || sky === 'sand') {
      g.strokeStyle = sky === 'rain' ? 'rgba(170,200,255,0.55)' : sky === 'sand' ? 'rgba(220,190,120,0.5)' : 'rgba(255,255,255,0.85)';
      g.fillStyle = g.strokeStyle; g.lineWidth = 1.5;
      for (let i = 0; i < many; i++) {
        const d = this.drops[i];
        if (sky === 'rain') { d.y += dt * 1.6 * d.s; d.x += dt * 0.15; }
        else if (sky === 'snow') { d.y += dt * 0.18 * d.s; d.x += Math.sin(now + i) * dt * 0.03; }
        else { d.x += dt * 1.2 * d.s; d.y += dt * 0.05; }
        d.x = (d.x + 1) % 1; d.y = (d.y + 1) % 1;
        const x = d.x * W, y = d.y * H;
        if (sky === 'snow') { g.beginPath(); g.arc(x, y, 2 * d.s, 0, 7); g.fill(); }
        else { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (sky === 'rain' ? 4 : 18), y + (sky === 'rain' ? 16 : 2)); g.stroke(); }
      }
      if (sky === 'sand') { g.fillStyle = 'rgba(210,170,100,0.18)'; g.fillRect(0, 0, W, H); }
      if (sky === 'rain') { g.fillStyle = 'rgba(40,60,110,0.12)'; g.fillRect(0, 0, W, H); }
    } else if (sky === 'fog') {
      g.fillStyle = `rgba(220,225,235,${0.28 + Math.sin(now * 0.5) * 0.05})`; g.fillRect(0, 0, W, H);
    } else if (sky === 'sun') {
      const grd = g.createRadialGradient(W * 0.85, -40, 10, W * 0.85, -40, W * 0.7);
      grd.addColorStop(0, 'rgba(255,240,170,0.45)'); grd.addColorStop(1, 'rgba(255,240,170,0)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
  }

  drawZone2(br, cx, cy, z, now) {
    const g = this.g, W = this.W / z, H = this.H / z;
    g.fillStyle = 'rgba(110,30,160,0.3)';
    g.beginPath(); g.rect(cx - W, cy - H, W * 2, H * 2); g.arc(br.x, br.y, br.r, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = '#c060ff'; g.lineWidth = 6; g.beginPath(); g.arc(br.x, br.y, br.r, 0, 7); g.stroke();
    if (br.tr < br.r) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.setLineDash([18, 12]); g.lineDashOffset = -now * 40; g.beginPath(); g.arc(br.tx, br.ty, br.tr, 0, 7); g.stroke(); g.setLineDash([]); }
  }

  // Slither-style tail: each benched party Pokémon walks in the leader's footsteps.
  drawTail(p, now) {
    let tail = this.tails.get(p.id);
    if (!tail) { tail = []; this.tails.set(p.id, tail); }
    const last = tail[tail.length - 1];
    if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 14) { tail.push([p.x, p.y]); if (tail.length > 40) tail.shift(); }
    if (!p.pf) return;
    const g = this.g;
    p.pf.forEach(([form, sh, fainted], i) => {
      const k = tail.length - 1 - (i + 1) * 3;
      if (k < 0) return;
      const [x, y] = tail[k], [nx] = tail[Math.min(tail.length - 1, k + 1)];
      const img = this.sprite(form, sh), pk = this.d.pokemon[form];
      if (!img?.complete || !img.naturalWidth || !pk) return;
      const r = bodySize(pk.h, 20) * 0.8, bx = this.box(img), s = (r * 2.6) / Math.max(bx.w, bx.h), bob = Math.abs(Math.sin(now * 10 + i * 2)) * -3;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x, y + r * 0.8, r * 0.8, r * 0.3, 0, 0, 7); g.fill();
      g.save(); g.translate(x, y + r * 0.85 + bob);
      if (nx > x) g.scale(-1, 1);
      g.globalAlpha = fainted ? 0.35 : 0.95;
      if (fainted) g.filter = 'grayscale(1)';
      g.drawImage(img, bx.x, bx.y, bx.w, bx.h, -bx.w * s / 2, -bx.h * s, bx.w * s, bx.h * s);
      g.restore();
    });
  }

  drawBall(x, y, r, rot) {
    const g = this.g;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = '#e83030'; g.beginPath(); g.arc(0, 0, r, Math.PI, 0); g.fill();
    g.fillStyle = '#f8f8f8'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI); g.fill();
    g.strokeStyle = '#202020'; g.lineWidth = r * 0.22; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke();
    g.fillStyle = '#f8f8f8'; g.beginPath(); g.arc(0, 0, r * 0.3, 0, 7); g.fill(); g.stroke();
    g.restore();
  }

  drawOrb(o, now) {
    const g = this.g, bob = Math.sin(now * 4 + o.id) * 2;
    if (o.k === 'e' || o.k === 'x') {
      const r = o.k === 'e' ? 4 : Math.min(12, 4 + Math.log10(o.v + 1) * 1.6);
      g.fillStyle = o.k === 'e' ? 'rgba(248,232,120,0.35)' : 'rgba(120,200,248,0.4)';
      g.beginPath(); g.arc(o.x, o.y + bob, r * 1.9, 0, 7); g.fill();
      g.fillStyle = o.k === 'e' ? '#f8f0a0' : '#c0e8ff';
      g.beginPath(); g.arc(o.x, o.y + bob, r, 0, 7); g.fill();
      return;
    }
    const im = this.items[o.k];
    g.fillStyle = o.k === 'mega' ? `hsla(${now * 200 % 360},90%,60%,0.45)` : o.k === 'dmax' ? 'rgba(248,64,96,0.45)' : 'rgba(255,255,255,0.4)';
    g.beginPath(); g.arc(o.x, o.y + bob, 15, 0, 7); g.fill();
    if (im?.complete && im.naturalWidth) g.drawImage(im, o.x - 14, o.y - 14 + bob, 28, 28);
  }

  drawZone(zn, now) {
    const g = this.g, col = TYPE_COLORS[zn.t] || '#fff';
    g.globalAlpha = 0.2; g.fillStyle = col;
    g.beginPath(); g.arc(zn.x, zn.y, zn.r, 0, 7); g.fill();
    g.globalAlpha = 0.7; g.strokeStyle = col; g.lineWidth = 3;
    g.setLineDash([10, 8]); g.lineDashOffset = -now * 30;
    g.beginPath(); g.arc(zn.x, zn.y, zn.r, 0, 7); g.stroke();
    g.setLineDash([]);
    g.fillStyle = LIGHT[zn.t] || '#fff';
    const r = rng(zn.id);
    for (let i = 0; i < 9; i++) {
      const a = r() * 7, d = r() * zn.r * 0.85, x = zn.x + Math.cos(a) * d, y = zn.y + Math.sin(a) * d;
      if (/spikes|stealth|debris/.test(zn.mv)) { g.fillStyle = col; star(g, x, y, 7, 3, 3, r() * 7); g.fill(); }
      else { g.globalAlpha = 0.5 + Math.sin(now * 5 + i) * 0.3; g.beginPath(); g.arc(x, y - (now * 30 + i * 10) % 20, 4, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
  }

  drawProj(b, tr, now) {
    if (b.ball) return this.drawBall(b.x, b.y, 9, now * 15);
    const g = this.g, t = b.t, col = TYPE_COLORS[t] || '#fff', lt = LIGHT[t] || '#fff', r = b.r;
    tr.forEach(([x, y], i) => { g.globalAlpha = (i / tr.length) * 0.35; g.fillStyle = col; g.beginPath(); g.arc(x, y, r * (0.4 + i / tr.length * 0.6), 0, 7); g.fill(); });
    g.globalAlpha = 0.3; g.fillStyle = col; g.beginPath(); g.arc(b.x, b.y, r * 1.8, 0, 7); g.fill();
    g.globalAlpha = 1;
    g.save(); g.translate(b.x, b.y);
    const spin = now * 10 + b.id;
    if (t === 'fire') {
      for (const [k, c] of [[1.25, '#e83018'], [0.9, '#f8a030'], [0.5, '#f8f8a0']]) { g.fillStyle = c; g.beginPath(); g.arc((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, r * k, 0, 7); g.fill(); }
      if (Math.random() < 0.5) this.emit(b.x, b.y, 1, ['#f8a030', '#e83018'], { spd: 30, up: 40, life: 0.3, size: 3 });
    } else if (t === 'water') {
      g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = lt; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-r * 0.35, -r * 0.35, r * 0.3, 0, 7); g.fill();
    } else if (t === 'electric') {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, r * 0.6, 0, 7); g.fill();
      g.strokeStyle = col; g.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) { const a = Math.random() * 7; zigzag(g, 0, 0, Math.cos(a) * r * 2, Math.sin(a) * r * 2, r * 0.4, 3); g.stroke(); }
    } else if (t === 'grass' || t === 'bug') {
      g.rotate(spin);
      g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, r * 1.3, r * 0.55, 0, 0, 7); g.fill();
      g.strokeStyle = t === 'grass' ? '#2c7c2c' : '#607010'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-r * 1.2, 0); g.lineTo(r * 1.2, 0); g.stroke();
    } else if (t === 'ice' || t === 'steel') {
      g.rotate(t === 'ice' ? b.a : spin);
      g.fillStyle = lt; g.strokeStyle = t === 'ice' ? '#68b8d8' : '#8888a0'; g.lineWidth = 2;
      star(g, 0, 0, r * 1.4, r * 0.45, t === 'ice' ? 2 : 4); g.fill(); g.stroke();
    } else if (t === 'rock' || t === 'ground') {
      g.rotate(spin * 0.6);
      g.fillStyle = col; g.strokeStyle = '#584020'; g.lineWidth = 2;
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.047, k = 0.75 + ((i * 37 + b.id) % 5) / 10; g.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k); } g.closePath(); g.fill(); g.stroke();
    } else if (t === 'poison') {
      g.fillStyle = col; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = i * 0.628, k = r * (1 + Math.sin(now * 12 + i * 2) * 0.15); g.lineTo(Math.cos(a) * k, Math.sin(a) * k); }
      g.closePath(); g.fill();
      g.fillStyle = lt; g.beginPath(); g.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, 7); g.fill();
    } else if (t === 'psychic' || t === 'fairy' && /voice|wind/.test(b.mv)) {
      g.strokeStyle = col; g.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) { g.globalAlpha = 1 - i * 0.3; g.beginPath(); g.arc(0, 0, r * (0.5 + ((now * 3 + i / 3) % 1) * 0.9), 0, 7); g.stroke(); }
      g.globalAlpha = 1;
    } else if (t === 'ghost' || t === 'dark') {
      g.fillStyle = t === 'ghost' ? '#382850' : '#282020'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = t === 'ghost' ? '#a080d0' : '#806860'; g.lineWidth = 2.5; g.stroke();
      if (t === 'dark') { g.rotate(b.a); g.strokeStyle = '#f8f8f8'; g.lineWidth = 2; g.beginPath(); g.arc(-r * 0.3, 0, r * 0.9, -1, 1); g.stroke(); }
    } else if (t === 'dragon') {
      g.rotate(spin);
      g.strokeStyle = col; g.lineWidth = 3;
      for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(0, 0, r, i * Math.PI, i * Math.PI + 2); g.stroke(); }
      g.fillStyle = lt; g.beginPath(); g.arc(0, 0, r * 0.5, 0, 7); g.fill();
    } else if (t === 'fairy') {
      g.rotate(spin * 0.5); g.fillStyle = col; star(g, 0, 0, r * 1.3, r * 0.55, 5); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, r * 0.3, 0, 7); g.fill();
    } else if (t === 'flying') {
      g.rotate(b.a); g.strokeStyle = '#fff'; g.lineWidth = 3;
      for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(-i * r * 0.6, 0, r * 1.1, -1.1, 1.1); g.stroke(); }
    } else {
      const blue = /aura|focus/.test(b.mv);
      g.rotate(spin * 0.4); g.fillStyle = blue ? '#5890f8' : col; star(g, 0, 0, r * 1.2, r * 0.6, 6); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, r * 0.4, 0, 7); g.fill();
    }
    g.restore();
  }

  drawPoke(p, isMe, now, dt) {
    const g = this.g, z = this.cam.z;
    if (p.cb) return this.drawBall(p.x, p.y + p.r * 0.5, 12, Math.sin(now * 25) * 0.5);
    if (p.wt && Math.random() < 0.3) this.emit(p.x + (Math.random() - 0.5) * p.r * 2, p.y - p.r, 1, '#a8d0f8', { dir: Math.PI / 2, spread: 0.3, spd: 60, life: 0.5, size: 3 });
    let e = this.ent.get(p.id);
    if (!e) { e = { ph: 0, lx: p.x, ly: p.y, dust: 0 }; this.ent.set(p.id, e); }
    const moved = Math.hypot(p.x - e.lx, p.y - e.ly);
    e.lx = p.x; e.ly = p.y;
    if (p.mv && moved < 60) {
      e.ph += moved / Math.max(8, p.r * 0.55);
      e.dust += moved;
      if (e.dust > p.r * 1.4) { e.dust = 0; this.emit(p.x, p.y + p.r * 0.8, 2, ['rgba(255,255,255,0.7)', 'rgba(200,180,140,0.7)'], { spd: 25, up: 20, life: 0.4, size: p.r * 0.18 }); }
    } else e.ph += (Math.round(e.ph / Math.PI) * Math.PI - e.ph) * Math.min(1, dt * 10);

    const back = Math.sin(p.fa) < -0.4;
    const img = this.sprite(p.f, p.sh, back);
    const s = Math.sin(e.ph), step = Math.abs(s);
    let ox = 0, oy = -step * p.r * 0.2, sc = 1;
    let sxk = 1 + step * 0.05, syk = 1 - step * 0.06 + (p.mv ? 0 : Math.sin(now * 3 + p.id) * 0.025);
    const an = this.anim.get(p.id);
    if (an) {
      const k = (now - an.t0) / 0.25;
      if (k > 1) this.anim.delete(p.id);
      else {
        const pulse = Math.sin(Math.PI * k);
        if (an.k === 'melee') { ox += Math.cos(an.a) * pulse * p.r * 0.5; oy += Math.sin(an.a) * pulse * p.r * 0.5; }
        else { ox -= Math.cos(an.a) * pulse * p.r * 0.15; oy -= Math.sin(an.a) * pulse * p.r * 0.15; sc += pulse * 0.1; }
      }
    }
    const hk = now - (this.hurt.get(p.id) ?? -9);
    if (hk < 0.2) { ox += (Math.random() - 0.5) * 6; oy += (Math.random() - 0.5) * 4; }

    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(p.x, p.y + p.r * 0.8, p.r * 0.95 * (1 - step * 0.1), p.r * 0.35, 0, 0, 7); g.fill();
    if (p.tm || p.b || p.wx) {
      const grd = g.createRadialGradient(p.x, p.y, p.r * 0.3, p.x, p.y, p.r * 1.8);
      const col = p.tm === 'mega' ? `hsla(${now * 180 % 360},100%,65%,` : p.tm === 'gmax' ? 'rgba(248,40,90,' : p.b ? 'rgba(168,96,248,' : `rgba(${this.rgb(TYPE_COLORS[p.wx])},`;
      grd.addColorStop(0, col + (p.wx && !p.tm && !p.b ? '0.3)' : '0.55)')); grd.addColorStop(1, col + '0)');
      g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, p.r * 1.8, 0, 7); g.fill();
      if (p.wx === 'water' && Math.random() < 0.4) this.emit(p.x + (Math.random() - 0.5) * p.r * 3, p.y - p.r * 2, 1, '#a8d0f8', { dir: Math.PI / 2, spread: 0.1, spd: 300, life: 0.3, size: 2 });
      if (p.wx === 'ice' && Math.random() < 0.3) this.emit(p.x + (Math.random() - 0.5) * p.r * 3, p.y - p.r * 2, 1, '#fff', { dir: Math.PI / 2, spread: 0.6, spd: 60, life: 0.9, size: 3 });
      if (p.wx === 'rock' && Math.random() < 0.4) this.emit(p.x - p.r * 2, p.y + (Math.random() - 0.5) * p.r * 2, 1, '#d8c088', { dir: 0, spread: 0.3, spd: 260, life: 0.5, size: 2 });
    }
    if (isMe) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2 / z; g.beginPath(); g.ellipse(p.x, p.y + p.r * 0.8, p.r, p.r * 0.38, 0, 0, 7); g.stroke(); }

    if (img?.complete && img.naturalWidth) {
      const bx = this.box(img), k = (p.r * 2.7 * sc) / Math.max(bx.w, bx.h), w = bx.w * k, h = bx.h * k;
      g.save();
      g.translate(p.x + ox, p.y + p.r * 0.85 + oy);
      if (p.rl) { g.translate(0, -h / 2); g.rotate(now * 22 * (Math.cos(p.fa) > 0 ? 1 : -1)); g.translate(0, h / 2); }
      else g.rotate(s * 0.07);
      const faceRight = Math.cos(p.fa) > 0;
      g.scale((back ? !faceRight : faceRight) ? -sxk : sxk, syk);
      if (p.pt) g.globalAlpha = 0.45 + Math.sin(now * 20) * 0.25;
      if (p.rl) g.globalAlpha = 0.65;
      if (p.fl || hk < 0.08) g.filter = 'brightness(3)';
      g.drawImage(img, bx.x, bx.y, bx.w, bx.h, -w / 2, -h, w, h);
      g.restore();
    } else {
      g.fillStyle = TYPE_COLORS[this.d.pokemon[p.f]?.t[0]] || '#aaa';
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    const ft = this.world?.tile(p.x / TILE | 0, (p.y + p.r * 0.7) / TILE | 0);
    if (ft === T.TALL && !p.tm) {
      g.save(); g.beginPath(); g.rect(p.x - p.r * 2, p.y + p.r * 0.35, p.r * 4, p.r); g.clip();
      for (let i = -2; i <= 2; i++) g.drawImage(this.tiles.blades, p.x + i * p.r * 0.7 - p.r * 0.5, p.y + p.r * 0.2, p.r, p.r * 0.8);
      g.restore();
    }
    if (p.sd) {
      g.strokeStyle = 'rgba(120,248,200,0.85)'; g.fillStyle = 'rgba(120,248,200,0.15)'; g.lineWidth = 3;
      star(g, p.x, p.y, p.r * 1.45, p.r * 1.3, 6, now); g.fill(); g.stroke();
    }
    if (p.np?.[3] && !p.np[4]) {
      const by = p.y - p.r * 2.6 - 22 / z - Math.abs(Math.sin(now * 4)) * 6;
      g.fillStyle = '#f8f8f8'; g.strokeStyle = '#383838'; g.lineWidth = 2 / z;
      g.beginPath(); g.arc(p.x, by, 9 / z, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#e83030'; g.font = `${10 / z}px ${FONT}`; g.textAlign = 'center'; g.fillText('!', p.x, by + 4 / z); g.textAlign = 'left';
    }
    if (p.pt && !p.np) { g.strokeStyle = `rgba(255,255,255,${0.4 + Math.sin(now * 10) * 0.3})`; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, p.r * 1.3, 0, 7); g.stroke(); }
    if (p.sh && Math.sin(now * 6 + p.id) > 0.7) { g.fillStyle = '#fff8a0'; g.font = `${12 / z}px ${FONT}`; g.fillText('✦', p.x + p.r, p.y - p.r); }

    const w = Math.max(44, p.r * 2.4) / Math.max(z, 0.7), bx = p.x - w / 2, by = p.y - p.r * 2.1 - 8 / z, bh = 5 / z;
    const ratio = Math.max(0, p.hp / p.mh);
    g.fillStyle = '#383838'; g.fillRect(bx - 1 / z, by - 1 / z, w + 2 / z, bh + 2 / z);
    g.fillStyle = '#f8f8f8'; g.fillRect(bx, by, w, bh);
    g.fillStyle = ratio > 0.5 ? '#58d080' : ratio > 0.2 ? '#f8d030' : '#f85838';
    g.fillRect(bx, by, w * ratio, bh);
    if (!this.opts.names && !isMe && !p.np && !p.b) { g.textAlign = 'left'; return; }
    g.font = `${8 / z}px ${FONT}`; g.textAlign = 'center';
    const text = `${p.np ? '★ ' : ''}${this.label(p)} Lv${p.l}${p.ks >= 3 ? ` ×${p.ks}` : ''}`;
    g.lineWidth = 3 / z; g.strokeStyle = '#202020';
    g.strokeText(text, p.x, by - 4 / z);
    g.fillStyle = p.np ? '#f8d030' : p.ks >= 5 ? '#f8a030' : p.b ? '#d8a8ff' : isMe ? '#f8f8f8' : p.w ? '#c8f0c8' : p.bt ? '#f8d8a0' : '#f8a0a0';
    g.fillText(text, p.x, by - 4 / z);
    if (p.s && STATUS[p.s]) {
      const [st, c] = STATUS[p.s];
      g.fillStyle = c; g.fillRect(bx + w + 2 / z, by - 2 / z, 26 / z, 9 / z);
      g.fillStyle = '#fff'; g.font = `${6 / z}px ${FONT}`; g.textAlign = 'left';
      g.fillText(st, bx + w + 3.5 / z, by + 5 / z);
    }
    g.textAlign = 'left';
  }

  rgb(hex = '#ffffff') { const n = parseInt(hex.slice(1), 16); return `${n >> 16},${n >> 8 & 255},${n & 255}`; }

  drawMelee(f, k, col, lt) {
    const g = this.g, { x, y, a, r } = f, ca = Math.cos(a), sa = Math.sin(a);
    g.lineCap = 'round';
    if (f.st === 'claw') {
      for (let i = -1; i <= 1; i++) {
        const nx = -sa * i * r * 0.35, ny = ca * i * r * 0.35, p0 = -0.7, p1 = p0 + Math.min(1, k * 3) * 1.4;
        const [x1, y1] = [x + nx + (ca * p0 - sa * 0.7) * r * 0.8, y + ny + (sa * p0 + ca * 0.7) * r * 0.8];
        const [x2, y2] = [x + nx + (ca * p1 - sa * (0.7 - (p1 - p0))) * r * 0.8, y + ny + (sa * p1 + ca * (0.7 - (p1 - p0))) * r * 0.8];
        g.strokeStyle = col; g.lineWidth = 7; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke();
      }
    } else if (f.st === 'bite') {
      const gap = r * 0.7 * (1 - Math.min(1, k * 2.5));
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      for (const dir of [-1, 1]) {
        g.fillStyle = '#f8f8f8'; g.strokeStyle = '#383838'; g.lineWidth = 2;
        g.beginPath(); g.arc(0, dir * gap, r * 0.7, dir < 0 ? Math.PI : 0, dir < 0 ? 0 : Math.PI, false); g.stroke();
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * r * 0.22 - r * 0.09, dir * gap); g.lineTo(i * r * 0.22, dir * (gap - r * 0.28)); g.lineTo(i * r * 0.22 + r * 0.09, dir * gap); g.fill(); g.stroke(); }
      }
      g.restore();
    } else if (f.st === 'horn') {
      const L = r * (0.4 + k * 1.2);
      g.strokeStyle = col; g.lineWidth = 9; g.beginPath(); g.moveTo(x - ca * r, y - sa * r); g.lineTo(x + ca * (L - r), y + sa * (L - r)); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    } else if (f.st === 'tail' || f.st === 'kick') {
      g.strokeStyle = col; g.lineWidth = 10 * (1 - k) + 3;
      g.beginPath(); g.arc(x - ca * r * 0.4, y - sa * r * 0.4, r * 0.9, a - 1.6 + k * 0.6, a - 1.6 + k * 3.4); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke();
    }
    if (f.st === 'punch' || f.st === 'kick' || f.st === 'tackle' || k > 0.5) {
      const s = r * (0.4 + k * 0.7);
      g.fillStyle = lt; star(g, x, y, s, s * 0.45, f.st === 'punch' ? 8 : 6, a); g.fill();
      g.fillStyle = col; star(g, x, y, s * 0.6, s * 0.3, f.st === 'punch' ? 8 : 6, a + 0.3); g.fill();
      if (f.st === 'tackle') {
        g.strokeStyle = '#fff'; g.lineWidth = 2;
        for (let i = 0; i < 5; i++) { const b = a + (i - 2) * 0.4; g.beginPath(); g.moveTo(x + Math.cos(b) * s, y + Math.sin(b) * s); g.lineTo(x + Math.cos(b) * s * 1.6, y + Math.sin(b) * s * 1.6); g.stroke(); }
      }
    }
    g.lineCap = 'butt';
  }

  drawFx(now) {
    const g = this.g, z = this.cam.z;
    this.fx = this.fx.filter(f => now - f.t0 < f.life);
    for (const f of this.fx) {
      const k = (now - f.t0) / f.life, col = TYPE_COLORS[f.t] || '#fff', lt = LIGHT[f.t] || '#fff';
      g.globalAlpha = Math.max(0, 1 - k);
      if (f.k === 'melee') {
        g.globalAlpha = Math.min(1, 2 - k * 2);
        this.drawMelee(f, k, col, lt);
      } else if (f.k === 'beam') {
        const ex = f.x + Math.cos(f.a) * f.l, ey = f.y + Math.sin(f.a) * f.l, w = f.w * (1 - k * 0.6) * (0.9 + Math.random() * 0.2);
        g.lineCap = 'round';
        if (f.t === 'electric') {
          g.strokeStyle = col; g.lineWidth = w * 0.8; zigzag(g, f.x, f.y, ex, ey, w, 10); g.stroke();
          g.strokeStyle = '#fff'; g.lineWidth = w * 0.3; g.stroke();
        } else {
          g.strokeStyle = col; g.globalAlpha *= 0.45; g.lineWidth = w * 2.2; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(ex, ey); g.stroke();
          g.globalAlpha = Math.max(0, 1 - k); g.lineWidth = w; g.stroke();
          g.strokeStyle = lt; g.lineWidth = w * 0.35; g.stroke();
        }
        g.lineCap = 'butt';
      } else if (f.k === 'strike') {
        g.globalAlpha = 0.5 + Math.sin(now * 30) * 0.3;
        g.strokeStyle = '#f83030'; g.lineWidth = 3; g.setLineDash([8, 6]);
        g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.stroke(); g.setLineDash([]);
        g.fillStyle = col; g.globalAlpha = 0.2; g.beginPath(); g.arc(f.x, f.y, f.r * k, 0, 7); g.fill();
      } else if (f.k === 'boom') {
        const thunder = f.t === 'electric' || /thunder|bolt/.test(f.mv), rocks = f.t === 'rock' || /meteor|stone|blades/.test(f.mv);
        if (thunder && k < 0.5) {
          g.strokeStyle = col; g.lineWidth = 10; zigzag(g, f.x + (Math.random() - 0.5) * 40, f.y - 700, f.x, f.y, 30, 12); g.stroke();
          g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
        }
        if (rocks && k < 0.6) {
          g.fillStyle = col; g.strokeStyle = '#584020'; g.lineWidth = 2;
          for (let i = 0; i < 5; i++) { const rx = f.x + (i - 2) * f.r * 0.35, ry = f.y - 300 * (1 - Math.min(1, k * 2.5 + i * 0.08)); g.beginPath(); g.arc(rx, ry, f.r * 0.22, 0, 7); g.fill(); g.stroke(); }
        }
        g.fillStyle = lt; g.globalAlpha = Math.max(0, 0.7 - k); g.beginPath(); g.arc(f.x, f.y, f.r * (0.6 + k * 0.6), 0, 7); g.fill();
        g.strokeStyle = col; g.lineWidth = 8 * (1 - k); g.globalAlpha = 1 - k; g.beginPath(); g.arc(f.x, f.y, f.r * (0.5 + k), 0, 7); g.stroke();
      } else if (f.k === 'aoe' || f.k === 'quake' || f.k === 'evo' || f.k === 'form' || f.k === 'zone') {
        const r = f.k === 'aoe' || f.k === 'quake' || f.k === 'zone' ? f.r * (f.k === 'zone' ? 1 - k * 0.3 : k) : 30 + k * 160;
        g.strokeStyle = f.k === 'form' ? `hsl(${k * 720},100%,65%)` : f.k === 'evo' ? '#fff' : col;
        g.lineWidth = 12 * (1 - k) + 2;
        g.beginPath(); g.arc(f.x, f.y, r, 0, 7); g.stroke();
        if (f.k === 'quake') {
          g.strokeStyle = '#584020'; g.lineWidth = 3;
          for (let i = 0; i < 8; i++) { const a = i * 0.785 + f.x; g.beginPath(); g.moveTo(f.x + Math.cos(a) * 20, f.y + Math.sin(a) * 20); g.lineTo(f.x + Math.cos(a + 0.2) * r * 0.5, f.y + Math.sin(a + 0.2) * r * 0.5); g.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); g.stroke(); }
        }
      } else if (f.k === 'ball') {
        this.drawBall(f.x, f.y, 12 + k * 6, k * 8);
      } else if (f.k === 'self' || f.k === 'shield') {
        g.strokeStyle = f.k === 'shield' ? '#78f8c8' : col; g.lineWidth = 4;
        g.beginPath(); g.arc(f.x, f.y, f.r * (1 + k * 0.8), 0, 7); g.stroke();
      } else if (f.k === 'pop' || f.k === 'ko') {
        g.fillStyle = f.k === 'ko' ? '#f8f8f8' : lt;
        star(g, f.x, f.y, (f.k === 'ko' ? 40 : 18) * (0.5 + k), (f.k === 'ko' ? 15 : 7) * (0.5 + k), 6, k); g.fill();
      } else {
        const fs = (f.k === 'dmg' ? (f.e > 1 || f.c || f.cb >= 3 ? 14 : 10) : f.k === 'catch' || f.k === 'raid' ? 14 : 9) / z;
        const txt = f.k === 'dmg' ? (f.e === 0 ? 'No effect' : `${f.v}${f.e > 1 ? '!' : ''}${f.c ? ' CRIT' : ''}${f.cb >= 3 ? ` x${f.cb}` : ''}`)
          : f.k === 'lvl' ? 'Lv UP!' : f.k === 'stat' ? (f.up ? '▲' : '▼') : f.k === 'catch' ? 'Gotcha!' : f.k === 'raid' ? 'RAID CLEAR!' : f.k === 'free' ? '' : f.s;
        if (!txt) continue;
        g.fillStyle = f.k === 'dmg' ? (f.e > 1 ? '#f86030' : f.e < 1 ? '#c8c8c8' : '#fff') : f.k === 'lvl' ? '#f8e030' : f.k === 'stat' ? (f.up ? '#f86040' : '#6090f8') : '#fff';
        g.font = `${fs}px ${FONT}`; g.textAlign = 'center';
        g.lineWidth = 3 / z; g.strokeStyle = '#202020';
        const ty = f.y - k * 40 - (f.k === 'weather' ? 30 : 0);
        g.strokeText(txt, f.x, ty); g.fillText(txt, f.x, ty);
        g.textAlign = 'left';
      }
    }
    g.globalAlpha = 1;
  }

  drawParts(now, dt) {
    const g = this.g;
    this.parts = this.parts.filter(p => now - p.t0 < p.life);
    if (this.parts.length > 1500) this.parts.splice(0, this.parts.length - 1500);
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.97; p.vy *= 0.97;
      g.globalAlpha = Math.max(0, 1 - (now - p.t0) / p.life);
      g.fillStyle = p.col;
      if (p.sh === 'plus') { g.fillRect(p.x - p.size, p.y - p.size / 3, p.size * 2, p.size * 0.66); g.fillRect(p.x - p.size / 3, p.y - p.size, p.size * 0.66, p.size * 2); }
      else if (p.sh === 'star') { star(g, p.x, p.y, p.size * 1.4, p.size * 0.5, 4, now * 4); g.fill(); }
      else g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
  }

  drawWorld(c, snap, me) {
    const g = c.getContext('2d'), S = c.width, s = S / (MAP * TILE);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.miniBg, 0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    for (let i = 1; i < GRID; i++) { g.beginPath(); g.moveTo(i * S / GRID, 0); g.lineTo(i * S / GRID, S); g.moveTo(0, i * S / GRID); g.lineTo(S, i * S / GRID); g.stroke(); }
    this.worldScale = s;
    g.textAlign = 'center';
    g.font = `${Math.max(7, Math.round(S / 120))}px ${FONT}`;
    for (const t of this.towns) {
      const x = t.x * s, y = t.y * s, here = t.region === me?.region && !t.village;
      g.fillStyle = t.league ? '#f8d030' : t.gyms.length ? TYPE_COLORS[REGIONS[t.region].gyms[t.gyms[0]][1]] : '#ffffff';
      g.strokeStyle = '#202020'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, t.league ? 5 : t.gyms.length ? 4 : t.village ? 1.5 : 2.5, 0, 7); g.fill(); g.stroke();
      if (this.visited?.has(t.id)) { g.strokeStyle = '#58f8a8'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke(); }
      if (here) { g.lineWidth = 3; g.fillStyle = '#fff'; g.strokeText(t.n, x, y - 7); g.fillText(t.n, x, y - 7); }
    }
    REGIONS.forEach((r, i) => {
      const cell = this.world.cellOf[i], x = (cell % GRID + 0.5) * S / GRID, y = (cell / GRID | 0) * S / GRID + 16;
      g.font = `bold ${Math.round(S / 60)}px ${FONT}`; g.lineWidth = 4; g.strokeStyle = '#202020'; g.fillStyle = i === me?.region ? '#ffffff' : '#f8d030';
      g.strokeText(r.n, x, y); g.fillText(r.n, x, y);
    });
    if (snap.br) { g.strokeStyle = '#c060ff'; g.lineWidth = 3; g.beginPath(); g.arc(snap.br.x * s, snap.br.y * s, snap.br.r * s, 0, 7); g.stroke(); }
    for (const p of snap.p) {
      if (p.d || (p.w && !p.b) || p.np) continue;
      const mine = p.id === me?.id;
      g.fillStyle = mine ? '#ffffff' : p.b ? '#c060ff' : p.bt ? '#f8a030' : '#f83838';
      g.beginPath(); g.arc(p.x * s, p.y * s, mine ? 6 : p.b ? 7 : 3, 0, 7); g.fill();
      if (p.b) { g.fillStyle = '#fff'; g.fillText('★', p.x * s, p.y * s + 4); }
      if (mine) { g.strokeStyle = '#202020'; g.lineWidth = 2; g.stroke(); }
    }
    g.textAlign = 'left';
  }

  drawMini(snap, me) {
    const now = performance.now();
    if (now - (this.miniAt || 0) > 700) { this.miniAt = now; this.refreshLocalMini(); }
    const m = this.mini, g = m.getContext('2d'), [ox, oy, span] = this.localOrigin, s = m.width / span;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.localMini, 0, 0, m.width, m.height);
    const inside = (x, y) => x >= ox && y >= oy && x < ox + span && y < oy + span;
    for (const t of this.towns) {
      if (!inside(t.x, t.y)) continue;
      g.fillStyle = t.league ? '#f8d030' : t.gyms.length ? '#e84038' : '#ffffff';
      g.fillRect((t.x - ox) * s - 2, (t.y - oy) * s - 2, 4, 4);
    }
    for (const p of snap.p) {
      if (p.d || (p.w && !p.b) || !inside(p.x, p.y)) continue;
      const mine = p.id === me?.id;
      g.fillStyle = mine ? '#fff' : p.b ? '#c060ff' : p.np ? '#f8d030' : p.bt ? '#f8a030' : '#f83838';
      const r = mine ? 5 : p.b ? 5 : 3;
      g.fillRect((p.x - ox) * s - r / 2, (p.y - oy) * s - r / 2, r, r);
    }
    if (snap.br) { g.strokeStyle = '#c060ff'; g.lineWidth = 2; g.beginPath(); g.arc((snap.br.x - ox) * s, (snap.br.y - oy) * s, snap.br.r * s, 0, 7); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
    const { x, y, z } = this.cam;
    g.strokeRect((x - this.W / 2 / z - ox) * s, (y - this.H / 2 / z - oy) * s, this.W / z * s, this.H / z * s);
  }

  // Crosshair at the cursor, plus a pulsing ring on the soft-locked target.
  drawAim(input, snap, now) {
    const g = this.g, z = this.cam.z;
    const t = input.lock && snap.p.find(p => p.id === input.lock);
    if (t && !t.d) {
      const [sx, sy] = [(t.x - this.cam.x) * z + this.W / 2, (t.y - this.cam.y) * z + this.H / 2], r = t.r * z * 1.4 + 6 + Math.sin(now * 8) * 2;
      g.strokeStyle = '#f83838'; g.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + now; g.beginPath(); g.arc(sx, sy, r, a, a + 0.9); g.stroke(); }
    }
    if (input.usedTouch || input.usedPad) return;
    const { x, y } = input.mouse;
    g.strokeStyle = t ? '#f83838' : 'rgba(255,255,255,0.85)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 9, 0, 7); g.moveTo(x - 15, y); g.lineTo(x - 5, y); g.moveTo(x + 5, y); g.lineTo(x + 15, y); g.moveTo(x, y - 15); g.lineTo(x, y - 5); g.moveTo(x, y + 5); g.lineTo(x, y + 15); g.stroke();
  }
}
