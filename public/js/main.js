import { starterList, REGIONS, BIOMES } from '/shared/sim.js';
import { TYPE_COLORS, cooldown, prep, KIND, NATURES, natureMul, UPGRADE_MAX } from '/shared/rules.js';
import { ABIL, pickAbility } from '/shared/abilities.js';
import { HELD } from '/shared/items.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Offline } from './offline.js';
import { Net } from './net.js';
import { Audio } from './audio.js';
import { Profile, SHINY_AT } from './profile.js';
import { Quests } from './quests.js';

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

const data = prep(await (await fetch('/data/game.json')).json());
const profile = new Profile(data);
const quests = new Quests(profile);
const settings = { music: 1, sfx: 1, particles: 'high', shake: true, names: true, ...JSON.parse(store.get('settings') || '{}') };
const STAT_NAMES = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
const KIND_HELP = {
  self: 'Buffs or heals yourself', shield: 'Blocks all damage briefly', weather: 'Your aura boosts matching-type moves 1.5x for 20s',
  zone: 'Leaves a damaging zone at the cursor', strike: 'Calls down a delayed hit at the cursor', aoe: 'Hits everything around you',
  quake: 'Ground shockwave around you', proj: 'Shoots toward the cursor', multi: 'Fires a spread volley',
  beam: 'Instant line that pierces every target', melee: 'Dashes forward and strikes up close',
};
const STATUS = { burn: ['BRN', '#f08030'], poison: ['PSN', '#a040a0'], paralysis: ['PAR', '#d8b800'], sleep: ['SLP', '#8898a8'], freeze: ['FRZ', '#68c8e8'], confusion: ['CNF', '#f85888'], trap: ['TRP', '#a8a878'], 'leech-seed': ['SED', '#78c850'] };
const spriteId = form => { const p = data.pokemon[form]; return p.img ? p.id : p.imgOf ?? p.id; };
// Regional Pokédexes for regions with their own range, plus the National Dex.
const DEX_TABS = [...REGIONS.slice(0, 10).map(r => [r.n, r.gen]), ['National', [[1, 1025]]]];
const dexId = sp => data.pokemon[data.species[sp].base].id;
const pickable = [...starterList(data), ...Object.keys(data.species).filter(n => data.species[n].leg && !data.species[n].from && data.pokemon[data.species[n].base])]
  .sort((a, b) => dexId(a) - dexId(b));

const audio = new Audio();
const renderer = new Renderer($('#game'), $('#mini'), data);
const moveBtns = [...document.querySelectorAll('#moves .move')];
const input = new Input($('#game'), moveBtns);
input.bindDodge($('#dodgeBtn'));
input.bindThrow($('#ballBtn'));
const UP_KEYS = ['5', '6', '7', '8', '9', '0'];
const upBtns = STAT_NAMES.map((n, i) => {
  const b = el('button', 'up');
  b.onclick = () => src?.upgrade(i);
  $('#upList').append(b);
  return b;
});
renderer.opts = settings; audio.setVolumes(settings.music, settings.sfx);
let src = null, attract = null, chosen = profile.unlocked(store.get('sp')) ? store.get('sp') : null, wantShiny = store.get('shiny') === '1';
$('#name').value = store.get('name') || '';
$('#controls').value = store.get('controls') || 'follow';

