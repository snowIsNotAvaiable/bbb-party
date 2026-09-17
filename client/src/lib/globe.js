import { bodyUrl, catUrl, objectUrl, img, CAT_FRAME, BODY_FRAME, BODY_ASPECT } from './sprites.js';

/**
 * Der Party-Planet: eine drehbare Pixel-Kugel, auf der alle Gäste herumlaufen.
 * Katzen streunen und machen Pausen, Objekte stehen fest auf der Oberfläche,
 * Ballons und eine Discokugel schweben darüber, und es knallt regelmäßig.
 *
 * Alles läuft in einem einzigen Canvas mit 2D-Kontext: die Punkte werden von
 * Kugelkoordinaten in den Bildschirm projiziert und nach Tiefe sortiert.
 */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** Die Kacheln der Tanzfläche am Äquator. Oben, damit pro Bild kein Array entsteht. */
const FLOOR_COLORS = ['201,143,174', '145,132,217', '217,192,143', '143,201,180'];

/** Das Raster der Tanzfläche steht fest: einmal bauen, nie wieder rechnen. */
const FLOOR = [];
for (let lon = 0; lon < 360; lon += 5) {
  for (const lat of [-5, 0, 5]) {
    FLOOR.push({
      lat,
      lon,
      phase: lon * 0.08 + lat,
      color: FLOOR_COLORS[Math.floor(lon / 5 + lat) % FLOOR_COLORS.length],
    });
  }
}

/** Die Längengrade, auf denen die Luftschlangen liegen. */
const STREAM_STEPS = [];
for (let lon = 0; lon < 360; lon += 2.5) {
  STREAM_STEPS.push({
    rad: lon * DEG,
    sin: Math.sin(lon * DEG),
    cos: Math.cos(lon * DEG),
    odd: Math.floor(lon / 2.5) % 2 === 1,
  });
}

const FIREWORK_COLORS = [
  ['#c98fae', '#e7c3d5', '#ffffff'],
  ['#9184d9', '#d2cefd', '#f5f4ff'],
  ['#d9c08f', '#f3e6c8', '#fffdf4'],
  ['#8fc9b4', '#d6efe5', '#ffffff'],
  ['#e8a06b', '#ffd9b8', '#fff5ea'],
  ['#6bb0e8', '#c2e2ff', '#f2faff'],
  ['#e86b8f', '#ffc2d4', '#fff0f4'],
  ['#8fe86b', '#d4ffc2', '#f4fff0'],
  ['#e8e06b', '#fff9c2', '#fffdf0'],
];

/**
 * Die Deko steht fest auf der Kugel. Die Liste ist bewusst dicht: auf einem
 * halben Planeten sollen immer ein paar Kuchen, Geschenke und Boxen zu sehen
 * sein, egal wie er gerade gedreht ist.
 */
const SURFACE_OBJECTS = (() => {
  const plan = [
    ['cake', 8], ['present', 9], ['speaker', 6],
  ];
  const out = [];
  let i = 0;
  for (const [kind, count] of plan) {
    for (let n = 0; n < count; n++, i++) {
      // Goldener Winkel streut die Objekte gleichmäßig über die Kugel
      const lon = (i * 137.508) % 360;
      const lat = Math.asin(((i / 23) * 2 - 1) * 0.92) / DEG;
      const size = kind === 'speaker' ? 26 : kind === 'cake' ? 30 : 24;
      out.push({ kind, lat, lon, w: size, h: kind === 'speaker' ? size * 1.35 : size });
    }
  }
  return out;
})();

/** Luftschlangen: farbige Bänder, die sich wellenförmig um den Planeten legen. */
const STREAMERS = [
  { lat: 34, amp: 9, freq: 3, color: '#c98fae', alt: '#e2c6d3' },
  { lat: 6, amp: 12, freq: 2, color: '#9184d9', alt: '#d2cefd' },
  { lat: -26, amp: 8, freq: 4, color: '#8fc9b4', alt: '#d6efe5' },
  { lat: -52, amp: 6, freq: 3, color: '#d9c08f', alt: '#f3e6c8' },
];

const CONFETTI_COLORS = ['#c98fae', '#9184d9', '#d9c08f', '#8fc9b4', '#e8a06b', '#b5abfc', '#f3f5fe'];

