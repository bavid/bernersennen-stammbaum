// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  partners: vi.fn(),
  createPartner: vi.fn(),
  updatePartner: vi.fn(),
  deletePartner: vi.fn(),
  uploadPartnerLogo: vi.fn(),
  createPartnerArea: vi.fn(),
  renewPartnerAreaKey: vi.fn(),
  einblicke: vi.fn(),
  setEinblickAusgeblendet: vi.fn(),
  setEinblickAngepinnt: vi.fn(),
  partnerBanner: vi.fn(),
  deletePartnerBanner: vi.fn()
}))
const { partners, createPartner, updatePartner, deletePartner, uploadPartnerLogo, createPartnerArea, renewPartnerAreaKey, einblicke, setEinblickAusgeblendet } =
  mocks
vi.mock('../api', () => ({ api: { admin: mocks } }))

import AdminPartners from './AdminPartners.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – der KeyReveal-Dialog für den
// Zugang eines Partner-Bereichs läuft im Modal.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select, value) {
  nativeSelectValueSetter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const draftPartner = {
  id: 1,
  slug: 'tierheim-sonnenhang',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  status: 'entwurf',
  ist_partner: 1,
  plz: '10115',
  ort: 'Berlin',
  website: null,
  spenden_url: null,
  vermittlung_url: null,
  kontakt_email: null,
  kontakt_telefon: null,
  logo_file: null,
  portal_titel: null,
  portal_text: null,
  farbe: null
}

const activePartner = {
  ...draftPartner,
  id: 2,
  slug: 'hundeschule-pfotengluck',
  name: 'Hundeschule Pfotenglück',
  typ: 'hundeschule',
  status: 'aktiv'
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  for (const mock of Object.values(mocks)) mock.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminPartners />))
  return container
}

function buttonByText(text) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

