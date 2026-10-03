// Selbst gezeichnete Muster-Kacheln für Collage-Hintergründe (Pfoten, Herzen, Papier) als kleine SVGs.
// Kein externes Bild: die Kachel wird als data:-URL in der Vorschau (CSS) und im Export (Canvas) gekachelt.
// Größen in Seiteneinheiten (PAGE.width = 1240), ganzzahlig, damit die Kacheln im Export nahtlos sitzen.

const n = (value) => String(Math.round(value * 10) / 10)

function svgTile(size, body) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
}

const place = ([x, y, rotation, scale]) => `translate(${n(x)} ${n(y)}) rotate(${n(rotation)}) scale(${n(scale)})`

// Pfote um (0, 0), Radius ~22: Ballen plus vier Zehen
const PAW =
  '<ellipse cx="0" cy="7" rx="11" ry="9.5"/>' +
  '<ellipse cx="-12" cy="-5" rx="4.6" ry="6" transform="rotate(-25 -12 -5)"/>' +
  '<ellipse cx="-4.5" cy="-12.5" rx="4.6" ry="6.2" transform="rotate(-8 -4.5 -12.5)"/>' +
  '<ellipse cx="4.5" cy="-12.5" rx="4.6" ry="6.2" transform="rotate(8 4.5 -12.5)"/>' +
  '<ellipse cx="12" cy="-5" rx="4.6" ry="6" transform="rotate(25 12 -5)"/>'

const HEART =
  '<path d="M0 8C-8 2-14-3-14-8.5C-14-13.5-10.5-16.5-6.5-16.5C-3.5-16.5-1.2-14.6 0-12.3C1.2-14.6 3.5-16.5 6.5-16.5C10.5-16.5 14-13.5 14-8.5C14-3 8 2 0 8Z"/>'

// [x, y, Drehung, Maßstab] - jedes Motiv liegt ganz in der Kachel, damit an den Kanten nichts abgeschnitten wird
const PAWS = [
  [52, 58, -18, 1],
  [150, 150, 22, 0.9],
  [152, 44, 10, 0.55],
  [46, 158, -32, 0.6]
]

const HEARTS = [
  [42, 50, -14, 1],
  [122, 124, 12, 0.85],
  [124, 40, 8, 0.5],
  [40, 128, -6, 0.55]
]

function motifTile(size, shape, spots, color, opacity) {
  const groups = spots.map((spot) => `<g transform="${place(spot)}">${shape}</g>`).join('')
  return svgTile(size, `<g fill="${color}" fill-opacity="${opacity}">${groups}</g>`)
}

// Feste Zufallsfolge (mulberry32): die Papier-Struktur sieht bei jedem Laden und im Export gleich aus.
function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PAPER_SIZE = 240
const PAPER_SEED = 20261003
const WRAP_MARGIN = 24

// Elemente nahe einer Kante zusätzlich auf der Gegenseite zeichnen - so läuft die Struktur nahtlos weiter.
function wrapped(x, y, draw) {
  const xs = [x, ...(x < WRAP_MARGIN ? [x + PAPER_SIZE] : []), ...(x > PAPER_SIZE - WRAP_MARGIN ? [x - PAPER_SIZE] : [])]
  const ys = [y, ...(y < WRAP_MARGIN ? [y + PAPER_SIZE] : []), ...(y > PAPER_SIZE - WRAP_MARGIN ? [y - PAPER_SIZE] : [])]
  return xs.flatMap((px) => ys.map((py) => draw(px, py))).join('')
}

function paperTile() {
  const random = seededRandom(PAPER_SEED)
  const between = (min, max) => min + random() * (max - min)
  let specks = ''
  for (let i = 0; i < 90; i += 1) {
    const [x, y, r, o] = [between(0, PAPER_SIZE), between(0, PAPER_SIZE), between(0.5, 1.6), between(0.05, 0.13)]
    specks += wrapped(x, y, (px, py) => `<circle cx="${n(px)}" cy="${n(py)}" r="${n(r)}" fill-opacity="${n(o * 100) / 100}"/>`)
  }
  let fibers = ''
  for (let i = 0; i < 40; i += 1) {
    const [x, y, angle, length, bend, o] = [
      between(0, PAPER_SIZE),
      between(0, PAPER_SIZE),
      between(0, Math.PI * 2),
      between(6, 20),
      between(-4, 4),
      between(0.06, 0.14)
    ]
    const dx = Math.cos(angle) * length
    const dy = Math.sin(angle) * length
    fibers += wrapped(
      x,
      y,
      (px, py) =>
        `<path d="M${n(px)} ${n(py)}q${n(dx / 2 - dy * bend * 0.05)} ${n(dy / 2 + dx * bend * 0.05)} ${n(dx)} ${n(dy)}" stroke-opacity="${n(o * 100) / 100}"/>`
    )
  }
  return svgTile(
    PAPER_SIZE,
    `<g fill="#7a5f45">${specks}</g><g fill="none" stroke="#9a7b5c" stroke-width="0.8" stroke-linecap="round">${fibers}</g>`
  )
}

const BUILDERS = {
  pfoten: () => ({ size: 200, svg: motifTile(200, PAW, PAWS, '#c39a72', 0.3) }),
  herzen: () => ({ size: 160, svg: motifTile(160, HEART, HEARTS, '#d27575', 0.28) }),
  papier: () => ({ size: PAPER_SIZE, svg: paperTile() })
}

// Neue Kachel { size, svg } für ein Muster, null für einfarbige Hintergründe.
export function buildTile(id) {
  return BUILDERS[id] ? BUILDERS[id]() : null
}
