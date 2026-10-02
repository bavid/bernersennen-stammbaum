// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { discover } = vi.hoisted(() => ({ discover: vi.fn() }))
vi.mock('../api', () => ({ api: { discover } }))

import DiscoverPage from './DiscoverPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Phase V1: die dezente Ortswahl - Entdecken öffnet mit Inhalt, oben nur "In der Nähe von … · ändern" bzw.
// "Überall · Ort wählen"; die Eingabe klappt erst auf Wunsch auf und nach der Suche wieder zu.

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  discover.mockReset()
  window.localStorage.clear()
})

async function render(path = '/entdecken') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <DiscoverPage />
      </MemoryRouter>
    )
  )
}

function anzeige(id, titel) {
  return { id, kind: 'promotion', bereich: 'hundeschule', kennzeichnung: 'Anzeige', titel, text: `${titel} – kurz erklärt.`, clickUrl: `/r/promotion/${id}` }
}

const pfotenglueck = {
  id: 1,
  kind: 'partner',
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  typ: 'hundeschule',
  plz: '20095',
  ort: 'Hamburg',
  badge: 'partner',
  kurztext: 'Welpenkurse und Hundetraining für Familien.',
  clickUrl: '/r/partner-website/1',
  anzeigen: [anzeige(11, 'Welpenkurs ab Oktober'), anzeige(12, 'Einzeltraining am Abend')],
  einblicke: [{ id: 5, fotoUrl: '/public-media/a.jpg', datum: '2026-08-22', text: 'Abschlussprüfung' }]
}

const response = {
  fallback: { hundeschulen: false, salon: false, begleiter: false },
  hundeschulen: [
    pfotenglueck,
    { id: 2, kind: 'partner', slug: 'hundeschule-birke', name: 'Hundeschule Birke', typ: 'hundeschule', badge: 'geprueft', anzeigen: [], einblicke: [] },
    { id: 30, kind: 'promotion', bereich: 'hundeschule', kennzeichnung: 'Empfehlung', empfohlenVon: 'Familie auf Pfoten', titel: 'Ratgeber Hundeschule', clickUrl: '/r/promotion/30' }
  ],
  begleiter: { partner: [], tiere: [], promotions: [] },
  futter: [],
  unterstuetzen: { partnerSpenden: [], promotions: [] }
}

function summaryLine() {
  return container.querySelector('.location-summary')
}

function toggleButton() {
  return summaryLine().querySelector('button')
}

describe('DiscoverPage – dezente Ortswahl', () => {
  test('ohne gemerkte PLZ: sofort Inhalte, oben nur "Überall · Ort wählen", kein Eingabefeld', async () => {
    discover.mockResolvedValue(response)
    await render()
    expect(discover).toHaveBeenCalledWith({})
    expect(container.querySelector('#location-plz')).toBeNull()
    expect(summaryLine().textContent).toContain('Überall')
    expect(toggleButton().textContent).toContain('Ort wählen')
    expect(toggleButton().getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.partner-discover-card')).not.toBeNull()
  })

  test('mit gemerkter PLZ: "In der Nähe von 20095 Hamburg · 25 km · ändern" (Ort aus der Antwort)', async () => {
    window.localStorage.setItem('chronik.nearbyPlz', JSON.stringify('20095'))
    discover.mockResolvedValue({ ...response, center: { lat: 53.55, lon: 10, ort: 'Hamburg' } })
    await render()
    expect(discover).toHaveBeenCalledWith({ plz: '20095', radius: 25 })
    expect(summaryLine().textContent).toContain('In der Nähe von 20095 Hamburg')
    expect(summaryLine().textContent).toContain('25 km')
    expect(toggleButton().textContent).toContain('ändern')
    expect(container.querySelector('#location-plz')).toBeNull()
  })

  test('"ändern" klappt die Eingabe auf (Fokus ins PLZ-Feld), nach der Suche klappt sie wieder zu', async () => {
    discover.mockResolvedValue(response)
    await render()
    await act(async () => toggleButton().click())
    const input = container.querySelector('#location-plz')
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
    expect(toggleButton().getAttribute('aria-expanded')).toBe('true')
    expect(toggleButton().getAttribute('aria-controls')).toBe(container.querySelector('form.location-picker').id)

    discover.mockResolvedValue({ ...response, center: { lat: 53.6, lon: 10, ort: 'Hamburg' } })
    await act(async () => {
      nativeInputValueSetter.call(input, '22303')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('form.location-picker').requestSubmit())
    expect(discover).toHaveBeenLastCalledWith({ plz: '22303', radius: 25 })
    expect(container.querySelector('#location-plz')).toBeNull()
    expect(summaryLine().textContent).toContain('In der Nähe von 22303 Hamburg')
    expect(document.activeElement).toBe(toggleButton())
  })

  test('eine unvollständige PLZ lässt die Eingabe offen und zeigt den Hinweis', async () => {
    discover.mockResolvedValue(response)
    await render()
    await act(async () => toggleButton().click())
    const input = container.querySelector('#location-plz')
    await act(async () => {
      nativeInputValueSetter.call(input, '203')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('form.location-picker').requestSubmit())
    expect(container.querySelector('#location-plz')).not.toBeNull()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Bitte eine 5-stellige Postleitzahl eingeben.')
  })

  test('eine abgelehnte PLZ (Serverfehler) lässt die Eingabe offen; "schließen" klappt ohne Suche zu', async () => {
    discover.mockResolvedValue(response)
    await render()
    await act(async () => toggleButton().click())
    discover.mockRejectedValue(Object.assign(new Error('Diese Postleitzahl kennen wir nicht'), { status: 400 }))
    const input = container.querySelector('#location-plz')
    await act(async () => {
      nativeInputValueSetter.call(input, '00000')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('form.location-picker').requestSubmit())
    expect(container.querySelector('#location-plz')).not.toBeNull()
    expect(toggleButton().textContent).toContain('schließen')
    await act(async () => toggleButton().click())
    expect(container.querySelector('#location-plz')).toBeNull()
  })
})
