/**
 * Ein zweiter Server zum Üben, auf eigener Ablage und eigenem Port.
 *
 * Gedacht für den Test mit zwei fremden Handys, ohne dass der echte Abend
 * davon etwas mitbekommt: Karten dürfen kaputtgespielt, Punkte verteilt und
 * die Party zurückgesetzt werden. Der echte Spielstand in server/data bleibt
 * unangetastet, weil BBB_DATA_DIR alles nach .probelauf/ umleitet.
 *
 *   npm run probelauf          weitermachen, wo der letzte Test aufhörte
 *   npm run probelauf -- neu   Ablage vorher wegwerfen und frisch kopieren
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL = path.join(ROOT, 'server', 'data');
const SANDBOX = path.join(ROOT, '.probelauf');
const PORT = Number(process.env.PORT) || 3001;

const frisch = process.argv.slice(2).includes('neu');
if (frisch) fs.rmSync(SANDBOX, { recursive: true, force: true });

if (!fs.existsSync(SANDBOX)) {
  fs.cpSync(REAL, SANDBOX, { recursive: true });
  // Der echte Spielstand hat im Probelauf nichts zu suchen.
  for (const f of ['state.json', 'state.backup.json', 'config.json']) {
    fs.rmSync(path.join(SANDBOX, f), { force: true });
  }
  console.log(`[probelauf] Karten frisch nach ${path.relative(ROOT, SANDBOX)} kopiert.`);
} else {
  console.log(`[probelauf] Ablage ${path.relative(ROOT, SANDBOX)} von vorhin wird weiterbenutzt.`);
}

console.log('[probelauf] Der echte Spielstand in server/data wird nicht angefasst.');
console.log(`[probelauf] Zum Wegwerfen: npm run probelauf -- neu\n`);

const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT), BBB_DATA_DIR: SANDBOX },
});

child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
