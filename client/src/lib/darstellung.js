import { readSetting, writeSetting } from './storage.js'
import { akzentFarben } from './akzent.js'
import { PALETTE_FLAECHEN } from './paletteFlaechen.js'

// Einstellungen „Darstellung“ - seit B+ Familienalbum der Mini-Designer: Farbwelt, Hintergrund (Papier/Weiß/Dunkel/
// Automatisch), Schriftgröße, eigene Akzentfarbe, Schriftart, Handschrift-Akzente und Ecken. Dieselben Listen wie
// server/lib/darstellung.js. Angewendet als data-Attribute an <html> - die Farben stehen in styles/palettes.css (je Farbwelt
// hell und dunkel, data-grund für „Weiß“, data-akzent für die eigene Akzentfarbe), Schrift und Ecken in styles/tokens.css.
// data-scheme ist das Ergebnis des Hintergrunds: „Automatisch“ folgt dem System (und dessen Wechsel, solange die Seite offen
// ist). Die eigene Akzentfarbe rechnet lib/akzent.js je Modus lesbar und setzt sie als --akzent-* an <html>.
// Damit beim Laden nichts aufblitzt, setzt public/darstellung-init.js die zuletzt gemerkte Wahl schon vor dem ersten
// Bild (aus localStorage, samt der gerechneten Akzentfarben) - dieselbe Regel, nur ohne Module.

export const PALETTEN = [
  { id: 'familienalbum', label: 'Familienalbum', hint: 'Papier, Terrakotta und Salbei' },
  { id: 'wald', label: 'Waldspaziergang', hint: 'Moosgrün und Rinde' },
  { id: 'meer', label: 'Strandtag', hint: 'Meerblau und Dünengras' },
  { id: 'lavendel', label: 'Lavendelfeld', hint: 'Flieder und Salbei' },
  { id: 'schiefer', label: 'Regentag', hint: 'Blaugrau und Petrol' }
]

// Der Hintergrund (Feld modus): „Papier“ ist der helle Modus mit Papierton, „Weiß“ der helle mit weißem Grund.
export const MODI = [
  { id: 'hell', label: 'Papier' },
  { id: 'weiss', label: 'Weiß' },
  { id: 'dunkel', label: 'Dunkel' },
  { id: 'auto', label: 'Automatisch', hint: 'wie am Gerät' }
]

export const SCHRIFTEN = [
  { id: 'normal', label: 'Normal' },
  { id: 'gross', label: 'Größer' }
]

export const SCHRIFTARTEN = [
  { id: 'klassisch', label: 'Klassisch', hint: 'Fraunces und Figtree' },
  { id: 'modern', label: 'Modern', hint: 'nur Figtree' },
  { id: 'lesbar', label: 'Gut lesbar', hint: 'Atkinson Hyperlegible' }
]

export const HANDSCHRIFT = [
  { id: 'an', label: 'An' },
  { id: 'aus', label: 'Aus' }
]

export const ECKEN = [
  { id: 'weich', label: 'Weich' },
  { id: 'eckig', label: 'Eckig' }
]

export const STANDARD = Object.freeze({
  palette: 'familienalbum',
  modus: 'auto',
  schrift: 'normal',
  akzent: '',
  schriftart: 'klassisch',
  handschrift: 'an',
  ecken: 'weich'
})

// Vor B+ Familienalbum hieß die Vorgabe „terrakotta“.
const LEGACY_PALETTEN = { terrakotta: 'familienalbum' }
const HEX_RE = /^#[0-9a-f]{6}$/

const ids = (list) => list.map((option) => option.id)
const ALLOWED = {
  palette: ids(PALETTEN),
  modus: ids(MODI),
  schrift: ids(SCHRIFTEN),
  schriftart: ids(SCHRIFTARTEN),
  handschrift: ids(HANDSCHRIFT),
  ecken: ids(ECKEN)
}
// Die Felder, die als data-Attribute an <html> stehen (dataset-Name = Feldname).
const DATA_FIELDS = ['palette', 'modus', 'schrift', 'schriftart', 'handschrift', 'ecken']
const AKZENT_VARS = {
  '--akzent-hell': ['hell', 'farbe'],
  '--akzent-hell-tief': ['hell', 'tief'],
  '--akzent-hell-auf': ['hell', 'auf'],
  '--akzent-dunkel': ['dunkel', 'farbe'],
  '--akzent-dunkel-tief': ['dunkel', 'tief'],
  '--akzent-dunkel-auf': ['dunkel', 'auf']
}

const STORAGE_KEY = 'darstellung'
const DARK_QUERY = '(prefers-color-scheme: dark)'
// Beim Ziehen des Farbfelds kommt viele Male je Sekunde eine neue Wahl - gemerkt wird sofort und dann erst, wenn es ruht.
const REMEMBER_DELAY_MS = 400
const WHITE_PAPER = '#ffffff'

function cleanAkzent(value) {
  const hex = typeof value === 'string' ? value.toLowerCase() : ''
  return HEX_RE.test(hex) ? hex : ''
}