describe('AdminPartners – Liste', () => {
  test('zeigt Status-Chips für Entwurf, Aktiv und Pausiert', async () => {
    partners.mockResolvedValue([draftPartner, activePartner, { ...draftPartner, id: 3, name: 'Pausiert e.V.', status: 'pausiert' }])
    await render()

    const rows = [...container.querySelectorAll('.admin-partner-row')]
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Entwurf')
    expect(rows[1].textContent).toContain('Aktiv')
    expect(rows[2].textContent).toContain('Pausiert')
  })

  test('Audit V7a: die Erklärung zu "Vertrauenswürdig" steht sichtbar nur einmal über der Liste', async () => {
    partners.mockResolvedValue([draftPartner, activePartner])
    await render()

    const visibleHints = [...container.querySelectorAll('.field-hint')].filter((p) => p.textContent.includes('ohne neue Prüfung online'))
    expect(visibleHints).toHaveLength(1)
    expect(visibleHints[0].closest('.admin-partner-row')).toBeNull()
    // je Schalter bleibt die Beschreibung für Screenreader
    for (const row of container.querySelectorAll('.admin-partner-row')) {
      const toggle = row.querySelector('input[role="switch"]')
      expect(row.querySelector(`#${toggle.getAttribute('aria-describedby')}`).textContent).toContain('ohne neue Prüfung online')
    }
  })

  test('"Portal ansehen" verlinkt /p/:slug in einem neuen Tab', async () => {
    partners.mockResolvedValue([draftPartner])
    await render()

    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Portal ansehen')
    expect(link.getAttribute('href')).toBe('/p/tierheim-sonnenhang')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('"Löschen" erscheint nur bei Entwürfen', async () => {
    partners.mockResolvedValue([draftPartner, activePartner])
    await render()

    const rows = [...container.querySelectorAll('.admin-partner-row')]
    expect([...rows[0].querySelectorAll('button')].some((btn) => btn.textContent.includes('Löschen'))).toBe(true)
    expect([...rows[1].querySelectorAll('button')].some((btn) => btn.textContent.includes('Löschen'))).toBe(false)
  })

  test('Pausieren/Aktivieren sendet den vollständigen Datensatz (nicht nur status) und lädt die Liste neu', async () => {
    partners.mockResolvedValue([activePartner])
    updatePartner.mockResolvedValue({ ...activePartner, status: 'pausiert' })
    await render()

    const toggle = [...container.querySelectorAll('.admin-partner-row button')].find((btn) => btn.textContent.trim() === 'Pausieren')
    expect(toggle).not.toBeUndefined()

    partners.mockResolvedValue([{ ...activePartner, status: 'pausiert' }])
    await act(async () => toggle.click())

    // PUT /api/admin/partners/:id validiert den vollen Datensatz (Name ist Pflicht) - ein Payload mit
    // nur { status } scheitert dort mit 400 (siehe server/test/partners.test.js). Alle Pflichtfelder aus
    // toPayload/initialState müssen deshalb mitgeschickt werden, status überschrieben.
    expect(updatePartner).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        name: activePartner.name,
        typ: activePartner.typ,
        plz: activePartner.plz,
        istPartner: true,
        status: 'pausiert'
      })
    )
    const sentPayload = updatePartner.mock.calls[0][1]
    expect(Object.keys(sentPayload).sort()).toEqual(
      [
        'name',
        'slug',
        'typ',
        'status',
        'istPartner',
        'plz',
        'website',
        'spendenUrl',
        'vermittlungUrl',
        'kontaktEmail',
        'kontaktTelefon',
        'ansprechperson',
        'portalTitel',
        'portalText',
        'farbe'
      ].sort()
    )
    expect(partners).toHaveBeenCalledTimes(2)
  })

  test('Löschen (Entwurf) fragt zweimal (Bestätigung) und ruft dann deletePartner auf', async () => {
    partners.mockResolvedValue([draftPartner])
    deletePartner.mockResolvedValue(null)
    await render()

    const row = container.querySelector('.admin-partner-row')
    const deleteButton = [...row.querySelectorAll('button')].find((btn) => btn.textContent.includes('Löschen'))

    partners.mockResolvedValue([])
    await act(async () => deleteButton.click())
    expect(deletePartner).not.toHaveBeenCalled()
    await act(async () => container.querySelector('.admin-partner-row button.is-armed').click())

    expect(deletePartner).toHaveBeenCalledWith(1)
  })

  test('ein Fehler beim Laden erscheint als Alert', async () => {
    partners.mockRejectedValue(new Error('Fehler 401'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Fehler 401')
  })
})

describe('AdminPartners – Formular', () => {
  test('"Partner anlegen" öffnet ein leeres Formular; Server-Validierungsfehler werden angezeigt', async () => {
    partners.mockResolvedValue([])
    await render()

    await act(async () => buttonByText('Partner anlegen').click())
    expect(container.querySelector('#admin-partner-name')).not.toBeNull()

    // Der Name ist client-seitig ausgefüllt (sonst bleibt der Speichern-Knopf disabled) - der Fehler
    // kommt vom Server, z. B. weil der (aus dem Namen erzeugte) Kurzname schon vergeben ist.
    const error = Object.assign(new Error('Diesen Kurznamen gibt es schon'), { status: 409 })
    createPartner.mockRejectedValue(error)

    await act(async () => {
      setInputValue(container.querySelector('#admin-partner-name'), 'Tierheim Sonnenhang')
    })
    await act(async () => container.querySelector('.admin-partner-form').requestSubmit())

    expect(createPartner).toHaveBeenCalled()
    expect(container.querySelector('.admin-partner-form .error-banner').textContent).toBe('Diesen Kurznamen gibt es schon')
  })

  test('legt einen Partner mit den Formularfeldern an (camelCase-Payload) und lädt danach die Liste neu', async () => {
    partners.mockResolvedValue([])
    createPartner.mockResolvedValue({ ...draftPartner, id: 9, name: 'Neuer Partner' })
    await render()

    await act(async () => buttonByText('Partner anlegen').click())

    await act(async () => {
      setInputValue(container.querySelector('#admin-partner-name'), 'Neuer Partner')
      setSelectValue(container.querySelector('#admin-partner-typ'), 'vermittlung')
      setInputValue(container.querySelector('#admin-partner-plz'), '10115')
      setInputValue(container.querySelector('#admin-partner-website'), 'https://example.org')
    })

    partners.mockResolvedValue([{ ...draftPartner, id: 9, name: 'Neuer Partner' }])
    await act(async () => container.querySelector('.admin-partner-form').requestSubmit())

    expect(createPartner).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Neuer Partner',
        typ: 'vermittlung',
        plz: '10115',
        website: 'https://example.org'
      })
    )
    // Formular schließt nach dem Speichern wieder
    expect(container.querySelector('#admin-partner-name')).toBeNull()
  })

  test('zeigt eine Kontrast-Warnung für eine zu helle Farbe und "gut lesbar" für eine passende', async () => {
    partners.mockResolvedValue([])
    await render()
    await act(async () => buttonByText('Partner anlegen').click())

    const farbeText = container.querySelector('#admin-partner-farbe-text')
    await act(async () => setInputValue(farbeText, '#fffaf2'))
    expect(container.querySelector('.admin-partner-contrast').textContent).toMatch(/zu (niedrig|gering)|schlecht lesbar/i)

    await act(async () => setInputValue(farbeText, '#2f6b3f'))
    expect(container.querySelector('.admin-partner-contrast').textContent).toMatch(/gut lesbar/i)
  })

  test('Bearbeiten öffnet das Formular vorbefüllt mit den Werten des Partners', async () => {
    partners.mockResolvedValue([activePartner])
    await render()

    await act(async () => buttonByText('Bearbeiten').click())
    expect(container.querySelector('#admin-partner-name').value).toBe('Hundeschule Pfotenglück')
    expect(container.querySelector('#admin-partner-typ').value).toBe('hundeschule')
  })

  test('beim Bearbeiten eines bestehenden Partners lässt sich ein Logo hochladen', async () => {
    partners.mockResolvedValue([activePartner])
    uploadPartnerLogo.mockResolvedValue({ logoUrl: '/partner-media/abc.png' })
    await render()

    await act(async () => buttonByText('Bearbeiten').click())

    const fileInput = container.querySelector('.admin-partner-form input[type="file"]')
    expect(fileInput).not.toBeNull()

    const file = new File(['x'], 'logo.png', { type: 'image/png' })
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(uploadPartnerLogo).toHaveBeenCalledWith(2, file)
  })

  test('das Logo-Upload-Feld ist per Tastatur erreichbar (nicht hidden, nur visuell versteckt)', async () => {
    partners.mockResolvedValue([activePartner])
    await render()

    await act(async () => buttonByText('Bearbeiten').click())

    const fileInput = container.querySelector('.admin-partner-form input[type="file"]')
    expect(fileInput.hidden).toBe(false)
    expect(fileInput.hasAttribute('hidden')).toBe(false)
    expect(fileInput.tabIndex).not.toBe(-1)
  })

  test('beim Neuanlegen (noch keine id) gibt es kein Logo-Upload-Feld', async () => {
    partners.mockResolvedValue([])
    await render()
    await act(async () => buttonByText('Partner anlegen').click())
    expect(container.querySelector('.admin-partner-form input[type="file"]')).toBeNull()
  })

  test('Abbrechen schließt das Formular ohne zu speichern', async () => {
    partners.mockResolvedValue([draftPartner])
    await render()

    await act(async () => buttonByText('Bearbeiten').click())
    await act(async () => buttonByText('Abbrechen').click())

    expect(container.querySelector('.admin-partner-form')).toBeNull()
    expect(createPartner).not.toHaveBeenCalled()
    expect(updatePartner).not.toHaveBeenCalled()
  })
})

