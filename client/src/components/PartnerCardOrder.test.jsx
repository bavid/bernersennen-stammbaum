// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { cardAnzeigen, setCardOrder, setPostInEntdecken } = vi.hoisted(() => ({
  cardAnzeigen: vi.fn(),
  setCardOrder: vi.fn(),
  setPostInEntdecken: vi.fn()
}))
vi.mock('../api', () => ({ api: { partnerArea: { cardAnzeigen, setCardOrder, setPostInEntdecken } } }))

import PartnerCardOrder from './PartnerCardOrder.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  vi.clearAllMocks()
})

function item(id, titel, overrides = {}) {
  return { id, titel, text: null, kennzeichnung: 'Anzeige', reihenfolge: null, inEntdecken: true, sichtbar: true, vomTeam: false, aufKarte: true, ...overrides }
}

const list = {
  bereich: 'hundeschule',
  max: 3,
  anzeigen: [
    item(1, 'Welpenkurs ab Oktober', { reihenfolge: 1 }),
    item(2, 'Einzeltraining am Abend', { reihenfolge: 2 }),
    item(3, 'Welpenkurs im Frühjahr', { kennzeichnung: 'Partner', vomTeam: true, inEntdecken: false, aufKarte: false }),
    item(4, 'Agility', { aufKarte: false })
  ]
}

async function render({ demo = false, hideWhenEmpty = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={demo}>
        <PartnerCardOrder hideWhenEmpty={hideWhenEmpty} />
      </DemoProvider>
    )
  )
}

const rows = () => [...container.querySelectorAll('.partner-card-order-item')]
const titles = () => rows().map((row) => row.querySelector('.partner-card-order-title').textContent)
const button = (label) => [...container.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === label)

describe('PartnerCardOrder', () => {
  test('listet die Anzeigen der Karte mit Stelle, Herkunft und Stand', async () => {
    cardAnzeigen.mockResolvedValue(list)
    await render()
    expect(container.querySelector('h3').textContent).toBe('Eure Karte in Entdecken')
    expect(titles()).toEqual(['Welpenkurs ab Oktober', 'Einzeltraining am Abend', 'Welpenkurs im Frühjahr', 'Agility'])
    expect(rows()[0].textContent).toContain('auf der Karte')
    expect(rows()[2].textContent).toContain('vom Team')
    expect(rows()[2].textContent).toContain('nur auf dem Portal')
    expect(rows()[3].textContent).toContain('nicht auf der Karte – es passen drei')
    expect(button('„Welpenkurs ab Oktober“ nach oben').disabled).toBe(true)
    expect(button('„Agility“ nach unten').disabled).toBe(true)
  })

  test('"nach unten" schickt die neue Reihenfolge, übernimmt die Antwort und sagt die neue Stelle an', async () => {
    cardAnzeigen.mockResolvedValue(list)
    const reordered = { ...list, anzeigen: [list.anzeigen[1], list.anzeigen[0], list.anzeigen[2], list.anzeigen[3]] }
    setCardOrder.mockResolvedValue(reordered)
    await render()
    await act(async () => button('„Welpenkurs ab Oktober“ nach unten').click())
    expect(setCardOrder).toHaveBeenCalledWith([2, 1, 3, 4])
    expect(titles()).toEqual(['Einzeltraining am Abend', 'Welpenkurs ab Oktober', 'Welpenkurs im Frühjahr', 'Agility'])
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('„Welpenkurs ab Oktober“ steht jetzt an Stelle 2.')
    expect(document.activeElement).toBe(button('„Welpenkurs ab Oktober“ nach unten'))
  })

  test('der Schalter "in Entdecken zeigen" schickt true/false', async () => {
    cardAnzeigen.mockResolvedValue(list)
    setPostInEntdecken.mockResolvedValue({ ...list, anzeigen: list.anzeigen.map((entry) => (entry.id === 3 ? { ...entry, inEntdecken: true } : entry)) })
    await render()
    const toggle = rows()[2].querySelector('input[role="switch"]')
    expect(toggle.checked).toBe(false)
    await act(async () => toggle.click())
    expect(setPostInEntdecken).toHaveBeenCalledWith(3, true)
    expect(rows()[2].querySelector('input[role="switch"]').checked).toBe(true)
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('„Welpenkurs im Frühjahr“ steht wieder in Entdecken.')
  })

  test('ein Fehler beim Speichern erscheint als Meldung, die Liste bleibt', async () => {
    cardAnzeigen.mockResolvedValue(list)
    setCardOrder.mockRejectedValue(new Error('Ordnen lassen sich nur freigegebene Anzeigen eurer Karte, jede einmal.'))
    await render()
    await act(async () => button('„Agility“ nach oben').click())
    expect(container.querySelector('[role="alert"]').textContent).toBe('Ordnen lassen sich nur freigegebene Anzeigen eurer Karte, jede einmal.')
    expect(titles()[3]).toBe('Agility')
  })

  test('in der Demo sichtbar, aber gesperrt', async () => {
    cardAnzeigen.mockResolvedValue(list)
    await render({ demo: true })
    expect(button('„Agility“ nach oben').disabled).toBe(true)
    expect(rows()[0].querySelector('input[role="switch"]').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })

  test('ohne Karte (Futter, Sonstige) nichts; ohne freigegebene Anzeige ein kurzer Hinweis', async () => {
    cardAnzeigen.mockResolvedValue({ bereich: null, max: 3, anzeigen: [] })
    await render()
    expect(container.querySelector('.partner-card-order')).toBeNull()
    act(() => root.unmount())
    root = null
    container.remove()

    cardAnzeigen.mockResolvedValue({ bereich: 'hundeschule', max: 3, anzeigen: [] })
    await render()
    expect(container.textContent).toContain('Sobald ein Beitrag freigegeben ist')
  })

  // Audit V7a: ganz ohne Beiträge keine leere Karte über dem Leerzustand der Liste - Team-Anzeigen zeigt sie trotzdem.
  test('hideWhenEmpty: leer nichts, mit Anzeigen (z. B. vom Team) die Liste', async () => {
    cardAnzeigen.mockResolvedValue({ bereich: 'hundeschule', max: 3, anzeigen: [] })
    await render({ hideWhenEmpty: true })
    expect(container.querySelector('.partner-card-order')).toBeNull()
    act(() => root.unmount())
    root = null
    container.remove()

    cardAnzeigen.mockResolvedValue({ ...list, anzeigen: [list.anzeigen[2]] })
    await render({ hideWhenEmpty: true })
    expect(titles()).toEqual(['Welpenkurs im Frühjahr'])
  })
})
