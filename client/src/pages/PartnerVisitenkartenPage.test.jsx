// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
import { PRINT_HINT } from '../components/visitenkarte/KartenDruckOptionen.jsx'
import { RUECKSEITE_NOTE } from '../components/visitenkarte/KartenDesigner.jsx'

// Feedback-Runde: EINE Karten-Seite ohne "Kartenart" - drei Kacheln (Visitenkarte, Einladungskarte, Kombi), vorne immer
// dieselbe Hauptkarte mit Kontakten, die Wahl in der Adresse (?karte=…, früher ?art=einladung) und mit der Gestaltung
// gespeichert. Hier: gestalten, wählen, speichern, Demo/Admin-Ansicht und der Hinweis ohne öffentliche Adresse; Codes und
// Druck in PartnerVisitenkartenPage.druck.test.jsx.
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
  karte: 'kombi',
  vorlage: 'klassisch',
  farbe: '#1f5f8b',
  kurztext: 'Training mit Herz',
  widmung: '',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: true
}
const RUECKSEITE = { titel: 'Eure Chronik wartet', text: 'Ein Text der Plattform.', schritte: ['Scannen', 'Code eingeben', 'Loslegen'], adresse: '' }
const STATE = {
  design: DESIGN,
  gespeichert: true,
  rueckseite: RUECKSEITE,
  vorschlag: 'Training mit Herz',
  gutscheine: { offen: 12, ungedruckt: 8 },
  maxJeAbruf: 50
}

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
          <LocationProbe />
        </MemoryRouter>
      </DemoProvider>
    )
  )
}

async function rerender(options) {
  act(() => root.unmount())
  root = null
  container.remove()
  await render(options)
}

const stage = () => container.querySelector('.vk-stage')
const printView = () => document.body.querySelector(':scope > .vk-print')
const button = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith(text))
const printButton = () => button('Drucken')
const tile = (id) => container.querySelector(`input[name="vk-karte"][value="${id}"]`)

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

describe('PartnerVisitenkartenPage – Kombination wählen', () => {
  test('eine Seite: drei Kacheln als Radio-Gruppe, Kombi gespeichert und gewählt, Vorschau mit Portal und Code', async () => {
    await render()
    expect(container.querySelector('h1').textContent).toBe('Karten gestalten')
    expect(container.textContent).not.toContain('Kartenart')
    const fieldset = container.querySelector('fieldset.vk-wahl')
    expect(fieldset.querySelector('legend').textContent).toBe('Welche Karte?')
    const radios = [...fieldset.querySelectorAll('input[type="radio"]')]
    expect(radios.map((radio) => radio.closest('label').querySelector('strong').textContent)).toEqual(['Visitenkarte', 'Einladungskarte', 'Kombi'])
    expect(radios.map((radio) => radio.closest('label').querySelector('.vk-wahl-hint').textContent)).toEqual([
      'vorne Kontakte · hinten euer Portal',
      'vorne Kontakte · hinten Einladungscode',
      'vorne Kontakte · hinten Portal + Einladungscode'
    ])
    expect(radios.map((radio) => radio.checked)).toEqual([false, false, true])
    expect(fieldset.querySelectorAll('.vk-wahl-skizze')).toHaveLength(3)

    const back = stage().querySelector('.vk-back-kombi')
    expect(back.dataset.muster).toBe('true')
    expect([...back.querySelectorAll('.vk-kombi-label')].map((label) => label.textContent)).toEqual(['Unser Portal', 'Euer Einladungscode'])
    expect(back.querySelector('.vk-einladung-titel').textContent).toBe('Eure Chronik wartet')
    expect(stage().textContent).toContain(RUECKSEITE_NOTE)
    expect(qrSvgPath).toHaveBeenCalledWith(`${PUBLIC_URL}/p/hundeschule-pfotenglueck`)
    expect(container.querySelector('.vk-save-row').textContent).toContain('Gespeichert')
    expect(container.querySelector('a[href="/profil?reiter=teilen"]')).not.toBe(null)
    expect(container.textContent).toContain(PRINT_HINT)
    expect(document.body.classList.contains(VK_PRINT_BODY_CLASS)).toBe(true)
  })

  test('Wechsel steht in der Adresse und im Entwurf; Visitenkarte ohne Codes, zurück zur Kombi ist wieder gespeichert', async () => {
    await render()
    await click(tile('visitenkarte'))
    expect(location.search).toBe('?karte=visitenkarte')
    expect(tile('visitenkarte').checked).toBe(true)
    expect(stage().querySelector('.vk-back-portal .vk-back-url').textContent).toBe('beispiel-chronik.de/p/hundeschule-pfotenglueck')
    expect(stage().textContent).not.toContain(RUECKSEITE_NOTE)
    expect(container.querySelector('#vk-codes-title')).toBe(null)
    expect(container.querySelector('.vk-save-row').textContent).toContain('Noch nicht gespeichert')

    await click(tile('einladung'))
    expect(location.search).toBe('?karte=einladung')
    const back = stage().querySelector('.vk-back-einladung:not(.vk-back-kombi)')
    expect([...back.querySelectorAll('.vk-einladung-schritte li')].map((li) => li.textContent)).toEqual(['Scannen', 'Code eingeben', 'Loslegen'])
    expect(back.querySelector('.vk-einladung-adresse').textContent).toBe('beispiel-chronik.de/v')
    expect(container.querySelector('#vk-codes-title').textContent).toBe('Einladungscodes')

    await click(tile('kombi'))
    expect(container.querySelector('.vk-save-row').textContent).toContain('Gespeichert')
  })

  test('?karte=einladung öffnet die Einladungskarte, das frühere ?art=einladung ebenso - die neue Wahl ersetzt es', async () => {
    await render({ url: '/visitenkarten?karte=einladung' })
    expect(tile('einladung').checked).toBe(true)
    expect(container.querySelector('.vk-save-row').textContent).toContain('Noch nicht gespeichert')
    await rerender({ url: '/visitenkarten?art=einladung&demo=1' })
    expect(tile('einladung').checked).toBe(true)
    expect(stage().querySelector('.vk-back-einladung')).not.toBe(null)
    await click(tile('kombi'))
    expect(location.search).toBe('?demo=1&karte=kombi')
  })

  test('ohne gespeicherte Gestaltung: Kombi als Vorgabe', async () => {
    visitenkarte.mockResolvedValue({ ...STATE, gespeichert: false })
    await render()
    expect(tile('kombi').checked).toBe(true)
    expect(container.querySelector('.vk-save-row').textContent).toContain('Noch nicht gespeichert')
  })
})

