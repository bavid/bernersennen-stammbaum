// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { config, profile, visitenkarte, saveVisitenkarte, saveEinladungskarte, visitenkarteGutscheine, qrSvgPath } = vi.hoisted(() => ({
  config: vi.fn(),
  profile: vi.fn(),
  visitenkarte: vi.fn(),
  saveVisitenkarte: vi.fn(),
  saveEinladungskarte: vi.fn(),
  visitenkarteGutscheine: vi.fn(),
  qrSvgPath: vi.fn(() => ({ size: 21, path: 'M0 0h1v1h-1z' }))
}))
vi.mock('../api', () => ({
  api: { config, partnerArea: { profile, visitenkarte, saveVisitenkarte, saveEinladungskarte, visitenkarteGutscheine } }
}))
vi.mock('../lib/qr.js', () => ({ qrSvgPath }))

import PartnerVisitenkartenPage from './PartnerVisitenkartenPage.jsx'
import { DemoProvider } from '../lib/demo.js'
import { RUECKSEITE_NOTE } from '../components/visitenkarte/EinladungskartenDesigner.jsx'
import { EMPTY_STACK_HINT } from '../components/visitenkarte/VisitenkarteGutschein.jsx'

// Einladungskarten im Designer (/visitenkarten?art=einladung): Wahl der Kartenart samt Adresse, vorne der Partner, hinten
// Familie auf Pfoten (Texte aus der Admin-Einstellung, nie Farbe oder Texte des Partners), je Karte ein eigener Code aus
// demselben Abruf wie bei den Visitenkarten - ohne Code keine Karte. Demo und Admin-Ansicht: nur Muster.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PUBLIC_URL = 'https://beispiel-chronik.de'
const PROFILE = {
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  farbe: '#1f5f8b',
  logoUrl: null,
  banner: [],
  ansprechperson: 'Anna Berg',
  website: null,
  kontaktTelefon: null,
  kontaktEmail: 'hallo@example.org'
}
const VK_DESIGN = {
  vorlage: 'schlicht',
  farbe: '#1f5f8b',
  kurztext: 'Training mit Herz',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: true,
  mitGutschein: false
}
const EL_DESIGN = {
  vorlage: 'klassisch',
  farbe: '#ff00aa',
  kurztext: 'Partner-Kurztext',
  widmung: 'Für unsere Welpenkurs-Familien',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: true
}
const RUECKSEITE = { titel: 'Eure Chronik wartet', text: 'Ein Text der Plattform.', schritte: ['Scannen', 'Code eingeben', 'Loslegen'], adresse: '' }
const STATE = {
  design: VK_DESIGN,
  gespeichert: true,
  einladung: { design: EL_DESIGN, gespeichert: true },
  rueckseite: RUECKSEITE,
  vorschlag: 'Training mit Herz',
  gutscheine: { offen: 12, ungedruckt: 8 },
  maxJeAbruf: 50
}
const codes = (count) => Array.from({ length: count }, (_, index) => `E${String(index).padStart(3, '0')}-AAAA-BBBB`)

let container
let root
let location

function LocationProbe() {
  location = useLocation()
  return null
}

beforeEach(() => {
  config.mockResolvedValue({ publicUrl: PUBLIC_URL })
  profile.mockResolvedValue(PROFILE)
  visitenkarte.mockResolvedValue(STATE)
  window.print = vi.fn()
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of [config, profile, visitenkarte, saveVisitenkarte, saveEinladungskarte, visitenkarteGutscheine, qrSvgPath]) mock.mockReset()
  qrSvgPath.mockImplementation(() => ({ size: 21, path: 'M0 0h1v1h-1z' }))
})

async function render({ url = '/visitenkarten?art=einladung', readOnly = null } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={readOnly ?? false}>
        <MemoryRouter initialEntries={[url]}>
          <PartnerVisitenkartenPage />
          <LocationProbe />
        </MemoryRouter>
      </DemoProvider>
    )
  )
}

const stage = () => container.querySelector('.vk-stage')
const printView = () => document.body.querySelector(':scope > .vk-print')
const button = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith(text))
const printButton = () => button('Drucken')
const printedCodes = () => [...printView().querySelectorAll('.vk-sheet-hinten .vk-code')].map((el) => el.getAttribute('aria-label').replace('Code ', ''))

async function click(element) {
  await act(async () => element.click())
}

