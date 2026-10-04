// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  ECKEN,
  HANDSCHRIFT,
  MODI,
  PALETTEN,
  SCHRIFTARTEN,
  SCHRIFTEN,
  STANDARD,
  applyDarstellung,
  normalizeDarstellung,
  rememberDarstellung,
  resolveScheme,
  storedDarstellung
} from './darstellung.js'
import { akzentFarben } from './akzent.js'

const root = document.documentElement
const here = dirname(fileURLToPath(import.meta.url))
const initScript = readFileSync(join(here, '..', '..', 'public', 'darstellung-init.js'), 'utf8')
const serverSource = readFileSync(join(here, '..', '..', '..', 'server', 'lib', 'darstellung.js'), 'utf8')
// Eine Liste aus server/lib/darstellung.js (const NAME = ['a', 'b']) - dieselben Werte müssen hier stehen.
const serverList = (name) => JSON.parse(serverSource.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'))

// matchMedia mit steuerbarem System-Dunkelmodus (jsdom kennt keins).
function mockSystem(dark) {
  const listeners = new Set()
  const query = {
    matches: dark,
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn)
  }
  window.matchMedia = vi.fn(() => query)
  return {
    listeners,
    change(next) {
      query.matches = next
      for (const fn of listeners) fn({ matches: next })
    }
  }
}

const DATA_KEYS = ['palette', 'modus', 'schrift', 'scheme', 'grund', 'schriftart', 'handschrift', 'ecken', 'akzent']
const AKZENT_VARS = ['--akzent-hell', '--akzent-hell-tief', '--akzent-hell-auf', '--akzent-dunkel', '--akzent-dunkel-tief', '--akzent-dunkel-auf']

function clearRoot() {
  for (const key of DATA_KEYS) delete root.dataset[key]
  for (const name of AKZENT_VARS) root.style.removeProperty(name)
}

// Was applyDarstellung zusätzlich zu Farbwelt/Modus/Schrift setzt (Mini-Designer) - die Vorgabe.
const DESIGN_DEFAULTS = { grund: 'papier', schriftart: 'klassisch', handschrift: 'an', ecken: 'weich' }

beforeEach(() => {
  window.localStorage.clear()
  clearRoot()
})

afterEach(() => {
  delete window.matchMedia
  vi.restoreAllMocks()
})

