/**
 * Pixel-Sprites, prozedural aus Zeichenrastern erzeugt.
 * Keine Bilddateien: jede Kombination entsteht im Code und landet als
 * SVG-Data-URL im Cache, damit die App offline läuft.
 */

export const SKIN = ['#f7ddc4', '#f0c9a8', '#e5b48c', '#dba97f', '#c68e5f', '#a9754f', '#8d5a3b', '#6f4a30'];
export const HAIR = ['#2b2431', '#6b4a3a', '#c98fae', '#d9c08f', '#8f9dc9', '#a9738f', '#e4e7f5', '#8fc9b4'];
export const OUTFIT = [
  '#9184d9',
  '#c98fae',
  '#8fc9b4',
  '#d9c08f',
  '#5d5294',
  '#b2b6ca',
  '#c9736b',
  '#6b8fc9',
];

/** Fell: Grundton und Schattenton. Zwölf Varianten statt sechs. */
export const FUR = [
  ['#d9c08f', '#a89066'],
  ['#8f8faa', '#5d5d75'],
  ['#e4e7f5', '#b2b6ca'],
  ['#4a4d5c', '#2f313b'],
  ['#c98fae', '#9c6b86'],
  ['#c98f6b', '#96684c'],
  ['#2b2431', '#151119'],
  ['#f3e2c8', '#cbb397'],
  ['#8fc9b4', '#5f9a86'],
  ['#b5abfc', '#7f76bd'],
  ['#a9754f', '#7a5236'],
  ['#e8a06b', '#b3703f'],
];

export const PATTERNS = ['Einfarbig', 'Getigert', 'Smoking', 'Gefleckt', 'Zweifarbig'];
export const STYLES = ['Kurz', 'Lang', 'Dutt', 'Locken', 'Zöpfe', 'Iro'];
export const ACCS = ['Ohne', 'Brille', 'Schleife', 'Krone', 'Partyhut', 'Shades'];

export const LIMITS = {
  skin: SKIN.length - 1,
  hair: HAIR.length - 1,
  style: STYLES.length - 1,
  acc: ACCS.length - 1,
  outfit: OUTFIT.length - 1,
  fur: FUR.length - 1,
  pattern: PATTERNS.length - 1,
};

const cache = {};
const images = {};

/* ── Menschen ──────────────────────────────────────────────── */

function head() {
  return [
    '................',
    '................',
    '.....ssssss.....',
    '....ssssssss....',
    '...ssssssssss...',
    '...ssssssssss...',
    '...sseesseess...',
    '...ssssssssss...',
    '....sssmmsss....',
    '....ssssssss....',
    '.....ssssss.....',
    '......oooo......',
    '...oooooooooo...',
    '..oooooooooooo..',
    '..oooooooooooo..',
    '..oo.oooooo.oo..',
  ];
}

function hairRows(s) {
  const base = { 1: '....kkkkkkkk....', 2: '...kkkkkkkkkk...', 3: '...kk......kk...' };
  if (s === 0) return { ...base, 4: '...k........k...' };
  if (s === 1)
    return {
      ...base,
      4: '...k........k...',
      5: '...k........k...',
      6: '..kk........kk..',
      7: '..k..........k..',
      8: '..k..........k..',
    };
  if (s === 2) return { 0: '......kkkk......', ...base };
  if (s === 3)
    return {
      0: '...k..kkkk..k...',
      1: '..kkkkkkkkkkkk..',
      2: '...kkkkkkkkkk...',
      3: '..kk........kk..',
      4: '..kk........kk..',
    };
  if (s === 4)
    return {
      ...base,
      4: '..kk........kk..',
      5: '..kk........kk..',
      6: '..kk........kk..',
      7: '..k..........k..',
      8: '..kk........kk..',
      9: '...k........k...',
    };
  return {
    0: '.......kk.......',
    1: '......kkkk......',
    2: '.....kkkkkk.....',
    3: '...kk......kk...',
  };
}

function accRows(a) {
  if (a === 1) return { 5: '....aaaaaaaa....', 6: '....a..aa..a....' };
  if (a === 2) return { 1: '..aa............', 2: '.aaaa...........', 3: '..aa............' };
  if (a === 3) return { 0: '...a..a..a..a...', 1: '...aaaaaaaaaa...' };
  if (a === 4)
    return { 0: '.......aa.......', 1: '......aaaa......', 2: '.....aaaaaa.....', 3: '....aaaaaaaa....' };
  if (a === 5) return { 6: '...aaaaaaaaaa...', 7: '...a.aa..aa.a...' };
  return {};
}