async function changeInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Kartenart', () => {
  test('Wechsel steht in der Adresse; Änderungen überstehen den Wechsel', async () => {
    await render({ url: '/visitenkarten' })
    expect(container.querySelector('h1').textContent).toBe('Visitenkarten gestalten')
    expect(button('Visitenkarte').getAttribute('aria-pressed')).toBe('true')

    await click(button('Einladungskarte'))
    expect(location.search).toBe('?art=einladung')
    expect(container.querySelector('h1').textContent).toBe('Einladungskarten gestalten')
    expect(button('Einladungskarte').getAttribute('aria-pressed')).toBe('true')
    await changeInput(container.querySelector('#vk-widmung'), 'Für die Montagsgruppe')

    await click(button('Visitenkarte'))
    expect(location.search).toBe('')
    expect(stage().querySelector('.vk-front').dataset.vorlage).toBe('schlicht')
    expect(container.querySelector('#vk-widmung')).toBe(null)

    await click(button('Einladungskarte'))
    expect(container.querySelector('#vk-widmung').value).toBe('Für die Montagsgruppe')
    expect(container.querySelector('.vk-save-row').textContent).toContain('Noch nicht gespeichert')
  })

  test('solange ein Druck seine Codes holt, lässt sich die Kartenart nicht wechseln', async () => {
    let resolveCodes
    visitenkarteGutscheine.mockImplementation(() => new Promise((resolve) => (resolveCodes = resolve)))
    await render()
    await click(printButton())
    expect(button('Visitenkarte').disabled).toBe(true)
    await click(button('Visitenkarte'))
    expect(location.search).toBe('?art=einladung')
    await act(async () => resolveCodes({ codes: codes(8), fehlen: 0, gutscheine: { offen: 12, ungedruckt: 0 } }))
    expect(button('Visitenkarte').disabled).toBe(false)
    expect(printView().querySelectorAll('.vk-back-einladung')).toHaveLength(8)
  })

  test('"Zuletzt gedruckt" meldet jede Kartenart nur bei sich', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(8), fehlen: 0, gutscheine: { offen: 12, ungedruckt: 4 } })
    visitenkarte.mockResolvedValue({ ...STATE, design: { ...VK_DESIGN, mitGutschein: true } })
    await render()
    await click(printButton())
    expect(container.textContent).toContain('Zuletzt gedruckt: 8 Einladungskarten mit eigenem Code')
    await click(button('Visitenkarte'))
    expect(container.querySelector('.vk-gutschein-body').textContent).not.toContain('Zuletzt gedruckt')
    await click(printButton())
    expect(container.textContent).toContain('Zuletzt gedruckt: 8 Karten mit eigenem Gutschein')
    await click(button('Einladungskarte'))
    expect(container.textContent).not.toContain('Zuletzt gedruckt')
  })

  test('?art=einladung öffnet die Einladungskarte direkt', async () => {
    await render()
    expect(container.querySelector('h1').textContent).toBe('Einladungskarten gestalten')
    expect(stage().querySelector('.vk-back-einladung')).not.toBe(null)
  })
})

describe('Vorder- und Rückseite', () => {
  test('vorne der Partner mit persönlicher Zeile, hinten die Plattform mit den Texten der Admin-Einstellung', async () => {
    await render()
    const front = stage().querySelector('.vk-front')
    expect(front.querySelector('.vk-widmung').textContent).toBe('Für unsere Welpenkurs-Familien')
    expect(front.style.getPropertyValue('--vk-farbe')).toBe('#ff00aa')

    const back = stage().querySelector('.vk-back-einladung')
    expect(back.querySelector('.vk-einladung-titel').textContent).toBe('Eure Chronik wartet')
    expect([...back.querySelectorAll('.vk-einladung-schritte li')].map((li) => li.textContent)).toEqual(['Scannen', 'Code eingeben', 'Loslegen'])
    expect(back.querySelector('.vk-einladung-adresse').textContent).toBe('beispiel-chronik.de/v')
    expect(back.dataset.muster).toBe('true')
    expect(back.outerHTML).not.toContain('#ff00aa')
    expect(back.textContent).not.toContain('Partner-Kurztext')
    expect(back.textContent).not.toContain('Hundeschule Pfotenglück')
    expect(stage().textContent).toContain(RUECKSEITE_NOTE)
    // Die Rückseite lässt sich im Designer nicht bearbeiten - es gibt kein Feld für ihre Texte.
    expect(container.querySelector('.vk-controls').textContent).not.toContain('Eure Chronik wartet')
  })

  test('speichert nur die Vorderseite der Einladungskarte - die Visitenkarte bleibt unberührt', async () => {
    saveEinladungskarte.mockImplementation(async (design) => ({ ...STATE, einladung: { design, gespeichert: true } }))
    await render()
    await changeInput(container.querySelector('#vk-widmung'), 'Für die Montagsgruppe')
    expect(stage().querySelector('.vk-widmung').textContent).toBe('Für die Montagsgruppe')
    await click(button('Gestaltung speichern'))
    expect(saveEinladungskarte).toHaveBeenCalledWith({ ...EL_DESIGN, widmung: 'Für die Montagsgruppe' })
    expect(saveVisitenkarte).not.toHaveBeenCalled()
    expect(container.querySelector('.vk-save-row').textContent).toContain('Gespeichert')
  })
})