// Phase P1: Bereich anlegen/Schlüssel erneuern für JEDEN Partner-Typ (vorher nur Tierheime, final-review
// Phase T Finding 4) - über POST /api/admin/partners/:id/area bzw. /area/key.
describe('AdminPartners – Partner-Bereich', () => {
  test('ohne Bereich zeigt jede Zeile "Partner-Bereich anlegen" - auch für eine Hundeschule', async () => {
    partners.mockResolvedValue([{ ...draftPartner, area_family_id: null }, { ...activePartner, area_family_id: null }])
    await render()

    const rows = [...container.querySelectorAll('.admin-partner-row')]
    for (const row of rows) {
      expect([...row.querySelectorAll('button')].some((btn) => btn.textContent.trim() === 'Partner-Bereich anlegen')).toBe(true)
    }
  })

  test('mit Bereich zeigt die Art ("Tierheim-Bereich"/"Partner-Bereich: angelegt") und "Schlüssel neu ausgeben"', async () => {
    partners.mockResolvedValue([
      { ...draftPartner, area_family_id: 42, area_art: 'tierheim' },
      { ...activePartner, area_family_id: 43, area_art: 'partner' }
    ])
    await render()

    const rows = [...container.querySelectorAll('.admin-partner-row')]
    expect(rows[0].textContent).toContain('Tierheim-Bereich: angelegt')
    expect(rows[1].textContent).toContain('Partner-Bereich: angelegt')
    expect(rows[1].textContent).not.toContain('Partner-Bereich anlegen')
    expect([...rows[1].querySelectorAll('button')].some((btn) => btn.textContent.trim() === 'Schlüssel neu ausgeben')).toBe(true)
  })

  test('Hundeschule: "Partner-Bereich anlegen" ruft api.admin.createPartnerArea ohne Rückfrage auf, zeigt den Schlüssel und lädt neu', async () => {
    partners.mockResolvedValue([{ ...activePartner, area_family_id: null }])
    createPartnerArea.mockResolvedValue({ familyId: 43, key: 'ABCD-1234-EFGH', art: 'partner' })
    await render()

    partners.mockResolvedValue([{ ...activePartner, area_family_id: 43, area_art: 'partner' }])
    await act(async () => buttonByText('Partner-Bereich anlegen').click())

    expect(createPartnerArea).toHaveBeenCalledWith(2)
    expect(container.querySelector('.key-reveal-value').textContent).toBe('ABCD-1234-EFGH')
    expect(container.querySelector('#modal-title').textContent).toBe('Zugang für Hundeschule Pfotenglück')
    // showCardHint={false} - der übliche Kartenhinweis fehlt, dafür der admin-spezifische Text.
    expect(container.textContent).not.toContain('Wer euch die Karte gegeben hat')
    expect(container.textContent).toContain('Diesen Schlüssel dem Partner geben')
    expect(partners).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.admin-partner-row').textContent).toContain('Partner-Bereich: angelegt')
  })

  test('Hundeschule: "Schlüssel neu ausgeben" verlangt erst eine Bestätigung mit Erklärtext, dann ruft es /area/key', async () => {
    partners.mockResolvedValue([{ ...activePartner, area_family_id: 43, area_art: 'partner' }])
    renewPartnerAreaKey.mockResolvedValue({ key: 'WXYZ-5678-IJKL' })
    await render()

    await act(async () => buttonByText('Schlüssel neu ausgeben').click())
    expect(renewPartnerAreaKey).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Alle Geräte des Partners müssen sich neu anmelden.')

    const confirm = buttonByText('Wirklich neu ausgeben?')
    expect(confirm).not.toBeUndefined()
    await act(async () => confirm.click())

    expect(renewPartnerAreaKey).toHaveBeenCalledWith(2)
    expect(container.querySelector('.key-reveal-value').textContent).toBe('WXYZ-5678-IJKL')
  })

  test('"Abbrechen" bei der Erneuern-Bestätigung ruft die API nicht auf', async () => {
    partners.mockResolvedValue([{ ...draftPartner, area_family_id: 42, area_art: 'tierheim' }])
    await render()

    await act(async () => buttonByText('Schlüssel neu ausgeben').click())
    await act(async () => buttonByText('Abbrechen').click())

    expect(renewPartnerAreaKey).not.toHaveBeenCalled()
    expect(buttonByText('Schlüssel neu ausgeben')).not.toBeUndefined()
  })

  test('ein Fehler beim Anlegen erscheint inline, ohne die restliche Liste zu verstecken', async () => {
    partners.mockResolvedValue([{ ...draftPartner, area_family_id: null }])
    createPartnerArea.mockRejectedValue(new Error('Für diesen Partner gibt es schon einen Tierheim-Bereich'))
    await render()

    await act(async () => buttonByText('Partner-Bereich anlegen').click())

    expect(container.querySelector('.admin-partner-row .field-error').textContent).toBe(
      'Für diesen Partner gibt es schon einen Tierheim-Bereich'
    )
    expect(container.querySelectorAll('.admin-partner-row')).toHaveLength(1)
  })
})

