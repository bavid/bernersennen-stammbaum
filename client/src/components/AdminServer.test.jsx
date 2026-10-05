// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { server } = vi.hoisted(() => ({ server: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { server } } }))

import AdminServer from './AdminServer.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const GB = 1024 ** 3
const MB = 1024 ** 2
const SCHWELLEN = { speicher: { gelb: 80, rot: 90 }, platte: { gelb: 70, rot: 85 }, last: { gelb: 0.75, rot: 1 } }

// Antwort von GET /api/admin/server wie heute (30.09.): 2 Kerne, 3,7 GB RAM, 38 GB Platte zu 16 % belegt.
function fixture(overrides = {}) {
  return {
    gemessenAt: '2026-10-03T08:42:00.000Z',
    speicher: { gesamt: 3.7 * GB, verfuegbar: 2.8 * GB, app: 35 * MB, belegtProzent: 24.3, ampel: 'ok' },
    platte: { gesamt: 38 * GB, frei: 31.9 * GB, belegtProzent: 16, ampel: 'ok' },
    last: { kerne: 2, load1: 0.1, load5: 0.08, load15: 0.05, proKern: 0.05, ampel: 'ok' },
    laufzeit: { server: 12 * 86400 + 4 * 3600, app: 3 * 3600 + 12 * 60 },
    groessen: {
      datenbank: 56 * MB,
      fotos: 312 * MB,
      chronikFotos: 300 * MB,
      partnerBilder: 12 * MB,
      sicherungen: 640 * MB,
      berechnetAt: '2026-10-03T08:00:00.000Z'
    },
    stand: {
      version: '03eb39d',
      letztesBackup: { at: '2026-10-03T01:30:00.000Z', bytes: 41 * MB, art: 'auto' },
      ausserHaus: { at: '2026-10-03T01:50:00.000Z', bytes: 700 * MB, art: 'offsite' }
    },
    verlauf: [
      { at: '2026-10-03T06:00:00.000Z', speicherFrei: 78, platteFrei: 84.2, last: 0.2 },
      { at: '2026-10-03T07:00:00.000Z', speicherFrei: 74, platteFrei: 84.1, last: 0.4 },
      { at: '2026-10-03T08:00:00.000Z', speicherFrei: 76, platteFrei: 84, last: 0.1 }
    ],
    schwellen: SCHWELLEN,
    warnungen: { aktiv: true, eingerichtet: true },
    ...overrides
  }
}

let container
let root

async function render(props = {}) {
  await act(async () => {
    root.render(<AdminServer {...props} />)
  })
}

const text = (selector) => container.querySelector(selector)?.textContent ?? null
const card = (title) => [...container.querySelectorAll('.server-card')].find((el) => el.querySelector('h3').textContent === title)
const rows = (el) => Object.fromEntries([...el.querySelectorAll('dl > div')].map((row) => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-03T08:45:00Z'))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  server.mockReset()
  vi.useRealTimers()
})