describe('Codes und Druck', () => {
  test('je Karte ein eigener Code - erst beim Drucken, gespiegelt hinter ihrer Karte, nach dem Druck wieder weg', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(8), fehlen: 0, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    expect(container.textContent).toContain('Für 2 Karten fehlen Codes – gedruckt werden nur die 8 mit Code.')
    expect(printButton().textContent).toContain('Drucken – 8 Einladungskarten')
    expect(printView().querySelectorAll('.vk-back-einladung')).toHaveLength(0)
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()

    await click(printButton())
    expect(visitenkarteGutscheine).toHaveBeenCalledWith({ anzahl: 8, nurUngedruckt: true })
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(printView().querySelectorAll('.vk-sheet-vorne .vk-front')).toHaveLength(8)
    expect(printedCodes()).toEqual([1, 0, 3, 2, 5, 4, 7, 6].map((index) => codes(8)[index]))
    expect(new Set(printedCodes()).size).toBe(8)
    expect(printView().querySelector('[data-muster]')).toBe(null)
    expect(qrSvgPath).toHaveBeenCalledWith(`${PUBLIC_URL}/v#${codes(8)[0]}`)
    expect(container.textContent).toContain('Zuletzt gedruckt: 8 Einladungskarten mit eigenem Code')

    await act(async () => window.dispatchEvent(new Event('afterprint')))
    expect(printView().querySelectorAll('.vk-back-einladung')).toHaveLength(0)
  })

  test('liefert der Server weniger Codes: nur die Karten mit Code kommen aufs Papier', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(5), fehlen: 3, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    await click(printButton())
    expect(printView().querySelectorAll('.vk-front')).toHaveLength(5)
    expect(printView().querySelectorAll('.vk-back-einladung')).toHaveLength(5)
    expect(container.textContent).toContain('für 3 Karten fehlte ein Code, sie kamen nicht aufs Papier')
  })

  test('kein Code mehr frei: kein Druck, ehrliche Meldung', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: [], fehlen: 8, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    await click(printButton())
    expect(window.print).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Es war kein Code mehr frei – es wurde keine Karte gedruckt.')
  })

  test('Anzahl 1-50 statt ganzer Bögen; "Nur vorne" holt keine Codes', async () => {
    await render()
    const anzahl = container.querySelector('#vk-anzahl')
    await changeInput(anzahl, '3')
    expect(container.textContent).toContain('1 A4-Bogen')
    expect(printButton().textContent).toContain('Drucken – 3 Einladungskarten')
    expect(container.querySelectorAll('.vk-bogen-vorschau .vk-sheet-vorne .vk-front')).toHaveLength(3)
    await changeInput(anzahl, '99')
    expect(anzahl.value).toBe('50')
    expect(container.textContent).toContain('5 A4-Bögen')
    await click(container.querySelector('[aria-label="Eine Karte weniger"]'))
    expect(anzahl.value).toBe('49')

    await changeInput(anzahl, '4')
    await click(button('Nur vorne'))
    await click(printButton())
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(printView().querySelectorAll('.vk-sheet-vorne .vk-front')).toHaveLength(4)
    expect(printView().querySelectorAll('.vk-sheet-hinten')).toHaveLength(0)
  })

  test('leerer Stapel: Hinweis mit Weg zum Admin, Drucken geht nicht', async () => {
    visitenkarte.mockResolvedValue({ ...STATE, gutscheine: { offen: 0, ungedruckt: 0 } })
    await render()
    expect(container.textContent).toContain(EMPTY_STACK_HINT)
    expect(container.textContent).toContain('ohne Code gibt es keine Einladungskarte.')
    expect(container.querySelector('a[href="/admin-schreiben"]')).not.toBe(null)
    expect(printButton().disabled).toBe(true)
  })
})

describe('Demo und Admin-Ansicht', () => {
  test('Demo: Muster-Codes auf jeder Karte, nie ein Abruf, nichts zu speichern', async () => {
    await render({ readOnly: { isDemo: true } })
    expect(button('Gestaltung speichern').disabled).toBe(true)
    expect(container.textContent).toContain('Muster: In der Demo')
    expect(printButton().textContent).toContain('Drucken – 10 Einladungskarten')
    const backs = [...printView().querySelectorAll('.vk-back-einladung')]
    expect(backs).toHaveLength(10)
    expect(backs.every((back) => back.dataset.muster === 'true')).toBe(true)
    expect(printedCodes().every((code) => code.startsWith('DEMO-'))).toBe(true)
    await click(printButton())
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
  })

  test('Admin-Ansicht: eigener Hinweis, nur Muster-Codes, kein Abruf', async () => {
    await render({ readOnly: { adminView: true } })
    expect(container.textContent).toContain('In der Admin-Ansicht stehen auf den Karten Beispiel-Codes')
    await click(printButton())
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(printedCodes().every((code) => code.startsWith('DEMO-'))).toBe(true)
    expect(document.body.textContent).not.toMatch(/E\d{3}-AAAA-BBBB/)
  })
})