const norm = (cfg) => ({
  skin: cfg?.skin ?? 0,
  hair: cfg?.hair ?? 0,
  style: cfg?.style ?? 0,
  acc: cfg?.acc ?? 0,
  outfit: cfg?.outfit ?? 0,
  fur: cfg?.fur ?? 0,
  pattern: cfg?.pattern ?? 0,
});

export function avatarUrl(rawCfg) {
  const cfg = norm(rawCfg);
  const key = `a${[cfg.skin, cfg.hair, cfg.style, cfg.acc, cfg.outfit].join('-')}`;
  if (cache[key]) return cache[key];

  const g = head().map((r) => r.split(''));
  const hr = hairRows(cfg.style);
  for (const y of Object.keys(hr)) {
    hr[y].split('').forEach((c, x) => {
      if (c === 'k') g[+y][x] = 'k';
    });
  }
  const ar = accRows(cfg.acc);
  for (const y of Object.keys(ar)) {
    ar[y].split('').forEach((c, x) => {
      if (c === 'a') g[+y][x] = 'a';
    });
  }
  const accColor =
    { 1: '#e4e7f5', 2: '#c98fae', 3: '#d9c08f', 4: '#c98fae', 5: '#241f2e' }[cfg.acc] || '#d9c08f';
  const pal = {
    s: SKIN[cfg.skin % SKIN.length],
    k: HAIR[cfg.hair % HAIR.length],
    o: OUTFIT[cfg.outfit % OUTFIT.length],
    e: '#241f2e',
    m: '#b3697f',
    a: accColor,
  };
  cache[key] = render(g, pal, 16, 16);
  return cache[key];
}

/* ── Ganzkörper-Figuren für den Planeten ───────────────────── */

/**
 * Der Kopf (Zeilen 0 bis 10) ist derselbe wie beim Brustbild, deshalb passen
 * Frisuren und Accessoires ohne Änderung darüber. Nur Rumpf, Arme und Beine
 * kommen je nach Haltung dazu.
 */
export const BODY_FRAME = { WALK_A: 0, WALK_B: 1, IDLE: 2, CHEER: 3 };

const BODY_ROWS = [
  // Laufen, linkes Bein vor
  [
    '.....oooooo.....',
    '...oooooooooo...',
    '..soooooooooos..',
    '..soooooooooos..',
    '..soooooooooos..',
    '...oooooooooo...',
    '...ooo....ooo...',
    '..ooo......ooo..',
    '..oo........oo..',
    '.bb..........bb.',
    '................',
  ],
  // Laufen, Beine zusammen, Arme tiefer
  [
    '.....oooooo.....',
    '...oooooooooo...',
    '...oooooooooo...',
    '..soooooooooos..',
    '..soooooooooos..',
    '..soooooooooos..',
    '....oo....oo....',
    '....oo....oo....',
    '....oo....oo....',
    '....bb....bb....',
    '................',
  ],
  // Stehen
  [
    '.....oooooo.....',
    '...oooooooooo...',
    '..soooooooooos..',
    '..soooooooooos..',
    '..soooooooooos..',
    '...oooooooooo...',
    '....oo....oo....',
    '....oo....oo....',
    '....oo....oo....',
    '...bbb...bbb....',
    '................',
  ],
  // Jubeln, Arme fliegen hoch
  [
    '.....oooooo.....',
    '...oooooooooo...',
    '...oooooooooo...',
    '...oooooooooo...',
    '...oooooooooo...',
    '...oooooooooo...',
    '...ooo....ooo...',
    '..ooo......ooo..',
    '..oo........oo..',
    '.bb..........bb.',
    '................',
  ],
];

/** Beim Jubeln gehen die Arme über die Schultern, das liegt über dem Kopf. */
const CHEER_ARMS = [
  [1, 8],
  [1, 9],
  [1, 10],
  [2, 11],
  [14, 8],
  [14, 9],
  [14, 10],
  [13, 11],
];

const BODY_W = 16;
const BODY_H = 22;

