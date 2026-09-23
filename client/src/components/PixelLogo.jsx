import { useMemo } from 'react';

/**
 * Das BBB-Logo als eigene Pixel-Schrift: drei fette Blockbuchstaben.
 * Glanzkante und Schattenkante werden aus der Form berechnet, nicht von Hand
 * gesetzt, damit die Buchstaben sauber bleiben. Die Farben laufen als
 * animierter Verlauf durch eine Maske, dazu Funken und Neonschein.
 */

const LETTER = [
  'XXXXXXXXXX...',
  'XXXXXXXXXXX..',
  'XXXXXXXXXXXX.',
  'XXX......XXXX',
  'XXX.......XXX',
  'XXX.......XXX',
  'XXX......XXXX',
  'XXXXXXXXXXXX.',
  'XXXXXXXXXX...',
  'XXXXXXXXXXX..',
  'XXXXXXXXXXXX.',
  'XXX......XXXX',
  'XXX.......XXX',
  'XXX.......XXX',
  'XXX.......XXX',
  'XXX......XXXX',
  'XXXXXXXXXXXX.',
  'XXXXXXXXXXX..',
  'XXXXXXXXXX...',
];

const LW = 13;
const LH = 19;
const GAP = 3;
const TOTAL_W = LW * 3 + GAP * 2;

const solid = (x, y) => y >= 0 && y < LH && x >= 0 && x < LW && LETTER[y][x] === 'X';

/** true, wenn das Pixel zur jeweiligen Ebene gehört. */
const LAYERS = {
  body: () => true,
  shine: (x, y) => !solid(x, y - 1),
  shade: (x, y) => !solid(x, y + 1) && solid(x, y),
};

function maskUrl(layer) {
  const test = LAYERS[layer];
  let rects = '';
  for (let l = 0; l < 3; l++) {
    const ox = l * (LW + GAP);
    for (let y = 0; y < LH; y++) {
      for (let x = 0; x < LW; x++) {
        if (!solid(x, y) || !test(x, y)) continue;
        rects += `<rect x='${ox + x}' y='${y}' width='1' height='1'/>`;
      }
    }
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${TOTAL_W}' height='${LH}' ` +
    `viewBox='0 0 ${TOTAL_W} ${LH}' fill='#fff' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const SPARKS = [
  { x: -6, y: 8, s: 6, d: 0 },
  { x: 99, y: 16, s: 5, d: 0.7 },
  { x: 20, y: -9, s: 5, d: 1.4 },
  { x: 76, y: -7, s: 7, d: 2.1 },
  { x: 48, y: 101, s: 5, d: 1.1 },
  { x: 104, y: 78, s: 6, d: 2.6 },
];

export default function PixelLogo({ size = 1, sparks = true, style }) {
  const masks = useMemo(
    () => ({ body: maskUrl('body'), shine: maskUrl('shine'), shade: maskUrl('shade') }),
    [],
  );
  const px = 6 * size;
  const width = TOTAL_W * px;
  const height = LH * px;

  const layer = (mask) => ({
    position: 'absolute',
    inset: 0,
    maskImage: mask,
    WebkitMaskImage: mask,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
  });

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        margin: '0 auto',
        animation: 'bbbLogoBreathe 3.6s ease-in-out infinite',
        filter: 'drop-shadow(0 0 14px rgba(201,143,174,.55)) drop-shadow(0 0 40px rgba(145,132,217,.45))',
        ...style,
      }}
      aria-label="BBB"
      role="img"
    >
      <div
        style={{
          ...layer(masks.body),
          backgroundImage: 'linear-gradient(100deg,#b5abfc,#e46fa4 26%,#ffca5f 50%,#4fd1a5 72%,#8f7dff)',
          backgroundSize: '260% 100%',
          animation: 'bbbShimmer 4.5s linear infinite',
        }}
      />
      <div
        style={{
          ...layer(masks.shade),
          backgroundImage: 'linear-gradient(180deg,rgba(30,12,32,.1),rgba(30,12,32,.6))',
        }}
      />
      <div
        style={{
          ...layer(masks.shine),
          backgroundImage: 'linear-gradient(180deg,rgba(255,255,255,.72),rgba(255,255,255,.26))',
        }}
      />
      {sparks &&
        SPARKS.map((s, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.s * size,
              height: s.s * size,
              background: i % 2 ? '#ffd98a' : '#ffc0d8',
              animation: `bbbSpark 2.4s ease-in-out ${s.d}s infinite`,
              pointerEvents: 'none',
            }}
          />
        ))}
    </div>
  );
}