function card(form, live) {
  const p = data.pokemon[form], s = data.species[p.sp], ab = pickAbility(p.ab), info = data.abilities[ab] || {};
  const box = el('div', 'card'), head = el('div', 'head'), img = el('img');
  img.src = `/sprites/${spriteId(form)}.png`; img.alt = '';
  const title = el('div');
  title.append(el('b', '', `#${String(p.id).padStart(4, '0')} ${s.n}${s.leg ? ' ★' : ''}`));
  const types = el('div', 'types');
  for (const t of p.t) { const b = el('span', 'badge', t.toUpperCase()); b.style.background = TYPE_COLORS[t]; types.append(b); }
  const home = REGIONS.find(r => r.gen.some(([lo, hi]) => p.id >= lo && p.id <= hi));
  title.append(types, el('div', 'dim', `${(p.h / 10).toFixed(1)} m · ${(p.w / 10).toFixed(1)} kg · ${s.g.replace(/-/g, ' ')} growth${home ? ' · ' + home.n : ''}`));
  head.append(img, title);
  const abl = el('div', 'ab');
  abl.append(el('b', '', `${info.n || ab}${ABIL[ab] ? '' : ' (no effect yet)'}: `), info.e || '');
  const stats = el('div', 'stats');
  p.s.forEach((v, i) => {
    const row = el('div', 'stat'), bar = el('i');
    bar.style.width = `${Math.min(100, v / 2)}%`;
    bar.style.background = v >= 100 ? '#58d080' : v >= 70 ? '#f8d030' : '#f88050';
    row.append(el('span', '', STAT_NAMES[i]), el('span', 'bar2', ''), el('span', 'num', live && i ? `${v} (${live.stat[i - 1]})` : `${v}`));
    row.children[1].append(bar);
    stats.append(row);
  });
  stats.append(el('div', 'dim', `Base total ${p.s.reduce((a, b) => a + b, 0)}`));
  box.append(head, abl, stats);
  if (live) {
    const n = live.nat, plus = [0, 1, 2, 3, 4].find(i => natureMul(n, i) > 1), minus = [0, 1, 2, 3, 4].find(i => natureMul(n, i) < 1);
    box.append(el('div', 'dim', `Nature: ${NATURES[n]}${plus !== undefined ? ` (+${STAT_NAMES[plus + 1]} −${STAT_NAMES[minus + 1]})` : ' (neutral)'} · IVs ${live.iv.join('/')}`));
    box.append(el('div', 'dim', `Upgrades: ${live.up.map((u, i) => `${STAT_NAMES[i]} ${u}`).join(' · ')}`));
    if (live.item) box.append(el('div', 'dim', `Holding ${HELD[live.item].n}: ${HELD[live.item].e}`));
  } else {
    const m = profile.mastery(p.sp), c = profile.catches(p.sp);
    box.append(el('div', 'mast', `Mastery ${'★'.repeat(m)}${'☆'.repeat(5 - m)} · caught ${c} · starts knowing moves up to Lv${5 + m * 8}`));
    box.append(el('div', 'dim', profile.shinyOk(p.sp) ? '✦ Shiny unlocked' : `✦ Shiny unlocks at ${SHINY_AT} catches of this line`));
  }
  const evo = s.evo?.map(e => `${data.species[e.to].n} (${e.lvl ? 'Lv' + e.lvl : e.item.replace(/-/g, ' ')})`).join(', ');
  if (evo) box.append(el('div', 'dim', `Evolves: ${evo}`));
  if (s.mega.length || s.gmax) box.append(el('div', 'dim', `${s.mega.length ? 'Can Mega Evolve. ' : ''}${s.gmax ? 'Has a Gigantamax form.' : ''}`));
  const best = [...new Map(p.m.map(([l, mv]) => [mv, l]))].filter(([mv]) => data.moves[mv].p).sort((a, b) => data.moves[b[0]].p - data.moves[a[0]].p).slice(0, 4);
  if (best.length) box.append(el('div', 'dim', `Signature moves: ${best.map(([mv, l]) => `${data.moves[mv].n} (Lv${l})`).join(', ')}`));
  return box;
}

function showInfo(root, form, live) { root.textContent = ''; if (form) root.append(card(form, live)); }

const pickers = [];
function picker(root, label) {
  const head = el('div', 'pickHead'), search = el('input'), grid = el('div', 'grid'), count = el('span', 'dim');
  search.placeholder = 'Search Pokémon...';
  head.append(search, count);
  root.append(head, grid);
  const buttons = pickable.map(sp => {
    const s = data.species[sp], b = el('button', 'mon'), img = el('img');
    img.loading = 'lazy'; img.src = `/sprites/${spriteId(s.base)}.png`; img.alt = '';
    b.append(img, el('span', '', s.n));
    b.onclick = () => profile.unlocked(sp) && select(sp);
    grid.append(b);
    return [sp, b];
  });
  const refresh = () => {
    let n = 0;
    for (const [sp, b] of buttons) {
      const ok = profile.unlocked(sp);
      n += ok;
      b.classList.toggle('locked', !ok);
      b.title = ok ? '' : 'Catch one to unlock';
      b.querySelector('span').textContent = ok || profile.p.seen[sp] ? data.species[sp].n : '???';
    }
    count.textContent = `${n}/${buttons.length} unlocked`;
  };
  const select = sp => {
    chosen = sp; store.set('sp', sp ?? '');
    for (const p of pickers) p.mark(sp);
  };
  const mark = sp => {
    for (const [s, b] of buttons) b.classList.toggle('sel', s === sp);
    document.querySelectorAll('.chosen').forEach(c => { c.textContent = sp ? data.species[sp].n : 'Random'; });
    const info = root.parentElement.querySelector('.pickInfo');
    if (info) showInfo(info, sp && data.species[sp].base);
    document.querySelectorAll('.shinyRow').forEach(r => { r.hidden = !sp || !profile.shinyOk(sp); });
  };
  search.oninput = () => {
    const q = search.value.toLowerCase();
    for (const [sp, b] of buttons) b.hidden = q && !data.species[sp].n.toLowerCase().includes(q);
  };
  pickers.push({ mark, refresh });
  refresh(); mark(chosen);
  label && (label.onclick = () => select(null));
}
picker($('#menuPicker'), $('#randomBtn'));
picker($('#deathPicker'));
document.querySelectorAll('.shinyToggle').forEach(t => {
  t.checked = wantShiny;
  t.onchange = () => { wantShiny = t.checked; store.set('shiny', wantShiny ? '1' : '0'); document.querySelectorAll('.shinyToggle').forEach(o => { o.checked = wantShiny; }); };
});