describe('lib/darstellung', () => {
  test('dieselben Listen wie der Server (server/lib/darstellung.js), Familienalbum als Vorgabe', () => {
    expect(PALETTEN.map((option) => option.id)).toEqual(['familienalbum', 'wald', 'meer', 'lavendel', 'schiefer'])
    expect(PALETTEN.map((option) => option.label)).toEqual(['Familienalbum', 'Waldspaziergang', 'Strandtag', 'Lavendelfeld', 'Regentag'])
    expect(PALETTEN.map((option) => option.id)).toEqual(serverList('PALETTEN'))
    expect(MODI.map((option) => option.id)).toEqual(serverList('MODI'))
    expect(MODI.map((option) => option.label)).toEqual(['Papier', 'Weiß', 'Dunkel', 'Automatisch'])
    expect(SCHRIFTEN.map((option) => option.id)).toEqual(serverList('SCHRIFTEN'))
    expect(SCHRIFTARTEN.map((option) => option.id)).toEqual(serverList('SCHRIFTARTEN'))
    expect(SCHRIFTARTEN.map((option) => option.label)).toEqual(['Klassisch', 'Modern', 'Gut lesbar'])
    expect(HANDSCHRIFT.map((option) => option.id)).toEqual(serverList('HANDSCHRIFT'))
    expect(ECKEN.map((option) => option.id)).toEqual(serverList('ECKEN'))
    expect(STANDARD).toEqual({
      palette: 'familienalbum',
      modus: 'auto',
      schrift: 'normal',
      akzent: '',
      schriftart: 'klassisch',
      handschrift: 'an',
      ecken: 'weich'
    })
  })

  test('normalizeDarstellung prüft jedes Feld einzeln; „terrakotta“ wird Familienalbum, Farben klein', () => {
    expect(normalizeDarstellung(null)).toEqual(STANDARD)
    expect(normalizeDarstellung('wald')).toEqual(STANDARD)
    expect(normalizeDarstellung({ palette: 'meer', modus: 'neon', schrift: 'gross', extra: 1 })).toEqual({
      ...STANDARD,
      palette: 'meer',
      schrift: 'gross'
    })
    expect(normalizeDarstellung({ palette: 'terrakotta' }).palette).toBe('familienalbum')
    expect(normalizeDarstellung({ akzent: '#C8553A' }).akzent).toBe('#c8553a')
    for (const akzent of ['rot', '#abc', '#12345g', 'url(x)', 7, null]) expect(normalizeDarstellung({ akzent }).akzent).toBe('')
    expect(normalizeDarstellung({ schriftart: 'lesbar', handschrift: 'aus', ecken: 'eckig', modus: 'weiss' })).toEqual({
      ...STANDARD,
      schriftart: 'lesbar',
      handschrift: 'aus',
      ecken: 'eckig',
      modus: 'weiss'
    })
  })

  test('resolveScheme: Papier/Weiß/Dunkel fest, Automatisch nach dem System', () => {
    expect(resolveScheme('hell', true)).toBe('hell')
    expect(resolveScheme('weiss', true)).toBe('hell')
    expect(resolveScheme('dunkel', false)).toBe('dunkel')
    expect(resolveScheme('auto', true)).toBe('dunkel')
    expect(resolveScheme('auto', false)).toBe('hell')
  })

  test('applyDarstellung setzt die Attribute an <html>; Automatisch folgt einem Wechsel des Systems', () => {
    const system = mockSystem(false)
    applyDarstellung({ palette: 'lavendel', modus: 'auto', schrift: 'gross' })
    expect({ ...root.dataset }).toEqual({ palette: 'lavendel', modus: 'auto', schrift: 'gross', scheme: 'hell', ...DESIGN_DEFAULTS })
    system.change(true)
    expect(root.dataset.scheme).toBe('dunkel')

    // Fest gewählt: kein Lauscher mehr, der Systemwechsel ändert nichts.
    applyDarstellung({ palette: 'lavendel', modus: 'hell', schrift: 'gross' })
    expect(system.listeners.size).toBe(0)
    system.change(false)
    system.change(true)
    expect(root.dataset.scheme).toBe('hell')
  })

  test('ohne matchMedia gilt Automatisch als hell', () => {
    delete window.matchMedia
    applyDarstellung({ modus: 'auto' })
    expect(root.dataset.scheme).toBe('hell')
  })

  test('Mini-Designer: Weiß, Schriftart, Handschrift und Ecken als data-Attribute; eigene Akzentfarbe als CSS-Variablen', () => {
    mockSystem(false)
    applyDarstellung({ palette: 'wald', modus: 'weiss', schriftart: 'modern', handschrift: 'aus', ecken: 'eckig', akzent: '#3f6e8c' })
    expect({ ...root.dataset }).toEqual({
      palette: 'wald',
      modus: 'weiss',
      schrift: 'normal',
      scheme: 'hell',
      grund: 'weiss',
      schriftart: 'modern',
      handschrift: 'aus',
      ecken: 'eckig',
      akzent: 'eigen'
    })
    const farben = akzentFarben('#3f6e8c', 'wald')
    expect(root.style.getPropertyValue('--akzent-hell')).toBe(farben.hell.farbe)
    expect(root.style.getPropertyValue('--akzent-dunkel-auf')).toBe(farben.dunkel.auf)
    expect(root.style.getPropertyValue('--akzent-hell-tief')).toBe(farben.hell.tief)

    // Zurück ohne Akzentfarbe: Attribut und Variablen sind weg.
    applyDarstellung({ palette: 'wald' })
    expect(root.dataset.akzent).toBeUndefined()
    for (const name of AKZENT_VARS) expect(root.style.getPropertyValue(name), name).toBe('')
    expect(root.dataset.grund).toBe('papier')
  })

  test('merken und wieder lesen - ein kaputter oder gesperrter Speicher führt zur Vorgabe', () => {
    rememberDarstellung({ palette: 'wald', modus: 'dunkel', schrift: 'normal' })
    expect(storedDarstellung()).toEqual({ ...STANDARD, palette: 'wald', modus: 'dunkel' })
    // Für public/darstellung-init.js liegen die gerechneten Akzentfarben mit im Speicher.
    rememberDarstellung({ akzent: '#c8553a' })
    expect(JSON.parse(window.localStorage.getItem('chronik.darstellung')).farben).toEqual(akzentFarben('#c8553a', 'familienalbum'))
    window.localStorage.setItem('chronik.darstellung', '{kaputt')
    expect(storedDarstellung()).toEqual(STANDARD)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    expect(storedDarstellung()).toEqual(STANDARD)
  })
})

