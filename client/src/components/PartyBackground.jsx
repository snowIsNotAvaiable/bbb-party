import { useEffect, useRef } from 'react';
import { img, objectUrl } from '../lib/sprites.js';

/**
 * Der Party-Hintergrund für alle Screens außer dem Planeten: wandernde
 * Farbwolken, Konfetti in drei Tiefen, aufsteigende Luftballons an Schnüren,
 * herabhängende Luftschlangen, Girlanden und ein Funkeln, das sich nie ganz
 * wiederholt. Liegt hinter dem Inhalt und nimmt keine Klicks an.
 *
 * Läuft auf jedem Screen und muss deshalb billig sein. Drei Kniffe dafür:
 * Himmel und Farbwolken entstehen auf einer viertelgroßen Hilfsfläche und
 * werden einmal hochskaliert kopiert (weiche Verläufe, den Unterschied sieht
 * niemand, spart aber fast die ganze Füllfläche); Verläufe werden einmal
 * angelegt und nur noch verschoben; und die Luftschlangen sind ein Pfad statt
 * hundert einzelner Rechtecke.
 */

const CONFETTI = ['#c98fae', '#9184d9', '#d9c08f', '#8fc9b4', '#e4e7f5', '#b5abfc', '#e8a06b', '#6bb0e8'];
const RIBBONS = ['#c98fae', '#9184d9', '#8fc9b4', '#d9c08f', '#e8a06b'];
const GARLAND = ['#c98fae', '#d9c08f', '#8fc9b4', '#9184d9', '#e8a06b'];

/** Drei Ebenen: hinten klein, langsam und blass, vorne groß, schnell und kräftig. */
const LAYERS = [
  { count: 34, speed: 0.18, size: [2, 4], alpha: 0.34, drift: 0.16 },
  { count: 30, speed: 0.4, size: [3, 6], alpha: 0.55, drift: 0.28 },
  { count: 20, speed: 0.72, size: [4, 8], alpha: 0.78, drift: 0.42 },
];

/** Die wandernden Farbwolken: Anteil der Fläche, Farbe, Bahn. */
const BLOBS = [
  { r: 0.62, color: 'rgba(145,132,217,.22)', x: [0.3, 0.22, 9000], y: [0.16, 0.08, 11000] },
  { r: 0.55, color: 'rgba(201,143,174,.18)', x: [0.75, 0.2, 12500], y: [0.7, 0.12, 10000] },
  { r: 0.4, color: 'rgba(217,192,143,.08)', x: [0.5, 0.3, 15000], y: [0.45, 0.2, 13000] },
];

/** Das Funkeln in acht Helligkeitsstufen, damit pro Bild keine Farbstrings entstehen. */
const STAR_STEPS = Array.from({ length: 8 }, (_, i) => `rgba(226,222,253,${(0.12 + i * 0.055).toFixed(3)})`);

/** Wie grob die Hilfsfläche für Himmel und Wolken ist. Vier heißt ein Sechzehntel Fläche. */
const BG_SCALE = 4;

