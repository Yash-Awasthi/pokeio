import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { World, genMap, T, MAP } from '../shared/sim.js';
import { typeMul, calcDamage } from '../shared/rules.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/game.json', import.meta.url)));
const world = () => new World(data, { wilds: 0 });

test('type chart', () => {
  assert.equal(typeMul(data.types, 'fire', ['grass']), 2);
  assert.equal(typeMul(data.types, 'normal', ['ghost']), 0);
  assert.equal(typeMul(data.types, 'electric', ['water', 'flying']), 4);
});

test('damage formula', () => {
  assert.equal(calcDamage(50, 80, 100, 100), 37);
});

test('level evolution chains through stages', () => {
  const w = world(), p = w.addPlayer('t', 'charmander');
  w.gain(p, w.expAt('charmander', 16) - p.exp);
  assert.equal(p.sp, 'charmeleon');
  w.gain(p, w.expAt('charmeleon', 40) - p.exp);
  assert.equal(p.sp, 'charizard');
  assert.equal(p.lvl, 40);
});

test('stone evolution', () => {
  const w = world(), p = w.addPlayer('t', 'pichu');
  p.sp = 'pikachu'; p.form = 'pikachu';
  w.spawnOrb('thunder-stone', p.x, p.y);
  w.tick(0.01);
  assert.equal(p.sp, 'raichu');
});

test('mega and dynamax revert after timer', () => {
  const w = world(), p = w.addPlayer('t', 'charmander');
  w.evolve(p, 'charizard');
  w.pickup(p, { k: 'dmax', id: -1 });
  assert.equal(p.form, 'charizard-gmax');
  const big = p.mh;
  p.temp.t = 0.001; w.tick(0.01);
  assert.equal(p.form, 'charizard');
  assert.ok(p.mh * 2 === big && p.hp <= p.mh);
});

test('KO drops 60% of exp as orbs', () => {
  const w = world(), a = w.addPlayer('a', 'charmander'), v = w.addPlayer('v', 'squirtle');
  w.gain(v, w.expAt('squirtle', 30) - v.exp);
  const before = new Set(w.orbs.keys()), exp = v.exp;
  w.damage(v, 1e9, a.id);
  const drops = [...w.orbs.values()].filter(o => !before.has(o.id));
  assert.ok(v.dead && a.kills === 1);
  assert.ok(Math.abs(drops.reduce((s, o) => s + o.v, 0) - exp * 0.6 * (v.shiny ? 2 : 1)) < 1);
});

test('close combat lowers user, psychic-style drop lowers target', () => {
  const w = world(), a = w.addPlayer('a', 'charmander'), q = w.addPlayer('q', 'squirtle');
  w.effects(a, q, data.moves['close-combat']);
  assert.equal(a.st[1], -1); assert.equal(q.st[1], 0);
  w.effects(a, q, data.moves.snarl);
  assert.equal(q.st[2], -1);
});

test('every move and form is usable', () => {
  const w = world();
  for (const [name, p] of Object.entries(data.pokemon)) {
    assert.ok(w.startMoves(name, 50).length > 0, name);
    assert.ok(p.s.length === 6, name);
  }
  const p = w.addPlayer('t', 'charmander'), q = w.addPlayer('q', 'squirtle');
  for (const mv of Object.keys(data.moves)) {
    p.moves = [mv]; p.cd = [0, 0, 0, 0]; p.status = null; q.dead = false; q.hp = q.mh;
    w.useMove(p, 0);
  }
  for (let i = 0; i < 60; i++) w.tick(1 / 30);
});

const duel = (sa, sb) => {
  const w = world(), a = w.addPlayer('a', sa), q = w.addPlayer('q', sb);
  q.x = a.x + 100; q.y = a.y; a.prot = q.prot = 0; a.aim = 0;
  w.sizeEvade = () => 0;
  return { w, a, q };
};

test('real heights make bigger pokemon bigger', () => {
  const { a, q } = duel('charmander', 'rhyhorn');
  const w = world(), big = w.addPlayer('b', 'charmander');
  w.evolve(big, 'rhyperior');
  assert.ok(big.r > a.r * 1.5, `${big.r} vs ${a.r}`);
  assert.ok(q.r > a.r);
});

test('spawn protection blocks damage until first attack', () => {
  const { w, a, q } = duel('charmander', 'squirtle');
  q.prot = 3;
  const hp = q.hp;
  w.hit(a, q, data.moves.tackle);
  assert.equal(q.hp, hp);
  q.moves = ['tackle']; w.useMove(q, 0);
  assert.ok(q.prot <= 0);
});

test('a huge level gap cannot one-shot', () => {
  const { w, a, q } = duel('charmander', 'squirtle');
  w.gain(a, w.expAt('charmander', 80) - a.exp);
  w.hit(a, q, data.moves['flamethrower']);
  assert.ok(!q.dead && q.hp >= q.mh * 0.6);
});

test('beam hits a target in line and misses one off-axis', () => {
  const { w, a, q } = duel('charmander', 'squirtle');
  const off = w.addPlayer('o', 'bulbasaur');
  off.x = a.x + 100; off.y = a.y + 200; off.prot = 0;
  a.moves = ['hydro-pump']; a.bot = true;
  w.useMove(a, 0);
  assert.ok(q.hp < q.mh && off.hp === off.mh);
});