function spawnChoice() {
  const sp = chosen && profile.unlocked(chosen) ? chosen : pickRandom();
  return { sp, opts: { mastery: profile.mastery(sp), shiny: wantShiny && profile.shinyOk(sp) } };
}
function pickRandom() { const ids = profile.starterIds(); return ids[Math.random() * ids.length | 0]; }

function profileSummary() {
  const p = profile.p, seen = Object.keys(p.seen).length, caught = Object.keys(p.caught).length;
  $('#profileBox').textContent = `Pokédex ${seen} seen · ${caught} caught · best Lv${p.best} · ${p.kos} KOs · ${p.wins} BR wins · ${p.raids} raids`;
}
profileSummary();

function startAttract() {
  attract = new Offline(data, null, null, 'ffa');
  renderer.setMap(attract.map);
  let focus = 0, t0 = performance.now(), prev = t0;
  const tick = now => {
    if (!attract) return;
    const f = attract.frame(Math.min(0.05, (now - prev) / 1000));
    prev = now;
    const alive = f.snap.p.filter(p => p.bt && !p.d);
    if (!alive.some(p => p.id === focus) || now - t0 > 12000) { focus = alive[Math.random() * alive.length | 0]?.id; t0 = now; renderer.camInit = false; }
    const players = new Map(f.snap.p.map(p => [p.id, p]));
    for (const e of f.fx) renderer.addFx(e, players, focus);
    const fp = players.get(focus);
    renderer.draw(f.snap, { id: focus, region: fp ? attract.w.regionOf(fp.x, fp.y) : 0 }, attract.orbs);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
startAttract();

async function start(mode) {
  audio.start();
  const name = $('#name').value.trim().slice(0, 16) || 'Red';
  store.set('name', name);
  store.set('controls', $('#controls').value);
  input.follow = $('#controls').value === 'follow';
  $('#menuErr').textContent = mode === 'lan' ? 'Connecting...' : '';
  const { sp, opts } = spawnChoice();
  try {
    src = mode === 'lan' ? new Net(addChat) : new Offline(data, name, sp, mode, opts);
    if (mode === 'lan') await src.connect(name, sp, opts);
  } catch (e) {
    $('#menuErr').textContent = e.message;
    return;
  }
  profile.bump('games');
  attract = null; renderer.camInit = false;
  renderer.setMap(src.map);
  visited = renderer.visited = new Set();
  quests.fill({ lvl: 5 });
  renderQuests();
  newLife();
  setTimeout(() => audio.cry(dex(sp)), 400);
  $('#menu').hidden = true; $('#hud').hidden = false; $('#chat').hidden = mode !== 'lan';
  last = performance.now();
  requestAnimationFrame(loop);
}
$('#offlineBtn').onclick = () => start('ffa');
$('#brBtn').onclick = () => start('br');
$('#lanBtn').onclick = () => start('lan');

let last = 0, snap = { p: [], pr: [] }, me = null, lbAt = 0, seenAt = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const mine = snap.p.find(p => p.id === me?.id);
  const blocked = me?.dead || document.activeElement === $('#chatIn');
  src.input(blocked ? { ix: 0, iy: 0, aim: mine?.a || 0, use: -1 } : input.read(renderer, mine, snap.p));
  const f = src.frame(dt);
  snap = f.snap; me = f.me;
  const players = new Map(snap.p.map(p => [p.id, p]));
  for (const e of f.fx) { renderer.addFx(e, players, me?.id); onFx(e, players); }
  renderer.draw(snap, me, src.orbs, input.touch, input);
  if (!$('#worldMap').hidden) renderer.drawWorld($('#worldCanvas'), snap, me);
  hud(players, now);
  if (mine && !me.dead) life.peak = Math.max(life.peak, mine.l);
  if (now - seenAt > 1000 && mine) {
    seenAt = now;
    questDone(quests.on({ k: 'tick' }, { lvl: mine.l, region: me.region, town: me.town }));
    renderQuests();
    for (const p of snap.p) if (!p.d && Math.hypot(p.x - mine.x, p.y - mine.y) < 900) profile.see(p.sp);
    profile.best(mine.l);
    profile.save();
  }
  requestAnimationFrame(loop);
}

let life = {};
function newLife() { life = { t0: performance.now(), kos: 0, catches: 0, peak: 5, badges: 0 }; }
const dex = sp => data.pokemon[data.species[sp]?.base]?.id;
function questDone(list) {
  for (const q of list) { src.reward(q.reward); say(`Quest complete: ${quests.label(q)}`); audio.play('lvl'); }
  if (list.length) renderQuests();
}
function renderQuests() {
  const box = $('#questList');
  box.textContent = '';
  for (const q of quests.list) {
    const row = el('div', 'q'), bar = el('i');
    bar.style.width = `${Math.min(1, q.have / q.need) * 100}%`;
    row.append(el('span', '', quests.label(q)), el('span', 'qb'), el('b', '', `${Math.min(q.have, q.need)}/${q.need}`));
    row.children[1].append(bar);
    box.append(row);
  }
}

// FireRed-style location sign that slides in when you enter a new region, town or biome.
let signT = 0, lastSign = '';
function showSign(big, small) {
  const key = big + small;
  if (key === lastSign) return;
  lastSign = key;
  const s = $('#areaSign');
  s.textContent = '';
  s.append(el('b', '', big), el('span', '', small));
  s.classList.remove('show'); void s.offsetWidth; s.classList.add('show');
  clearTimeout(signT); signT = setTimeout(() => s.classList.remove('show'), 2800);
}

function near(e, players, dist = 900) {
  const m = players.get(me?.id), p = e.x === undefined ? players.get(e.id) : e;
  return m && p && Math.hypot(p.x - m.x, p.y - m.y) < dist;
}

function onFx(e, players) {
  const mine = e.id === me?.id;
  const sound = { roll: 'roll', proj: 'cast', multi: 'cast', zone: 'cast', melee: 'melee', aoe: 'aoe', quake: 'aoe', boom: 'boom', beam: 'beam', strike: 'cast', self: 'self', shield: 'self', weather: 'self', throw: 'roll' }[e.k];
  if (sound && near(e, players)) audio.play(sound, e.t);
  else if (e.k === 'dmg' && near(e, players, 700)) {
    audio.play(e.e > 1 || e.c ? 'super' : 'hit');
    if (e.by === me?.id && e.cb === 3) questDone(quests.on({ k: 'combo' }, {}));
  }
  else if (e.k === 'pick' && mine) audio.play(e.it === 'e' || e.it === 'x' ? 'orb' : 'item');
  else if (e.k === 'lvl' && mine) audio.play('lvl');
  else if ((e.k === 'evo' || e.k === 'form') && mine) {
    audio.play('evo'); say(e.s);
    if (e.sp) { profile.see(e.sp); audio.cry(dex(e.sp)); }
    if (e.k === 'evo') questDone(quests.on({ k: 'evolve' }, {}));
  } else if (e.k === 'ko') {
    if (e.by === me?.id) { profile.bump('kos'); life.kos++; questDone(quests.on({ k: 'ko', wild: !!e.w }, {})); }
    if (mine) audio.play('ko');
  } else if (e.k === 'learn' && mine) { say(e.s); audio.play('lvl');
  } else if (e.k === 'fly' && mine) { say(e.s); audio.play('evo');
  } else if (e.k === 'swap' && mine) { toast(e.s); const p = snap.p.find(q => q.id === me.id); if (p) audio.cry(dex(p.sp)); }
  else if (e.k === 'weather' && mine) say(`${e.s}! ${e.t[0].toUpperCase() + e.t.slice(1)} moves are boosted.`);
  else if (e.k === 'catch' && mine) {
    audio.play('evo');
    say(e.s);
    for (const m of profile.caught(e.sp, snap.p.find(p => p.id === e.id)?.sh)) say(m);
    audio.cry(dex(e.sp)); life.catches++;
    questDone(quests.on({ k: 'catch', types: data.pokemon[data.species[e.sp].base].t }, {}));
    pickers.forEach(p => p.refresh());
    profile.save();
  } else if (e.k === 'raid' && mine) { profile.bump('raids'); audio.play('lvl'); }
  else if (e.k === 'challenge' && mine) { say(e.s); audio.play('boss'); }
  else if (e.k === 'badge' && mine) {
    if (e.kind === 'gym') profile.badge(e.region, e.idx); else profile.champion(e.region);
    life.badges++; questDone(quests.on({ k: 'badge' }, {}));
    say(e.s); audio.play('evo'); profile.save();
    if (e.kind === 'gym') toast(`Badges in ${REGIONS[e.region].n}: ${profile.badges(e.region).length}/${REGIONS[e.region].gyms.length}`);
  }
  else if (e.k === 'win') {
    if (mine) profile.bump('wins');
    banner(e.s);
    audio.play('evo');
  } else if (e.k === 'feed') { feed(e.s, e.boss || e.streak >= 5); if (e.boss) { audio.play('boss'); say(e.s); } }
}

const dialogQ = [];
let dialogTimer = 0;
function say(s) {
  dialogQ.push(s);
  if (!dialogTimer) nextDialog();
}
function nextDialog() {
  const s = dialogQ.shift();
  $('#dialog').hidden = !s;
  if (!s) { dialogTimer = 0; return; }
  $('#dialog').textContent = s;
  dialogTimer = setTimeout(nextDialog, 2200);
}

function banner(s) {
  const b = $('#banner');
  b.textContent = s; b.hidden = false;
  clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, 5000);
}

