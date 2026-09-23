import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

/**
 * Persistenz als JSON-Datei. Ein Serverneustart darf den Spielstand nicht
 * verlieren, deshalb wird nach jeder Änderung geschrieben,
 * gebündelt über einen kurzen Timer und atomar per rename.
 *
 * BBB_STATE_FILE legt den Spielstand woandershin. Der Kartenkatalog bleibt
 * dabei, wo er ist. Gedacht für Tests und für einen Probelauf, der die echte
 * Party nicht überschreiben soll. BBB_STATE_FILE=none schaltet das Speichern
 * ganz ab, dann lebt die Runde nur im Arbeitsspeicher.
 */

const OVERRIDE = process.env.BBB_STATE_FILE || '';
export const EPHEMERAL = OVERRIDE === 'none';
const STATE_FILE = OVERRIDE && !EPHEMERAL ? path.resolve(OVERRIDE) : path.join(DATA_DIR, 'state.json');
const STATE_DIR = path.dirname(STATE_FILE);
const BACKUP_FILE = `${STATE_FILE.replace(/\.json$/, '')}.backup.json`;
const SNAPSHOT_DIR = path.join(STATE_DIR, 'snapshots');

// Die eine Sicherungsdatei ist höchstens eine Minute alt. Das hilft gegen einen
// abgebrochenen Schreibvorgang, aber nicht gegen einen Fehler, den erst zwei
// Stunden später jemand bemerkt. Deshalb zusätzlich ein Stand pro Stunde,
// höchstens SNAPSHOT_KEEP Stück, damit die Platte nicht vollläuft.
const SNAPSHOT_EVERY = 60 * 60 * 1000;
const SNAPSHOT_KEEP = 12;

let pending = null;
let lastWrite = 0;
let lastSnapshot = 0;

export function loadState() {
  if (EPHEMERAL) return null;
  for (const file of [STATE_FILE, BACKUP_FILE]) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.players)) {
        console.log(
          `[store] Spielstand geladen: ${parsed.players.length} Spieler, ${parsed.events.length} Events`,
        );
        return parsed;
      }
    } catch {
      /* nächste Datei versuchen */
    }
  }
  return null;
}

function write(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const json = JSON.stringify(state);
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, json);
  if (fs.existsSync(STATE_FILE) && Date.now() - lastWrite > 60000) {
    try {
      fs.copyFileSync(STATE_FILE, BACKUP_FILE);
    } catch {
      /* Backup ist nice-to-have */
    }
  }
  fs.renameSync(tmp, STATE_FILE);
  lastWrite = Date.now();
  snapshot(json);
}

/**
 * Stündlicher Stand mit Zeitstempel im Namen. Kostet bei 12 Ständen weniger
 * als ein Foto und rettet einen Abend, an dem jemand zwei Stunden zu spät
 * merkt, dass die Punkte nicht stimmen.
 */
function snapshot(json) {
  const now = Date.now();
  if (now - lastSnapshot < SNAPSHOT_EVERY) return;
  lastSnapshot = now;
  try {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 13).replace(/[:T-]/g, '');
    fs.writeFileSync(path.join(SNAPSHOT_DIR, `state-${stamp}.json`), json);

    const files = fs
      .readdirSync(SNAPSHOT_DIR)
      .filter((f) => /^state-\d+\.json$/.test(f))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - SNAPSHOT_KEEP))) {
      fs.rmSync(path.join(SNAPSHOT_DIR, old), { force: true });
    }
  } catch (err) {
    // Ein fehlgeschlagener Zwischenstand darf den laufenden Abend nicht stören.
    console.warn('[store] Zwischenstand nicht geschrieben:', err.message);
  }
}

export function persist(state) {
  if (EPHEMERAL) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    try {
      write(state);
    } catch (err) {
      console.error('[store] Schreiben fehlgeschlagen:', err.message);
    }
  }, 150);
}

export function persistNow(state) {
  if (EPHEMERAL) return;
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  try {
    write(state);
  } catch (err) {
    console.error('[store] Schreiben fehlgeschlagen:', err.message);
  }
}
