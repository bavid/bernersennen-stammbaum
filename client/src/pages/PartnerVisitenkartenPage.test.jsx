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
import { DemoProvider, ADMIN_VIEW_HINT, DEMO_HINT } from '../lib/demo.js'
import { VK_PRINT_BODY_CLASS } from '../components/visitenkarte/VisitenkartenBogen.jsx'
import { ALL_PRINTED_HINT, EMPTY_STACK_HINT } from '../components/visitenkarte/VisitenkarteGutschein.jsx'
import { PRINT_HINT } from '../components/visitenkarte/VisitenkarteDruckOptionen.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PUBLIC_URL = 'https://beispiel-chronik.de'
const PROFILE = {
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  farbe: '#1f5f8b',
  logoUrl: '/partner-media/logo.png',
  banner: [{ position: 1, fotoUrl: '/uploads/banner.jpg', alt: 'Welpen' }],
  ansprechperson: 'Anna Berg',
  website: 'https://example.org/pfotenglueck',
  kontaktTelefon: null,
  kontaktEmail: 'hallo@example.org'
}
const DESIGN = {
  vorlage: 'klassisch',
  farbe: '#1f5f8b',
  kurztext: 'Training mit Herz',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: true,
  mitGutschein: false
}
const STATE = { design: DESIGN, gespeichert: false, vorschlag: 'Training mit Herz', gutscheine: { offen: 12, ungedruckt: 8 }, maxJeAbruf: 50 }
const codes = (count, prefix = 'K') => Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(3, '0')}-AAAA-BBBB`)

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
  for (const mock of [config, profile, visitenkarte, saveVisitenkarte, visitenkarteGutscheine, qrSvgPath]) mock.mockClear()
  saveVisitenkarte.mockReset()
  visitenkarteGutscheine.mockReset()
})

async function render({ readOnly = null } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={readOnly ?? false}>
        <MemoryRouter initialEntries={['/visitenkarten']}>
          <PartnerVisitenkartenPage />
        </MemoryRouter>
      </DemoProvider>
    )
  )
}

const stage = () => container.querySelector('.vk-stage')
const printView = () => document.body.querySelector(':scope > .vk-print')
const button = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith(text))
const printButton = () => button('Drucken')

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

async function toggle(id) {
  await click(container.querySelector(`#${id}`))
}

