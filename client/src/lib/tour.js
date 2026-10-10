// Rundgang (components/tour): die Schritte und alles, was sich ohne React rechnen lässt - wer gefragt wird, wo das Ziel
// eines Schritts steht, wo die Sprechblase hinkommt und die Form der abgedunkelten Fläche mit Ausschnitt.
// Stand je Zuhause: me.rundgang ('neu' | 'fertig' | 'aus', server/lib/profil.js). Ohne Angabe vom Server (ältere
// Version) zählt der Stand dieses Geräts (localStorage, lib/storage.js). Demo: nie speichern, höchstens einmal je Sitzung
// fragen (sessionStorage) - die Demo teilen sich viele.
import { api } from '../api.js'
import { areaContext } from './areas.js'
import { hasMenuSlot } from './navItems.js'
import { readSetting, writeSetting } from './storage.js'
import { CHAPTERS_BY_ART } from './tourSteps.js'

export const TOUR_STATUS = Object.freeze({ neu: 'neu', fertig: 'fertig', aus: 'aus' })
const LOCAL_KEY = 'rundgang'
const LATER_KEY = 'chronik.rundgangSpaeter'
const DEMO_ASKED_KEY = 'chronik.rundgangDemoGefragt'
// „Nicht mehr zeigen“ in einer Demo gilt für dieses Gerät (die Demo selbst speichert nichts).
const DEMO_OFF_KEY = 'rundgangDemoAus'

// Bis hierhin (px Breite) wird die Sprechblase zum Blatt am oberen oder unteren Rand.
export const SHEET_MAX_WIDTH = 720
export const POPOVER_WIDTH = 340
const GAP = 12
const EDGE = 16
const SPOT_PADDING = 8
const SPOT_RADIUS = 14

// Kapitel und Schritte: lib/tourSteps.js.
export { ROUTE_FIRST_ANIMAL, CHAPTER_TITLES } from './tourSteps.js'
export const TOUR_SCOPE = Object.freeze({ kurz: 'kurz', alles: 'alles' })

// Für wen gibt es den Rundgang? Alle Bereiche im eigenen Zugang - nicht in der Admin-Ansicht und nicht zu Besuch.
export function isTourAvailable(family) {
  return Boolean(family) && !family.adminView && !family.zuBesuch && areaContext(family) !== 'visit'
}

// Von selbst gefragt wird beim Betreten einer Demo (Zuhause, Familie, Partner, Tierheim) und beim ersten Login eines
// echten Haushalts bzw. klassischen Familien-Logins.
function asksByItself(family) {
  if (!isTourAvailable(family)) return false
  return Boolean(family.isDemo) || hasMenuSlot(family)
}

export function chaptersFor(family) {
  const chapters = CHAPTERS_BY_ART[family?.art] || CHAPTERS_BY_ART.household
  return chapters
    .map((chapter) => ({ ...chapter, steps: chapter.steps.filter((step) => !step.when || step.when(family)) }))
    .filter((chapter) => chapter.steps.length > 0)
}

// Die Schritte eines Durchgangs: „Kurz“ nur das erste Kapitel, „Alles“ alle - ab chapterKey (Sprung zu einem Kapitel).
// Jeder Schritt kennt sein Kapitel (chapter, chapterNumber) für die Zeile über dem Titel.
export function buildTour(family, { scope = TOUR_SCOPE.kurz, chapterKey } = {}) {
  const chapters = chaptersFor(family)
  const from = Math.max(0, chapters.findIndex((chapter) => chapter.key === chapterKey))
  const picked = scope === TOUR_SCOPE.alles ? chapters.slice(from) : chapters.slice(from, from + 1)
  return picked.flatMap((chapter) =>
    chapter.steps.map((step) => ({ ...step, chapter: chapter.key, chapterNumber: chapters.indexOf(chapter) + 1, chapterCount: chapters.length }))
  )
}