export function bodyUrl(rawCfg, frame = BODY_FRAME.IDLE, blink = false) {
  const cfg = norm(rawCfg);
  const key = `b${[cfg.skin, cfg.hair, cfg.style, cfg.acc, cfg.outfit, frame, blink ? 1 : 0].join('-')}`;
  if (cache[key]) return cache[key];

  const g = [];
  const headRows = head();
  for (let y = 0; y <= 10; y++) g.push(headRows[y].split(''));
  for (const row of BODY_ROWS[frame % BODY_ROWS.length]) g.push(row.split(''));

  const hr = hairRows(cfg.style);
  for (const y of Object.keys(hr)) {
    hr[y].split('').forEach((c, x) => {
      if (c === 'k' && g[+y]) g[+y][x] = 'k';
    });
  }
  const ar = accRows(cfg.acc);
  for (const y of Object.keys(ar)) {
    ar[y].split('').forEach((c, x) => {
      if (c === 'a' && g[+y]) g[+y][x] = 'a';
    });
  }

  if (frame === BODY_FRAME.CHEER) {
    for (const [x, y] of CHEER_ARMS) if (g[y] && g[y][x] === '.') g[y][x] = 's';
  }

  // Blinzeln: die Augen rutschen eine Zeile tiefer und werden zum Lid
  if (blink) {
    for (const x of [5, 6, 9, 10]) {
      g[6][x] = 's';
      g[7][x] = 'e';
    }
  }

  const accColor =
    { 1: '#e4e7f5', 2: '#c98fae', 3: '#d9c08f', 4: '#c98fae', 5: '#241f2e' }[cfg.acc] || '#d9c08f';
  cache[key] = render(
    g,
    {
      s: SKIN[cfg.skin % SKIN.length],
      k: HAIR[cfg.hair % HAIR.length],
      o: OUTFIT[cfg.outfit % OUTFIT.length],
      b: '#2b2431',
      e: '#241f2e',
      m: '#b3697f',
      a: accColor,
    },
    BODY_W,
    BODY_H,
  );
  return cache[key];
}

export const BODY_ASPECT = BODY_W / BODY_H;

/* ── Katzen ────────────────────────────────────────────────── */

/**
 * Sechs Haltungen statt zwei: laufen (zwei Phasen), sitzen, putzen,
 * schlafen und springen. Die Map wählt daraus je nach Aktion.
 */
export const CAT_FRAME = { WALK_A: 0, WALK_B: 1, SIT: 2, GROOM: 3, SLEEP: 4, JUMP: 5 };

const CAT_FRAMES = [
  [
    '.f...f......',
    '.ff.ff......',
    '.ffffff...d.',
    '.feffef..df.',
    '.ffpfff.ddf.',
    '..ffff..ff..',
    '.fffffffff..',
    '.ffffffffff.',
    '.f.f...f.f..',
    '............',
  ],
  [
    '............',
    '.f...f....d.',
    '.ff.ff...df.',
    '.ffffff.ddf.',
    '.feffef.ff..',
    '.ffpfff.....',
    '..ffff......',
    '.fffffffff..',
    '.ffffffffff.',
    '.f..f.f..f..',
  ],
  [
    '.f...f......',
    '.ff.ff......',
    '.ffffff.....',
    '.feffef...d.',
    '.ffpfff..dd.',
    '..ffff...df.',
    '.ffffff..df.',
    '.fffffff.d..',
    '.ffffffff...',
    '.ff....ff...',
  ],
  [
    '.f...f......',
    '.ff.ff......',
    '.ffffff...d.',
    '.ffffff..df.',
    '.ffpfff.ddf.',
    '..ffff..ff..',
    '.fffffff....',
    '.ffffffff...',
    '.ff.ff..ff..',
    '............',
  ],
  [
    '............',
    '............',
    '.....ffff...',
    '....ffffff..',
    '...ffffffff.',
    '..ffffffffff',
    '..ffffffffff',
    '..dffffffdd.',
    '...dddddd...',
    '............',
  ],
  [
    '.f...f....d.',
    '.ff.ff...df.',
    '.ffffff.ddf.',
    '.feffef.ff..',
    '.ffpfff.....',
    '..ffff......',
    '.fffffffff..',
    '.ffffffffff.',
    'f..f....f..f',
    '............',
  ],
];

/** Musterüberlagerung: Streifen, Smoking, Flecken, zweifarbig. */
function applyPattern(g, pattern) {
  const set = (y, x, ch) => {
    if (g[y] && g[y][x] && g[y][x] !== '.') g[y][x] = ch;
  };
  if (pattern === 1) {
    for (const y of [2, 3, 6, 7]) for (const x of [2, 4, 6, 8]) set(y, x, 'd');
    set(0, 1, 'd');
    set(0, 5, 'd');
  } else if (pattern === 2) {
    for (const x of [4, 5, 6]) set(7, x, 'w');
    set(6, 5, 'w');
    for (const x of [1, 3, 7, 9]) set(8, x, 'w');
    set(4, 3, 'w');
  } else if (pattern === 3) {
    for (const [y, x] of [
      [2, 3],
      [3, 5],
      [6, 2],
      [6, 7],
      [7, 4],
      [7, 8],
      [4, 6],
    ])
      set(y, x, 'd');
  } else if (pattern === 4) {
    for (let y = 0; y < g.length; y++) for (let x = 0; x < 6; x++) set(y, x, 'w');
  }
  return g;
}