function feed(s, hot) {
  const d = el('div', hot ? 'boss' : '', s);
  $('#feed').prepend(d);
  while ($('#feed').children.length > 5) $('#feed').lastChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, 6000);
}

function addChat(m) {
  const line = el('div', m.n ? '' : 'sys');
  if (m.n) line.append(el('b', '', `${m.n}: `));
  line.append(m.s);
  $('#chatLog').append(line);
  while ($('#chatLog').children.length > 40) $('#chatLog').firstChild.remove();
  $('#chatLog').scrollTop = 1e9;
}

let shown = {}, promptLeader = null;
const setOnce = (key, val, fn) => { if (!(key in shown) || shown[key] !== val) { shown[key] = val; fn(val); } };
function hud(players, now) {
  if (!me) return;
  const p = players.get(me.id);
  if (p) {
    const ratio = Math.max(0, p.hp / p.mh);
    setOnce('name', `${data.species[p.sp].n}${p.sh ? ' ✦' : ''}`, v => { $('#meName').textContent = v; });
    setOnce('lv', p.l, v => { $('#meLv').textContent = `Lv${v}`; });
    setOnce('hp', `${p.hp}/${p.mh}`, v => {
      $('#hpText').textContent = v;
      $('#hpFill').style.width = `${ratio * 100}%`;
      $('#hpFill').style.background = ratio > 0.5 ? '#58d080' : ratio > 0.2 ? '#f8d030' : '#f85838';
    });
    setOnce('st', `${p.s}|${me.temp?.k}|${me.temp?.t}|${me.wx?.t}|${me.wx?.s}|${p.pt}|${me.streak}`, () => {
      const box = $('#meStatus');
      box.textContent = '';
      if (p.s && STATUS[p.s]) { const b = el('span', 'badge', STATUS[p.s][0]); b.style.background = STATUS[p.s][1]; box.append(b, ' '); }
      if (me.wx) { const b = el('span', 'badge', `${me.wx.t.toUpperCase()}${me.wx.s ? ' ' + me.wx.s + 's' : ''}`); b.style.background = TYPE_COLORS[me.wx.t]; box.append(b, ' '); }
      if (me.streak >= 2) { const b = el('span', 'badge', `STREAK ×${me.streak} +${Math.min(me.streak, 10) * 10}% EXP`); b.style.background = '#f88030'; box.append(b, ' '); }
      if (me.temp) box.append(`${me.temp.k === 'mega' ? 'MEGA' : 'DMAX'} ${me.temp.t}s `);
      if (p.pt) box.append('SAFE');
    });
    setOnce('ab', `${p.f}|${me.ab}`, () => {
      const a = data.abilities[me.ab];
      $('#meAb').textContent = `${a?.n || me.ab}${ABIL[me.ab] ? '' : ' (no effect yet)'}`;
      $('#meAb').title = a?.e || '';
      if (!$('#info').hidden) showInfo($('#info'), p.f, me);
    });
    $('#expFill').style.width = `${me.hi > me.lo ? (me.exp - me.lo) / (me.hi - me.lo) * 100 : 100}%`;
  }
  setOnce('where', `${me.region}|${me.biome}|${me.town}`, () => {
    const t = me.town && renderer.towns.find(x => x.n === me.town && x.region === me.region);
    if (t) visited.add(t.id);
    if (!me.dead) showSign(me.town || REGIONS[me.region]?.n, me.town ? `${REGIONS[me.region]?.n} · Pokémon Center` : BIOMES[me.biome]?.n);
    $('#where').textContent = `${REGIONS[me.region]?.n} · ${me.town ? `${me.town} (Pokémon Center: healing)` : BIOMES[me.biome]?.n}`;
  });
  setOnce('bag', `${me.balls}|${me.item}`, () => {
    const it = HELD[me.item];
    $('#ballBtn').querySelector('.n').textContent = `×${me.balls}`;
    const box = $('#held');
    box.textContent = '';
    if (it) { const img = el('img'); img.src = `/items/${me.item}.png`; box.append(img, it.n); box.title = it.e; } else { box.append('No held item'); box.title = 'Pick up held items on the map'; }
  });
  setOnce('party', JSON.stringify(me.party) + (p?.f || '') + me.swapCd, () => renderParty(p));

  moveBtns.forEach((b, i) => {
    const mv = me.moves[i], m = data.moves[mv];
    setOnce('mv' + i, mv, () => {
      b.textContent = '';
      b.classList.toggle('empty', !m);
      b.style.background = m ? TYPE_COLORS[m.t] : '';
      b.append(el('span', 'k', `${i + 1}`), m ? m.n : '—', el('span', 'ty', m ? `${KIND[m.k].label} · ${m.t}${m.p ? ' ' + m.p : ''}` : ''), el('div', 'cd'));
      b.title = m ? `${m.n}: ${KIND_HELP[m.k]}. ${m.c} ${m.t}, power ${m.p || '-'}, PP ${m.pp}${m.ail !== 'none' ? `, may cause ${m.ail}` : ''}${m.mh[1] > 1 ? `, hits ${m.mh[0]}-${m.mh[1]}x` : ''}` : '';
    });
    if (m) b.lastChild.style.height = `${Math.min(1, me.cd[i] / cooldown(m.pp, m.p)) * 100}%`;
  });

  $('#dodgeBtn').lastChild.style.height = `${Math.min(1, me.dcd / me.dmax) * 100}%`;
  setOnce('ups', `${me.pts}|${me.up.join()}`, () => {
    $('#ups').classList.toggle('has', me.pts > 0);
    $('#ups').hidden = !(me.pts > 0);
    $('#upPts').textContent = me.pts > 0 ? `${me.pts} point${me.pts > 1 ? 's' : ''} to spend` : 'Level up to earn points';
    upBtns.forEach((b, i) => {
      b.textContent = '';
      const pips = el('span', 'pips');
      for (let k = 0; k < UPGRADE_MAX; k++) pips.append(el('i', k < me.up[i] ? 'on' : ''));
      b.append(el('span', 'kk', UP_KEYS[i]), el('span', 'nm', STAT_NAMES[i]), pips, el('span', 'plus', me.up[i] >= UPGRADE_MAX ? 'MAX' : '+'));
      b.disabled = !(me.pts > 0) || me.up[i] >= UPGRADE_MAX;
    });
    if (!$('#info').hidden && p) showInfo($('#info'), p.f, me);
  });
  setOnce('pending', me.pending, mv => {
    const box = $('#learn');
    box.hidden = !mv;
    if (!mv) return;
    box.textContent = '';
    box.append(el('div', '', `${data.species[p?.sp]?.n || 'Your Pokémon'} wants to learn ${data.moves[mv].n}! Forget which move? (Shift+1-4, X to skip)`));
    const opts = el('div', 'opts');
    me.moves.forEach((old, i) => { const b = el('button', 'btn', `${i + 1}. ${data.moves[old].n}`); b.onclick = () => src.learn(i); opts.append(b); });
    const skip = el('button', 'btn', `Don't learn`); skip.onclick = () => src.learn(-1);
    opts.append(skip);
    box.append(opts);
  });

  const near = p && snap.p.find(q => q.np && q.np[3] && Math.hypot(q.x - p.x, q.y - p.y) < 300);
  promptLeader = near || null;
  setOnce('prompt', near ? `${near.id}|${near.np[4]}` : '', () => {
    $('#prompt').hidden = !near;
    if (!near) return;
    const [kind, r, idx] = near.np, reg = REGIONS[r];
    if (near.np[4]) { $('#prompt').textContent = `${near.n} is resting...`; return; }
    if (kind === 1) {
      const [n, t, badge] = reg.gyms[idx], got = profile.badges(r).includes(idx);
      $('#prompt').textContent = `G: challenge ${n} (${t.toUpperCase()}) for the ${badge}${got ? ' ✓' : ''}`;
    } else {
      const need = Math.min(8, reg.gyms.length), have = profile.badges(r).length;
      $('#prompt').textContent = have >= need ? `G: challenge the ${reg.league.n} (${reg.league.members.length} battles in a row)` : `${reg.league.n}: collect ${need} ${reg.n} badges first (${have}/${need})`;
    }
  });
  const br = snap.br;
  $('#brBox').hidden = !br;
  if (br) {
    setOnce('br', `${br.round}|${br.alive}|${br.wait}|${br.shrink}|${br.over}|${br.ph}`, () => {
      $('#brBox').textContent = br.over ? `Next round in ${br.over}s` : `Round ${br.round} · ${br.alive} alive · ${br.shrink ? 'ZONE CLOSING!' : `zone shrinks in ${br.wait}s`}`;
      $('#brBox').classList.toggle('hot', !!br.shrink);
    });
  }
  setOnce('dead', `${me.dead}|${br?.over ? 1 : 0}`, () => {
    $('#death').hidden = !me.dead;
    if (!me.dead) return;
    pickers.forEach(pk => pk.refresh());
    const sp = p ? data.species[p.sp].n : 'Your Pokémon';
    const place = me.mode === 'br' && me.place ? ` You placed #${me.place}.` : '';
    $('#deathMsg').textContent = `${sp} fainted!${me.killer ? ` KO'd by ${me.killer}.` : ''}${place}`;
    const secs = Math.round((performance.now() - life.t0) / 1000);
    $('#lifeStats').textContent = `This run: ${Math.floor(secs / 60)}m ${secs % 60}s · peak Lv${life.peak} · ${life.kos} KOs · ${life.catches} caught · ${life.badges} badges`;
    $('#deathSub').textContent = me.mode === 'br' && !br?.over ? 'Spectating until the round ends...' : 'Pick a partner and jump back in:';
  });
  $('#respawnBtn').disabled = !(me.deadT > 1.5) || (me.mode === 'br' && !br?.over);

  if (now - lbAt > 500) {
    lbAt = now;
    const ranked = [...players.values()].filter(q => !q.w && !q.np).sort((a, b) => b.e - a.e);
    const list = $('#lbList');
    list.textContent = '';
    ranked.slice(0, 10).forEach(q => list.append(el('li', `${q.id === me.id ? 'mine' : ''} ${q.d ? 'out' : ''}`, `${q.n} · ${data.species[q.sp].n} Lv${q.l}${q.ks >= 3 ? ` ×${q.ks}` : ''}`)));
    const rank = ranked.findIndex(q => q.id === me.id);
    $('#myRank').textContent = rank >= 10 ? `You: #${rank + 1}` : '';
  }
}