describe('PartnerVisitenkartenPage – gestalten', () => {
  test('lädt Profil und Gestaltung, zeigt Vorder- und Rückseite nebeneinander und den ersten Bogen', async () => {
    await render()
    expect(container.querySelector('h1').textContent).toBe('Visitenkarten gestalten')
    const front = stage().querySelector('.vk-front')
    expect(front.dataset.vorlage).toBe('klassisch')
    expect(front.textContent).toContain('Training mit Herz')
    expect(stage().querySelector('.vk-back-portal .vk-back-url').textContent).toBe('beispiel-chronik.de/p/hundeschule-pfotenglueck')
    expect(qrSvgPath).toHaveBeenCalledWith(`${PUBLIC_URL}/p/hundeschule-pfotenglueck`)
    expect(container.querySelectorAll('.vk-bogen-vorschau .vk-sheet')).toHaveLength(2)
    expect(container.querySelector('a[href="/profil?reiter=teilen"]')).not.toBe(null)
    expect(container.textContent).toContain(PRINT_HINT)
    // Die Rückseiten laufen gespiegelt - das passt zum Wenden über die lange Kante.
    expect(PRINT_HINT).toBe('Rückseiten: Duplex über die lange Kante – bei manuellem Druck das Blatt seitlich umdrehen.')
    expect(document.body.classList.contains(VK_PRINT_BODY_CLASS)).toBe(true)
  })

  test('Vorlage, Farbe und Kurztext wirken sofort in der Vorschau; ungültige Farbe bleibt ohne Wirkung', async () => {
    await render()
    await click(container.querySelector('input[name="vk-vorlage"][value="foto"]'))
    expect(stage().querySelector('.vk-front').dataset.vorlage).toBe('foto')
    expect(stage().querySelector('.vk-foto-bild').getAttribute('src')).toBe('/uploads/banner.jpg')

    await click(container.querySelector('input[name="vk-farbe"][value="#d49a5b"]'))
    expect(stage().querySelector('.vk-front').style.getPropertyValue('--vk-on')).toBe('#1c1511')

    const hex = container.querySelector('#vk-farbe-hex')
    await changeInput(hex, '#12')
    expect(hex.getAttribute('aria-invalid')).toBe('true')
    expect(stage().querySelector('.vk-front').style.getPropertyValue('--vk-farbe')).toBe('#d49a5b')
    await changeInput(hex, '#2F6B3F')
    expect(stage().querySelector('.vk-front').style.getPropertyValue('--vk-farbe')).toBe('#2f6b3f')
    expect(container.querySelector('#vk-farbe-kontrast').textContent).toContain('helle')

    await changeInput(container.querySelector('#vk-kurztext'), 'Neu auf der Wiese')
    expect(stage().querySelector('.vk-kurztext').textContent).toBe('Neu auf der Wiese')
    await click(button('Aus dem Portal übernehmen'))
    expect(stage().querySelector('.vk-kurztext').textContent).toBe('Training mit Herz')
  })

  test('Kontaktzeile: nur Angaben aus dem Profil sind schaltbar', async () => {
    await render()
    expect(container.querySelector('#vk-website')).not.toBe(null)
    expect(container.querySelector('#vk-email')).not.toBe(null)
    expect(container.querySelector('#vk-telefon')).toBe(null)
    await toggle('vk-website')
    expect(stage().querySelector('.vk-kontakte').textContent).not.toContain('example.org/pfotenglueck')
    expect(stage().querySelector('.vk-kontakte').textContent).toContain('hallo@example.org')
    await toggle('vk-person')
    expect(stage().querySelector('.vk-person')).toBe(null)
  })

  test('speichert die ganze Gestaltung und zeigt danach "Gespeichert"', async () => {
    saveVisitenkarte.mockImplementation(async (design) => ({ ...STATE, design, gespeichert: true }))
    await render()
    expect(container.textContent).toContain('Noch nicht gespeichert')
    await click(container.querySelector('input[name="vk-vorlage"][value="schlicht"]'))
    await click(button('Gestaltung speichern'))
    expect(saveVisitenkarte).toHaveBeenCalledWith({ ...DESIGN, vorlage: 'schlicht' })
    expect(container.querySelector('.vk-save-row').textContent).toContain('Gespeichert')
    expect(button('Gestaltung speichern').disabled).toBe(true)
  })

  test('Änderungen während des Speicherns bleiben erhalten und gelten als noch nicht gespeichert', async () => {
    let resolveSave
    saveVisitenkarte.mockImplementation((design) => new Promise((resolve) => (resolveSave = () => resolve({ ...STATE, design, gespeichert: true }))))
    await render()
    await click(button('Gestaltung speichern'))
    await changeInput(container.querySelector('#vk-kurztext'), 'Während des Speicherns geändert')
    await act(async () => resolveSave())
    expect(container.querySelector('#vk-kurztext').value).toBe('Während des Speicherns geändert')
    expect(container.querySelector('.vk-save-row').textContent).toContain('Noch nicht gespeichert')
    expect(button('Gestaltung speichern').disabled).toBe(false)
  })

  test('Hex-Feld: ein ungültiger Rest springt beim Verlassen auf die geltende Farbe zurück', async () => {
    await render()
    const hex = container.querySelector('#vk-farbe-hex')
    await changeInput(hex, '#a443')
    expect(hex.getAttribute('aria-invalid')).toBe('true')
    await act(async () => {
      hex.focus()
      hex.blur()
    })
    expect(hex.value).toBe('#1f5f8b')
    expect(hex.getAttribute('aria-invalid')).toBe(null)
  })

  test('Bögen 1-5: die Druckfassung in <body> hat je Bogen Vorder- und Rückseite; nur Rückseiten auf Wunsch', async () => {
    await render()
    await click([...container.querySelectorAll('.vk-segmented button')].find((btn) => btn.textContent === '3'))
    expect(printView().querySelectorAll('.vk-sheet')).toHaveLength(6)
    expect(container.textContent).toContain('30 Karten')
    await click(button('Nur hinten'))
    expect(printView().querySelectorAll('.vk-sheet-vorne')).toHaveLength(0)
    expect(printView().querySelectorAll('.vk-sheet-hinten')).toHaveLength(3)
    await click(printButton())
    expect(window.print).toHaveBeenCalledTimes(1)
  })
})

