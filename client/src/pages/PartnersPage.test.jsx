// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { publicEntdecken } = vi.hoisted(() => ({ publicEntdecken: vi.fn() }))
vi.mock('../api', () => ({ api: { publicEntdecken } }))

import PartnersPage from './PartnersPage.jsx'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  publicEntdecken.mockReset()
  setLang('de')
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PartnersPage />
      </MemoryRouter>
    )
  )
  return container
}

const card = (slug, extra = {}) => ({
  slug,
  name: extra.name || slug,
  typ: 'hundeschule',
  plz: '20095',
  ort: 'Hamburg',
  bildUrl: '/partner-media/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.jpg',
  bildArt: 'logo',
  kurztext: 'Training mit Herz.',
  badge: 'partner',
  ...extra
})

const weit = card('tierschutznetz-weitblick', { name: 'Tierschutznetz Weitblick', typ: 'tierheim', deutschlandweit: true })
const elbe = card('welpenschule-elbkiesel', { name: 'Welpenschule Elbkiesel' })
const answer = (overrides = {}) => ({ deutschlandweit: [weit], treffer: [elbe], gesamt: 1, seite: 1, seiten: 1, mehr: false, ...overrides })
const buttonByText = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith(text))

describe('PartnersPage – öffentliches Entdecken', () => {
  test('lädt ohne Filter, zeigt Text, „Deutschlandweit“ und Treffer mit Portal-Link', async () => {
    publicEntdecken.mockResolvedValue(answer())
    await render()

    expect(publicEntdecken).toHaveBeenCalledWith({ q: undefined, typ: undefined, plz: undefined, radius: undefined, seite: undefined })
    expect(container.querySelector('h1').textContent).toBe('Entdecken')
    expect(container.textContent).toContain('sichtbar, weil sie mitmachen. Keine fremde Werbung, kein Tracking, kein Datenhandel.')
    expect(container.textContent).not.toMatch(/ohne Werbung/)
    const weitSection = container.querySelector('.entdecken-weit')
    expect(weitSection.querySelector('h2').textContent).toContain('Deutschlandweit')
    expect(weitSection.textContent).toContain('Tierschutznetz Weitblick')
    expect(weitSection.querySelector('.entdecken-card-weit').textContent).toBe('deutschlandweit')
    const link = container.querySelector('#entdecken-treffer a')
    expect(link.getAttribute('href')).toBe('/p/welpenschule-elbkiesel')
    expect(container.querySelector('#entdecken-treffer').textContent).toContain('20095 Hamburg')
  })

  test('Suche und Typ-Umschalter fragen den Server mit q und typ', async () => {
    publicEntdecken.mockResolvedValue(answer())
    await render()

    await act(async () => setInputValue(container.querySelector('input[type="search"]'), 'Köln'))
    await act(async () => container.querySelector('form[role="search"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(publicEntdecken).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Köln', typ: undefined }))

    await act(async () => buttonByText('Tierheime').click())
    expect(publicEntdecken).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Köln', typ: 'tierheim,vermittlung' }))
    expect(buttonByText('Tierheime').getAttribute('aria-pressed')).toBe('true')
    expect(buttonByText('Alle').getAttribute('aria-pressed')).toBe('false')
  })

  test('In der Nähe: PLZ + Umkreis gehen mit, eine unvollständige PLZ gibt einen Hinweis statt einer Anfrage', async () => {
    publicEntdecken.mockResolvedValue(answer())
    await render()
    await act(async () => container.querySelector('.location-summary-toggle').click())

    await act(async () => setInputValue(container.querySelector('#location-plz'), '201'))
    await act(async () => container.querySelector('#location-plz').form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/5-stellige Postleitzahl/)
    expect(publicEntdecken).toHaveBeenCalledTimes(1)

    await act(async () => setInputValue(container.querySelector('#location-plz'), '20095'))
    await act(async () => container.querySelector('#location-plz').form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(publicEntdecken).toHaveBeenLastCalledWith(expect.objectContaining({ plz: '20095', radius: 25 }))
  })

  test('„Mehr laden“ hängt die nächste Seite an, ohne „Deutschlandweit“ zu verdoppeln', async () => {
    publicEntdecken.mockResolvedValueOnce(answer({ gesamt: 2, seiten: 2, mehr: true }))
    publicEntdecken.mockResolvedValueOnce(answer({ deutschlandweit: [], treffer: [card('hundeschule-pfotenweg', { name: 'Hundeschule Pfotenweg' })], gesamt: 2, seite: 2, seiten: 2 }))
    await render()

    await act(async () => buttonByText('Mehr laden').click())
    expect(publicEntdecken).toHaveBeenLastCalledWith(expect.objectContaining({ seite: 2 }))
    expect(container.querySelectorAll('#entdecken-treffer li')).toHaveLength(2)
    expect(container.querySelectorAll('.entdecken-weit li')).toHaveLength(1)
    expect(buttonByText('Mehr laden')).toBeUndefined()
  })

  test('leer: ruhiger Hinweis; Fehler: Meldung; fremde Bild-Adressen werden nicht geladen', async () => {
    publicEntdecken.mockResolvedValue(answer({ deutschlandweit: [], treffer: [], gesamt: 0 }))
    await render()
    expect(container.querySelector('.ui-empty').textContent).toContain('Nichts gefunden')

    act(() => root.unmount())
    root = null
    publicEntdecken.mockResolvedValue(answer({ deutschlandweit: [], treffer: [card('x-y', { bildUrl: 'https://tracker.example/pixel.gif' })] }))
    await render()
    expect(container.querySelector('#entdecken-treffer img')).toBeNull()

    act(() => root.unmount())
    root = null
    publicEntdecken.mockRejectedValue(new Error('Zu viele Anfragen in kurzer Zeit – bitte einen Moment warten.'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/Zu viele Anfragen/)
  })

  test('Englisch: Text, Umschalter und „Deutschlandweit“ übersetzt', async () => {
    setLang('en')
    publicEntdecken.mockResolvedValue(answer())
    await render()
    expect(container.querySelector('h1').textContent).toBe('Discover')
    expect(container.textContent).toContain('No third-party ads, no tracking, no data trading.')
    expect(buttonByText('Animal shelters')).toBeDefined()
    expect(buttonByText('Grooming salons')).toBeDefined()
    expect(container.querySelector('.entdecken-weit h2').textContent).toContain('Germany-wide')
    expect(container.querySelector('input[type="search"]').getAttribute('placeholder')).toMatch(/Name, type or place/)
  })
})