export function catUrl(fur = 0, frame = 0, pattern = 0) {
  const key = `c${fur}-${frame}-${pattern}`;
  if (cache[key]) return cache[key];
  const f = FUR[fur % FUR.length];
  const light = FUR[(fur + 2) % FUR.length][0];
  const grid = applyPattern(
    CAT_FRAMES[frame % CAT_FRAMES.length].map((r) => r.split('')),
    pattern,
  );
  cache[key] = render(
    grid,
    { f: f[0], d: f[1], w: pattern === 2 ? '#f3f5fe' : light, e: '#241f2e', p: '#e6a3bb' },
    12,
    10,
  );
  return cache[key];
}

/* ── Partykatze mit Hut und Wunderkerze ────────────────────── */

const PARTY_CAT = [
  '................',
  '......hh........',
  '.....hhhh.......',
  '....hhhhhh......',
  '...HHHHHHHH.....',
  '..f.ffffff.f....',
  '..ffffffffff....',
  '..ffeffffeff....',
  '..ffffppffff....',
  '...ffffffff.....',
  '..ffffffffff....',
  '..ffffffffff....',
  '..ffffffffff.d..',
  '..ff.ffff.ff.dd.',
];

/** Die Wunderkerze steckt in der rechten Pfote und sprüht nach oben. */
const STICK = [
  [12, 10],
  [13, 9],
  [14, 8],
];

const SPARKS = [
  [
    [15, 6],
    [13, 5],
    [15, 3],
    [12, 4],
  ],
  [
    [14, 5],
    [15, 4],
    [13, 3],
    [14, 7],
  ],
  [
    [13, 6],
    [15, 5],
    [14, 3],
    [12, 5],
  ],
  [
    [15, 7],
    [14, 4],
    [12, 3],
    [13, 4],
  ],
];

/** Hutfarben, aus denen eine gewählt wird, die sich vom Fell abhebt. */
const HAT_COLORS = ['#c98fae', '#9184d9', '#8fc9b4', '#e8a06b', '#6bb0e8', '#d9c08f'];

export function partyCatUrl(fur = 0, frame = 0, pattern = 0) {
  const key = `pc${fur}-${frame}-${pattern}`;
  if (cache[key]) return cache[key];
  const f = FUR[fur % FUR.length];
  // Die erste Hutfarbe nehmen, die nicht dem Fellton entspricht
  const hat = HAT_COLORS.find((c) => c.toLowerCase() !== f[0].toLowerCase()) || HAT_COLORS[1];
  const brim = HAT_COLORS.find((c) => c !== hat && c.toLowerCase() !== f[0].toLowerCase()) || '#d9c08f';
  const g = PARTY_CAT.map((r) => r.split(''));
  for (const [x, y] of STICK) g[y][x] = 's';
  for (const [x, y] of SPARKS[frame % SPARKS.length]) {
    if (g[y] && g[y][x] === '.') g[y][x] = frame % 2 ? 'S' : 'T';
  }
  // Ohren wippen leicht mit
  if (frame % 2) {
    g[5][2] = '.';
    g[5][3] = 'f';
  }
  cache[key] = render(
    g,
    {
      f: f[0],
      d: f[1],
      w: '#f3f5fe',
      e: '#241f2e',
      p: '#e6a3bb',
      h: hat,
      H: brim,
      s: '#9397ab',
      S: '#ffd98a',
      T: '#fff3d8',
    },
    16,
    14,
  );
  return cache[key];
}

/* ── Party-Objekte für den Globus ──────────────────────────── */

