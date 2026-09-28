// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { promotions, createPromotion, updatePromotion, deletePromotion, uploadPromotionImage } = vi.hoisted(() => ({
  promotions: vi.fn(),
  createPromotion: vi.fn(),
  updatePromotion: vi.fn(),
  deletePromotion: vi.fn(),
  uploadPromotionImage: vi.fn()
}))
vi.mock('../api', () => ({
  api: { admin: { promotions, createPromotion, updatePromotion, deletePromotion, uploadPromotionImage } }
}))

import AdminPromotions from './AdminPromotions.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const FUTTER_HINT = 'Keine Gesundheitsversprechen (z. B. ‚heilt‘, ‚verhindert Krankheiten‘).'
const EMPFEHLUNG_HINT = 'Nur ohne Gegenleistung – sonst ‚Anzeige‘ wählen.'

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

const partnerList = [
  { id: 3, name: 'Hundeschule Pfotenglück', status: 'aktiv' },
  { id: 4, name: 'Futterhof Deichland', status: 'entwurf' }
]

const anzeige = {
  id: 1,
  partner_id: null,
  bereich: 'futter',
  kennzeichnung: 'Anzeige',
  empfohlen_von: null,
  titel: 'Futterhof Deichland – Probierpaket',
  text: null,
  url: 'https://example.org/probierpaket',
  bildUrl: null,
  tierart: null,
  aktiv: 1,
  start: '2026-05-01',
  ende: '2026-06-30',
  sort: 0,
  is_demo: 0,
  clicks7: 7,
  clicksTotal: 20
}

const empfehlung = {
  ...anzeige,
  id: 2,
  partner_id: 3,
  bereich: 'hundeschule',
  kennzeichnung: 'Empfehlung',
  empfohlen_von: 'Tierheim Sonnenhang',
  titel: 'Welpenkurs im Frühjahr',
  aktiv: 0,
  start: null,
  ende: null,
  clicks7: 0,
  clicksTotal: 3
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
  for (const mock of [promotions, createPromotion, updatePromotion, deletePromotion, uploadPromotionImage]) mock.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminPromotions partners={partnerList} />))
  return container
}