describe('AdminServer', () => {
  test('Karten mit Ampel als Wort, Werten und Zusammenfassung; zuletzt gemessen', async () => {
    server.mockResolvedValue(fixture())
    await render()

    expect(text('#admin-server-title')).toBe('Server')
    expect(text('.admin-server-summary')).toBe('Alles im grünen Bereich.')
    expect(text('.admin-server-time')).toBe('Zuletzt gemessen: 10:42 Uhr')

    const speicher = card('Arbeitsspeicher')
    expect(speicher.querySelector('.server-ampel').textContent).toBe('Ampel: ok')
    expect(speicher.querySelector('.server-card-value').textContent).toBe('24,3 % belegt')
    expect(rows(speicher)).toEqual({ Gesamt: '3,7 GB', Verfügbar: '2,8 GB', 'Davon diese App': '35 MB' })
    expect(speicher.querySelector('.server-card-hint').textContent).toBe('Erhöht über 80 %, kritisch über 90 % belegt.')

    expect(rows(card('Speicherplatz'))).toEqual({ Gesamt: '38 GB', Frei: '31,9 GB' })
    const last = card('Last')
    expect(last.querySelector('.server-card-value').textContent).toBe('0,1 (1 Minute)')
    expect(rows(last)).toEqual({ 'CPU-Kerne': '2', '5 Minuten': '0,08', '15 Minuten': '0,05', 'Je Kern': '0,05' })
    expect(last.querySelector('.server-card-hint').textContent).toBe('Erhöht über 1,5, kritisch über 2 (bei 2 Kernen).')

    expect(rows(card('Größe'))).toEqual({
      Datenbank: '56 MB',
      Fotos: '312 MB',
      'davon Chronik und Steckbriefe': '300 MB',
      'davon Partner-Bilder': '12 MB',
      Sicherungen: '640 MB'
    })
    expect(card('Größe').querySelector('.server-card-hint').textContent).toBe('Stündlich ermittelt, zuletzt um 10:00 Uhr.')
    expect(rows(card('Laufzeit'))).toEqual({ Server: '12 Tage, 4 Stunden', App: '3 Stunden, 12 Minuten' })
    expect(rows(card('Stand'))).toEqual({
      Version: '03eb39d',
      'Letztes Backup': '03.10.2026, 03:30 (vor 7 Stunden)',
      Größe: '41 MB',
      Art: 'automatisch (täglich)',
      'Außer Haus': '03.10.2026, 03:50 (vor 6 Stunden)',
      Umfang: '700 MB'
    })
    expect(text('.admin-server-warn-note')).toBe('Warnungen per Telegram: an (höchstens eine je Messwert und Tag).')
  })

  test('Warnzustand: Ampeln erhöht und kritisch, Zusammenfassung nennt sie - die Farbe ist nie das einzige Signal', async () => {
    server.mockResolvedValue(
      fixture({
        speicher: { gesamt: 3.7 * GB, verfuegbar: 0.3 * GB, app: 35 * MB, belegtProzent: 91.9, ampel: 'kritisch' },
        platte: { gesamt: 38 * GB, frei: 9 * GB, belegtProzent: 76.3, ampel: 'erhoeht' }
      })
    )
    await render()

    const summary = container.querySelector('.admin-server-summary')
    expect(summary.textContent).toBe('Kritisch: Arbeitsspeicher. Erhöht: Speicherplatz.')
    expect(summary.closest('[role="status"]')).not.toBeNull()
    expect(summary.classList.contains('is-kritisch')).toBe(true)
    expect(card('Arbeitsspeicher').querySelector('.server-ampel').textContent).toBe('Ampel: kritisch')
    expect(card('Arbeitsspeicher').classList.contains('is-kritisch')).toBe(true)
    expect(card('Speicherplatz').querySelector('.server-ampel').textContent).toBe('Ampel: erhöht')
    expect(card('Last').querySelector('.server-ampel').textContent).toBe('Ampel: ok')
  })

  test('Verlauf: drei Linien mit Schwelle und Textalternative in Worten', async () => {
    server.mockResolvedValue(fixture())
    await render()

    const charts = [...container.querySelectorAll('.server-verlauf-chart')]
    expect(charts.map((chart) => chart.querySelector('h4').textContent)).toEqual(['Arbeitsspeicher frei', 'Speicherplatz frei', 'Last (1 Minute)'])
    expect(charts[0].querySelector('svg').getAttribute('aria-hidden')).toBe('true')
    expect(charts[0].querySelector('.server-verlauf-line').getAttribute('d')).toMatch(/^M[\d.]+,[\d.]+ L/)
    expect(charts[0].querySelector('.server-verlauf-threshold')).not.toBeNull()
    expect(charts[0].querySelector('.server-verlauf-text').textContent).toBe(
      'Arbeitsspeicher frei: zuletzt 76 %, niedrigster Wert 74 %, höchster Wert 78 % (3 Messungen).'
    )
    expect(charts[2].querySelector('.server-verlauf-text').textContent).toBe(
      'Last (1 Minute): zuletzt 0,1, niedrigster Wert 0,1, höchster Wert 0,4 (3 Messungen).'
    )
    expect(charts[2].querySelector('.server-verlauf-legend').textContent).toBe('Gestrichelt: Warnschwelle 1,5')
  })

  test('Noch nichts gemessen: Größen „wird ermittelt“, kein Backup, kein Verlauf, Stand unbekannt', async () => {
    server.mockResolvedValue(
      fixture({ groessen: null, stand: { version: null, letztesBackup: null }, verlauf: [], warnungen: { aktiv: true, eingerichtet: false } })
    )
    await render()

    expect(card('Größe').querySelector('.server-card-hint').textContent).toBe('Wird gerade ermittelt – bitte gleich noch einmal aktualisieren.')
    expect(rows(card('Größe'))).toEqual({})
    expect(rows(card('Stand'))).toEqual({ Version: 'unbekannt', 'Letztes Backup': 'noch keins', 'Außer Haus': 'noch keine Sicherung' })
    expect(text('.server-verlauf-empty')).toBe('Noch keine Messungen – der Verlauf füllt sich stündlich.')
    expect(text('.admin-server-warn-note')).toBe(
      'Warnungen per Telegram: Telegram ist noch nicht eingerichtet (Reiter „Einstellungen“).'
    )
  })

  test('Aktualisieren lädt neu; solange bleibt der Knopf fokussierbar, aber ohne zweiten Aufruf; ein Fehler erscheint als Meldung', async () => {
    server.mockResolvedValueOnce(fixture())
    await render()
    let resolve
    server.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      })
    )
    const button = container.querySelector('.admin-server-refresh')
    act(() => button.focus())
    await act(async () => button.click())
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.disabled).toBe(false)
    expect(document.activeElement).toBe(button)
    expect(button.textContent).toBe('Aktualisiere …')
    await act(async () => button.click())
    expect(server).toHaveBeenCalledTimes(2)
    await act(async () => resolve(fixture({ gemessenAt: '2026-10-03T08:44:00.000Z' })))
    expect(button.getAttribute('aria-disabled')).toBe('false')
    expect(text('.admin-server-time')).toBe('Zuletzt gemessen: 10:44 Uhr')
    expect(server).toHaveBeenCalledTimes(2)

    server.mockRejectedValueOnce(new Error('Nur für Admins'))
    await act(async () => button.click())
    expect(text('.error-banner')).toBe('Nur für Admins')
    expect(card('Arbeitsspeicher')).not.toBeUndefined()
  })

  test('Schalter aus: Hinweis auf die Einstellungen; Backup vor einem Deploy', async () => {
    server.mockResolvedValue(
      fixture({
        warnungen: { aktiv: false, eingerichtet: true },
        stand: { version: '03eb39d', letztesBackup: { at: '2026-10-01T08:45:00.000Z', bytes: 90 * MB, art: 'deploy' } }
      })
    )
    await render()
    expect(text('.admin-server-warn-note')).toBe('Warnungen per Telegram: aus (Reiter „Einstellungen“, Schalter „Server-Warnungen“).')
    expect(rows(card('Stand')).Art).toBe('vor einem Deploy')
    expect(rows(card('Stand'))['Letztes Backup']).toBe('01.10.2026, 10:45 (vor 2 Tagen)')
  })

  test('Reiter wieder geöffnet (active): lädt neu, verborgen nicht', async () => {
    server.mockResolvedValue(fixture())
    await render({ active: true })
    expect(server).toHaveBeenCalledTimes(1)
    await render({ active: false })
    expect(server).toHaveBeenCalledTimes(1)
    await render({ active: true })
    expect(server).toHaveBeenCalledTimes(2)
  })
})
