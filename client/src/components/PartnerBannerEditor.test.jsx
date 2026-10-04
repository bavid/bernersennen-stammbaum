// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { addBanner, replaceBanner, updateBannerAlt, deleteBanner, setBannerLayout } = vi.hoisted(() => ({
  addBanner: vi.fn(),
  replaceBanner: vi.fn(),
  updateBannerAlt: vi.fn(),
  deleteBanner: vi.fn(),
  setBannerLayout: vi.fn()
}))
vi.mock('../api', () => ({ api: { partnerArea: { addBanner, replaceBanner, updateBannerAlt, deleteBanner, setBannerLayout } } }))

import PartnerBannerEditor from './PartnerBannerEditor.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let onChange

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function pickFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}

const jpeg = () => new File(['jpeg-bytes'], 'kopf.jpg', { type: 'image/jpeg' })
const first = { position: 1, fotoUrl: '/uploads/a.jpg', alt: 'Training' }
const second = { position: 2, fotoUrl: '/uploads/b.jpg', alt: '' }

async function render({ banner = [], layout, isDemo = false } = {}) {
  onChange = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <PartnerBannerEditor banner={banner} layout={layout} onChange={onChange} />
      </DemoProvider>
    )
  )
}

function buttonByText(text) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent.trim() === text)
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of [addBanner, replaceBanner, updateBannerAlt, deleteBanner, setBannerLayout]) mock.mockReset()
})