describe('PartnerVisitenkartenPage – Kunden-Gutschein', () => {
  test('Codes erst beim Drucken - genau so viele wie Karten, gespiegelt in der Druckfassung, nach dem Druck wieder weg', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(10), fehlen: 0, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    await toggle('vk-mit-gutschein')
    expect(container.textContent).toContain('12 offene Gutscheine, davon 8 noch nicht gedruckt.')
    expect(container.textContent).toContain('Beim Drucken bekommt jede Karte einen eigenen Code')
    // Vorschau und Druckbogen zeigen bis dahin Muster-Codes, die Druckfassung noch keine echten.
    expect(stage().querySelector('.vk-back-gutschein').dataset.muster).toBe('true')
    expect(container.querySelector('.vk-bogen-vorschau .vk-back-gutschein').dataset.muster).toBe('true')
    expect(printView().querySelectorAll('.vk-back-gutschein')).toHaveLength(0)
    expect(printButton().textContent).toContain('Drucken – mit 8 Gutscheinen')
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()

    await click(printButton())
    expect(visitenkarteGutscheine).toHaveBeenCalledWith({ anzahl: 10, nurUngedruckt: true })
    expect(window.print).toHaveBeenCalledTimes(1)
    const backCodes = [...printView().querySelectorAll('.vk-sheet-hinten .vk-code')].map((el) => el.getAttribute('aria-label').slice(-14))
    expect(backCodes).toEqual([1, 0, 3, 2, 5, 4, 7, 6, 9, 8].map((index) => codes(10)[index]))
    expect(printView().querySelector('[data-muster]')).toBe(null)
    expect(qrSvgPath).toHaveBeenCalledWith(`${PUBLIC_URL}/v#${codes(10)[0]}`)
    expect(container.textContent).toContain('Zuletzt gedruckt: 10 Karten mit eigenem Gutschein')

    // Nach dem Druckdialog verschwinden die Codes - ein neuer Druck bekommt neue.
    await act(async () => window.dispatchEvent(new Event('afterprint')))
    expect(printView().querySelectorAll('.vk-back-gutschein')).toHaveLength(0)
  })

  test('mehr Bögen und "nur ungedruckte" aus: holt genau die Karten des Drucks, warnt vor schon gedruckten', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(14), fehlen: 6, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    await toggle('vk-mit-gutschein')
    await click([...container.querySelectorAll('.vk-segmented button')].find((btn) => btn.textContent === '2'))
    expect(container.textContent).toContain('Für 12 Karten reichen sie nicht')
    await toggle('vk-nur-ungedruckt')
    expect(container.textContent).toContain('Schon gedruckte Codes können auf verteilten Karten stehen')
    await click(printButton())
    expect(visitenkarteGutscheine).toHaveBeenCalledWith({ anzahl: 20, nurUngedruckt: false })
    expect(printView().querySelectorAll('.vk-back-gutschein')).toHaveLength(14)
    expect(printView().querySelectorAll('.vk-back-portal')).toHaveLength(6)
    expect(container.textContent).toContain('14 Karten mit eigenem Gutschein, 6 mit Portal-Rückseite')
  })

  test('"Nur vorne" holt keine Codes - erst der Druck der Rückseiten bekommt welche', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: codes(10), fehlen: 0, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    await toggle('vk-mit-gutschein')
    await click(button('Nur vorne'))
    expect(printButton().textContent.trim()).toBe('Drucken')
    await click(printButton())
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(window.print).toHaveBeenCalledTimes(1)
    await click(button('Nur hinten'))
    await click(printButton())
    expect(visitenkarteGutscheine).toHaveBeenCalledWith({ anzahl: 10, nurUngedruckt: true })
  })

  test('kein Code mehr frei (Server liefert keinen): ehrliche Meldung statt "0 Karten mit Gutschein"', async () => {
    visitenkarteGutscheine.mockResolvedValue({ codes: [], fehlen: 10, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    await toggle('vk-mit-gutschein')
    await click(printButton())
    expect(container.textContent).toContain('Es war kein Gutschein mehr frei – alle 10 Karten bekamen die Rückseite mit eurem Portal.')
    expect(container.textContent).not.toContain('0 Karten mit eigenem Gutschein')
  })

  test('alle offenen schon gedruckt: Hinweis mit Weg zum Admin, Druck ohne Codes mit Portal-Rückseite', async () => {
    visitenkarte.mockResolvedValue({ ...STATE, design: { ...DESIGN, mitGutschein: true }, gutscheine: { offen: 12, ungedruckt: 0 } })
    await render()
    expect(container.textContent).toContain(ALL_PRINTED_HINT)
    expect(container.querySelector('a[href="/admin-schreiben"]')).not.toBe(null)
    expect(stage().querySelector('.vk-back-portal')).not.toBe(null)
    expect(printButton().textContent.trim()).toBe('Drucken')
    await click(printButton())
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(window.print).toHaveBeenCalledTimes(1)
  })

  test('leerer Stapel: Hinweis mit Weg zum Admin, gedruckt wird mit Portal-Rückseite', async () => {
    visitenkarte.mockResolvedValue({ ...STATE, gutscheine: { offen: 0, ungedruckt: 0 } })
    await render()
    await toggle('vk-mit-gutschein')
    expect(container.textContent).toContain(EMPTY_STACK_HINT)
    expect(container.querySelector('a[href="/admin-schreiben"]')).not.toBe(null)
    expect(stage().querySelector('.vk-back-gutschein')).toBe(null)
    await click(printButton())
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(window.print).toHaveBeenCalledTimes(1)
  })

  test('Fehler beim Holen: Meldung, kein Druck, keine Codes', async () => {
    visitenkarteGutscheine.mockRejectedValue(new Error('Zu viele Abrufe von Gutscheinen in kurzer Zeit'))
    await render()
    await toggle('vk-mit-gutschein')
    await click(printButton())
    expect(container.querySelector('[role="alert"]').textContent).toContain('Zu viele Abrufe')
    expect(window.print).not.toHaveBeenCalled()
    expect(printView().querySelectorAll('.vk-back-gutschein')).toHaveLength(0)
  })
})