describe('PartnerVisitenkartenPage – Vorderseite gestalten', () => {
  test('eine Vorderseite für alle Kombinationen: Vorlage, Farbe, Kurztext und persönliche Zeile wirken sofort', async () => {
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

    await changeInput(container.querySelector('#vk-kurztext'), 'Neu auf der Wiese')
    expect(stage().querySelector('.vk-kurztext').textContent).toBe('Neu auf der Wiese')
    await click(button('Aus dem Portal übernehmen'))
    expect(stage().querySelector('.vk-kurztext').textContent).toBe('Training mit Herz')

    await changeInput(container.querySelector('#vk-widmung'), 'Für die Montagsgruppe')
    expect(stage().querySelector('.vk-widmung').textContent).toBe('Für die Montagsgruppe')
    // Dieselbe Vorderseite bleibt beim Wechsel der Kombination.
    await click(tile('visitenkarte'))
    expect(stage().querySelector('.vk-widmung').textContent).toBe('Für die Montagsgruppe')
    expect(stage().querySelector('.vk-front').dataset.vorlage).toBe('foto')
    // Die Rückseite der Plattform trägt nie die Farbe oder Texte des Partners.
    await click(tile('einladung'))
    const back = stage().querySelector('.vk-back-einladung')
    expect(back.outerHTML).not.toContain('#2f6b3f')
    expect(back.textContent).not.toContain('Hundeschule Pfotenglück')
  })

  test('Kontaktzeile: nur Angaben aus dem Profil sind schaltbar', async () => {
    await render()
    expect(container.querySelector('#vk-website')).not.toBe(null)
    expect(container.querySelector('#vk-email')).not.toBe(null)
    expect(container.querySelector('#vk-telefon')).toBe(null)
    await click(container.querySelector('#vk-website'))
    expect(stage().querySelector('.vk-kontakte').textContent).not.toContain('example.org/pfotenglueck')
    expect(stage().querySelector('.vk-kontakte').textContent).toContain('hallo@example.org')
    await click(container.querySelector('#vk-person'))
    expect(stage().querySelector('.vk-person')).toBe(null)
  })

  test('speichert Gestaltung und Kombination zusammen und zeigt danach "Gespeichert"', async () => {
    saveVisitenkarte.mockImplementation(async (design) => ({ ...STATE, design, gespeichert: true }))
    await render()
    await click(tile('einladung'))
    await changeInput(container.querySelector('#vk-widmung'), 'Für die Montagsgruppe')
    await click(button('Gestaltung speichern'))
    expect(saveVisitenkarte).toHaveBeenCalledWith({ ...DESIGN, karte: 'einladung', widmung: 'Für die Montagsgruppe' })
    expect(container.querySelector('.vk-save-row').textContent).toContain('Gespeichert')
    expect(button('Gestaltung speichern').disabled).toBe(true)
  })

  test('Änderungen während des Speicherns bleiben erhalten und gelten als noch nicht gespeichert', async () => {
    let resolveSave
    saveVisitenkarte.mockImplementation((design) => new Promise((resolve) => (resolveSave = () => resolve({ ...STATE, design, gespeichert: true }))))
    visitenkarte.mockResolvedValue({ ...STATE, gespeichert: false })
    await render()
    await click(button('Gestaltung speichern'))
    await changeInput(container.querySelector('#vk-kurztext'), 'Während des Speicherns geändert')
    await act(async () => resolveSave())
    expect(container.querySelector('#vk-kurztext').value).toBe('Während des Speicherns geändert')
    expect(container.querySelector('.vk-save-row').textContent).toContain('Noch nicht gespeichert')
  })

  test('Hex-Feld: ein ungültiger Rest springt beim Verlassen auf die geltende Farbe zurück', async () => {
    await render()
    const hex = container.querySelector('#vk-farbe-hex')
    await changeInput(hex, '#a443')
    await act(async () => {
      hex.focus()
      hex.blur()
    })
    expect(hex.value).toBe('#1f5f8b')
    expect(hex.getAttribute('aria-invalid')).toBe(null)
  })

  test('der Druckbogen steht zum Aufklappen da - die Seite bleibt kurz', async () => {
    await render()
    const details = container.querySelector('details.vk-bogen-vorschau')
    expect(details.open).toBe(false)
    expect(details.querySelector('summary').textContent).toBe('Druckbogen ansehen')
    expect(details.querySelectorAll('.vk-sheet')).toHaveLength(2)
  })

  test('Ladefehler: Meldung statt Designer', async () => {
    visitenkarte.mockRejectedValue(new Error('Nur im Partner-Bereich möglich'))
    await render()
    expect(container.querySelector('.error-banner').textContent).toBe('Nur im Partner-Bereich möglich')
    expect(stage()).toBe(null)
  })
})

