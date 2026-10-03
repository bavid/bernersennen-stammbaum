// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MODI, PALETTEN, SCHRIFTEN, STANDARD, applyDarstellung, normalizeDarstellung, rememberDarstellung, resolveScheme, storedDarstellung } from './darstellung.js'

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

function clearRoot() {
  for (const key of ['palette', 'modus', 'schrift', 'scheme']) delete root.dataset[key]
}

beforeEach(() => {
  window.localStorage.clear()
  clearRoot()
})

afterEach(() => {
  delete window.matchMedia
  vi.restoreAllMocks()
})

describe('lib/darstellung', () => {
  test('dieselben Listen wie der Server (server/lib/darstellung.js), Terrakotta als Vorgabe', () => {
    expect(PALETTEN.map((option) => option.id)).toEqual(['terrakotta', 'wald', 'meer', 'lavendel', 'schiefer'])
    expect(PALETTEN.map((option) => option.id)).toEqual(serverList('PALETTEN'))
    expect(MODI.map((option) => option.id)).toEqual(serverList('MODI'))
    expect(SCHRIFTEN.map((option) => option.id)).toEqual(serverList('SCHRIFTEN'))
    expect(STANDARD).toEqual({ palette: 'terrakotta', modus: 'auto', schrift: 'normal' })
  })

  test('normalizeDarstellung prüft jedes Feld einzeln', () => {
    expect(normalizeDarstellung(null)).toEqual(STANDARD)
    expect(normalizeDarstellung('wald')).toEqual(STANDARD)
    expect(normalizeDarstellung({ palette: 'meer', modus: 'neon', schrift: 'gross', extra: 1 })).toEqual({
      palette: 'meer',
      modus: 'auto',
      schrift: 'gross'
    })
  })

  test('resolveScheme: Hell/Dunkel fest, Automatisch nach dem System', () => {
    expect(resolveScheme('hell', true)).toBe('hell')
    expect(resolveScheme('dunkel', false)).toBe('dunkel')
    expect(resolveScheme('auto', true)).toBe('dunkel')
    expect(resolveScheme('auto', false)).toBe('hell')
  })

  test('applyDarstellung setzt die Attribute an <html>; Automatisch folgt einem Wechsel des Systems', () => {
    const system = mockSystem(false)
    applyDarstellung({ palette: 'lavendel', modus: 'auto', schrift: 'gross' })
    expect({ ...root.dataset }).toEqual({ palette: 'lavendel', modus: 'auto', schrift: 'gross', scheme: 'hell' })
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

  test('merken und wieder lesen - ein kaputter oder gesperrter Speicher führt zur Vorgabe', () => {
    rememberDarstellung({ palette: 'wald', modus: 'dunkel', schrift: 'normal' })
    expect(storedDarstellung()).toEqual({ palette: 'wald', modus: 'dunkel', schrift: 'normal' })
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

  test('unbekannte Werte und kaputter Speicher setzen nichts außer Automatisch', () => {
    mockSystem(false)
    window.localStorage.setItem('chronik.darstellung', JSON.stringify({ palette: '"><script>', modus: 'nacht', schrift: 3 }))
    run()
    expect({ ...root.dataset }).toEqual({ modus: 'auto', scheme: 'hell' })
    clearRoot()
    window.localStorage.setItem('chronik.darstellung', 'kein json')
    run()
    expect({ ...root.dataset }).toEqual({ modus: 'auto', scheme: 'hell' })
  })
})