describe('PartnerVisitenkartenPage – Demo und Admin-Ansicht', () => {
  test('Demo: ausprobieren ja, speichern nein; Muster-Codes statt echter, Portal-Link mit ?demo=1', async () => {
    visitenkarte.mockResolvedValue({ ...STATE, design: { ...DESIGN, vorlage: 'foto', mitGutschein: true }, gespeichert: true })
    await render({ readOnly: { isDemo: true } })
    expect(button('Gestaltung speichern').disabled).toBe(true)
    expect(container.textContent).toContain(DEMO_HINT)
    expect(container.textContent).toContain('Muster: In der Demo')
    expect(button('Gutscheine für')).toBeUndefined()
    expect(printButton().disabled).toBe(false)
    const muster = [...printView().querySelectorAll('.vk-back-gutschein')]
    expect(muster).toHaveLength(10)
    expect(muster.every((back) => back.dataset.muster === 'true')).toBe(true)
    expect(muster[0].querySelector('.vk-code').textContent.startsWith('DEMO')).toBe(true)
    await click(printButton())
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    // Ohne Gutschein trägt die Rückseite den Portal-QR - in der Demo mit ?demo=1, damit er sich öffnen lässt.
    await toggle('vk-mit-gutschein')
    expect(qrSvgPath).toHaveBeenCalledWith(`${PUBLIC_URL}/p/hundeschule-pfotenglueck?demo=1`)
  })

  test('Admin-Ansicht: eigener Hinweis, nie echte Codes, Portal-Link ohne ?demo=1', async () => {
    visitenkarte.mockResolvedValue({ ...STATE, design: { ...DESIGN, mitGutschein: true }, gespeichert: true })
    await render({ readOnly: { adminView: true } })
    expect(container.textContent).toContain(ADMIN_VIEW_HINT)
    expect(container.textContent).toContain('In der Admin-Ansicht stehen auf den Karten Beispiel-Codes')
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(printView().querySelector('.vk-back-gutschein').dataset.muster).toBe('true')
    await toggle('vk-mit-gutschein')
    expect(qrSvgPath).toHaveBeenCalledWith(`${PUBLIC_URL}/p/hundeschule-pfotenglueck`)
    expect(qrSvgPath).not.toHaveBeenCalledWith(expect.stringContaining('?demo=1'))
  })

  test('Ladefehler: Meldung statt Designer', async () => {
    visitenkarte.mockRejectedValue(new Error('Nur im Partner-Bereich möglich'))
    await render()
    expect(container.querySelector('.error-banner').textContent).toBe('Nur im Partner-Bereich möglich')
    expect(stage()).toBe(null)
  })
})