describe('PartnerVisitenkartenPage – Demo und Admin-Ansicht', () => {
  test('Demo: Kombinationen ausprobieren ja, speichern nein; Muster-Codes, Portal-Link mit ?demo=1', async () => {
    await render({ readOnly: { isDemo: true } })
    expect(button('Gestaltung speichern').disabled).toBe(true)
    expect(container.textContent).toContain(DEMO_HINT)
    expect(container.textContent).toContain('Muster: In der Demo')
    const backs = [...printView().querySelectorAll('.vk-back-kombi')]
    expect(backs).toHaveLength(10)
    expect(backs.every((back) => back.dataset.muster === 'true')).toBe(true)
    await click(printButton())
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    await click(tile('visitenkarte'))
    expect(qrSvgPath).toHaveBeenCalledWith(`${PUBLIC_URL}/p/hundeschule-pfotenglueck?demo=1`)
    expect(printView().querySelectorAll('.vk-back-portal')).toHaveLength(10)
  })

  test('Admin-Ansicht: eigener Hinweis, nie echte Codes, Portal-Link ohne ?demo=1', async () => {
    await render({ readOnly: { adminView: true } })
    expect(container.textContent).toContain(ADMIN_VIEW_HINT)
    expect(container.textContent).toContain('In der Admin-Ansicht stehen auf den Karten Beispiel-Codes')
    expect(printView().querySelector('.vk-back-kombi').dataset.muster).toBe('true')
    await click(printButton())
    expect(visitenkarteGutscheine).not.toHaveBeenCalled()
    expect(qrSvgPath).not.toHaveBeenCalledWith(expect.stringContaining('?demo=1'))
  })
})

describe('PartnerVisitenkartenPage – ohne öffentliche Adresse (Feedback-Runde)', () => {
  const PENDING = 'Drucken ist bald möglich – wir richten gerade die Adresse der Plattform ein.'

  test('Produktion ohne Domain: ein Satz ohne Adresse, Drucken gesperrt, keine Druckfassung, Vorschau ohne Host', async () => {
    config.mockResolvedValue({ appEnv: 'production', publicUrl: null })
    await render()
    expect(container.textContent).toContain(PENDING)
    expect(container.textContent).not.toMatch(/keine öffentliche Adresse|beim Betreiber melden|localhost/)
    expect(stage().querySelector('.vk-kombi-sub').textContent).toBe('Adresse folgt')
    expect(printButton().disabled).toBe(true)
    expect(printView()).toBe(null)
  })

  test('Vorschau und Testsystem ohne Domain, Demo und Admin-Ansicht in Produktion: kein Hinweis, Drucken möglich', async () => {
    for (const [appEnv, readOnly] of [
      ['staging', null],
      ['dev', null],
      ['production', { isDemo: true }],
      ['production', { adminView: true }]
    ]) {
      config.mockResolvedValue({ appEnv, publicUrl: null })
      await render({ readOnly })
      expect(container.textContent).not.toContain(PENDING)
      expect(container.textContent).not.toContain('keine öffentliche Adresse')
      expect(printButton().disabled).toBe(false)
      act(() => root.unmount())
      root = null
      container.remove()
    }
  })
})