function renderParty(p) {
  const box = $('#party');
  box.textContent = '';
  const slot = (form, lvl, hp, mh, sh, label, onClick, cls) => {
    const b = el('button', `slot ${cls}`), img = el('img'), bar = el('i'), wrap = el('span', 'hpb');
    img.src = `/sprites/${sh ? 'shiny/' : ''}${spriteId(form)}.png`; img.alt = '';
    bar.style.width = `${Math.max(0, hp / mh) * 100}%`;
    wrap.append(bar);
    b.append(img, el('span', 'lv', `Lv${lvl}`), wrap, el('span', 'key', label));
    if (onClick) b.onclick = onClick;
    box.append(b);
  };
  if (p) slot(p.f, p.l, p.hp, p.mh, p.sh, 'ACTIVE', null, 'active');
  me.party.forEach((m, i) => slot(m.form, m.lvl, m.hp, m.mh, m.sh, m.fainted ? 'FAINTED' : me.swapCd > 0 ? '...' : i ? 'R×2' : 'R', () => src.swap(i), m.fainted ? 'fainted' : ''));
  for (let i = me.party.length; i < 2; i++) box.append(el('div', 'slot empty', 'Catch with C'));
}

function openJourney() {
  const box = $('#journeyList');
  box.textContent = '';
  let total = 0, got = 0;
  REGIONS.forEach((r, i) => {
    const row = el('div', 'jRow'), b = profile.badges(i), champ = profile.champs(i);
    total += r.gyms.length; got += b.length;
    row.append(el('b', '', r.n), el('div', 'dim', r.arc));
    const badges = el('div', 'jBadges');
    r.gyms.forEach(([n, t, badge, town], gi) => {
      const c = el('span', `jBadge ${b.includes(gi) ? 'got' : ''}`, b.includes(gi) ? '●' : '○');
      c.style.color = TYPE_COLORS[t]; c.title = `${badge} · ${n} (${t}) at ${town}`;
      badges.append(c);
    });
    badges.append(el('span', `jLeague ${champ ? 'got' : ''}`, `${r.league.n}${champ ? ` ★×${champ}` : ''}`));
    row.append(badges);
    row.title = `${r.league.n}: ${r.league.members.map(m => m[0]).join(' → ')}`;
    box.append(row);
  });
  $('#journeyHead').textContent = `Journey · ${got}/${total} badges · ${REGIONS.filter((_, i) => profile.champs(i)).length}/${REGIONS.length} leagues conquered`;
  $('#journey').hidden = false;
}

