// Original route-style chiptune and SFX synthesized with WebAudio (no audio files).
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = n => { const m = /^([A-G]#?)(\d)$/.exec(n); return 440 * 2 ** ((NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12); };

const LEAD = `F#5:2 A5:2 D6:3 C#6:1 | B5:2 A5:2 E5:4 | F#5:2 G5:1 A5:1 B5:2 D6:2 | C#6:2 B5:2 A5:2 G5:2 |
  F#5:2 A5:2 D6:2 E6:2 | F#6:3 E6:1 C#6:2 A5:2 | B5:2 G5:2 E5:2 C#6:2 | D6:6 R:2 |
  D5:2 G5:2 B5:3 A5:1 | G5:2 E5:2 C#5:4 | F#5:2 A5:2 C#6:2 A5:2 | B5:4 D6:2 B5:2 |
  G5:2 B5:2 D6:2 G6:2 | F#6:2 E6:2 C#6:2 E6:2 | D6:2 A5:2 F#5:2 A5:2 | D6:4 R:4`;
const CHORDS = ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A', 'G', 'A', 'F#m', 'Bm', 'G', 'A', 'D', 'D'];
const TRIAD = { D: ['D', 'F#', 'A'], A: ['A', 'C#', 'E'], Bm: ['B', 'D', 'F#'], G: ['G', 'B', 'D'], 'F#m': ['F#', 'A', 'C#'] };
const STEP = 60 / 150 / 2;

function buildSong() {
  const lead = [];
  let s = 0;
  for (const tok of LEAD.replace(/\|/g, ' ').trim().split(/\s+/)) {
    const [n, d] = tok.split(':');
    if (n !== 'R') lead.push([s, freq(n), +d]);
    s += +d;
  }
  return { lead, steps: s };
}

const TYPE_PITCH = { fire: 330, water: 262, electric: 660, grass: 294, ice: 880, fighting: 196, poison: 233, ground: 147, flying: 523, psychic: 587, bug: 392, rock: 165, ghost: 208, dragon: 175, dark: 185, steel: 740, fairy: 784, normal: 440 };

export class Audio {
  constructor() { this.on = true; this.song = buildSong(); }

  start() {
    if (this.ctx) return;
    const C = this.ctx = new AudioContext();
    this.master = C.createGain(); this.master.gain.value = 0.5; this.master.connect(C.destination);
    this.music = C.createGain(); this.music.gain.value = 0.22 * (this.vol?.music ?? 1); this.music.connect(this.master);
    this.sfx = C.createGain(); this.sfx.gain.value = 0.5 * (this.vol?.sfx ?? 1); this.sfx.connect(this.master);
    const len = C.sampleRate * 0.5, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const real = new Float32Array(16), imag = new Float32Array(16);
    for (let n = 1; n < 16; n++) imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25); // 25% pulse wave
    this.pulse = C.createPeriodicWave(real, imag);
    this.step = 0; this.next = C.currentTime + 0.1;
    setInterval(() => this.schedule(), 50);
  }

  setVolumes(music, sfx) {
    this.vol = { music, sfx };
    if (this.music) { this.music.gain.value = 0.22 * music; this.sfx.gain.value = 0.5 * sfx; }
  }

  // Real Pokémon cry (OGG from PokeAPI), played through a plain audio element.
  cry(id) {
    if (!this.on || !id) return;
    const a = new window.Audio(`/cries/${id}.ogg`);
    a.volume = Math.min(1, 0.35 * (this.vol?.sfx ?? 1));
    a.play().catch(() => {});
  }

  toggle() { this.on = !this.on; if (this.master) this.master.gain.value = this.on ? 0.5 : 0; return this.on; }

  tone(t, f, dur, { type = 'square', vol = 0.3, to, out = this.sfx, wave } = {}) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hiss(t, dur, vol, hp = 4000, out = this.sfx) {
    const C = this.ctx, s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
    s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t); s.stop(t + dur);
  }

  schedule() {
    const C = this.ctx, { lead, steps } = this.song;
    while (this.next < C.currentTime + 0.25) {
      const s = this.step % steps, t = this.next, bar = s / 8 | 0, chord = TRIAD[CHORDS[bar]];
      for (const [at, f, d] of lead) if (at === s) this.tone(t, f, d * STEP * 0.95, { wave: this.pulse, vol: 0.32, out: this.music });
      this.tone(t, freq(chord[[0, 1, 2, 1][s % 4]] + '4'), STEP * 0.6, { type: 'square', vol: 0.08, out: this.music });
      const root = freq(chord[0] + '2') * (s % 2 ? 2 : 1);
      this.tone(t, root, STEP * 0.9, { type: 'triangle', vol: 0.45, out: this.music });
      if (s % 4 === 0) this.tone(t, 150, 0.12, { type: 'sine', vol: 0.6, to: 40, out: this.music });
      if (s % 4 === 2) this.hiss(t, 0.1, 0.3, 1500, this.music);
      this.hiss(t, 0.03, 0.12, 7000, this.music);
      this.step++; this.next += STEP;
    }
  }

  play(kind, type) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, p = TYPE_PITCH[type] || 440;
    if (kind === 'cast') this.tone(t, p * 2, 0.12, { vol: 0.12, to: p });
    else if (kind === 'melee') { this.hiss(t, 0.08, 0.25, 2000); this.tone(t, p, 0.08, { vol: 0.12, to: p / 2 }); }
    else if (kind === 'aoe') { this.hiss(t, 0.35, 0.3, 300); this.tone(t, p / 2, 0.35, { type: 'sawtooth', vol: 0.12, to: 60 }); }
    else if (kind === 'roll') this.hiss(t, 0.18, 0.2, 2500);
    else if (kind === 'beam') { this.tone(t, p * 2, 0.35, { type: 'sawtooth', vol: 0.1, to: p / 2 }); this.hiss(t, 0.3, 0.15, 3000); }
    else if (kind === 'boom') { this.hiss(t, 0.5, 0.45, 150); this.tone(t, 120, 0.5, { type: 'sine', vol: 0.5, to: 30 }); }
    else if (kind === 'self') [0, 1, 2].forEach(i => this.tone(t + i * 0.06, p * (1 + i * 0.25), 0.08, { vol: 0.1 }));
    else if (kind === 'hit') { this.hiss(t, 0.1, 0.35, 800); this.tone(t, 220, 0.1, { vol: 0.15, to: 80 }); }
    else if (kind === 'super') { this.hiss(t, 0.18, 0.45, 500); this.tone(t, 330, 0.18, { vol: 0.2, to: 60 }); }
    else if (kind === 'orb') this.tone(t, 1320 + Math.random() * 200, 0.05, { vol: 0.05 });
    else if (kind === 'item') [988, 1319].forEach((f, i) => this.tone(t + i * 0.08, f, 0.12, { vol: 0.15 }));
    else if (kind === 'lvl') [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.09, f, 0.14, { vol: 0.18, wave: this.pulse }));
    else if (kind === 'evo') [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.12, f, 0.2, { vol: 0.2, wave: this.pulse }));
    else if (kind === 'ko') this.tone(t, 600, 0.6, { vol: 0.25, to: 60 });
    else if (kind === 'boss') [0, 0.3, 0.6].forEach(d => this.tone(t + d, 220, 0.25, { type: 'sawtooth', vol: 0.18, to: 440 }));
  }
}
