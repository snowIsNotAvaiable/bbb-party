/**
 * Namenserkennung für den Karten-Editor. Karten sollen keine Personennamen
 * enthalten: wer namentlich drinsteht und dann absagt, macht die Karte tot.
 *
 * Zwei Quellen, weil eine allein nicht reicht: die echten Gäste kennt die App
 * erst, wenn sie beigetreten sind, und eine feste Liste kennt nicht jeden Gast.
 * Eine Großschreibungs-Heuristik wäre im Deutschen wertlos, da ist jedes
 * Substantiv groß.
 */

/** Gängige Vornamen. Bewusst ohne alles, was auch ein normales Wort ist. */
const COMMON = `
alex alexander ali alina amelie andrea andreas anna annika anton ayse
ben benjamin bernd bianca björn burak carina carlos caro carolin celine
chantal chris christian christina christoph claudia clemens colin conny
daniel daniela david dennis diana dieter dilara dominik dorothea dustin
ebru elena elif elias emil emily emma emre enes erik esra eva fabian
fatih fatma felix ferdinand finn florian franziska frank fynn gabriel
georg gerd gina giulia görkem greta gunnar hakan hannah hanna hannes
hans harald heiko heike helena helmut henrik henry ilay ines ingo irina
isabel jakob jan janina janine jannik jasmin jennifer jenny jens jessica
joel johanna johannes jonas jonathan josef julia julian juliane justin
kai kajetan karin karl katharina kathrin kerstin kevin kilian kira
klaus konstantin korbinian kristin lara larissa lars laura lea leon
leonie leonard levent levin lina linda lisa liam lorenz luca lucas ludwig
luis luisa lukas lutz maike maja malte manuel manuela marc marcel marco
marcus maria mariam marie marina mario marius markus martin mathias
matthias maurice maximilian mehmet melanie melis melina merve
michael michaela miriam mirko moritz murat mustafa nadine natalie nele
nici nico nicolas niklas nils nina noah norbert olaf oliver omar oskar
patrick paul paula pauline peter philipp pia rabea ralf raphael rebecca
rene ricardo richard rico rita robert robin robby roland romy ronja
ruben rudolf sabine samira sandra sara sarah sascha sebastian selin
selina semih sena serkan silke simon simone sinan sofia sonja sophia
sophie stefan stefanie steffen stephan svenja sven tamara tanja tarik
thomas tim timo tobias tom tomas tommy toni torben tugce ulf ulrich ulrike
uwe valentin vanessa vera verena victoria viktor vincent volker wolfgang
yasmin yusuf yvonne zeynep
bela deniz devin ela elli fiona ilyas jara jule lennard lennart
marlon mats mia mila nika ole pepe phil samuel silas theo till
tino valeria vito yannick zoe
`
  .trim()
  .split(/\s+/);

/** Wer namentlich drinstehen darf: die Party gehört ihr. */
const ALLOWED = new Set(['buki', 'bukurije']);

const clean = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();

/**
 * Sucht Personennamen in einem Text.
 *
 * @param {string} text zu prüfender Aufgabentext
 * @param {Array<{name: string, role?: string}>} players aktuelle Gästeliste
 * @returns {Array<{name: string, source: 'gast'|'liste'}>} gefundene Namen
 */
export function findNames(text, players = []) {
  const words = String(text || '')
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (!words.length) return [];

  // Der Genitiv hängt ein s an: „Robbys Bier“ soll genauso anschlagen.
  const forms = new Set(words);
  for (const w of words) if (w.length > 3 && w.endsWith('s')) forms.add(w.slice(0, -1));

  const guests = new Map();
  for (const p of players) {
    const n = clean(p.name);
    // Das Geburtstagskind ist ausgenommen, auf sie darf eine Karte zeigen.
    if (n.length < 3 || ALLOWED.has(n) || p.role === 'birthday') continue;
    guests.set(n, p.name.trim());
  }

  const hits = new Map();
  for (const form of forms) {
    if (ALLOWED.has(form)) continue;
    if (guests.has(form)) hits.set(form, { name: guests.get(form), source: 'gast' });
    else if (!hits.has(form) && COMMON.includes(form)) {
      hits.set(form, { name: form[0].toUpperCase() + form.slice(1), source: 'liste' });
    }
  }
  return [...hits.values()];
}