// Jedes Feld einzeln geprüft - Unbekanntes (alte Werte, kaputter Speicher) fällt auf die Vorgabe zurück.
export function normalizeDarstellung(value) {
  const source = value && typeof value === 'object' ? value : {}
  // Nur Zeichenketten sind alte Namen (ein Objekt mit eigenem toString rutschte sonst als Schlüssel durch).
  const legacy = typeof source.palette === 'string' && Object.hasOwn(LEGACY_PALETTEN, source.palette)
  const palette = legacy ? LEGACY_PALETTEN[source.palette] : source.palette
  const picked = Object.fromEntries(
    Object.entries(ALLOWED).map(([key, allowed]) => {
      const candidate = key === 'palette' ? palette : source[key]
      return [key, allowed.includes(candidate) ? candidate : STANDARD[key]]
    })
  )
  return { ...STANDARD, ...picked, akzent: cleanAkzent(source.akzent) }
}

function systemPrefersDark() {
  try {
    return Boolean(window.matchMedia?.(DARK_QUERY).matches)
  } catch {
    return false
  }
}

// Hell oder dunkel, wie es die Seite zeigt („Papier“ und „Weiß“ sind beide hell).
export function resolveScheme(modus, prefersDark = systemPrefersDark()) {
  if (modus === 'dunkel') return 'dunkel'
  if (modus === 'hell' || modus === 'weiss') return 'hell'
  return prefersDark ? 'dunkel' : 'hell'
}

// „Automatisch“: einem Wechsel des Systems (z. B. abends) folgen, solange die Seite offen ist - genau ein Lauscher.
let systemQuery = null
let systemListener = null

// Das Papier je Modus - für die Farbe der Browser-Leiste (<meta name="theme-color">, Handy).
function papierOf(darstellung) {
  const flaechen = PALETTE_FLAECHEN[darstellung.palette] || PALETTE_FLAECHEN.familienalbum
  return { hell: darstellung.modus === 'weiss' ? WHITE_PAPER : flaechen.hell.paper, dunkel: flaechen.dunkel.paper }
}

function setThemeColor(color) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}

function followSystem(root, enabled, papier) {
  if (systemQuery && systemListener) systemQuery.removeEventListener?.('change', systemListener)
  systemQuery = null
  systemListener = null
  if (!enabled) return
  try {
    systemQuery = window.matchMedia?.(DARK_QUERY) || null
  } catch {
    systemQuery = null
  }
  if (!systemQuery?.addEventListener) return
  systemListener = (event) => {
    const scheme = event.matches ? 'dunkel' : 'hell'
    root.dataset.scheme = scheme
    setThemeColor(papier[scheme])
  }
  systemQuery.addEventListener('change', systemListener)
}

// Eigene Akzentfarbe: data-akzent und die gerechneten Farben je Modus - ohne Farbe beides weg.
function applyAkzent(root, darstellung) {
  const farben = akzentFarben(darstellung.akzent, darstellung.palette)
  for (const [name, [scheme, key]] of Object.entries(AKZENT_VARS)) {
    if (farben) root.style.setProperty(name, farben[scheme][key])
    else root.style.removeProperty(name)
  }
  if (farben) root.dataset.akzent = 'eigen'
  else delete root.dataset.akzent
}

// Setzt die Darstellung an <html> (oder root) und gibt die geprüfte Fassung zurück.
export function applyDarstellung(value, root = document.documentElement) {
  const darstellung = normalizeDarstellung(value)
  for (const key of DATA_FIELDS) root.dataset[key] = darstellung[key]
  root.dataset.grund = darstellung.modus === 'weiss' ? 'weiss' : 'papier'
  const scheme = resolveScheme(darstellung.modus)
  const papier = papierOf(darstellung)
  root.dataset.scheme = scheme
  setThemeColor(papier[scheme])
  applyAkzent(root, darstellung)
  followSystem(root, darstellung.modus === 'auto', papier)
  return darstellung
}

let rememberTimer = null
let pendingRemember = null
let lastRememberAt = -Infinity

function writeRemembered() {
  clearTimeout(rememberTimer)
  rememberTimer = null
  if (pendingRemember) writeSetting(STORAGE_KEY, pendingRemember)
  pendingRemember = null
  lastRememberAt = Date.now()
}

// Eine noch wartende Wahl sofort merken (beim Verlassen der Seite - pagehide).
export function flushRememberedDarstellung() {
  if (pendingRemember) writeRemembered()
}

// Für das nächste Laden auf diesem Gerät merken (public/darstellung-init.js liest denselben Schlüssel) - mit den
// gerechneten Akzentfarben und dem Papier je Modus, die das Skript ohne Module nicht selbst rechnen kann. Sofort, solange
// es nicht gerade sehr schnell hintereinander geht (Farbfeld) - dann die letzte, sobald es REMEMBER_DELAY_MS ruht.
export function rememberDarstellung(value) {
  const darstellung = normalizeDarstellung(value)
  const farben = akzentFarben(darstellung.akzent, darstellung.palette)
  pendingRemember = { ...darstellung, papier: papierOf(darstellung), ...(farben ? { farben } : {}) }
  if (Date.now() - lastRememberAt >= REMEMBER_DELAY_MS) {
    writeRemembered()
    return
  }
  clearTimeout(rememberTimer)
  rememberTimer = setTimeout(writeRemembered, REMEMBER_DELAY_MS)
  window.addEventListener('pagehide', flushRememberedDarstellung, { once: true })
}

export function storedDarstellung() {
  return normalizeDarstellung(readSetting(STORAGE_KEY, null))
}
