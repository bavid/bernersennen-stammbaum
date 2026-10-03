// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { addBanner, replaceBanner, updateBannerAlt, deleteBanner } = vi.hoisted(() => ({
  addBanner: vi.fn(),
  replaceBanner: vi.fn(),
  updateBannerAlt: vi.fn(),
  deleteBanner: vi.fn()
}))
vi.mock('../api', () => ({ api: { partnerArea: { addBanner, replaceBanner, updateBannerAlt, deleteBanner } } }))

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

async function render({ banner = [], isDemo = false } = {}) {
  onChange = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <PartnerBannerEditor banner={banner} onChange={onChange} />
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
  for (const mock of [addBanner, replaceBanner, updateBannerAlt, deleteBanner]) mock.mockReset()
})

describe('PartnerBannerEditor', () => {
  test('ohne Fotos: Hinweis und "Bannerfoto hinzufügen" - ein JPG wird sofort hochgeladen', async () => {
    addBanner.mockResolvedValue({ banner: [first] })
    await render()
    expect(container.querySelector('h2').textContent).toBe('Bannerfotos')
    expect(container.querySelector('.partner-banner-list')).toBeNull()
    const label = container.querySelector('.partner-banner-editor > label.admin-upload-btn')
    expect(label.textContent).toContain('Bannerfoto hinzufügen')
    await pickFile(label.querySelector('input[type="file"]'), jpeg())
    expect(addBanner).toHaveBeenCalledTimes(1)
    const formData = addBanner.mock.calls[0][0]
    expect(formData.get('foto')).toBeInstanceOf(File)
    expect(formData.has('alt')).toBe(false)
    expect(onChange).toHaveBeenCalledWith([first])
  })

  test('falscher Dateityp: Hinweis statt Upload; Fehler vom Server stehen im Abschnitt', async () => {
    await render()
    const input = container.querySelector('.partner-banner-editor > label input[type="file"]')
    await pickFile(input, new File(['x'], 'kopf.webp', { type: 'image/webp' }))
    expect(addBanner).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Bitte als JPG oder PNG hochladen.')

    addBanner.mockRejectedValue(new Error('Höchstens 2 Bannerfotos – bitte zuerst eins ersetzen oder entfernen.'))
    await pickFile(input, jpeg())
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/Höchstens 2 Bannerfotos/)
    expect(onChange).not.toHaveBeenCalled()
  })

  test('zwei Fotos: kein weiteres Hinzufügen; Vorschau nur für eigene /uploads-Adressen', async () => {
    await render({ banner: [first, second, { position: 2, fotoUrl: 'https://example.org/x.jpg', alt: '' }] })
    const slots = container.querySelectorAll('.partner-banner-slot')
    expect(slots).toHaveLength(2)
    expect([...container.querySelectorAll('.partner-banner-thumb')].map((img) => img.getAttribute('src'))).toEqual(['/uploads/a.jpg', '/uploads/b.jpg'])
    expect(container.textContent).not.toContain('hinzufügen')
  })

  test('Alternativtext: speichern per Knopf oder Enter, nur wenn geändert', async () => {
    updateBannerAlt.mockResolvedValue({ banner: [{ ...first, alt: 'Welpen am Deich' }] })
    await render({ banner: [first] })
    const input = container.querySelector('#partner-banner-alt-1')
    expect(input.value).toBe('Training')
    expect(buttonByText('Text speichern').disabled).toBe(true)
    await act(async () => setValue(input, ' Welpen am Deich '))
    expect(buttonByText('Text speichern').disabled).toBe(false)
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(updateBannerAlt).toHaveBeenCalledWith(1, 'Welpen am Deich')
    expect(onChange).toHaveBeenCalledWith([{ ...first, alt: 'Welpen am Deich' }])
  })

  test('Ersetzen schickt das neue Foto samt eingegebenem Text; Entfernen erst nach Bestätigung', async () => {
    replaceBanner.mockResolvedValue({ banner: [{ ...first, fotoUrl: '/uploads/neu.jpg' }] })
    deleteBanner.mockResolvedValue({ banner: [] })
    await render({ banner: [first] })
    await pickFile(container.querySelector('.partner-banner-slot input[type="file"]'), jpeg())
    expect(replaceBanner).toHaveBeenCalledTimes(1)
    expect(replaceBanner.mock.calls[0][0]).toBe(1)
    expect(replaceBanner.mock.calls[0][1].get('alt')).toBe('Training')
    expect(onChange).toHaveBeenLastCalledWith([{ ...first, fotoUrl: '/uploads/neu.jpg' }])

    const remove = container.querySelector('.partner-banner-slot .btn-danger')
    await act(async () => remove.click())
    expect(deleteBanner).not.toHaveBeenCalled()
    await act(async () => remove.click())
    expect(deleteBanner).toHaveBeenCalledWith(1)
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  test('Demo: alles sichtbar, nichts änderbar - mit Hinweis', async () => {
    await render({ banner: [first], isDemo: true })
    expect(container.querySelector('.partner-banner-editor > label input[type="file"]').disabled).toBe(true)
    expect(container.querySelector('.partner-banner-slot input[type="file"]').disabled).toBe(true)
    expect(container.querySelector('#partner-banner-alt-1').disabled).toBe(true)
    expect(container.querySelector('.partner-banner-slot .btn-danger').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })
})