function swapNext() {
  const i = me?.party.findIndex(m => !m.fainted);
  if (i >= 0) src.swap(i);
}

function toggleInfo() {
  const box = $('#info'), p = snap.p.find(q => q.id === me?.id);
  box.hidden = !box.hidden;
  if (!box.hidden && p) showInfo(box, p.f, me);
}
let visited = new Set();
// Click a town you've visited this game to Fly there.
$('#worldCanvas').onclick = e => {
  e.stopPropagation();
  const c = $('#worldCanvas'), rect = c.getBoundingClientRect(), s = renderer.worldScale, k = c.width / rect.width;
  const mx = (e.clientX - rect.left) * k, my = (e.clientY - rect.top) * k;
  const t = renderer.towns.reduce((a, t) => (Math.hypot(t.x * s - mx, t.y * s - my) < Math.hypot(a.x * s - mx, a.y * s - my) ? t : a));
  if (Math.hypot(t.x * s - mx, t.y * s - my) > 14) return;
  if (!visited.has(t.id)) return toast(`Visit ${t.n} first to unlock Fly there`);
  src.fly(t.id); toggleMap();
};

function toggleMap() {
  const m = $('#worldMap');
  m.hidden = !m.hidden;
  if (!m.hidden) { const c = $('#worldCanvas'), s = Math.min(innerWidth, innerHeight) * 0.86 | 0; c.width = c.height = s; }
}