function buttonByText(text, scope = container) {
  return [...scope.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

async function openNewForm() {
  await act(async () => buttonByText('Empfehlung anlegen').click())
  return container.querySelector('.admin-promo-form')
}

const field = (id) => container.querySelector(`#admin-promo-${id}`)

describe('AdminPromotions – Liste', () => {
  test('zeigt Titel, Bereich, Kennzeichnung, aktiv ja/nein, Zeitraum und Klicks (7 Tage / gesamt)', async () => {
    promotions.mockResolvedValue([anzeige, empfehlung])
    await render()

    const rows = [...container.querySelectorAll('.admin-promo-row')]
    expect(rows).toHaveLength(2)

    expect(rows[0].textContent).toContain('Futterhof Deichland – Probierpaket')
    expect(rows[0].textContent).toContain('Futter')
    expect(rows[0].querySelector('.promotion-badge').textContent).toBe('Anzeige')
    expect(rows[0].querySelector('.promotion-badge').classList.contains('promotion-badge-anzeige')).toBe(true)
    expect(rows[0].textContent).toContain('01.05.2026 – 30.06.2026')
    expect(rows[0].querySelector('.admin-promo-status-aktiv').textContent).toBe('ja')
    expect(rows[0].querySelector('.admin-promo-clicks').textContent).toBe('7 / 20')
    expect(rows[0].textContent).toContain('Klicks 7 Tage / gesamt')

    expect(rows[1].querySelector('.promotion-badge').textContent).toBe('Empfehlung von Tierheim Sonnenhang')
    expect(rows[1].textContent).toContain('Hundeschule')
    expect(rows[1].textContent).toContain('unbefristet')
    expect(rows[1].querySelector('.admin-promo-status-inaktiv').textContent).toBe('nein')
    expect(rows[1].querySelector('.admin-promo-clicks').textContent).toBe('0 / 3')
  })

  test('fehlende Klickzahlen werden als 0 gezeigt', async () => {
    const { clicks7, clicksTotal, ...withoutClicks } = anzeige
    promotions.mockResolvedValue([withoutClicks])
    await render()
    expect(container.querySelector('.admin-promo-clicks').textContent).toBe('0 / 0')
  })

  test('leere Liste und Ladefehler', async () => {
    promotions.mockResolvedValue([])
    await render()
    expect(container.textContent).toContain('Noch keine Empfehlungen oder Anzeigen angelegt.')

    act(() => root.unmount())
    container.remove()
    promotions.mockRejectedValue(new Error('Fehler 401'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Fehler 401')
  })

  test('Löschen fragt erst nach (Bestätigung), dann deletePromotion und neu laden', async () => {
    promotions.mockResolvedValue([anzeige])
    deletePromotion.mockResolvedValue(null)
    await render()

    const deleteButton = [...container.querySelectorAll('.admin-promo-row button')].find((btn) => btn.textContent.includes('Löschen'))
    promotions.mockResolvedValue([])
    await act(async () => deleteButton.click())
    expect(deletePromotion).not.toHaveBeenCalled()

    await act(async () => container.querySelector('.admin-promo-row button.is-armed').click())
    expect(deletePromotion).toHaveBeenCalledWith(1)
    expect(promotions).toHaveBeenCalledTimes(2)
  })
})

describe('AdminPromotions – Formular', () => {
  test('legt eine Empfehlung mit allen Feldern an (camelCase-Payload), schließt das Formular und lädt neu', async () => {
    promotions.mockResolvedValue([])
    createPromotion.mockResolvedValue({ ...anzeige, id: 9 })
    await render()
    await openNewForm()

    await act(async () => {
      setInputValue(field('titel'), 'Welpenkurs im Frühjahr')
      setSelectValue(field('bereich'), 'hundeschule')
      setSelectValue(field('kennzeichnung'), 'Partner')
      setSelectValue(field('partner'), '3')
      setSelectValue(field('tierart'), 'hund')
      setInputValue(field('url'), 'https://example.org/welpenkurs')
      setInputValue(field('start'), '2026-10-01')
      setInputValue(field('ende'), '2026-12-31')
      setInputValue(field('sort'), '2')
    })

    promotions.mockResolvedValue([{ ...anzeige, id: 9 }])
    await act(async () => container.querySelector('.admin-promo-form').requestSubmit())

    expect(createPromotion).toHaveBeenCalledWith({
      bereich: 'hundeschule',
      kennzeichnung: 'Partner',
      empfohlenVon: null,
      titel: 'Welpenkurs im Frühjahr',
      text: null,
      url: 'https://example.org/welpenkurs',
      tierart: 'hund',
      partnerId: 3,
      aktiv: true,
      start: '2026-10-01',
      ende: '2026-12-31',
      sort: 2
    })
    expect(container.querySelector('.admin-promo-form')).toBeNull()
    expect(promotions).toHaveBeenCalledTimes(2)
  })

  test('die Partner-Auswahl kommt aus der Partnerliste', async () => {
    promotions.mockResolvedValue([])
    await render()
    await openNewForm()

    const options = [...field('partner').querySelectorAll('option')].map((option) => [option.value, option.textContent])
    expect(options).toEqual([
      ['', 'Kein Partner'],
      ['3', 'Hundeschule Pfotenglück'],
      ['4', 'Futterhof Deichland (Entwurf)']
    ])
  })

  test('eine zuordenbare Server-Meldung erscheint direkt am Feld (aria-invalid), nicht oben', async () => {
    promotions.mockResolvedValue([])
    createPromotion.mockRejectedValue(Object.assign(new Error('Der Link: ungültige Adresse'), { status: 400 }))
    await render()
    await openNewForm()

    await act(async () => setInputValue(field('titel'), 'Welpenkurs'))
    await act(async () => container.querySelector('.admin-promo-form').requestSubmit())

    expect(createPromotion).toHaveBeenCalled()
    expect(container.querySelector('#admin-promo-url-error').textContent).toBe('Der Link: ungültige Adresse')
    expect(field('url').getAttribute('aria-invalid')).toBe('true')
    expect(field('url').getAttribute('aria-describedby')).toContain('admin-promo-url-error')
    expect(container.querySelector('.admin-promo-form .error-banner')).toBeNull()

    // Tippen im Feld nimmt den Fehler wieder weg.
    await act(async () => setInputValue(field('url'), 'https://example.org'))
    expect(container.querySelector('#admin-promo-url-error')).toBeNull()
  })

  test('eine nicht zuordenbare Server-Meldung erscheint oben im Formular', async () => {
    promotions.mockResolvedValue([])
    createPromotion.mockRejectedValue(new Error('Züchter und Zucht-Angebote werden hier nicht aufgenommen.'))
    await render()
    await openNewForm()

    await act(async () => setInputValue(field('titel'), 'Welpenkurs'))
    await act(async () => container.querySelector('.admin-promo-form').requestSubmit())

    expect(container.querySelector('.admin-promo-form .error-banner').textContent).toBe(
      'Züchter und Zucht-Angebote werden hier nicht aufgenommen.'
    )
    expect(container.querySelector('.admin-promo-form .field-error')).toBeNull()
  })

  test('Bereich "Futter" zeigt den Hinweis gegen Gesundheitsversprechen', async () => {
    promotions.mockResolvedValue([])
    await render()
    await openNewForm()

    expect(container.textContent).not.toContain(FUTTER_HINT)
    await act(async () => setSelectValue(field('bereich'), 'futter'))
    expect(container.textContent).toContain(FUTTER_HINT)
    await act(async () => setSelectValue(field('bereich'), 'begleiter'))
    expect(container.textContent).not.toContain(FUTTER_HINT)
  })

  test('Kennzeichnung "Empfehlung" zeigt den Hinweis und macht "Empfohlen von" zur Pflicht', async () => {
    promotions.mockResolvedValue([])
    await render()
    await openNewForm()

    expect(container.textContent).not.toContain(EMPFEHLUNG_HINT)
    expect(field('empfohlen-von').required).toBe(false)

    await act(async () => setSelectValue(field('kennzeichnung'), 'Empfehlung'))
    expect(container.textContent).toContain(EMPFEHLUNG_HINT)
    expect(field('empfohlen-von').required).toBe(true)

    // Ohne "Empfohlen von" geht nichts an den Server - der Fehler steht am Feld.
    await act(async () => setInputValue(field('titel'), 'Welpenkurs'))
    await act(async () => container.querySelector('.admin-promo-form').requestSubmit())
    expect(createPromotion).not.toHaveBeenCalled()
    expect(container.querySelector('#admin-promo-empfohlen-von-error').textContent).toBe('Bei einer Empfehlung ist „Empfehlung von“ Pflicht')

    createPromotion.mockResolvedValue({ ...empfehlung, id: 10 })
    await act(async () => setInputValue(field('empfohlen-von'), 'Tierheim Sonnenhang'))
    await act(async () => container.querySelector('.admin-promo-form').requestSubmit())
    expect(createPromotion).toHaveBeenCalledWith(expect.objectContaining({ kennzeichnung: 'Empfehlung', empfohlenVon: 'Tierheim Sonnenhang' }))
  })

  test('beim Neuanlegen gibt es noch keinen Bild-Upload', async () => {
    promotions.mockResolvedValue([])
    await render()
    await openNewForm()
    expect(container.querySelector('.admin-promo-form input[type="file"]')).toBeNull()
  })

  test('Bearbeiten: vorbefüllt, updatePromotion mit id; Bild-Upload per Tastatur erreichbar', async () => {
    promotions.mockResolvedValue([empfehlung])
    updatePromotion.mockResolvedValue(empfehlung)
    uploadPromotionImage.mockResolvedValue({ bildUrl: '/partner-media/abc.png' })
    await render()

    await act(async () => buttonByText('Bearbeiten').click())
    expect(field('titel').value).toBe('Welpenkurs im Frühjahr')
    expect(field('kennzeichnung').value).toBe('Empfehlung')
    expect(field('empfohlen-von').value).toBe('Tierheim Sonnenhang')
    expect(field('partner').value).toBe('3')
    expect(field('aktiv').checked).toBe(false)

    const fileInput = container.querySelector('.admin-promo-form input[type="file"]')
    expect(fileInput.hasAttribute('hidden')).toBe(false)
    expect(fileInput.tabIndex).not.toBe(-1)

    const file = new File(['x'], 'bild.png', { type: 'image/png' })
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(uploadPromotionImage).toHaveBeenCalledWith(2, file)
    expect(container.querySelector('.admin-promo-form img').getAttribute('src')).toBe('/partner-media/abc.png')
    // Das Bild ist schon gespeichert - die Liste lädt neu, damit ein späteres "Abbrechen" nichts Veraltetes zeigt.
    expect(promotions).toHaveBeenCalledTimes(2)

    await act(async () => container.querySelector('.admin-promo-form').requestSubmit())
    expect(updatePromotion).toHaveBeenCalledWith(2, expect.objectContaining({ titel: 'Welpenkurs im Frühjahr', aktiv: false }))
  })

  test('Abbrechen schließt das Formular ohne zu speichern', async () => {
    promotions.mockResolvedValue([anzeige])
    await render()

    await act(async () => buttonByText('Bearbeiten').click())
    await act(async () => buttonByText('Abbrechen').click())

    expect(container.querySelector('.admin-promo-form')).toBeNull()
    expect(updatePromotion).not.toHaveBeenCalled()
  })
})