const OBJECTS = {
  cake: {
    w: 12,
    h: 12,
    pal: { c: '#f3e6c8', i: '#c98fae', f: '#d9c08f', l: '#e8e05a', p: '#9184d9' },
    rows: [
      '..l...l...l.',
      '..l...l...l.',
      '..p...p...p.',
      '............',
      '..iiiiiiii..',
      '..cccccccc..',
      '.iiiiiiiiii.',
      '.cccccccccc.',
      'iiiiiiiiiiii',
      'ffffffffffff',
      'ffffffffffff',
      '.ffffffffff.',
    ],
  },
  balloon: {
    w: 10,
    h: 14,
    pal: { b: '#c98fae', h: '#e2c6d3', s: '#75798c' },
    rows: [
      '...bbbb...',
      '..bhbbbb..',
      '.bhbbbbbb.',
      '.bhbbbbbb.',
      'bbbbbbbbbb',
      'bbbbbbbbbb',
      '.bbbbbbbb.',
      '..bbbbbb..',
      '...bbbb...',
      '....bb....',
      '....s.....',
      '.....s....',
      '....s.....',
      '.....s....',
    ],
  },
  disco: {
    w: 12,
    h: 14,
    pal: { s: '#75798c', b: '#b2b6ca', h: '#f3f5fe', d: '#5d5294' },
    rows: [
      '.....ss.....',
      '.....ss.....',
      '.....ss.....',
      '...bbbbbb...',
      '..bhbbdbbb..',
      '.bbbdbbbbhb.',
      '.bhbbbbdbbb.',
      'bbbdbbbbbhbb',
      'bbbbbhbbbbdb',
      '.bbdbbbbbbb.',
      '.bbbbbhbbdb.',
      '..bdbbbbbb..',
      '...bbbbbb...',
      '............',
    ],
  },
  present: {
    w: 12,
    h: 12,
    pal: { b: '#9184d9', r: '#d9c08f', d: '#5d5294' },
    rows: [
      '.....rr.....',
      '....r..r....',
      '.....rr.....',
      '..rrrrrrrr..',
      '..bbbrrbbb..',
      '..bbbrrbbb..',
      '.bbbbrrbbbb.',
      '.bbbbrrbbbb.',
      '.bbbbrrbbbb.',
      '.dddd..dddd.',
      '.dddddddddd.',
      '............',
    ],
  },
  speaker: {
    w: 10,
    h: 14,
    pal: { c: '#33364a', d: '#1a1b26', h: '#9184d9', l: '#c98fae' },
    rows: [
      'cccccccccc',
      'cddddddddc',
      'cd.hhhh.dc',
      'cd.hhhh.dc',
      'cddddddddc',
      'cdd.ll.ddc',
      'cd.llll.dc',
      'cd.llll.dc',
      'cdd.ll.ddc',
      'cddddddddc',
      'cd.hhhh.dc',
      'cddddddddc',
      'cccccccccc',
      '.c......c.',
    ],
  },
};

export function objectUrl(kind, tint = 0) {
  const key = `o${kind}-${tint}`;
  if (cache[key]) return cache[key];
  const def = OBJECTS[kind];
  if (!def) return '';
  const pal = { ...def.pal };
  if (kind === 'balloon') {
    const colors = ['#c98fae', '#9184d9', '#8fc9b4', '#d9c08f', '#b5abfc', '#e8a06b'];
    pal.b = colors[tint % colors.length];
  }
  cache[key] = render(
    def.rows.map((r) => r.split('')),
    pal,
    def.w,
    def.h,
  );
  return cache[key];
}

export const OBJECT_KINDS = Object.keys(OBJECTS);

/* ── Renderer ──────────────────────────────────────────────── */

/** Fasst gleichfarbige Läufe pro Zeile zu einem <rect> zusammen. */
function render(g, pal, w, h) {
  let r = '';
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const ch = g[y] && g[y][x];
      const col = ch && ch !== '.' ? pal[ch] : null;
      if (!col) {
        x++;
        continue;
      }
      let n = 1;
      while (x + n < w && g[y][x + n] === ch) n++;
      r += `<rect x='${x}' y='${y}' width='${n}' height='1' fill='${col}'/>`;
      x += n;
    }
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w * 8}' height='${h * 8}' ` +
    `viewBox='0 0 ${w} ${h}' shape-rendering='crispEdges'>${r}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Bild-Cache fürs Canvas: die Data-URLs werden nur einmal dekodiert. */
export function img(src) {
  if (!images[src]) {
    const i = new Image();
    i.src = src;
    images[src] = i;
  }
  return images[src];
}

export function randomCfg() {
  const r = (n) => Math.floor(Math.random() * (n + 1));
  return {
    skin: r(LIMITS.skin),
    hair: r(LIMITS.hair),
    style: r(LIMITS.style),
    acc: r(LIMITS.acc),
    outfit: r(LIMITS.outfit),
    fur: r(LIMITS.fur),
    pattern: r(LIMITS.pattern),
  };
}
