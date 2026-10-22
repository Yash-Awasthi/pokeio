// Downloads each species' latest cry (OGG) from the PokeAPI cries repo into public/cries/{dex id}.ogg.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/cries');
const ids = Array.from({ length: 1025 }, (_, i) => i + 1);
let i = 0, ok = 0;
await Promise.all(Array.from({ length: 10 }, async () => {
  while (i < ids.length) {
    const id = ids[i++], file = path.join(OUT, `${id}.ogg`);
    try { await fs.access(file); ok++; continue; } catch {}
    const r = await fetch(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`).catch(() => null);
    if (r?.ok) { await fs.writeFile(file, Buffer.from(await r.arrayBuffer())); ok++; }
  }
}));
console.log(`cries: ${ok}/${ids.length}`);