describe('public/darstellung-init.js – vor dem ersten Bild', () => {
  const run = () => new Function(initScript)()

  test('setzt die gemerkte Wahl, ohne Wahl Automatisch nach dem System', () => {
    mockSystem(true)
    run()
    expect({ ...root.dataset }).toEqual({ modus: 'auto', scheme: 'dunkel' })

    clearRoot()
    window.localStorage.setItem('chronik.darstellung', JSON.stringify({ palette: 'meer', modus: 'hell', schrift: 'gross' }))
    run()
    expect({ ...root.dataset }).toEqual({ palette: 'meer', modus: 'hell', schrift: 'gross', scheme: 'hell' })
  })

  test('der Mini-Designer: Weiß, Schriftart, Handschrift, Ecken und die gemerkten Akzentfarben', () => {
    mockSystem(false)
    rememberDarstellung({ palette: 'terrakotta', modus: 'weiss', schriftart: 'lesbar', handschrift: 'aus', ecken: 'eckig', akzent: '#3f6e8c' })
    run()
    expect({ ...root.dataset }).toEqual({
      palette: 'familienalbum',
      modus: 'weiss',
      schrift: 'normal',
      scheme: 'hell',
      grund: 'weiss',
      schriftart: 'lesbar',
      handschrift: 'aus',
      ecken: 'eckig',
      akzent: 'eigen'
    })
    const farben = akzentFarben('#3f6e8c', 'familienalbum')
    expect(root.style.getPropertyValue('--akzent-hell')).toBe(farben.hell.farbe)
    expect(root.style.getPropertyValue('--akzent-dunkel-tief')).toBe(farben.dunkel.tief)
  })

  test('gemerkte Farben, die keine #rrggbb sind, setzen nichts', () => {
    mockSystem(false)
    const bad = { farbe: 'red;} body{display:none', tief: '#000000', auf: '#ffffff' }
    window.localStorage.setItem('chronik.darstellung', JSON.stringify({ akzent: '#3f6e8c', farben: { hell: bad, dunkel: bad } }))
    run()
    expect(root.dataset.akzent).toBeUndefined()
    expect(root.style.getPropertyValue('--akzent-hell')).toBe('')
  })

  test('unbekannte Werte und kaputter Speicher setzen nichts außer Automatisch', () => {
    mockSystem(false)
    window.localStorage.setItem('chronik.darstellung', JSON.stringify({ palette: '"><script>', modus: 'nacht', schrift: 3, ecken: '1px' }))
    run()
    expect({ ...root.dataset }).toEqual({ modus: 'auto', scheme: 'hell' })
    clearRoot()
    window.localStorage.setItem('chronik.darstellung', 'kein json')
    run()
    expect({ ...root.dataset }).toEqual({ modus: 'auto', scheme: 'hell' })
  })
})