export function createGlobe(canvas, opts = {}) {
  const state = {
    people: [],
    meId: null,
    leaderId: null,
    slow: false,
  };

  let w = 0;
  let h = 0;
  /** Verläufe, die nur von der Größe abhängen. Siehe buildFills(). */
  const fills = {};
  let cx = 0;
  let cy = 0;
  let R = 120;
  let dpr = Math.min(2, window.devicePixelRatio || 1);

  let yaw = 0.6;
  let pitch = -0.22;
  // Gierung und Neigung sind für alle Punkte eines Bildes gleich. Vorher
  // rechnete project() ihre vier Winkelfunktionen für jeden der rund 1400
  // Punkte neu aus, also über 5000 Mal pro Bild.
  let cosYaw = Math.cos(yaw);
  let sinYaw = Math.sin(yaw);
  let cosPitch = Math.cos(pitch);
  let sinPitch = Math.sin(pitch);
  let spin = 0.00006; // Grunddrehung pro Millisekunde
  let velYaw = 0;
  let velPitch = 0;
  let dragging = false;

  let walkers = [];
  const cats = [];
  const balloons = [];
  const fireworks = [];
  const sparkles = [];
  let hits = [];
  let shooting = null;
  let nextBoom = 900;
  let followId = null;

  /* ── Aufbau ─────────────────────────────────────────────── */

  for (let i = 0; i < 6; i++) {
    cats.push({
      lat: -40 + Math.random() * 80,
      lon: Math.random() * 360,
      tLat: -40 + Math.random() * 80,
      tLon: Math.random() * 360,
      speed: 0.004 + Math.random() * 0.004,
      fur: i * 2 + 1,
      pattern: i % 5,
      action: 'walk',
      timer: 1200 + Math.random() * 2600,
      phase: Math.random() * 1000,
      facing: 1,
    });
  }

  for (let i = 0; i < 18; i++) {
    balloons.push({
      lat: -30 + Math.random() * 70,
      lon: Math.random() * 360,
      alt: 1.16 + Math.random() * 0.24,
      tint: i % 6,
      bob: Math.random() * TAU,
      drift: 0.004 + Math.random() * 0.006,
    });
  }

  // Konfetti auf der Oberfläche: deterministisch verteilt, damit es beim
  // Drehen an derselben Stelle bleibt.
  const confetti = [];
  for (let i = 0; i < 520; i++) {
    confetti.push({
      lat: Math.asin(((i / 520) * 2 - 1) * 0.97) / DEG,
      lon: (i * 137.508) % 360,
      size: 2 + (i % 3),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      twinkle: i % 5 === 0,
    });
  }

  /* ── Projektion ─────────────────────────────────────────── */

  /** Muss einmal je Bild laufen, bevor irgendetwas projiziert wird. */
  function syncCamera() {
    cosYaw = Math.cos(yaw);
    sinYaw = Math.sin(yaw);
    cosPitch = Math.cos(pitch);
    sinPitch = Math.sin(pitch);
  }

  /**
   * Dreht einen Punkt der Einheitskugel in den Bildschirm, ohne Winkelfunktion,
   * und schreibt das Ergebnis in ein mitgegebenes Objekt.
   */
  function projectUnitInto(out, ux, uy, uz, alt = 1) {
    const x2 = ux * cosYaw + uz * sinYaw;
    const z2 = -ux * sinYaw + uz * cosYaw;
    const y3 = uy * cosPitch - z2 * sinPitch;
    const z3 = uy * sinPitch + z2 * cosPitch;
    const r = R * alt;
    out.x = cx + x2 * r;
    out.y = cy - y3 * r;
    out.depth = z3;
    out.scale = 0.66 + 0.46 * Math.max(0, z3);
    return out;
  }

  /**
   * Für Konfetti, Luftschlangen und Tanzfläche: rund 1300 Punkte je Bild, die
   * sofort gezeichnet und dann vergessen werden. Ein einziges wiederverwendetes
   * Objekt spart dem Aufräumer knapp 80000 kurzlebige Objekte pro Sekunde.
   * Wer das Ergebnis behält, etwa die Tiefensortierung, nimmt projectPoint.
   */
  const scratch = { x: 0, y: 0, depth: 0, scale: 0 };

  function projectUnit(ux, uy, uz, alt = 1) {
    return projectUnitInto({ x: 0, y: 0, depth: 0, scale: 0 }, ux, uy, uz, alt);
  }

  function project(lat, lon, alt = 1) {
    const la = lat * DEG;
    const lo = lon * DEG;
    const cl = Math.cos(la);
    return projectUnit(cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo), alt);
  }

  /**
   * Wie project, merkt sich die Kugelkoordinaten aber am Objekt. Punkte, die
   * stillstehen, kosten dadurch ab dem zweiten Bild keine Winkelfunktion mehr;
   * bewegte rechnen nur dann neu, wenn sie sich wirklich bewegt haben.
   */
  function projectPoint(p, alt = 1) {
    if (p._lat !== p.lat || p._lon !== p.lon) {
      p._lat = p.lat;
      p._lon = p.lon;
      const la = p.lat * DEG;
      const lo = p.lon * DEG;
      const cl = Math.cos(la);
      p._ux = cl * Math.sin(lo);
      p._uy = Math.sin(la);
      p._uz = cl * Math.cos(lo);
    }
    return projectUnit(p._ux, p._uy, p._uz, alt);
  }

  /** Wie projectPoint, aber ohne neues Objekt. Nur für sofort verworfene Punkte. */
  function projectPointInto(out, p, alt = 1) {
    if (p._lat !== p.lat || p._lon !== p.lon) {
      p._lat = p.lat;
      p._lon = p.lon;
      const la = p.lat * DEG;
      const lo = p.lon * DEG;
      const cl = Math.cos(la);
      p._ux = cl * Math.sin(lo);
      p._uy = Math.sin(la);
      p._uz = cl * Math.cos(lo);
    }
    return projectUnitInto(out, p._ux, p._uy, p._uz, alt);
  }

  /* ── Eingabe ────────────────────────────────────────────── */

  let pointer = null;

  function onDown(e) {
    const p = point(e);
    pointer = { ...p, moved: 0, t: performance.now() };
    dragging = true;
    followId = null;
    opts.onFollowEnd?.();
    velYaw = 0;
    velPitch = 0;
    canvas.setPointerCapture?.(e.pointerId);
  }

  function onMove(e) {
    if (!pointer) return;
    const p = point(e);
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    pointer.moved += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.006;
    pitch = clamp(pitch + dy * 0.005, -0.85, 0.85);
    velYaw = -dx * 0.0004;
    velPitch = dy * 0.0002;
    pointer.x = p.x;
    pointer.y = p.y;
    if (pointer.moved > 6) e.preventDefault();
  }

  function onUp(e) {
    if (!pointer) return;
    const tap = pointer.moved < 8;
    const p = point(e);
    dragging = false;
    if (tap) {
      const hit = hits.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < s.r);
      opts.onTap?.(hit ? hit.person : null);
    }
    pointer = null;
  }

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  /* ── Feuerwerk ──────────────────────────────────────────── */

  function launch(lat, lon) {
    const p = project(lat ?? -20 + Math.random() * 60, lon ?? Math.random() * 360);
    if (p.depth < 0.05) return;
    fireworks.push({
      stage: 'rise',
      x: p.x,
      y: p.y,
      vx: (Math.random() - 0.5) * 0.06,
      vy: -(0.34 + Math.random() * 0.16),
      life: 0,
      peak: 620 + Math.random() * 420,
      palette: mixPalette(),
      trail: [],
      parts: null,
    });
    if (fireworks.length > 16) fireworks.shift();
  }

  /** Zwei zufällige Paletten gemischt, damit ein Knall mehrere Farben zeigt. */
  function mixPalette() {
    const a = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    const b = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    return [a[0], b[0], a[1], b[1], a[2]];
  }

  function explode(f) {
    const count = 46 + Math.floor(Math.random() * 30);
    const ring = Math.random() < 0.4;
    f.parts = [];
    for (let i = 0; i < count; i++) {
      const a = ring ? (i / count) * TAU : Math.random() * TAU;
      const speed = ring ? 0.19 + Math.random() * 0.03 : 0.06 + Math.random() * 0.2;
      f.parts.push({
        x: f.x,
        y: f.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.85,
        c: f.palette[i % f.palette.length],
        s: 2 + Math.floor(Math.random() * 3),
        trail: [],
        life: 0,
        max: 900 + Math.random() * 700,
      });
    }
    f.stage = 'boom';
    f.life = 0;
    f.flash = 1;
    sparkles.push({ x: f.x, y: f.y, max: 40 + Math.random() * 26, c: f.palette[0], life: 0 });
  }

  /* ── Zeichnen ───────────────────────────────────────────── */

  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    R = Math.min(w * 0.58, h * 0.40);
    cx = w / 2;
    cy = h * 0.64;
    buildFills();
  }

  /**
   * Alles, was nur von der Größe abhängt, einmal anlegen. Vorher entstanden
   * Himmel, Nordlicht, Halo, Kugel und Randlicht bei jedem einzelnen Bild neu,
   * und das kostet auf einem älteren Handy mehr als die ganze Szene.
   */
  function buildFills() {
    if (!w || !h) return;
    const x = canvas.getContext('2d');

    fills.sky = x.createLinearGradient(0, 0, 0, h);
    fills.sky.addColorStop(0, '#241f3d');
    fills.sky.addColorStop(0.34, '#191a2b');
    fills.sky.addColorStop(0.72, '#13141f');
    fills.sky.addColorStop(1, '#0d0e16');

    // Die Helligkeit der Bänder schwankt; das macht später globalAlpha,
    // damit der Verlauf selbst konstant bleibt.
    fills.aurora = [0, 1, 2].map((b) => {
      const g = x.createLinearGradient(0, h * (0.08 + b * 0.07), w, h * (0.3 + b * 0.07));
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, `rgb(${b === 1 ? '201,143,174' : '145,132,217'})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      return g;
    });

    fills.halo = x.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.45);
    fills.halo.addColorStop(0, 'rgba(160,140,240,.34)');
    fills.halo.addColorStop(1, 'rgba(145,132,217,0)');

    fills.body = x.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.08, cx, cy, R);
    fills.body.addColorStop(0, '#6a5ea6');
    fills.body.addColorStop(0.42, '#4a4179');
    fills.body.addColorStop(0.78, '#332c58');
    fills.body.addColorStop(1, '#1e1a33');

    fills.rim = x.createRadialGradient(cx - R * 0.55, cy - R * 0.55, R * 0.2, cx - R * 0.55, cy - R * 0.55, R * 1.15);
    fills.rim.addColorStop(0, 'rgba(226,222,253,.30)');
    fills.rim.addColorStop(1, 'rgba(226,222,253,0)');

    // Im Ursprung angelegt und beim Zeichnen an die Discokugel geschoben
    fills.shine = x.createRadialGradient(0, 0, 0, 0, 0, 78);
    fills.shine.addColorStop(0, 'rgba(214,206,255,.34)');
    fills.shine.addColorStop(1, 'rgba(214,206,255,0)');
  }

  function drawSky(x, t) {
    x.fillStyle = fills.sky;
    x.fillRect(0, 0, w, h);

    // Nordlicht-Bänder
    for (let b = 0; b < 3; b++) {
      x.fillStyle = fills.aurora[b];
      x.globalAlpha = 0.05 + 0.035 * Math.sin(t / (3600 + b * 900));
      x.save();
      x.translate(0, Math.sin(t / 5200 + b) * 12);
      x.fillRect(0, h * (0.04 + b * 0.09), w, h * 0.2);
      x.restore();
      x.globalAlpha = 1;
    }

    // Sterne in zwei Ebenen
    for (let i = 0; i < 90; i++) {
      const sx = (i * 149.3) % w;
      const sy = (i * 71.7) % (h * 0.72);
      const near = i % 3 === 0;
      const a = (near ? 0.3 : 0.16) + 0.34 * Math.abs(Math.sin(t / 820 + i));
      x.fillStyle = `rgba(226,222,253,${a.toFixed(2)})`;
      x.fillRect(sx, sy, near ? 2 : 1, near ? 2 : 1);
    }

    // Sternschnuppe
    if (!shooting && Math.random() < 0.0035) {
      shooting = { x: Math.random() * w, y: Math.random() * h * 0.3, life: 0 };
    }
    if (shooting) {
      shooting.life += 16;
      const p = shooting.life / 700;
      if (p > 1) shooting = null;
      else {
        x.globalAlpha = Math.sin(p * Math.PI);
        x.strokeStyle = '#e2defd';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(shooting.x + p * 150, shooting.y + p * 70);
        x.lineTo(shooting.x + p * 150 - 34, shooting.y + p * 70 - 16);
        x.stroke();
        x.globalAlpha = 1;
      }
    }
  }

  function drawGlobe(x, t) {
    // Atmosphäre
    x.fillStyle = fills.halo;
    x.beginPath();
    x.arc(cx, cy, R * 1.45, 0, TAU);
    x.fill();

    // Kugelkörper, Licht von oben links
    x.fillStyle = fills.body;
    x.beginPath();
    x.arc(cx, cy, R, 0, TAU);
    x.fill();

    // Randlicht als Sichel oben links
    x.save();
    x.beginPath();
    x.arc(cx, cy, R, 0, TAU);
    x.clip();
    x.fillStyle = fills.rim;
    x.fillRect(cx - R, cy - R, R * 2, R * 2);
    x.restore();

    // Konfetti liegt über die ganze Kugel verstreut
    for (const c of confetti) {
      const pt = projectPointInto(scratch, c);
      if (pt.depth <= 0.05) continue;
      const size = Math.max(2, Math.round(c.size * pt.scale));
      x.fillStyle = c.color;
      x.globalAlpha = 0.45 + 0.45 * pt.depth;
      // Ein Teil der Schnipsel blinkt leicht, das gibt Bewegung ins Bild
      if (c.twinkle) x.globalAlpha *= 0.55 + 0.45 * Math.abs(Math.sin(t / 620 + c.lon));
      x.fillRect(pt.x | 0, pt.y | 0, size, size);
    }
    x.globalAlpha = 1;

    // Luftschlangen als wellige Bänder. Die Länge jedes Schritts steht fest,
    // nur die Breite schwingt, also sind Sinus und Kosinus der Länge vorgerechnet.
    for (const st of STREAMERS) {
      for (const step of STREAM_STEPS) {
        const lat = (st.lat + Math.sin(step.rad * st.freq + t / 4200) * st.amp) * DEG;
        const cl = Math.cos(lat);
        const pt = projectUnitInto(scratch, cl * step.sin, Math.sin(lat), cl * step.cos);
        if (pt.depth <= 0.05) continue;
        const size = Math.max(3, Math.round(5 * pt.scale));
        x.fillStyle = step.odd ? st.color : st.alt;
        x.globalAlpha = 0.34 + 0.5 * pt.depth;
        x.fillRect(pt.x - size / 2, pt.y - size / 2, size, size);
      }
    }
    x.globalAlpha = 1;

    // Tanzfläche: ein Band aus blinkenden Kacheln rund um den Äquator
    for (const tile of FLOOR) {
      const pt = projectPointInto(scratch, tile);
      if (pt.depth <= 0.05) continue;
      const beat = Math.sin(t / 300 + tile.phase) * 0.5 + 0.5;
      x.fillStyle = `rgba(${tile.color},${(0.18 + beat * 0.6).toFixed(2)})`;
      const s2 = Math.max(3, Math.round(6 * pt.scale));
      x.fillRect(pt.x - s2 / 2, pt.y - s2 / 2, s2, s2);
    }

    // Discokugel hängt fest über dem Planeten und wirft Lichtpunkte
    const dx = cx;
    const dy = cy - R - 46 + Math.sin(t / 900) * 5;
    x.strokeStyle = 'rgba(178,182,202,.45)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(dx, dy - 60);
    x.lineTo(dx, dy);
    x.stroke();

    // Schein hinter der Kugel, damit sie sich vom Himmel abhebt
    x.save();
    x.translate(dx, dy + 26);
    x.fillStyle = fills.shine;
    x.beginPath();
    x.arc(0, 0, 78, 0, TAU);
    x.fill();
    x.restore();

    // Lichtstrahlen, die mit der Kugel mitdrehen
    for (let i = 0; i < 8; i++) {
      const a = t / 1600 + (i / 8) * TAU;
      x.globalAlpha = 0.045 + 0.045 * Math.abs(Math.sin(a * 2));
      x.strokeStyle = i % 2 ? '#c98fae' : '#b5abfc';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(dx, dy + 26);
      x.lineTo(dx + Math.cos(a) * R * 0.72, dy + 26 + Math.abs(Math.sin(a)) * R * 0.62);
      x.stroke();
    }
    x.globalAlpha = 1;

    const dimg = img(objectUrl('disco'));
    if (dimg.complete) x.drawImage(dimg, dx - 27, dy - 8, 54, 64);

    for (let i = 0; i < 18; i++) {
      const a = (t / 1300 + (i / 18) * TAU) % TAU;
      const rr = R * (0.5 + 0.4 * Math.abs(Math.sin(t / 2600 + i)));
      x.fillStyle = i % 2 ? 'rgba(201,143,174,.5)' : 'rgba(181,171,252,.5)';
      x.fillRect(cx + Math.cos(a) * rr, cy - R * 0.35 + Math.sin(a) * rr * 0.5, 5, 5);
    }
  }

  function updateCats(dt) {
    for (const c of cats) {
      c.timer -= dt;
      if (c.timer <= 0) {
        const roll = Math.random();
        if (c.action !== 'walk' || roll < 0.55) {
          c.action = 'walk';
          c.tLat = -55 + Math.random() * 110;
          c.tLon = Math.random() * 360;
          c.timer = 2600 + Math.random() * 3400;
        } else if (roll < 0.7) {
          c.action = 'sit';
          c.timer = 1800 + Math.random() * 2400;
        } else if (roll < 0.84) {
          c.action = 'groom';
          c.timer = 1800 + Math.random() * 2000;
        } else if (roll < 0.94) {
          c.action = 'sleep';
          c.timer = 3200 + Math.random() * 4200;
        } else {
          c.action = 'jump';
          c.timer = 700 + Math.random() * 500;
        }
      }
      if (c.action === 'walk') {
        const dLat = c.tLat - c.lat;
        let dLon = ((c.tLon - c.lon + 540) % 360) - 180;
        const d = Math.hypot(dLat, dLon);
        if (d < 1.5) c.timer = 0;
        else {
          c.lat += (dLat / d) * c.speed * dt;
          c.lon = (c.lon + (dLon / d) * c.speed * dt + 360) % 360;
          if (Math.abs(dLon) > 2) c.facing = dLon > 0 ? 1 : -1;
        }
      }
    }
  }

  function catFrame(c, t) {
    if (c.action === 'sit') return CAT_FRAME.SIT;
    if (c.action === 'groom') return Math.floor((t + c.phase) / 380) % 2 ? CAT_FRAME.GROOM : CAT_FRAME.SIT;
    if (c.action === 'sleep') return CAT_FRAME.SLEEP;
    if (c.action === 'jump') return CAT_FRAME.JUMP;
    return Math.floor((t + c.phase) / 220) % 2 ? CAT_FRAME.WALK_B : CAT_FRAME.WALK_A;
  }

  function syncWalkers() {
    const ids = state.people.map((p) => p.id).join(',');
    if (walkers._ids === ids) {
      for (const wk of walkers) wk.person = state.people.find((p) => p.id === wk.id) || wk.person;
      return;
    }
    const prev = new Map(walkers.map((wk) => [wk.id, wk]));
    walkers = state.people.map((person, i) => {
      const old = prev.get(person.id);
      if (old) {
        old.person = person;
        return old;
      }
      return {
        id: person.id,
        person,
        lat: -35 + ((i * 53) % 70),
        lon: (i * 71) % 360,
        tLat: -35 + Math.random() * 70,
        tLon: Math.random() * 360,
        speed: 0.0028 + Math.random() * 0.0022,
        phase: Math.random() * 1000,
        facing: 1,
        stride: Math.random() * 10,
        moving: true,
        pause: 0,
        blink: 0,
        nextBlink: 1500 + Math.random() * 4000,
        cheer: 0,
      };
    });
    walkers._ids = ids;
  }

  function updateWalkers(dt) {
    for (const wk of walkers) {
      // Lidschlag: kurz zu, dann wieder eine Weile offen
      wk.blink -= dt;
      wk.nextBlink -= dt;
      if (wk.nextBlink <= 0) {
        wk.blink = 130;
        wk.nextBlink = 2200 + Math.random() * 5000;
      }
      if (wk.cheer > 0) wk.cheer -= dt;

      if (wk.pause > 0) {
        wk.pause -= dt;
        wk.moving = false;
        continue;
      }

      const dLat = wk.tLat - wk.lat;
      let dLon = ((wk.tLon - wk.lon + 540) % 360) - 180;
      const d = Math.hypot(dLat, dLon);
      if (d < 1.5) {
        // Kurz stehen bleiben, sonst laufen alle ununterbrochen im Kreis
        wk.pause = Math.random() < 0.5 ? 1200 + Math.random() * 2600 : 0;
        wk.tLat = -45 + Math.random() * 90;
        wk.tLon = Math.random() * 360;
        wk.moving = wk.pause <= 0;
      } else {
        const stepLat = (dLat / d) * wk.speed * dt;
        const stepLon = (dLon / d) * wk.speed * dt;
        wk.lat += stepLat;
        wk.lon = (wk.lon + stepLon + 360) % 360;
        wk.stride += Math.abs(stepLon) + Math.abs(stepLat);
        wk.moving = true;
        // Blickrichtung folgt der Laufrichtung, aber erst ab spürbarer Bewegung
        if (Math.abs(dLon) > 2) wk.facing = dLon > 0 ? 1 : -1;
      }
    }
  }

  function drawEntities(x, t) {
    const items = [];

    for (const o of SURFACE_OBJECTS) {
      const p = projectPoint(o);
      if (p.depth <= 0.05) continue;
      items.push({ p, draw: () => {
        const image = img(objectUrl(o.kind));
        if (!image.complete) return;
        const sw = o.w * p.scale;
        const sh = o.h * p.scale;
        shadow(x, p, sw * 0.4);
        x.drawImage(image, p.x - sw / 2, p.y - sh + 4, sw, sh);
      } });
    }

    for (const c of cats) {
      const p = projectPoint(c);
      if (p.depth <= 0.05) continue;
      const frame = catFrame(c, t);
      items.push({ p, draw: () => {
        const image = img(catUrl(c.fur, frame, c.pattern));
        if (!image.complete) return;
        const sw = 30 * p.scale;
        const sh = 25 * p.scale;
        const hop = c.action === 'jump' ? Math.abs(Math.sin(t / 150)) * 7 * p.scale : 0;
        shadow(x, p, sw * 0.34);
        if (c.facing < 0) {
          x.save();
          x.scale(-1, 1);
          x.drawImage(image, -p.x - sw / 2, p.y - sh - hop, sw, sh);
          x.restore();
        } else {
          x.drawImage(image, p.x - sw / 2, p.y - sh - hop, sw, sh);
        }
      } });
    }

    hits = [];
    for (const wk of walkers) {
      const p = projectPoint(wk);
      if (p.depth <= 0.02) continue;
      const bob = Math.sin(t / 210 + wk.phase) * 1.8 * p.scale;
      items.push({ p, draw: () => {
        const frame = wk.cheer > 0
          ? BODY_FRAME.CHEER
          : wk.moving
            ? Math.floor(wk.stride / 7) % 2
              ? BODY_FRAME.WALK_B
              : BODY_FRAME.WALK_A
            : BODY_FRAME.IDLE;
        const image = img(bodyUrl(wk.person.cfg, frame, wk.blink > 0));
        if (!image.complete) return;

        const h = 46 * p.scale;
        const w2 = h * BODY_ASPECT;
        const top = p.y - h - bob;
        shadow(x, p, w2 * 0.38);

        // Beim Jubeln hüpft die Figur ein Stück
        const hop = wk.cheer > 0 ? Math.abs(Math.sin(t / 130)) * 5 * p.scale : 0;

        if (wk.facing < 0) {
          x.save();
          x.scale(-1, 1);
          x.drawImage(image, -p.x - w2 / 2, top - hop, w2, h);
          x.restore();
        } else {
          x.drawImage(image, p.x - w2 / 2, top - hop, w2, h);
        }

        if (wk.id === state.leaderId) {
          x.fillStyle = '#d9c08f';
          const cw = 15 * p.scale;
          const ct = top - hop - 6 * p.scale;
          x.fillRect(p.x - cw / 2, ct + 4 * p.scale, cw, 3 * p.scale);
          x.fillRect(p.x - cw / 2, ct, 3 * p.scale, 5 * p.scale);
          x.fillRect(p.x - 1.5 * p.scale, ct - 1 * p.scale, 3 * p.scale, 6 * p.scale);
          x.fillRect(p.x + cw / 2 - 3 * p.scale, ct, 3 * p.scale, 5 * p.scale);
        }

        if (p.depth > 0.3) {
          const label = wk.person.name;
          x.font = `500 ${Math.round(11 * p.scale)}px Inter, system-ui, sans-serif`;
          x.textAlign = 'center';
          const tw = x.measureText(label).width;
          const ly = p.y + 5 * p.scale;
          // Schild innerhalb des Bildrands halten, sonst schneidet es ab
          const lx = clamp(p.x, tw / 2 + 8, w - tw / 2 - 8);
          x.fillStyle = 'rgba(13,14,22,.8)';
          x.fillRect(lx - tw / 2 - 5, ly, tw + 10, 15 * p.scale);
          x.fillStyle = wk.id === state.meId ? '#d9c08f' : '#e4e7f5';
          x.fillText(label, lx, ly + 11 * p.scale);
        }
        hits.push({ x: p.x, y: p.y - h * 0.5, r: Math.max(24, w2 * 0.9), person: wk.person });
      } });
    }

    for (const b of balloons) {
      b.lon = (b.lon + b.drift * 16) % 360;
      b.bob += 0.02;
      const p = projectPoint(b, b.alt + Math.sin(b.bob) * 0.02);
      if (p.depth <= 0.06) continue;
      items.push({ p, draw: () => {
        const image = img(objectUrl('balloon', b.tint));
        if (!image.complete) return;
        const sw = 17 * p.scale;
        x.drawImage(image, p.x - sw / 2, p.y - sw * 1.4, sw, sw * 1.4);
      } });
    }

    items.sort((a, b) => a.p.depth - b.p.depth);
    for (const it of items) it.draw();
  }

  function shadow(x, p, r) {
    x.fillStyle = 'rgba(0,0,0,.34)';
    x.beginPath();
    x.ellipse(p.x, p.y + 1, r, r * 0.42, 0, 0, TAU);
    x.fill();
  }

  function drawFireworks(x, dt) {
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const f = fireworks[i];
      f.life += dt;
      if (f.stage === 'rise') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += 0.00028 * dt;
        f.trail.push({ x: f.x, y: f.y });
        if (f.trail.length > 12) f.trail.shift();
        f.trail.forEach((pt, k) => {
          x.globalAlpha = (k / f.trail.length) * 0.8;
          x.fillStyle = f.palette[2];
          x.fillRect(pt.x | 0, pt.y | 0, 3, 3);
        });
        x.globalAlpha = 1;
        if (f.life > f.peak || f.vy > -0.02) explode(f);
        continue;
      }

      if (f.flash > 0) {
        const g = x.createRadialGradient(f.x, f.y, 0, f.x, f.y, 52 * f.flash);
        g.addColorStop(0, `rgba(255,250,240,${0.26 * f.flash})`);
        g.addColorStop(1, 'rgba(255,250,240,0)');
        x.fillStyle = g;
        x.fillRect(f.x - 80, f.y - 80, 160, 160);
        f.flash -= dt / 260;
      }

      let alive = false;
      for (const pt of f.parts) {
        pt.life += dt;
        if (pt.life > pt.max) continue;
        alive = true;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 0.00034 * dt;
        pt.vx *= 0.992;
        pt.vy *= 0.992;
        pt.trail.push({ x: pt.x, y: pt.y });
        if (pt.trail.length > 5) pt.trail.shift();
        const fade = 1 - pt.life / pt.max;
        pt.trail.forEach((q, k) => {
          x.globalAlpha = fade * (k / pt.trail.length) * 0.5;
          x.fillStyle = pt.c;
          x.fillRect(Math.round(q.x / 2) * 2, Math.round(q.y / 2) * 2, pt.s, pt.s);
        });
        x.globalAlpha = fade;
        x.fillStyle = pt.life < 220 ? '#fffdf6' : pt.c;
        x.fillRect(Math.round(pt.x / 2) * 2, Math.round(pt.y / 2) * 2, pt.s, pt.s);
      }
      x.globalAlpha = 1;
      if (!alive) fireworks.splice(i, 1);
    }

    for (let i = sparkles.length - 1; i >= 0; i--) {
      const sp = sparkles[i];
      sp.life += dt;
      const prog = sp.life / 520;
      if (prog > 1) {
        sparkles.splice(i, 1);
        continue;
      }
      // Weicher Schein statt harter Kreislinie
      const r = sp.max * prog;
      const g = x.createRadialGradient(sp.x, sp.y, r * 0.4, sp.x, sp.y, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, hexToRgba(sp.c, (1 - prog) * 0.3));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(sp.x, sp.y, r, 0, TAU);
      x.fill();
    }
  }

  /** #rrggbb plus Deckkraft, für die Verläufe im Feuerwerk. */
  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha.toFixed(3)})`;
  }

  /* ── Schleife ───────────────────────────────────────────── */

  let raf = 0;
  let last = performance.now();
  let running = true;

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(48, t - last) * (state.slow ? 0.4 : 1);
    last = t;
    if (!w || !h) return;

    const target = followId ? walkers.find((wk) => wk.id === followId) : null;
    if (target) {
      // Eine Figur ist mittig, wenn yaw = −Länge und pitch = Breite ist.
      const wantYaw = -target.lon * DEG;
      const wantPitch = clamp(target.lat * DEG, -0.85, 0.85);
      const delta = ((wantYaw - yaw + Math.PI * 3) % TAU) - Math.PI;
      const ease = 1 - Math.pow(0.001, dt / 1000);
      yaw += delta * ease;
      pitch += (wantPitch - pitch) * ease;
      velYaw = 0;
      velPitch = 0;
    } else if (!dragging) {
      yaw += (spin + velYaw) * dt;
      pitch = clamp(pitch + velPitch * dt, -0.85, 0.85);
      velYaw *= 0.94;
      velPitch *= 0.94;
    }

    syncCamera();
    syncWalkers();
    updateWalkers(dt);
    updateCats(dt);

    nextBoom -= dt;
    if (nextBoom <= 0) {
      launch();
      // Zwei Drittel der Zeit steigen gleich mehrere Raketen zusammen auf
      if (Math.random() < 0.45) setTimeout(() => launch(), 120 + Math.random() * 260);
      if (Math.random() < 0.25) setTimeout(() => launch(), 340 + Math.random() * 380);
      nextBoom = 380 + Math.random() * 900;
    }

    const x = canvas.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, w, h);
    drawSky(x, t);
    drawGlobe(x, t);
    drawEntities(x, t);
    drawFireworks(x, dt);
  }

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  raf = requestAnimationFrame(frame);

  return {
    setState(next) {
      Object.assign(state, next);
    },
    celebrate(n = 3) {
      for (let i = 0; i < n; i++) setTimeout(() => launch(), i * 180);
      // Alle jubeln kurz mit
      for (const wk of walkers) wk.cheer = 1400 + Math.random() * 700;
    },
    follow(id) {
      followId = id;
    },
    stopFollow() {
      followId = null;
    },
    pause() {
      running = false;
    },
    resume() {
      running = true;
      last = performance.now();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    },
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