describe('AdminPartners – Sperren', () => {
  test('"Sperren" fragt mit Hinweis nach und sendet erst dann den vollen Datensatz mit gesperrt: true', async () => {
    partners.mockResolvedValue([activePartner])
    updatePartner.mockResolvedValue({ ...activePartner, gesperrt: 1, status: 'pausiert' })
    await render()

    await act(async () => buttonByText('Sperren').click())
    expect(updatePartner).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Das Profil verschwindet sofort aus allen öffentlichen Listen.')

    partners.mockResolvedValue([{ ...activePartner, gesperrt: 1, status: 'pausiert' }])
    await act(async () => buttonByText('Wirklich sperren?').click())

    expect(updatePartner).toHaveBeenCalledWith(2, expect.objectContaining({ name: activePartner.name, typ: 'hundeschule', gesperrt: true }))
    const row = container.querySelector('.admin-partner-row')
    expect(row.classList.contains('is-locked')).toBe(true)
    expect(row.querySelector('.admin-partner-locked').textContent).toBe('Gesperrt')
    expect(buttonByText('Entsperren')).not.toBeUndefined()
  })

  test('"Abbrechen" beim Sperren sendet nichts', async () => {
    partners.mockResolvedValue([activePartner])
    await render()

    await act(async () => buttonByText('Sperren').click())
    await act(async () => buttonByText('Abbrechen').click())

    expect(updatePartner).not.toHaveBeenCalled()
    expect(buttonByText('Sperren')).not.toBeUndefined()
  })

  test('gesperrt: Badge, "Aktivieren" ist aus, "Entsperren" sendet gesperrt: false ohne Rückfrage', async () => {
    partners.mockResolvedValue([{ ...activePartner, status: 'pausiert', gesperrt: 1 }])
    updatePartner.mockResolvedValue({ ...activePartner, status: 'pausiert', gesperrt: 0 })
    await render()

    expect(container.querySelector('.admin-partner-locked')).not.toBeNull()
    expect(buttonByText('Aktivieren').disabled).toBe(true)

    await act(async () => buttonByText('Entsperren').click())
    expect(updatePartner).toHaveBeenCalledWith(2, expect.objectContaining({ gesperrt: false, status: 'pausiert' }))
  })
})