export default function PartyBackground({ intensity = 1, garland = true, style }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Dekor, kein Pixelart: 1,5 reicht und viertelt die Füllarbeit gegenüber 2.
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let raf = 0;
    let last = performance.now();
    let confetti = [];
    let balloons = [];
    let ribbons = [];
    let stars = [];
    let w = 0;
    let h = 0;

    // Hilfsfläche für Himmel und Wolken, bewusst grob
    const bg = document.createElement('canvas');
    const bgx = bg.getContext('2d');
    let sky = null;
    let blobFills = [];

    const rnd = (a, b) => a + Math.random() * (b - a);

    const seed = () => {
      confetti = [];
      for (const layer of LAYERS) {
        const n = Math.round(layer.count * intensity);
        for (let i = 0; i < n; i++) {
          confetti.push({
            x: Math.random() * w,
            y: Math.random() * h,
            v: layer.speed * rnd(0.7, 1.4),
            drift: (Math.random() - 0.5) * layer.drift,
            s: Math.round(rnd(layer.size[0], layer.size[1])),
            // Ein Teil der Schnipsel ist länglich, wie echtes Konfetti
            long: Math.random() < 0.4,
            alpha: layer.alpha,
            c: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
            spin: Math.random() * 6.28,
            rate: 0.0018 + Math.random() * 0.005,
          });
        }
      }

      balloons = Array.from({ length: Math.max(4, Math.round(8 * intensity)) }, (_, i) => ({
        x: Math.random() * w,
        y: rnd(-60, h + h * 0.5),
        v: rnd(0.12, 0.34),
        sway: Math.random() * 6.28,
        swayRate: rnd(0.0006, 0.0013),
        tint: i % 6,
        scale: rnd(1.3, 2.6),
      }));

      ribbons = Array.from({ length: Math.max(3, Math.round(5 * intensity)) }, (_, i) => {
        const len = rnd(70, 170);
        return {
          x: rnd(0, w),
          y: rnd(0, h + 120),
          len,
          amp: rnd(7, 18),
          period: rnd(16, 34),
          v: rnd(0.1, 0.26),
          c: RIBBONS[i % RIBBONS.length],
          phase: Math.random() * 6.28,
          // Der Verlauf sitzt in der Schlange selbst und wird nur mitgeschoben
          fade: null,
        };
      });

      stars = Array.from({ length: 60 }, (_, i) => ({
        x: (i * 137.5) % Math.max(1, w),
        y: ((i * 61) % Math.max(1, h * 0.85)) + 4,
        p: Math.random() * 6.28,
        big: i % 4 === 0,
      }));
    };

    /** Was nur von der Größe abhängt: einmal anlegen, nicht pro Bild. */
    const buildFills = () => {
      sky = bgx.createLinearGradient(0, 0, 0, bg.height);
      sky.addColorStop(0, '#211d36');
      sky.addColorStop(0.42, '#181927');
      sky.addColorStop(1, '#0f101a');

      const maxSide = Math.max(bg.width, bg.height);
      blobFills = BLOBS.map((b) => {
        const r = Math.max(1, maxSide * b.r);
        // Im Ursprung angelegt und beim Zeichnen an die Stelle geschoben
        const g = bgx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, b.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        return { g, r };
      });

      const main = canvas.getContext('2d');
      for (const r of ribbons) {
        const f = main.createLinearGradient(0, 0, 0, -r.len);
        f.addColorStop(0, hexAlpha(r.c, 0.42));
        f.addColorStop(1, hexAlpha(r.c, 0.12));
        r.fade = f;
      }
    };

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      bg.width = Math.max(2, Math.ceil(w / BG_SCALE));
      bg.height = Math.max(2, Math.ceil(h / BG_SCALE));
      seed();
      buildFills();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (t) => {
      raf = requestAnimationFrame(draw);
      if (!w || !h || !sky) return;
      const dt = Math.min(48, t - last) * (slow ? 0.25 : 1);
      last = t;

      /* ── Himmel und Farbwolken, grob und einmal kopiert ──── */
      bgx.fillStyle = sky;
      bgx.fillRect(0, 0, bg.width, bg.height);
      for (let i = 0; i < BLOBS.length; i++) {
        const b = BLOBS[i];
        const f = blobFills[i];
        const cx = bg.width * (b.x[0] + Math.sin(t / b.x[2]) * b.x[1]);
        const cy = bg.height * (b.y[0] + Math.cos(t / b.y[2]) * b.y[1]);
        bgx.save();
        bgx.translate(cx, cy);
        bgx.fillStyle = f.g;
        // Außerhalb des Radius ist der Verlauf ohnehin durchsichtig
        bgx.fillRect(-f.r, -f.r, f.r * 2, f.r * 2);
        bgx.restore();
      }

      const x = canvas.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Der Himmel deckt alles ab, ein clearRect wäre verschenkte Arbeit
      x.imageSmoothingEnabled = true;
      x.drawImage(bg, 0, 0, w, h);
      x.imageSmoothingEnabled = false;

      /* ── Funkeln ──────────────────────────────────────────── */
      for (const s of stars) {
        const lift = s.big ? 0.08 : 0;
        const step = Math.min(7, ((Math.abs(Math.sin(t / 780 + s.p)) + lift) * 7) | 0);
        x.fillStyle = STAR_STEPS[step];
        x.fillRect(s.x % w, s.y, s.big ? 2 : 1, s.big ? 2 : 1);
      }

      /* ── Luftschlangen: ein gestrichelter Pfad je Band ────── */
      // 4 an, 1 aus: genau das Muster, das früher aus einzeln gesetzten
      // 4x4-Quadraten im Abstand von 5 Pixeln entstand.
      x.lineWidth = 4;
      x.lineCap = 'butt';
      x.setLineDash([4, 1]);
      for (const r of ribbons) {
        r.y += r.v * dt * 0.06;
        if (r.y - r.len > h) {
          r.y = -r.len - Math.random() * 120;
          r.x = Math.random() * w;
        }
        if (r.y < -r.len - 200 || r.y > h + 200) continue;
        x.save();
        x.translate(r.x, r.y);
        x.strokeStyle = r.fade;
        x.beginPath();
        for (let k = 0; k <= r.len; k += 5) {
          const yy = r.y - k;
          const xx = Math.sin(yy / r.period + r.phase) * r.amp;
          if (k === 0) x.moveTo(xx, -k);
          else x.lineTo(xx, -k);
        }
        x.stroke();
        x.restore();
      }
      x.setLineDash([]);

      /* ── Luftballons mit Schnur ───────────────────────────── */
      x.strokeStyle = 'rgba(178,182,202,.28)';
      x.lineWidth = 1;
      for (const b of balloons) {
        b.y -= b.v * dt * 0.06;
        b.sway += b.swayRate * dt;
        if (b.y < -70 * b.scale) {
          b.y = h + 60 + Math.random() * 160;
          b.x = Math.random() * w;
          b.tint = Math.floor(Math.random() * 6);
          b.scale = rnd(1.3, 2.6);
        }
        if (b.y > h + 80) continue;
        const bx = b.x + Math.sin(b.sway) * 16;
        const bw = 10 * b.scale;
        const bh = 14 * b.scale;
        // Schnur, die der Bewegung leicht hinterherhängt
        x.beginPath();
        x.moveTo(bx + bw / 2, b.y + bh);
        x.quadraticCurveTo(bx + bw / 2 - Math.sin(b.sway) * 8, b.y + bh + 14, bx + bw / 2 + Math.sin(b.sway) * 5, b.y + bh + 26);
        x.stroke();

        const image = img(objectUrl('balloon', b.tint));
        if (image.complete) {
          x.globalAlpha = 0.42 + b.scale * 0.14;
          x.drawImage(image, bx, b.y, bw, bh);
          x.globalAlpha = 1;
        }
      }

      /* ── Konfetti ─────────────────────────────────────────── */
      for (const c of confetti) {
        c.y += c.v * dt * 0.06;
        c.x += c.drift * dt * 0.05;
        c.spin += c.rate * dt;
        if (c.y > h + 10) {
          c.y = -10;
          c.x = Math.random() * w;
        }
        if (c.x < -10) c.x = w + 10;
        if (c.x > w + 10) c.x = -10;
        // Das Drehen wird als Stauchen angedeutet, das bleibt pixelig
        const squash = Math.abs(Math.cos(c.spin));
        const ch = Math.max(1, Math.round((c.long ? c.s * 1.8 : c.s) * squash));
        x.globalAlpha = c.alpha;
        x.fillStyle = c.c;
        x.fillRect(Math.round(c.x), Math.round(c.y), c.s, ch);
      }
      x.globalAlpha = 1;

      /* ── Girlande am oberen Rand ──────────────────────────── */
      if (garland) {
        const sag = (px) => 8 + Math.sin((px / w) * Math.PI) * 18;
        const wobble = t / 2600;
        x.strokeStyle = 'rgba(145,132,217,.34)';
        x.lineWidth = 2;
        x.beginPath();
        for (let px = -26; px < w + 26; px += 8) {
          const yy = sag(px) + Math.sin(px / 90 + wobble) * 3;
          if (px === -26) x.moveTo(px, yy);
          else x.lineTo(px, yy);
        }
        x.stroke();
        x.globalAlpha = 0.8;
        for (let i = 0; i * 24 < w + 24; i++) {
          const px = i * 24;
          const drop = sag(px) + Math.sin(px / 90 + wobble) * 3;
          x.fillStyle = GARLAND[i % GARLAND.length];
          x.beginPath();
          x.moveTo(px - 5, drop);
          x.lineTo(px + 5, drop);
          x.lineTo(px, drop + 12);
          x.closePath();
          x.fill();
        }
        x.globalAlpha = 1;
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [intensity, garland]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
}

/** #rrggbb mit Deckkraft, für die Verläufe der Luftschlangen. */
function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
