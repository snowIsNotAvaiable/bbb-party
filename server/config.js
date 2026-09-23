import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// BBB_DATA_DIR verlegt Karten, Katalog und Spielstand komplett woandershin.
// Tests arbeiten damit auf einer Kopie und können den echten Inhalt nicht
// beschädigen, auch nicht wenn sie mittendrin abstürzen.
export const DATA_DIR = process.env.BBB_DATA_DIR
  ? path.resolve(process.env.BBB_DATA_DIR)
  : path.join(DIR, 'data');
// BBB_CONFIG_FILE zieht die Laufzeit-Einstellungen woandershin, damit ein Test
// oder ein Probelauf die echte Konfiguration nicht anfasst. Passt zu
// BBB_STATE_FILE in server/store.js.
const CONFIG_FILE = process.env.BBB_CONFIG_FILE
  ? path.resolve(process.env.BBB_CONFIG_FILE)
  : path.join(DATA_DIR, 'config.json');

/** Alle Stellschrauben aus dem Plan. Im Admin zur Laufzeit änderbar. */
export const DEFAULTS = {
  port: 3000,
  hostPin: '2409',

  // Reroll (docs/rules.md)
  rerollScaling: 'linear', // 'linear' = ×n, 'exponential' = ×2^(n-1)
  rerollLimitPerCard: 3, // so oft darf man dieselbe Karte wegwerfen

  // Beobachter (docs/rules.md)
  observerCount: 1,
  maxOpenObservationsPerPlayer: 0, // 0 = kein Ausschluss

  // Sonderauftrag, früher „Der Ruf" (docs/rules.md)
  wildcardEnabled: true,
  wildcardIntervalMinMin: 15,
  wildcardIntervalMaxMin: 25,
  wildcardTimeoutMin: 5,
  wildcardPoints: 25,
  wildcardObserverCount: 2,
  wildcardBlindAccept: true, // Variante B

  // Black Market (docs/rules.md)
  betsEnabled: true,
  betStakeCap: 25,
  betOfferExpiryMin: 15,

  // Shop (docs/rules.md)
  shopEnabled: true,
  shopAllowNegative: true,
  maxForeignEffects: 1,
  drinkItemCooldownMin: 20,

  // Special Cards
  specialsEnabled: true,
  specialChance: 0.05,
  catBlessingIntervalMin: 5,

  // Kartenpool
  emptyPoolBehavior: 'reshuffle', // 'reshuffle' | 'stop'

  // Auswertung (docs/rules.md)
  podiumSize: 3,
  loserBucketsOverride: 0, // 0 = automatisch nach Gruppengröße
  tieBreak: 'earliest',

  // Sonstiges
  partyTitle: "Buki's Birthday Bash",
  partyAge: 24,
};

function read() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

let current = { ...DEFAULTS, ...read() };

export function getConfig() {
  return current;
}

export function setConfig(patch) {
  current = { ...current, ...patch };
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2));
  return current;
}