describe('PartnerBannerEditor', () => {
  test('ohne Fotos: Layout-Wahl und ein freier Platz "Foto hinzufügen" - ein JPG wird sofort hochgeladen', async () => {
    addBanner.mockResolvedValue({ banner: [first], layout: 'eins' })
    await render()
    expect(container.querySelector('h2').textContent).toBe('Bannerfotos')
    expect(container.querySelectorAll('.partner-banner-slot:not(.is-empty)')).toHaveLength(0)
    const free = container.querySelector('.partner-banner-slot.is-empty')
    expect(free.textContent).toContain('Foto hinzufügen')
    await pickFile(free.querySelector('input[type="file"]'), jpeg())
    expect(addBanner).toHaveBeenCalledTimes(1)
    const formData = addBanner.mock.calls[0][0]
    expect(formData.get('foto')).toBeInstanceOf(File)
    expect(formData.has('alt')).toBe(false)
    expect(onChange).toHaveBeenCalledWith({ banner: [first], layout: 'eins' })
  })

  test('falscher Dateityp: Hinweis statt Upload; Fehler vom Server stehen im Abschnitt', async () => {
    await render()
    const input = container.querySelector('.partner-banner-slot.is-empty input[type="file"]')
    await pickFile(input, new File(['x'], 'kopf.webp', { type: 'image/webp' }))
    expect(addBanner).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Bitte als JPG oder PNG hochladen.')

    addBanner.mockRejectedValue(new Error('Höchstens 3 Bannerfotos – bitte zuerst eins ersetzen oder entfernen.'))
    await pickFile(input, jpeg())
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/Höchstens 3 Bannerfotos/)
    expect(onChange).not.toHaveBeenCalled()
  })

  test('Layout-Wahl: vier Kacheln als Radio-Gruppe mit Namen; Wählen speichert und meldet { banner, layout }', async () => {
    setBannerLayout.mockResolvedValue({ banner: [first, second], layout: 'drei' })
    await render({ banner: [first, second], layout: 'halb' })
    const fieldset = container.querySelector('fieldset.banner-layout-picker')
    expect(fieldset.querySelector('legend').textContent).toBe('Layout')
    const radios = [...fieldset.querySelectorAll('input[type="radio"]')]
    expect(radios.map((radio) => radio.closest('label').textContent)).toEqual([
      'Ein Foto',
      'Zwei Fotos – halb/halb',
      'Groß links, klein rechts',
      'Drei Fotos'
    ])
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false, false])
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1)
    const labels = [...container.querySelectorAll('.partner-banner-slot-label')].map((el) => el.textContent)
    expect(labels).toEqual(['Foto 1 · links', 'Foto 2 · rechts'])
    await act(async () => radios[3].click())
    expect(setBannerLayout).toHaveBeenCalledWith('drei')
    expect(onChange).toHaveBeenCalledWith({ banner: [first, second], layout: 'drei' })
  })

  test('drei Fotos gewählt, zwei da: der dritte Platz ist frei; zwei Fotos im Layout "Ein Foto": das zweite steht extra', async () => {
    await render({ banner: [first, second], layout: 'drei' })
    const labels = () => [...container.querySelectorAll('.partner-banner-slot-label')].map((el) => el.textContent)
    expect(labels()).toEqual(['Foto 1 · groß links', 'Foto 2 · rechts oben', 'Foto 3 · rechts unten'])
    const free = container.querySelector('.partner-banner-slot.is-empty input')
    expect(free.getAttribute('aria-label')).toBe('Foto 3 · rechts unten hinzufügen')
    act(() => root.unmount())
    root = null
    container.remove()

    await render({ banner: [first, second], layout: 'eins' })
    expect(container.querySelectorAll('.partner-banner-slot.is-empty')).toHaveLength(0)
    expect(container.querySelector('.partner-banner-extra').textContent).toContain('Nicht im Banner – das Layout „Ein Foto“ zeigt weniger Fotos')
    expect(container.querySelectorAll('.partner-banner-extra .partner-banner-slot')).toHaveLength(1)
  })

  test('drei Fotos im Layout "Drei Fotos": kein freier Platz; Vorschau nur für eigene /uploads-Adressen', async () => {
    const third = { position: 3, fotoUrl: '/uploads/c.jpg', alt: '' }
    await render({ banner: [first, second, third, { position: 2, fotoUrl: 'https://example.org/x.jpg', alt: '' }], layout: 'drei' })
    expect(container.querySelectorAll('.partner-banner-slot')).toHaveLength(3)
    expect([...container.querySelectorAll('.partner-banner-thumb')].map((img) => img.getAttribute('src'))).toEqual([
      '/uploads/a.jpg',
      '/uploads/b.jpg',
      '/uploads/c.jpg'
    ])
    expect(container.textContent).not.toContain('hinzufügen')
  })

  test('Kurze Beschreibung: schlichtes Feld ohne Erklärsatz, speichern per Knopf oder Enter, nur wenn geändert', async () => {
    updateBannerAlt.mockResolvedValue({ banner: [{ ...first, alt: 'Welpen am Deich' }], layout: 'eins' })
    await render({ banner: [first] })
    const input = container.querySelector('#partner-banner-alt-1')
    expect(input.value).toBe('Training')
    expect(container.querySelector('label[for="partner-banner-alt-1"]').textContent).toBe('Kurze Beschreibung (optional)')
    expect(input.getAttribute('placeholder')).toBe('z. B. Welpen spielen im Garten')
    expect(container.textContent).not.toMatch(/Alternativtext|Wer ist zu sehen|Für Menschen, die das Bild nicht sehen/)
    // Der Zweck steht nur für Screenreader dabei.
    const note = document.getElementById(input.getAttribute('aria-describedby'))
    expect(note.classList.contains('visually-hidden')).toBe(true)
    expect(buttonByText('Speichern').disabled).toBe(true)
    expect(buttonByText('Speichern').getAttribute('aria-label')).toBe('Beschreibung von Foto 1 speichern')
    await act(async () => setValue(input, ' Welpen am Deich '))
    expect(buttonByText('Speichern').disabled).toBe(false)
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(updateBannerAlt).toHaveBeenCalledWith(1, 'Welpen am Deich')
    expect(onChange).toHaveBeenCalledWith({ banner: [{ ...first, alt: 'Welpen am Deich' }], layout: 'eins' })
  })

  test('Ersetzen schickt das neue Foto samt eingegebenem Text; Entfernen erst nach Bestätigung', async () => {
    replaceBanner.mockResolvedValue({ banner: [{ ...first, fotoUrl: '/uploads/neu.jpg' }], layout: 'eins' })
    deleteBanner.mockResolvedValue({ banner: [], layout: 'eins' })
    await render({ banner: [first] })
    await pickFile(container.querySelector('.partner-banner-slot input[type="file"]'), jpeg())
    expect(replaceBanner).toHaveBeenCalledTimes(1)
    expect(replaceBanner.mock.calls[0][0]).toBe(1)
    expect(replaceBanner.mock.calls[0][1].get('alt')).toBe('Training')
    expect(onChange).toHaveBeenLastCalledWith({ banner: [{ ...first, fotoUrl: '/uploads/neu.jpg' }], layout: 'eins' })

    // Kompakte Knöpfe; Entfernen klar als Löschen (Warnfarbe, Mülleimer) und abgesetzt am Ende der Zeile.
    const actions = container.querySelector('.partner-banner-slot-actions')
    expect(actions.querySelector('label.admin-upload-btn').classList.contains('btn-compact')).toBe(true)
    const remove = container.querySelector('.partner-banner-slot .btn-danger')
    expect([...remove.classList]).toEqual(expect.arrayContaining(['btn-compact', 'btn-quiet', 'btn-end']))
    expect(remove.querySelector('svg')).not.toBeNull()
    expect(actions.lastElementChild).toBe(remove)
    await act(async () => remove.click())
    expect(deleteBanner).not.toHaveBeenCalled()
    await act(async () => remove.click())
    expect(deleteBanner).toHaveBeenCalledWith(1)
    expect(onChange).toHaveBeenLastCalledWith({ banner: [], layout: 'eins' })
  })

  test('Demo: alles sichtbar, nichts änderbar - das Layout lässt sich ansehen und umschalten, ohne zu speichern', async () => {
    await render({ banner: [first], layout: 'halb', isDemo: true })
    expect(container.querySelector('.partner-banner-slot.is-empty input[type="file"]').disabled).toBe(true)
    const radios = [...container.querySelectorAll('.banner-layout-picker input[type="radio"]')]
    await act(async () => radios[3].click())
    expect(setBannerLayout).not.toHaveBeenCalled()
    expect(radios[3].checked).toBe(true)
    const freeLabel = container.querySelector('.partner-banner-slot.is-empty .partner-banner-slot-label')
    expect(freeLabel.textContent).toBe('Foto 2 · rechts oben')
    expect(container.querySelector('.partner-banner-slot input[type="file"]').disabled).toBe(true)
    expect(container.querySelector('#partner-banner-alt-1').disabled).toBe(true)
    expect(container.querySelector('.partner-banner-slot .btn-danger').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })
})