describe('AdminPartners – Einblicke', () => {
  // Audit V7a: das Panel heißt "Fotos" und zeigt über den Einblicken die Bannerfotos.
  beforeEach(() => mocks.partnerBanner.mockResolvedValue({ banner: [] }))

  const einblickList = [
    { id: 7, fotoUrl: '/uploads/11111111-2222-3333-4444-555555555555.jpg', datum: '2026-09-01', text: 'Welpenkurs im Park', ausgeblendet: false },
    { id: 8, fotoUrl: '/uploads/66666666-7777-8888-9999-000000000000.png', datum: '2026-08-15', text: null, ausgeblendet: true }
  ]

  test('"Fotos" klappt die Einblicke mit Vorschaubild, Datum und Text auf', async () => {
    partners.mockResolvedValue([activePartner])
    einblicke.mockResolvedValue(einblickList)
    await render()

    const toggle = buttonByText('Fotos')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await act(async () => toggle.click())

    expect(einblicke).toHaveBeenCalledWith(2)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const items = [...container.querySelectorAll('.admin-einblick')]
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('img').getAttribute('src')).toBe(einblickList[0].fotoUrl)
    expect(items[0].textContent).toContain('1. September 2026')
    expect(items[0].textContent).toContain('Welpenkurs im Park')
    expect(items[1].classList.contains('is-hidden')).toBe(true)
    expect(items[1].querySelector('input[role="switch"]').checked).toBe(true)
  })

  test('der Schalter "ausblenden" ruft die API und übernimmt die Antwort', async () => {
    partners.mockResolvedValue([activePartner])
    einblicke.mockResolvedValue(einblickList)
    setEinblickAusgeblendet.mockResolvedValue({ ...einblickList[0], ausgeblendet: true })
    await render()

    await act(async () => buttonByText('Fotos').click())
    const toggle = container.querySelector('.admin-einblick input[role="switch"]')
    expect(toggle.checked).toBe(false)
    await act(async () => toggle.click())

    expect(setEinblickAusgeblendet).toHaveBeenCalledWith(7, true)
    expect(container.querySelector('.admin-einblick').classList.contains('is-hidden')).toBe(true)
    expect(container.querySelector('.admin-einblick input[role="switch"]').checked).toBe(true)
  })

  // Phase V1: Team-Pin für die Partner-Karte in "Entdecken".
  test('der Schalter "anpinnen" setzt einen Team-Pin; ein Partner-Pin ist markiert', async () => {
    partners.mockResolvedValue([activePartner])
    einblicke.mockResolvedValue([{ ...einblickList[0], angepinntVon: 'partner' }, einblickList[1]])
    mocks.setEinblickAngepinnt.mockResolvedValue({ ...einblickList[0], angepinntVon: 'admin' })
    await render()

    await act(async () => buttonByText('Fotos').click())
    const [first, hidden] = [...container.querySelectorAll('.admin-einblick')]
    expect(first.textContent).toContain('vom Partner angepinnt')
    const pin = first.querySelector('.admin-einblick-pin input[role="switch"]')
    expect(pin.checked).toBe(false)
    expect(hidden.querySelector('.admin-einblick-pin input').disabled).toBe(true)
    await act(async () => pin.click())

    expect(mocks.setEinblickAngepinnt).toHaveBeenCalledWith(7, true)
    const updated = container.querySelector('.admin-einblick')
    expect(updated.querySelector('.admin-einblick-pin input').checked).toBe(true)
    expect(updated.textContent).not.toContain('vom Partner angepinnt')
  })

  test('ein Fehler beim Ausblenden erscheint als Alert', async () => {
    partners.mockResolvedValue([activePartner])
    einblicke.mockResolvedValue(einblickList)
    setEinblickAusgeblendet.mockRejectedValue(new Error('Diesen Einblick gibt es nicht'))
    await render()

    await act(async () => buttonByText('Fotos').click())
    await act(async () => container.querySelector('.admin-einblick input[role="switch"]').click())

    expect(container.querySelector('.admin-partner-einblicke [role="alert"]').textContent).toBe('Diesen Einblick gibt es nicht')
  })
})

