// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { partners, createPartner, updatePartner, deletePartner, uploadPartnerLogo } = vi.hoisted(() => ({
  partners: vi.fn(),
  createPartner: vi.fn(),
  updatePartner: vi.fn(),
  deletePartner: vi.fn(),
  uploadPartnerLogo: vi.fn()
}))
vi.mock('../api', () => ({ api: { admin: { partners, createPartner, updatePartner, deletePartner, uploadPartnerLogo } } }))

import AdminPartners from './AdminPartners.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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
  partners.mockReset()
  createPartner.mockReset()
  updatePartner.mockReset()
  deletePartner.mockReset()
  uploadPartnerLogo.mockReset()
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

  test('Pausieren/Aktivieren wechselt den Status und lädt die Liste neu', async () => {
    partners.mockResolvedValue([activePartner])
    updatePartner.mockResolvedValue({ ...activePartner, status: 'pausiert' })
    await render()

    const toggle = [...container.querySelectorAll('.admin-partner-row button')].find((btn) => btn.textContent.trim() === 'Pausieren')
    expect(toggle).not.toBeUndefined()

    partners.mockResolvedValue([{ ...activePartner, status: 'pausiert' }])
    await act(async () => toggle.click())

    expect(updatePartner).toHaveBeenCalledWith(2, { status: 'pausiert' })
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
