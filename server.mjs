// Static file server plus the authoritative LAN game loop.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { World } from './shared/sim.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODE = process.env.MODE === 'br' ? 'br' : 'ffa', PORT = +process.env.PORT || 3000, MAX = 30, BOTS = +(process.env.BOTS ?? 20), TICK = 50, VIEW = 1800;
const DIRS = ['public', 'shared', 'data'].map(d => path.join(ROOT, d));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/game.json')));
const world = new World(data, { mode: MODE });
const cleanOpts = o => ({ mastery: Math.max(0, Math.min(5, o?.mastery | 0)), shiny: !!o?.shiny });

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') url = '/index.html';
  const top = /^\/(shared|data)\//.test(url) ? ROOT : DIRS[0];
  const file = path.join(top, path.normalize(url));
  if (!DIRS.some(d => file.startsWith(d + path.sep))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const clients = new Map();
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const broadcast = msg => { const s = JSON.stringify(msg); for (const ws of clients.keys()) if (ws.readyState === 1) ws.send(s); };

function fillBots() {
  const bots = [...world.players.values()].filter(p => p.bot && !p.wild && !p.npc);
  const want = Math.max(0, Math.min(BOTS, MAX - clients.size));
  if (bots.length < want) world.addBots(want - bots.length);
  for (const b of bots.slice(want)) world.removePlayer(b.id);
}

wss.on('connection', ws => {
  if (clients.size >= MAX) return ws.close(1013, 'Server full');
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const p = clients.get(ws);
    if (m.t === 'join' && !p) {
      const name = String(m.name || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16) || 'Trainer';
      const pl = world.addPlayer(name, String(m.sp), { opts: cleanOpts(m.opts) });
      clients.set(ws, pl);
      ws.send(JSON.stringify({ t: 'init', id: pl.id, seed: world.seed, mode: MODE, orbs: [...world.orbs.values()] }));
      broadcast({ t: 'chat', s: `${name} joined the battle!` });
      fillBots();
    } else if (!p) {
      return;
    } else if (m.t === 'in') {
      world.setInput(p, m);
    } else if (m.t === 'learn') {
      world.learnMove(p, m.slot);
    } else if (m.t === 'up') {
      world.upgrade(p, m.i);
    } else if (m.t === 'respawn') {
      world.respawn(p, String(m.sp), cleanOpts(m.opts));
    } else if (m.t === 'fly') {
      world.fly(p, m.town | 0);
    } else if (m.t === 'reward') {
      world.reward(p, String(m.kind));
    } else if (m.t === 'challenge') {
      world.challenge(p, m.id | 0, m.badges | 0);
    } else if (m.t === 'swap') {
      world.swapTo(p, m.i | 0);
    } else if (m.t === 'chat') {
      const s = String(m.s || '').trim().slice(0, 120), now = Date.now();
      if (s && now - (p.chatAt || 0) > 700) { p.chatAt = now; broadcast({ t: 'chat', n: p.name, s }); }
    }
  });
  ws.on('close', () => {
    const p = clients.get(ws);
    if (!p) return;
    clients.delete(ws);
    world.removePlayer(p.id);
    broadcast({ t: 'chat', s: `${p.name} left.` });
    fillBots();
  });
});

fillBots();
setInterval(() => {
  world.tick(TICK / 1000);
  const snap = world.snapshot(), orbs = `"oa":${JSON.stringify(world.added)},"or":${JSON.stringify(world.removed)}`;
  for (const [ws, me] of clients) {
    if (ws.readyState !== 1) continue;
    const near = o => o.x === undefined || (Math.abs(o.x - me.x) < VIEW && Math.abs(o.y - me.y) < VIEW);
    // ponytail: JSON snapshots ~5KB/client/tick; switch to binary deltas if Wi-Fi chokes past ~30 players
    const c = { t: snap.t, br: snap.br, day: snap.day, sky: snap.sky, p: snap.p.filter(q => (!q.w && !q.np) || q.b || near(q)), pr: snap.pr.filter(near), z: snap.z.filter(near), fx: snap.fx.filter(f => f.k === 'feed' || near(f)) };
    ws.send(`{"t":"s","c":${JSON.stringify(c)},${orbs},"me":${JSON.stringify(world.mine(me))}}`);
  }
  world.flush();
}, TICK);

server.listen(PORT, () => {
  console.log(`PokeIO running (${MODE === 'br' ? 'Battle Royale' : 'Free-for-all'}):\n  this PC:  http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets) if (n.family === 'IPv4' && !n.internal) console.log(`  LAN:      http://${n.address}:${PORT}`);
  }
});