describe('AdminPartners – Bannerfotos (Audit V7a)', () => {
  const bannerList = [
    { position: 1, fotoUrl: '/uploads/aaaaaaaa-1111-2222-3333-444444444444.jpg', alt: 'Welpen auf der Wiese' },
    { position: 2, fotoUrl: '/uploads/bbbbbbbb-1111-2222-3333-444444444444.png', alt: null }
  ]

  test('"Fotos" zeigt die Bannerfotos; "Entfernen" fragt nach und entfernt ein einzelnes Foto', async () => {
    partners.mockResolvedValue([activePartner])
    einblicke.mockResolvedValue([])
    mocks.partnerBanner.mockResolvedValue({ banner: bannerList })
    mocks.deletePartnerBanner.mockResolvedValue({ banner: [{ ...bannerList[1], position: 1 }] })
    await render()

    await act(async () => buttonByText('Fotos').click())
    expect(mocks.partnerBanner).toHaveBeenCalledWith(2)
    const items = () => [...container.querySelectorAll('.admin-banner-foto')]
    expect(items()).toHaveLength(2)
    expect(items()[0].querySelector('img').getAttribute('src')).toBe(bannerList[0].fotoUrl)
    expect(items()[0].textContent).toContain('Foto 1')
    expect(items()[0].textContent).toContain('Welpen auf der Wiese')
    expect(items()[1].textContent).toContain('ohne Beschreibung')

    const remove = items()[0].querySelector('button')
    expect(remove.getAttribute('aria-label')).toBe('Bannerfoto 1 entfernen')
    await act(async () => remove.click())
    expect(mocks.deletePartnerBanner).not.toHaveBeenCalled()
    await act(async () => items()[0].querySelector('button').click())
    expect(mocks.deletePartnerBanner).toHaveBeenCalledWith(2, 1, bannerList[0].fotoUrl)
    expect(items()).toHaveLength(1)
    expect(items()[0].textContent).toContain('ohne Beschreibung')
  })

  test('ohne Bannerfotos ein ruhiger Hinweis, ein Fehler beim Entfernen erscheint als Alert', async () => {
    partners.mockResolvedValue([activePartner])
    einblicke.mockResolvedValue([])
    mocks.partnerBanner.mockResolvedValue({ banner: [bannerList[0]] })
    mocks.deletePartnerBanner.mockRejectedValue(new Error('Dieses Bannerfoto gibt es nicht'))
    await render()

    await act(async () => buttonByText('Fotos').click())
    const button = () => container.querySelector('.admin-banner-foto button')
    await act(async () => button().click())
    await act(async () => button().click())
    expect(container.querySelector('.admin-partner-banner [role="alert"]').textContent).toBe('Dieses Bannerfoto gibt es nicht')
    expect(container.querySelectorAll('.admin-banner-foto')).toHaveLength(1)
  })

  test('hat sich das Foto inzwischen geändert (409), kommt die aktuelle Liste samt Meldung', async () => {
    partners.mockResolvedValue([activePartner])
    einblicke.mockResolvedValue([])
    mocks.partnerBanner.mockResolvedValueOnce({ banner: bannerList }).mockResolvedValueOnce({ banner: [{ ...bannerList[1], position: 1 }] })
    mocks.deletePartnerBanner.mockRejectedValue(Object.assign(new Error('Das Foto an dieser Stelle hat sich inzwischen geändert'), { status: 409 }))
    await render()

    await act(async () => buttonByText('Fotos').click())
    const button = () => container.querySelector('.admin-banner-foto button')
    await act(async () => button().click())
    await act(async () => button().click())
    expect(container.querySelector('.admin-partner-banner [role="alert"]').textContent).toContain('hat sich inzwischen geändert')
    expect(mocks.partnerBanner).toHaveBeenCalledTimes(2)
    expect(container.querySelectorAll('.admin-banner-foto')).toHaveLength(1)
    expect(container.querySelector('.admin-banner-foto').textContent).toContain('ohne Beschreibung')
  })

  test('ein Partner ohne Bannerfotos: "Keine Bannerfotos."', async () => {
    partners.mockResolvedValue([activePartner])
    einblicke.mockResolvedValue([])
    mocks.partnerBanner.mockResolvedValue({ banner: [] })
    await render()

    await act(async () => buttonByText('Fotos').click())
    expect(container.querySelector('.admin-partner-banner').textContent).toContain('Keine Bannerfotos.')
  })
})
