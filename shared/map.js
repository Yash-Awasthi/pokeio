// Seeded, huge world: 25 regions on a shuffled 5×5 grid, generated lazily in 64×64 chunks.
// Terrain is a pure function of (seed, x, y); towns, roads and buildings are precomputed overlays stamped into chunks.
import { B, BIOMES } from './biomes.js';
import { REGIONS } from './regions.js';
export { B, BIOMES, REGIONS };

export const TILE = 32, RS = 1200, GRID = 5, MAP = RS * GRID, WORLD = TILE * MAP, CH = 64, SG = 140;
export const T = { GRASS: 0, TALL: 1, TREE: 2, WATER: 3, SAND: 4, FLOWER: 5, PATH: 6, ASH: 7, LAVA: 8, ROCK: 9, SNOW: 10, SNOWTREE: 11, SWAMP: 12, CAVE: 13, CACTUS: 14, MUD: 15, BUILD: 16,
  HILL: 17, ICE: 18, PAVE: 19, HOUSE: 20, GRAVE: 21, DEADGRASS: 22, DEADTREE: 23, PALM: 24 };
export const SOLID = new Set([T.TREE, T.ROCK, T.SNOWTREE, T.CACTUS, T.BUILD, T.HOUSE, T.GRAVE, T.DEADTREE, T.PALM]);
export const TREES = new Set([T.TREE, T.SNOWTREE, T.DEADTREE, T.PALM]);
const { ROUTE: R, FOREST: F, VOLCANO: V, SNOW: S, SWAMP: W, CAVE: C, DESERT: D, SEA: O, HILLS: H, CITY: Y, HAUNTED: G, BEACH: E } = B;

function rng(s) { return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function noiseField(r, cells) {
  const g = Float32Array.from({ length: (cells + 1) ** 2 }, r), s = MAP / cells;
  return (x, y) => {
    const gx = x / s, gy = y / s, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), at = (i, j) => g[(iy + j) * (cells + 1) + ix + i];
    return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
  };
}
// Position hash in [0,1): lets any tile be generated alone, in any order.
const VILLAGE_A = ['Ash', 'Birch', 'Cedar', 'Dune', 'Elm', 'Fern', 'Glen', 'Haze', 'Iris', 'Jade', 'Kelp', 'Lark', 'Moss', 'Nimbus', 'Oak', 'Pine', 'Quartz', 'Rose',
  'Sage', 'Thorn', 'Umber', 'Vale', 'Willow', 'Yarrow', 'Zephyr', 'Coral', 'Ember', 'Frost', 'Gale', 'Honey', 'Ivy', 'Juniper', 'Kindle', 'Lumen', 'Maple', 'Nectar', 'Opal', 'Pebble'];
const VILLAGE_B = ['Town', 'Village', 'Hollow', 'Outpost', 'Harbor', 'Crossing', 'Meadow', 'Ridge', 'Falls', 'Grove', 'Bay', 'Hamlet', 'Point', 'Springs'];
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function terrain(b, e, g, roll) {
  switch (b) {
    case F: return e < 0.3 ? T.WATER : e > 0.68 || g > 0.6 ? T.TREE : g > 0.42 ? T.TALL : roll < 0.02 ? T.FLOWER : T.GRASS;
    case V: return e < 0.34 ? T.LAVA : e > 0.64 || g > 0.76 ? T.ROCK : T.ASH;
    case S: return e < 0.24 ? T.WATER : e < 0.36 ? T.ICE : e > 0.66 || g > 0.72 ? T.SNOWTREE : T.SNOW;
    case H: return e < 0.28 ? T.WATER : e > 0.6 ? T.ROCK : g > 0.72 ? T.TREE : g > 0.6 ? T.TALL : T.HILL;
    case G: return e < 0.3 ? T.SWAMP : g > 0.68 ? T.DEADTREE : roll < 0.05 ? T.GRAVE : g > 0.55 ? T.TALL : T.DEADGRASS;
    case E: return e < 0.42 ? T.WATER : e < 0.58 ? (roll < 0.02 ? T.PALM : T.SAND) : g > 0.72 ? T.PALM : T.GRASS;
    case W: return e < 0.42 ? T.SWAMP : e > 0.7 || g > 0.78 ? T.TREE : g > 0.5 ? T.TALL : T.MUD;
    case C: return e < 0.3 ? T.WATER : e > 0.58 || g > 0.68 ? T.ROCK : T.CAVE;
    case D: return e < 0.27 ? T.WATER : e > 0.72 ? T.ROCK : roll < 0.025 ? T.CACTUS : T.SAND;
    case O: return e < 0.5 ? T.WATER : e < 0.54 ? T.SAND : g > 0.7 ? T.TREE : g > 0.55 ? T.TALL : T.GRASS;
    default: return e < 0.33 ? T.WATER : e < 0.37 ? T.SAND : e > 0.66 || g > 0.74 ? T.TREE : g > 0.56 ? T.TALL : roll < 0.03 ? T.FLOWER : T.GRASS;
  }
}
function cityTile(x, y, roll) {
  const bx = x % 12, by = y % 10;
  if (bx < 2 || by < 2) return T.PAVE;
  if (bx > 2 && bx < 11 && by > 2 && by < 8) return roll < 0.85 ? T.HOUSE : T.PAVE;
  return roll < 0.1 ? T.TREE : T.GRASS;
}