function sessionFlag(key) {
  try {
    return window.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function setSessionFlag(key) {
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {
    // ohne Speicher fragt der Rundgang eben in dieser Sitzung noch einmal
  }
}

const homeIdOf = (family) => family?.home?.id ?? family?.id

export function tourStatus(family) {
  const fromServer = family?.rundgang
  if (Object.values(TOUR_STATUS).includes(fromServer)) return fromServer
  return readSetting(`${LOCAL_KEY}.${homeIdOf(family)}`, TOUR_STATUS.neu)
}

// Soll die Frage „Möchtet ihr einen kurzen Rundgang?“ jetzt kommen?
export function shouldPrompt(family) {
  if (!asksByItself(family) || sessionFlag(LATER_KEY)) return false
  if (family.isDemo) return !sessionFlag(DEMO_ASKED_KEY) && readSetting(DEMO_OFF_KEY, false) !== true
  return tourStatus(family) === TOUR_STATUS.neu
}

// Die Frage wurde gezeigt - in der Demo nur einmal je Sitzung.
export function markPrompted(family) {
  if (family?.isDemo) setSessionFlag(DEMO_ASKED_KEY)
}

// Speichert den Stand (Gerät + Server); Fehler (offline, Admin-Ansicht) bleiben still - der Rundgang ist Komfort.
// Demo: nichts am Server, „aus“ nur auf diesem Gerät. Gibt die neue family zurück.
export async function saveTourStatus(family, status) {
  if (!family) return family
  setSessionFlag(LATER_KEY)
  if (family.isDemo) {
    if (status === TOUR_STATUS.aus) writeSetting(DEMO_OFF_KEY, true)
    return family
  }
  writeSetting(`${LOCAL_KEY}.${homeIdOf(family)}`, status)
  try {
    await api.setRundgang(status)
  } catch {
    // Gerätestand reicht
  }
  return { ...family, rundgang: status }
}

// Nach einem Durchgang: ein neuer Haushalt gilt als „fertig“, wer „aus“ gewählt hat, bleibt dabei.
export function statusAfterTour(family) {
  return tourStatus(family) === TOUR_STATUS.aus ? TOUR_STATUS.aus : TOUR_STATUS.fertig
}

// checkVisibility kennt auch display: none an Vorfahren (z. B. das Konto-Menü am Handy); ältere Browser: Layout-Kästchen.
function isVisible(element) {
  if (!element || element.hidden) return false
  if (typeof element.checkVisibility === 'function') return element.checkVisibility()
  return element.getClientRects().length > 0
}

// Erster sichtbarer Treffer der Selektoren.
export function findTarget(selectors, root = document) {
  for (const selector of selectors) {
    const match = [...root.querySelectorAll(selector)].find(isVisible)
    if (match) return match
  }
  return null
}

export function firstAnimalRoute(root = document) {
  return root.querySelector('a.animal-tile')?.getAttribute('href') || null
}

// Ausschnitt um das Ziel, etwas größer als das Element.
export function spotRect(rect) {
  return {
    x: rect.left - SPOT_PADDING,
    y: rect.top - SPOT_PADDING,
    width: rect.width + SPOT_PADDING * 2,
    height: rect.height + SPOT_PADDING * 2
  }
}

// Fläche des ganzen Fensters mit abgerundetem Loch (evenodd) - als <path d> für die abgedunkelte Ebene.
export function overlayPath(viewport, spot) {
  const outer = `M0 0H${viewport.width}V${viewport.height}H0Z`
  if (!spot) return outer
  const r = Math.max(0, Math.min(SPOT_RADIUS, spot.width / 2, spot.height / 2))
  const { x, y, width: w, height: h } = spot
  const hole =
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  return `${outer}${hole}`
}

const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)))

// Wohin mit der Sprechblase? Schmal: Blatt unten - oder oben, wenn das Ziel in der unteren Hälfte steht (z. B. die
// Leiste unten am Handy). Breit: unter dem Ziel, sonst darüber, waagerecht im Fenster gehalten.
export function placePopover(rect, viewport, height = 220) {
  if (viewport.width <= SHEET_MAX_WIDTH) {
    const lower = rect ? rect.top + rect.height / 2 > viewport.height / 2 : false
    return { mode: 'sheet', edge: lower ? 'top' : 'bottom' }
  }
  if (!rect) return { mode: 'center' }
  const left = clamp(rect.left + rect.width / 2 - POPOVER_WIDTH / 2, EDGE, viewport.width - POPOVER_WIDTH - EDGE)
  const below = rect.bottom + SPOT_PADDING + GAP
  if (below + height <= viewport.height - EDGE) return { mode: 'float', top: below, left }
  const above = rect.top - SPOT_PADDING - GAP - height
  return { mode: 'float', top: clamp(above, EDGE, viewport.height - height - EDGE), left }
}