function openDex(region = 0) {
  const box = $('#dexGrid'), tabs = $('#dexTabs');
  tabs.textContent = '';
  DEX_TABS.forEach(([n], i) => { const b = el('button', `btn ${i === region ? 'sel' : ''}`, n); b.onclick = () => openDex(i); tabs.append(b); });
  box.textContent = '';
  const ranges = DEX_TABS[region][1], p = profile.p;
  const list = Object.keys(data.species).filter(sp => { const id = dexId(sp); return ranges.some(([lo, hi]) => id >= lo && id <= hi); }).sort((a, b) => dexId(a) - dexId(b));
  let seen = 0, caught = 0;
  for (const sp of list) {
    const s = p.seen[sp], c = p.caught[sp], cell = el('div', `dexCell ${s ? '' : 'unseen'} ${c ? 'caught' : ''}`), img = el('img');
    seen += !!s; caught += !!c;
    img.loading = 'lazy'; img.src = `/sprites/${spriteId(data.species[sp].base)}.png`; img.alt = '';
    cell.append(img, el('span', '', `#${String(dexId(sp)).padStart(4, '0')}`), el('b', '', s ? data.species[sp].n : '???'));
    if (c) cell.append(el('i', '', `●${c > 1 ? ' ×' + c : ''}`));
    cell.title = s ? `${data.species[sp].n}${c ? ` · caught ${c}` : ''}${profile.unlocked(profile.root(sp)) ? ' · line unlocked' : ''}` : 'Not seen yet';
    box.append(cell);
  }
  $('#dexHead').textContent = `${DEX_TABS[region][0]} Pokédex: ${seen}/${list.length} seen · ${caught} caught`;
  $('#dex').hidden = false;
}

