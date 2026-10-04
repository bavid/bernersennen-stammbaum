// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { config, profile, visitenkarte, saveVisitenkarte, visitenkarteGutscheine, qrSvgPath } = vi.hoisted(() => ({
  config: vi.fn(),
  profile: vi.fn(),
  visitenkarte: vi.fn(),
  saveVisitenkarte: vi.fn(),
  visitenkarteGutscheine: vi.fn(),
  qrSvgPath: vi.fn(() => ({ size: 21, path: 'M0 0h1v1h-1z' }))
}))
vi.mock('../api', () => ({ api: { config, partnerArea: { profile, visitenkarte, saveVisitenkarte, visitenkarteGutscheine } } }))
vi.mock('../lib/qr.js', () => ({ qrSvgPath }))

import PartnerVisitenkartenPage from './PartnerVisitenkartenPage.jsx'
import { DemoProvider } from '../lib/demo.js'
import { ALL_PRINTED_HINT, EMPTY_STACK_HINT } from '../components/visitenkarte/KartenCodes.jsx'

// Feedback-Runde: Codes und Druck für jede Kombination (/visitenkarten). Rückseiten mit Code (Einladungskarte, Kombi):
// je Karte ein eigener Code, erst beim Drucken geholt, in genau der Zahl der Karten mit Code - ohne Code keine solche
// Karte. Die Visitenkarte (hinten das Portal) holt nie Codes. Demo und Admin-Ansicht: nur Muster.
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
const DESIGN = {
  karte: 'kombi',
  vorlage: 'klassisch',
  farbe: '#1f5f8b',
  kurztext: 'Training mit Herz',
  widmung: 'Für unsere Welpenkurs-Familien',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: true
}
const RUECKSEITE = { titel: 'Eure Chronik wartet', text: 'Ein Text der Plattform.', schritte: ['Scannen', 'Code eingeben'], adresse: '' }
const STATE = { design: DESIGN, gespeichert: true, rueckseite: RUECKSEITE, vorschlag: 'Training mit Herz', gutscheine: { offen: 12, ungedruckt: 8 }, maxJeAbruf: 50 }
const codes = (count) => Array.from({ length: count }, (_, index) => `E${String(index).padStart(3, '0')}-AAAA-BBBB`)

let container
let root

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
  for (const mock of [config, profile, visitenkarte, saveVisitenkarte, visitenkarteGutscheine, qrSvgPath]) mock.mockReset()
  qrSvgPath.mockImplementation(() => ({ size: 21, path: 'M0 0h1v1h-1z' }))
})

async function render({ url = '/visitenkarten', readOnly = null } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={readOnly ?? false}>
        <MemoryRouter initialEntries={[url]}>
          <PartnerVisitenkartenPage />
        </MemoryRouter>
      </DemoProvider>
    )
  )
}

const printView = () => document.body.querySelector(':scope > .vk-print')
const button = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith(text))
const printButton = () => button('Drucken')
const tile = (id) => container.querySelector(`input[name="vk-karte"][value="${id}"]`)
const printedCodes = () => [...printView().querySelectorAll('.vk-sheet-hinten .vk-code')].map((el) => el.getAttribute('aria-label').replace('Einladungscode ', ''))

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

