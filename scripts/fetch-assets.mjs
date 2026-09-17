/**
 * Holt Inter als WOFF2 einmalig auf Platte. Icons entstehen im Code
 * (client/src/components/PixelIcon.jsx), es wird also nichts weiter geladen.
 * Am Partyabend läuft nichts mehr über das Netz, die App ist offline-tauglich.
 * Aufruf: npm run assets
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = path.join(ROOT, 'client', 'public', 'fonts');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

async function fetchInter() {
  await fs.mkdir(FONT_DIR, { recursive: true });
  const url = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();

  // Nur die latin-Subsets behalten, mehr braucht eine deutsche Party-App nicht.
  const blocks = css.split('/*').filter((b) => b.startsWith(' latin') || b.startsWith(' latin-ext'));
  let out =
    '/* Inter, lokal eingebunden, keine externen Fonts zur Laufzeit.\n' +
    '   Google liefert für alle vier Gewichte dieselbe Datei aus, deshalb\n' +
    '   zeigen alle @font-face-Regeln auf je eine Datei pro Subset. */\n';

  // Pro Subset wird nur einmal geladen. Vorher lagen hier acht Dateien, von
  // denen nur zwei verschieden waren: 532 kB statt 134 kB, die jedes Handy am
  // Abend über das WLAN ziehen musste.
  const geladen = new Map();

  for (const block of blocks) {
    const subset = block.startsWith(' latin-ext') ? 'latin-ext' : 'latin';
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const src = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (!weight || !src) continue;

    const name = `inter-${subset}.woff2`;
    if (!geladen.has(name)) {
      const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
      await fs.writeFile(path.join(FONT_DIR, name), buf);
      geladen.set(name, buf.length);
    }

    out +=
      `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:swap;` +
      `src:url('/fonts/${name}') format('woff2');` +
      (range ? `unicode-range:${range};` : '') +
      '}\n';
  }

  // Altlasten aus früheren Läufen wegräumen, sonst liegen die acht Dateien
  // weiter herum und landen im Build.
  for (const f of await fs.readdir(FONT_DIR)) {
    if (/^inter-latin(-ext)?-\d00\.woff2$/.test(f)) await fs.rm(path.join(FONT_DIR, f));
  }

  await fs.writeFile(path.join(FONT_DIR, 'inter.css'), out);
  const kb = Math.round([...geladen.values()].reduce((a, b) => a + b, 0) / 1024);
  console.log(`[assets] Inter: ${geladen.size} Dateien, ${kb} kB in client/public/fonts`);
}

await fetchInter();
console.log('[assets] fertig.');