$('#infoBtn').onclick = toggleInfo;
$('#mapBtn').onclick = toggleMap;
$('#worldMap').onclick = toggleMap;
$('#dexBtn').onclick = () => openDex();
$('#journeyBtn').onclick = openJourney;
$('#journeyBtn2').onclick = openJourney;
$('#journeyClose').onclick = () => { $('#journey').hidden = true; };
$('#dexClose').onclick = () => { $('#dex').hidden = true; profileSummary(); };
$('#respawnBtn').onclick = () => { const { sp, opts } = spawnChoice(); src.respawn(sp, opts); newLife(); setTimeout(() => audio.cry(dex(sp)), 300); };
$('#muteBtn').onclick = () => { $('#muteBtn').textContent = audio.toggle() ? 'SOUND ON' : 'SOUND OFF'; };

let toastT = 0;
function toast(s) { $('#toast').hidden = false; $('#toast').textContent = s; clearTimeout(toastT); toastT = setTimeout(() => { $('#toast').hidden = true; }, 1500); }

// Settings / pause overlay (Esc). Offline play pauses underneath it.
function applySettings() {
  renderer.opts = settings;
  audio.setVolumes(settings.music, settings.sfx);
  store.set('settings', JSON.stringify(settings));
}
function toggleSettings(open = $('#settings').hidden) {
  $('#settings').hidden = !open;
  if (src && !src.lan) src.paused = open;
  $('#setMusic').value = settings.music; $('#setSfx').value = settings.sfx;
  $('#setParticles').value = settings.particles; $('#setShake').checked = settings.shake; $('#setNames').checked = settings.names;
}
$('#setMusic').oninput = e => { settings.music = +e.target.value; applySettings(); };
$('#setSfx').oninput = e => { settings.sfx = +e.target.value; applySettings(); };
$('#setParticles').onchange = e => { settings.particles = e.target.value; applySettings(); };
$('#setShake').onchange = e => { settings.shake = e.target.checked; applySettings(); };
$('#setNames').onchange = e => { settings.names = e.target.checked; applySettings(); };
$('#resumeBtn').onclick = () => toggleSettings(false);
$('#quitBtn').onclick = () => { profile.save(); location.reload(); };
$('#settingsBtn').onclick = () => toggleSettings();
$('#menuSettingsBtn').onclick = () => toggleSettings();
$('#swapBtn').onclick = () => swapNext();
$('#gBtn').onclick = () => { if (promptLeader && !promptLeader.np[4]) src.challenge(promptLeader.id, profile.badges(promptLeader.np[1]).length); };

addEventListener('keydown', e => {
  if (e.code === 'Escape' && !e.target.closest?.('input')) {
    if (!$('#dex').hidden) { $('#dex').hidden = true; return; }
    if (!$('#journey').hidden) { $('#journey').hidden = true; return; }
    if (!$('#worldMap').hidden) { toggleMap(); return; }
    if (!me?.pending) { toggleSettings(); return; }
  }
  if (!src) return;
  const chat = $('#chatIn');
  if (e.target === chat) {
    if (e.key === 'Enter') { if (chat.value.trim()) src.chat(chat.value); chat.value = ''; chat.blur(); }
    if (e.key === 'Escape') chat.blur();
    return;
  }
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Enter' && src.lan) { e.preventDefault(); chat.focus(); }
  else if (e.code === 'KeyM') $('#muteBtn').click();
  else if (!e.shiftKey && /^Digit[5-90]$/.test(e.code) && me && !me.dead) src.upgrade(UP_KEYS.indexOf(e.code.at(-1)));
  else if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); toggleInfo(); }
  else if (e.code === 'KeyO') toggleMap();
  else if (e.code === 'KeyJ') { if ($('#journey').hidden) openJourney(); else $('#journey').hidden = true; }
  else if (e.code === 'KeyG' && promptLeader && !promptLeader.np[4]) src.challenge(promptLeader.id, profile.badges(promptLeader.np[1]).length);
  else if (e.code === 'KeyR' && !e.repeat) swapNext();
  else if (e.code === 'KeyF') { input.follow = !input.follow; toast(input.follow ? 'Mouse steering ON' : 'WASD movement'); }
  else if (me?.pending && e.shiftKey && /^Digit[1-4]$/.test(e.code)) src.learn(+e.code.at(-1) - 1);
  else if (me?.pending && (e.code === 'KeyX' || e.code === 'Escape')) src.learn(-1);
  else if (me?.dead && e.code === 'Space') { e.preventDefault(); $('#respawnBtn').click(); }
});
