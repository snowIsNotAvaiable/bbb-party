/**
 * Gemeinsames Gerüst für die beiden gedruckten Seiten: den Spickzettel für
 * den Host (server/sheet.js) und den Rückblick nach der Party
 * (server/recap.js).
 *
 * Beide sind bewusst simpel: ein einziges HTML-Dokument, kein Skript, keine
 * externe Schrift, kein Bild. Sie müssen ohne Internet funktionieren, sie
 * müssen auf A4 sauber umbrechen, und sie müssen auch dann noch lesbar sein,
 * wenn jemand sie als Screenshot ins Gruppenchat wirft.
 */

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const PAGE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 28px 22px 60px;
  background: #f4f3f0;
  color: #16161c;
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
}
.wrap { max-width: 860px; margin: 0 auto; }
h1 { font-size: 27px; margin: 0 0 2px; letter-spacing: -.01em; text-wrap: balance; }
h2 {
  font-size: 11px; letter-spacing: .17em; text-transform: uppercase;
  color: #7a7686; margin: 0 0 9px; font-weight: 600;
}
p { margin: 0 0 9px; }
.lead { color: #55525f; margin: 0 0 22px; }
.card {
  background: #fff; border: 1px solid #ddd9d2; border-radius: 12px;
  padding: 16px 18px; margin: 0 0 14px; break-inside: avoid;
}
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 14px; }
.big { display: flex; flex-wrap: wrap; gap: 22px; align-items: baseline; }
.big div { min-width: 0; }
.big b { display: block; font-size: 22px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.big span { font-size: 10px; letter-spacing: .15em; text-transform: uppercase; color: #7a7686; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 7px 10px 7px 0; vertical-align: top; }
th { font-weight: 600; color: #7a7686; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
tr + tr td { border-top: 1px solid #ebe8e2; }
td.num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; width: 1%; padding-right: 16px; }
td.right { text-align: right; font-variant-numeric: tabular-nums; }
ul { margin: 0; padding-left: 19px; }
li { margin-bottom: 6px; }
li:last-child { margin-bottom: 0; }
.rule { font-size: 14px; color: #55525f; }
.warn { border-color: #c98fae; background: #fdf7fa; }
.warn h2 { color: #9c4f76; }
footer { margin-top: 26px; font-size: 12px; color: #8b8794; }
/* Breite Tabellen scrollen in ihrem eigenen Kasten, statt die ganze Seite
   seitwärts zu schieben. shell() legt den Kasten automatisch um jede Tabelle. */
.scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.scroll table { min-width: 100%; }
@media (max-width: 430px) {
  body { padding-left: 16px; padding-right: 16px; }
  td, th { padding-right: 8px; }
  td.num { white-space: normal; overflow-wrap: anywhere; }
}
@media print {
  body { background: #fff; padding: 0; font-size: 11.5pt; }
  .card { border-color: #c9c5bd; box-shadow: none; }
  .warn { background: #fff; }
  .page-break { break-before: page; }
  @page { margin: 14mm; }
}
`;

/**
 * Rahmen um den Inhalt. `title` landet im Tab und über dem Ausdruck.
 *
 * Jede Tabelle bekommt automatisch einen scrollbaren Kasten. Auf einem 320er
 * Display ist sonst die ganze Seite seitwärts verschiebbar, und das macht das
 * Lesen kaputt. Die Suche ist ungefährlich, weil aller Inhalt durch esc()
 * gegangen ist und deshalb kein echtes `<table>` enthalten kann.
 */
export function shell({ title, body }) {
  const inhalt = body
    .replace(/<table>/g, '<div class="scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
${inhalt}
</div>
</body>
</html>`;
}
