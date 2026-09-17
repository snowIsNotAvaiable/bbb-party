/**
 * Navigations-Icons als Pixelart, im gleichen Raster wie die Sprites.
 * Sie ersetzen die Phosphor-Outlines, damit die Tabbar zum Rest passt.
 * X = Vollfläche, o = Akzentpixel (nur im aktiven Zustand eingefärbt).
 */

const ICONS = {
  home: [
    '......XX......',
    '.....XXXX.....',
    '....XXXXXX....',
    '...XXXXXXXX...',
    '..XXXXXXXXXX..',
    '.XXXXXXXXXXXX.',
    'XXXXXXXXXXXXXX',
    '.XX........XX.',
    '.XX.oooooo.XX.',
    '.XX.oooooo.XX.',
    '.XX.oo..oo.XX.',
    '.XX.oo..oo.XX.',
    '.XXXXXXXXXXXX.',
    '..............',
  ],
  cards: [
    '......XXXXXX..',
    '.....X....XX..',
    '....XXXXXXXX..',
    '...X......XX..',
    '..XXXXXXXXXX..',
    '..X........X..',
    '..X...oo...X..',
    '..X..oooo..X..',
    '..X.oooooo.X..',
    '..X..oooo..X..',
    '..X...oo...X..',
    '..X........X..',
    '..XXXXXXXXXX..',
    '..............',
  ],
  eye: [
    '..............',
    '..............',
    '.....XXXX.....',
    '...XX....XX...',
    '..X........X..',
    '.X..oooooo..X.',
    'X..oo.XX.oo..X',
    'X..oo.XX.oo..X',
    '.X..oooooo..X.',
    '..X........X..',
    '...XX....XX...',
    '.....XXXX.....',
    '..............',
    '..............',
  ],
  bag: [
    '....XXXXXX....',
    '...X......X...',
    '...X......X...',
    '.XXXXXXXXXXXX.',
    '.X..........X.',
    '.X.oo....oo.X.',
    '.X.oo....oo.X.',
    '.X..........X.',
    '.X.oo....oo.X.',
    '.X..oooooo..X.',
    '.X..........X.',
    '.XXXXXXXXXXXX.',
    '..............',
    '..............',
  ],
  crown: [
    '..............',
    '..............',
    'X...........X.',
    'XX....XX....XX',
    'XX...XXXX...XX',
    'XXX.XXXXXX.XXX',
    'XXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXX',
    'XX.oo.oo.oo.XX',
    'XXXXXXXXXXXXXX',
    '.XXXXXXXXXXXX.',
    '..............',
    '..............',
    '..............',
  ],
  chat: [
    '..XXXXXXXXXX..',
    '.XXXXXXXXXXXX.',
    'XX..........XX',
    'XX.oo.oo.oo.XX',
    'XX..........XX',
    'XX.oooooooo.XX',
    'XX..........XX',
    'XX.oooooo...XX',
    'XX..........XX',
    '.XXXXXXXXXXXX.',
    '..XXXXXXXXXX..',
    '...XXX........',
    '..XX..........',
    '..............',
  ],
  users: [
    '..............',
    '...XX....XX...',
    '..XXXX..XXXX..',
    '..XXXX..XXXX..',
    '...XX....XX...',
    '..............',
    '.XXXXX..XXXXX.',
    'XXoooXXXXoooXX',
    'XXoooXXXXoooXX',
    'XXoooXXXXoooXX',
    'XXXXXXXXXXXXXX',
    '..............',
    '..............',
    '..............',
  ],
  check: [
    '..............',
    '..XXXXXXXXXX..',
    '.XX........XX.',
    'XX....oo....XX',
    'XX...oooo...XX',
    'XX.o.oooo...XX',
    'XX.oo.oooo..XX',
    'XX.ooo.oooo.XX',
    'XX..oooooo..XX',
    'XX...oooo...XX',
    '.XX........XX.',
    '..XXXXXXXXXX..',
    '..............',
    '..............',
  ],
  gear: [
    '.....XXXX.....',
    '..X..XXXX..X..',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    'XXXXoooooXXXXX',
    'XXXoo...ooXXXX',
    'XXXoo...ooXXXX',
    'XXXXoooooXXXXX',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '..X..XXXX..X..',
    '.....XXXX.....',
    '..............',
    '..............',
  ],
  list: [
    '..............',
    '.XX..XXXXXXXX.',
    '.XX..XXXXXXXX.',
    '..............',
    '.XX..oooooooo.',
    '.XX..oooooooo.',
    '..............',
    '.XX..XXXXXXXX.',
    '.XX..XXXXXXXX.',
    '..............',
    '.XX..oooooooo.',
    '.XX..oooooooo.',
    '..............',
    '..............',
  ],
};

const W = 14;
const H = 14;

function svgFor(name, color, accent) {
  const grid = ICONS[name];
  if (!grid) return '';
  let rects = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const ch = grid[y][x];
      if (ch === '.') {
        x++;
        continue;
      }
      let n = 1;
      while (x + n < W && grid[y][x + n] === ch) n++;
      rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${ch === 'o' ? accent : color}"/>`;
      x += n;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects}</svg>`;
}

export default function PixelIcon({ name, size = 26, color = 'currentColor', accent, style }) {
  const svg = svgFor(name, color, accent || color);
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', width: size, height: size, lineHeight: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${size}" height="${size}"`) }}
    />
  );
}