describe('Codes beim Drucken (Kombi und Einladungskarte)', () => {
  test('Kombi: je Karte ein eigener Code - erst beim Drucken, gespiegelt hinter ihrer Karte, nach dem Druck wieder weg', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(8), fehlen: 0, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    expect(container.textContent).toContain('12 offene Einladungscodes, davon 8 noch nicht gedruckt.')
    expect(container.textContent).toContain('Für 2 Karten fehlen Codes – gedruckt werden nur die 8 mit Code.')
    expect(printButton().textContent).toContain('Drucken – 8 Karten mit Code')
    expect(printView().querySelectorAll('.vk-back-kombi')).toHaveLength(0)
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()

    await click(printButton())
    expect(visitenkarteGutscheine).toHaveBeenCalledWith({ anzahl: 8, nurUngedruckt: true })
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(printView().querySelectorAll('.vk-sheet-vorne .vk-front')).toHaveLength(8)
    expect(printView().querySelectorAll('.vk-back-kombi')).toHaveLength(8)
    expect(printedCodes()).toEqual([1, 0, 3, 2, 5, 4, 7, 6].map((index) => codes(8)[index]))
    expect(printView().querySelector('[data-muster]')).toBe(null)
    expect(qrSvgPath).toHaveBeenCalledWith(`${PUBLIC_URL}/v#${codes(8)[0]}`)
    expect(container.textContent).toContain('Zuletzt gedruckt: 8 Karten mit eigenem Code')

    await act(async () => window.dispatchEvent(new Event('afterprint')))
    expect(printView().querySelectorAll('.vk-back-kombi')).toHaveLength(0)
  })

  test('Einladungskarte: Rückseite der Plattform mit Code; der Server liefert weniger - nur die Karten mit Code', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(5), fehlen: 3, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render({ url: '/visitenkarten?karte=einladung' })
    await click(printButton())
    expect(printView().querySelectorAll('.vk-front')).toHaveLength(5)
    expect(printView().querySelectorAll('.vk-back-einladung')).toHaveLength(5)
    expect(printView().querySelectorAll('.vk-back-kombi')).toHaveLength(0)
    expect(container.textContent).toContain('für 3 Karten fehlte ein Code, sie kamen nicht aufs Papier')
  })

  test('kein Code mehr frei: kein Druck, ehrliche Meldung', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: [], fehlen: 8, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    await click(printButton())
    expect(window.print).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Es war kein Code mehr frei – es wurde keine Karte gedruckt.')
  })

  test('"nur ungedruckte" aus: warnt vor schon gedruckten und holt auch die', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(10), fehlen: 0, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    await click(container.querySelector('#vk-nur-ungedruckt'))
    expect(container.textContent).toContain('Schon gedruckte Codes können auf verteilten Karten stehen')
    await click(printButton())
    expect(visitenkarteGutscheine).toHaveBeenCalledWith({ anzahl: 10, nurUngedruckt: false })
  })

  test('Anzahl 1-50; "Nur vorne" holt keine Codes', async () => {
    await render()
    const anzahl = container.querySelector('#vk-anzahl')
    await changeInput(anzahl, '3')
    expect(container.textContent).toContain('1 A4-Bogen')
    expect(printButton().textContent).toContain('Drucken – 3 Karten mit Code')
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

  test('solange ein Druck seine Codes holt, lässt sich die Kombination nicht wechseln', async () => {
    let resolveCodes
    visitenkarteGutscheine.mockImplementation(() => new Promise((resolve) => (resolveCodes = resolve)))
    await render()
    await click(printButton())
    expect(tile('visitenkarte').disabled).toBe(true)
    await act(async () => resolveCodes({ codes: codes(8), fehlen: 0, gutscheine: { offen: 12, ungedruckt: 0 } }))
    expect(tile('visitenkarte').disabled).toBe(false)
    expect(printView().querySelectorAll('.vk-back-kombi')).toHaveLength(8)
  })

  test('leerer Stapel: Hinweis mit Weg zum Admin, Drucken geht nicht; alle schon gedruckt: eigener Hinweis', async () => {
    visitenkarte.mockResolvedValue({ ...STATE, gutscheine: { offen: 0, ungedruckt: 0 } })
    await render()
    expect(container.textContent).toContain(EMPTY_STACK_HINT)
    expect(container.textContent).toContain('ohne Code gibt es keine Karte mit dieser Rückseite.')
    expect(container.querySelector('a[href="/admin-schreiben"]')).not.toBe(null)
    expect(printButton().disabled).toBe(true)
    act(() => root.unmount())
    root = null
    container.remove()

    visitenkarte.mockResolvedValue({ ...STATE, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    expect(container.textContent).toContain(ALL_PRINTED_HINT)
    expect(printButton().disabled).toBe(true)
  })

  test('Fehler beim Holen: Meldung, kein Druck, keine Codes', async () => {
    visitenkarteGutscheine.mockRejectedValue(new Error('Zu viele Abrufe in kurzer Zeit'))
    await render()
    await click(printButton())
    expect(container.querySelector('[role="alert"]').textContent).toContain('Zu viele Abrufe')
    expect(window.print).not.toHaveBeenCalled()
    expect(printView().querySelectorAll('.vk-back-kombi')).toHaveLength(0)
  })
})

describe('Visitenkarte (hinten das Portal)', () => {
  test('nie ein Code: kein Code-Abschnitt, gedruckt werden alle Karten mit der Portal-Rückseite', async () => {
    visitenkarte.mockResolvedValue({ ...STATE, design: { ...DESIGN, karte: 'visitenkarte' }, gutscheine: { offen: 0, ungedruckt: 0 } })
    await render()
    expect(container.querySelector('#vk-codes-title')).toBe(null)
    expect(container.textContent).not.toContain('Einladungscodes')
    await changeInput(container.querySelector('#vk-anzahl'), '12')
    expect(printButton().textContent).toContain('Drucken – 12 Karten')
    await click(printButton())
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(printView().querySelectorAll('.vk-back-portal')).toHaveLength(12)
    expect(printView().querySelectorAll('.vk-code')).toHaveLength(0)
  })
})

describe('Demo und Admin-Ansicht', () => {
  test('Demo: Muster-Codes auf jeder Karte, nie ein Abruf', async () => {
    await render({ url: '/visitenkarten?karte=einladung', readOnly: { isDemo: true } })
    expect(printButton().textContent).toContain('Drucken – 10 Karten')
    const backs = [...printView().querySelectorAll('.vk-back-einladung')]
    expect(backs).toHaveLength(10)
    expect(backs.every((back) => back.dataset.muster === 'true')).toBe(true)
    expect(printedCodes().every((code) => code.startsWith('DEMO-'))).toBe(true)
    await click(printButton())
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
  })

  test('Admin-Ansicht: nur Muster-Codes, kein Abruf, nie ein echter Code im Dokument', async () => {
    await render({ readOnly: { adminView: true } })
    await click(printButton())
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(printedCodes().every((code) => code.startsWith('DEMO-'))).toBe(true)
    expect(document.body.textContent).not.toMatch(/E\d{3}-AAAA-BBBB/)
  })
})