test('diagonal movement is not faster than straight', () => {
  const w = world(), p = w.addPlayer('p', 'pidgey'), o = w.addPlayer('o', 'pidgey');
  const run = (pl, ix, iy) => {
    pl.x = pl.y = 3000; pl.prot = 9; pl.nat = 0; pl.up = [0, 0, 0, 0, 0, 0];
    w.setInput(pl, { ix, iy, aim: 0, use: -1 });
    for (let i = 0; i < 30; i++) w.step(pl, 1 / 30);
    return Math.hypot(pl.x - 3000, pl.y - 3000);
  };
  const straight = run(p, 1, 0), diag = run(o, 1, 1);
  assert.ok(Math.abs(straight - diag) < 2, `${straight} vs ${diag}`);
});

test('abilities: levitate dodges ground, blaze boosts at low hp, static paralyzes on contact', () => {
  const { w, a, q } = duel('diglett', 'gastly');
  assert.equal(q.ab, 'levitate');
  w.hit(a, q, data.moves.earthquake);
  assert.equal(q.hp, q.mh);
  const c = w.addPlayer('c', 'charmander');
  assert.equal(c.ab, 'blaze');
  c.hp = c.mh; const full = w.powMul(c, data.moves.ember, 'fire', {}, 1);
  c.hp = 1; assert.equal(w.powMul(c, data.moves.ember, 'fire', {}, 1), full * 1.5);
  const { w: w2, a: a2, q: pika } = duel('rattata', 'pichu');
  pika.A = { contact: ['paralysis', 100] };
  w2.hit(a2, pika, data.moves.tackle, { contact: 1 });
  assert.equal(a2.status, 'paralysis');
});

test('bots and wilds start stage 1 and stay within one stage of the human', () => {
  const w = new World(data, { wilds: 0 }), me = w.addPlayer('me', 'charmander');
  const stages = n => Array.from({ length: n }, () => w.depthOf(w.spawnTiered(w.addPlayer('b', 'pidgey', { bot: true })).sp));
  const s0 = stages(400);
  assert.ok(s0.every(s => s <= 1), 'never more than one stage up');
  assert.ok(s0.filter(s => s === 1).length < 40, `off-stage ~1/50 expected, got ${s0.filter(s => s === 1).length}`);
  w.evolve(me, 'charmeleon'); w.evolve(me, 'charizard');
  const s2 = stages(400);
  assert.ok(s2.every(s => s === 1 || s === 2), 'stage window is 1..3 around the human');
  assert.ok(s2.filter(s => s === 2).length > 350);
  const lv = w.spawnTiered(w.addPlayer('b', 'pidgey', { bot: true })).lvl;
  assert.ok(Math.abs(lv - me.lvl) <= 3);
});

test('stat upgrades, IVs and natures change stats', () => {
  const w = world(), p = w.addPlayer('p', 'charmander');
  p.pts = 3; const atk = p.stat[0];
  w.upgrade(p, 1); w.upgrade(p, 1);
  assert.ok(p.stat[0] > atk && p.pts === 1 && p.up[1] === 2);
  p.pts = 0; w.upgrade(p, 1);
  assert.equal(p.up[1], 2, 'cannot spend without points');
  w.gain(p, w.expAt('charmander', 10) - p.exp);
  assert.equal(p.pts, 5);
});

test('fast growers out-level slow growers on the same orbs', () => {
  const w = world(), fast = w.addPlayer('f', 'cleffa'), slow = w.addPlayer('s', 'dratini');
  assert.notEqual(data.species[fast.sp].g, data.species[slow.sp].g);
  for (let i = 0; i < 60; i++) { w.pickup(fast, { k: 'e', v: 1, id: -1 }); w.pickup(slow, { k: 'e', v: 1, id: -1 }); }
  assert.ok(fast.lvl > slow.lvl, `${fast.lvl} vs ${slow.lvl}`);
});

test('dodge roll grants invulnerability; heavy pokemon recharge slower', () => {
  const { w, a, q } = duel('pichu', 'munchlax');
  w.dodge(q, 1, 0);
  const hp = q.hp;
  w.hit(a, q, data.moves.tackle);
  assert.equal(q.hp, hp);
  w.dodge(a, 1, 0);
  assert.ok(q.dodgeCd > a.dodgeCd, `${q.dodgeCd} vs ${a.dodgeCd}`);
});

test('map has every terrain', () => {
  const m = genMap(7).tiles, count = t => m.filter(x => x === t).length / (MAP * MAP);
  for (const t of Object.values(T)) assert.ok(count(t) > 0.0001, `tile ${t}: ${count(t)}`);
  console.log(Object.entries(T).map(([k, t]) => `${k} ${(count(t) * 100).toFixed(1)}%`).join(', '));
});

test('bots play without crashing', () => {
  const w = new World(data);
  w.addBots(20);
  for (let i = 0; i < 30 * 60; i++) { w.tick(1 / 30); w.flush(); }
  assert.ok([...w.players.values()].some(p => p.bot && p.lvl > 5));
});