export function genMap(seed = 7) { return new WorldMap(seed); }

export class WorldMap {
  constructor(seed) {
    const r = rng(seed);
    this.seed = seed;
    // Shuffle which region sits in which grid cell, so every world is laid out differently.
    this.order = REGIONS.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
    this.cellOf = [];
    this.order.forEach((reg, cell) => { this.cellOf[reg] = cell; });
    this.elev = noiseField(r, MAP / 22 | 0); this.det = noiseField(r, MAP / 8 | 0); this.veg = noiseField(r, MAP / 12 | 0); this.warp = noiseField(r, MAP / 20 | 0);
    // Biome blobs = Voronoi cells of one jittered seed per SG×SG block; each seed takes a biome from its region's mix.
    this.sgN = Math.ceil(MAP / SG);
    this.seeds = Array.from({ length: this.sgN * this.sgN }, (_, i) => {
      const gx = i % this.sgN, gy = i / this.sgN | 0, x = (gx + 0.15 + r() * 0.7) * SG, y = (gy + 0.15 + r() * 0.7) * SG;
      const mix = REGIONS[this.regionAt(x, y)].mix;
      return { x, y, b: mix[r() * mix.length | 0] };
    });
    this.bridgeV = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => (0.25 + r() * 0.5) * RS | 0));
    this.bridgeH = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => (0.25 + r() * 0.5) * RS | 0));
    this.chunks = new Map();
    this.overlay = new Map();
    this.towns = [];
    this.layTowns(r);
  }

  regionAt(tx, ty) { return this.order[Math.min(GRID - 1, Math.max(0, ty / RS | 0)) * GRID + Math.min(GRID - 1, Math.max(0, tx / RS | 0))]; }
  regionCenter(i) { const c = this.cellOf[i]; return [((c % GRID) + 0.5) * RS * TILE, ((c / GRID | 0) + 0.5) * RS * TILE]; }
  regionBox(i) { const c = this.cellOf[i]; return [(c % GRID) * RS, (c / GRID | 0) * RS]; }

  // Base terrain without towns/roads: [tile, biome].
  base(x, y) {
    if (x < 3 || y < 3 || x >= MAP - 3 || y >= MAP - 3) return [T.TREE, R];
    const lx = x % RS, ly = y % RS, col = x / RS | 0, row = y / RS | 0;
    const vCh = lx < 4 && col > 0, hCh = ly < 4 && row > 0;
    if ((vCh && Math.abs(ly - this.bridgeV[col][row]) < 3) || (hCh && Math.abs(lx - this.bridgeH[row][col]) < 3)) return [T.PATH, O];
    if (vCh || hCh) return [T.WATER, O];
    const wx = x + (this.warp(x, y) - 0.5) * 80, wy = y + (this.warp(y, x) - 0.5) * 80, sx = wx / SG | 0, sy = wy / SG | 0;
    let b = R, bd = Infinity;
    for (let gy = sy - 1; gy <= sy + 1; gy++) for (let gx = sx - 1; gx <= sx + 1; gx++) {
      const s = gx >= 0 && gy >= 0 && gx < this.sgN && gy < this.sgN && this.seeds[gy * this.sgN + gx];
      if (!s || this.regionAt(s.x, s.y) !== this.regionAt(x, y)) continue;
      const d = (s.x - wx) ** 2 + (s.y - wy) ** 2;
      if (d < bd) { bd = d; b = s.b; }
    }
    const roll = hash(x, y, this.seed);
    return [b === Y ? cityTile(x, y, roll) : terrain(b, this.elev(x, y) * 0.7 + this.det(x, y) * 0.3, this.veg(x, y), roll), b];
  }

  stamp(x, y, t, force) {
    const k = (x / CH | 0) * 4096 + (y / CH | 0);
    if (!this.overlay.has(k)) this.overlay.set(k, new Map());
    const m = this.overlay.get(k), i = (y % CH) * CH + (x % CH);
    if (force || m.get(i) !== T.BUILD) m.set(i, t);
  }

  carve(x0, y0, x1, y1, r) {
    let x = x0, y = y0;
    for (let s = 0; s < 8000 && (Math.abs(x1 - x) > 1 || Math.abs(y1 - y) > 1); s++) {
      if (r() < 0.5 ? x !== x1 : y === y1) x += Math.sign(x1 - x); else y += Math.sign(y1 - y);
      if (x > 3 && y > 3 && x < MAP - 4 && y < MAP - 4) for (let d = 0; d < 4; d++) this.stamp(x + (d & 1), y + (d >> 1), T.PATH);
    }
  }

  layTowns(r) {
    this.order.forEach((reg, cell) => {
      const R0 = REGIONS[reg], ox = (cell % GRID) * RS, oy = (cell / GRID | 0) * RS, mine = [];
      // Real towns first, then procedural villages so the huge regions never feel empty.
      const names = [...R0.towns];
      for (let v = 0; v < 22; v++) names.push(`${VILLAGE_A[r() * VILLAGE_A.length | 0]} ${VILLAGE_B[r() * VILLAGE_B.length | 0]}`);
      for (const n of names) {
        let tx, ty;
        for (let tries = 0; tries < 80; tries++) {
          tx = ox + 30 + (r() * (RS - 60) | 0); ty = oy + 30 + (r() * (RS - 60) | 0);
          if (mine.every(t => Math.hypot(t.tx - tx, t.ty - ty) > 140)) break;
        }
        for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) this.stamp(tx + dx, ty + dy, T.PATH, true);
        for (let dy = -3; dy <= -1; dy++) for (let dx = -2; dx <= 1; dx++) this.stamp(tx + dx, ty + dy, T.BUILD, true);
        const gyms = (R0.gyms || []).map((g, gi) => (g[3] === n ? gi : -1)).filter(gi => gi >= 0);
        const t = { id: this.towns.length, n, region: reg, tx, ty, x: tx * TILE, y: ty * TILE, gyms, league: R0.league?.town === n, village: !R0.towns.includes(n) };
        mine.push(t); this.towns.push(t);
      }
      // Road network: each town links to its nearest already-connected neighbour (a spanning tree of short routes).
      const linked = [mine[0]];
      for (const t of mine.slice(1)) {
        const to = linked.reduce((a, u) => (Math.hypot(u.tx - t.tx, u.ty - t.ty) < Math.hypot(a.tx - t.tx, a.ty - t.ty) ? u : a));
        this.carve(t.tx, t.ty + 3, to.tx, to.ty + 3, r);
        linked.push(t);
      }
      const col = cell % GRID, row = cell / GRID | 0;
      const near = (x, y) => mine.reduce((a, t) => (Math.hypot(t.tx - x, t.ty - y) < Math.hypot(a.tx - x, a.ty - y) ? t : a));
      const ends = [];
      if (col > 0) ends.push([ox + 4, oy + this.bridgeV[col][row]]);
      if (col < GRID - 1) ends.push([ox + RS - 1, oy + this.bridgeV[col + 1][row]]);
      if (row > 0) ends.push([ox + this.bridgeH[row][col], oy + 4]);
      if (row < GRID - 1) ends.push([ox + this.bridgeH[row + 1][col], oy + RS - 1]);
      for (const [bx, by] of ends) { const t = near(bx, by); this.carve(bx, by, t.tx, t.ty + 3, r); }
    });
  }

  chunk(cx, cy) {
    const k = cx * 4096 + cy;
    let c = this.chunks.get(k);
    if (c) return c;
    c = new Uint8Array(CH * CH * 2);
    const ov = this.overlay.get(k);
    for (let ly = 0; ly < CH; ly++) for (let lx = 0; lx < CH; lx++) {
      const i = ly * CH + lx, [t, b] = this.base(cx * CH + lx, cy * CH + ly);
      c[i] = ov?.get(i) ?? t; c[CH * CH + i] = b;
    }
    this.chunks.set(k, c);
    return c;
  }

  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) return T.TREE;
    return this.chunk(tx / CH | 0, ty / CH | 0)[(ty % CH) * CH + (tx % CH)];
  }
  biome(tx, ty) {
    tx = Math.min(MAP - 1, Math.max(0, tx)); ty = Math.min(MAP - 1, Math.max(0, ty));
    return this.chunk(tx / CH | 0, ty / CH | 0)[CH * CH + (ty % CH) * CH + (tx % CH)];
  }

  // Low-res terrain for minimaps without generating every chunk: one sample per `step` tiles, roads included.
  overview(step = 16) {
    const n = MAP / step | 0, out = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const tx = x * step, ty = y * step, ov = this.overlay.get((tx / CH | 0) * 4096 + (ty / CH | 0))?.get((ty % CH) * CH + (tx % CH));
      out[y * n + x] = ov ?? this.base(tx, ty)[0];
    }
    return { n, step, tiles: out };
  }
}
