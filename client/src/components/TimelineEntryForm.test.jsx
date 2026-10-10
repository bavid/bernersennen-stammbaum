// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ upload: vi.fn(), erlebtMitTiere: vi.fn() }))
vi.mock('../api', () => ({ api }))

import TimelineEntryForm from './TimelineEntryForm.jsx'
import useClearDraftsOnSignOut from '../hooks/useClearDraftsOnSignOut.js'
import { DemoProvider } from '../lib/demo.js'
import { todayIso } from '../lib/dates.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function render(props = {}, { isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <TimelineEntryForm onCancel={() => {}} {...props} />
      </DemoProvider>
    )
  )
  return container
}

function unmount() {
  act(() => root.unmount())
  root = null
  container.remove()
  container = null
}

beforeEach(() => {
  window.localStorage.setItem('chronik.autorName', JSON.stringify('Dana'))
})

afterEach(() => {
  if (root) unmount()
  window.localStorage.clear()
  window.sessionStorage.clear()
  Object.values(api).forEach((fn) => fn.mockReset())
})

const field = (name) => container.querySelector(`[name="${name}"]`)
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const submit = () => act(async () => container.querySelector('form').requestSubmit())

function setValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

async function addPhotos(...names) {
  const input = container.querySelector('.foto-feld input[type="file"]')
  const files = names.map((name) => new File(['x'], name, { type: 'image/jpeg' }))
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}

const radio = (label) => [...container.querySelectorAll('.entry-visibility-option')].find((option) => option.textContent === label)?.querySelector('input')

describe('Erinnerung festhalten – Fotos zuerst', () => {
  test('Reihenfolge: Fotofläche, „Was ist passiert?“, Überschrift (optional), Datum', async () => {
    await render()
    const order = [...container.querySelectorAll('.foto-feld, textarea[name="text"], input[name="titel"], .datum-chip')].map((el) => el.name || el.className)
    expect(order).toEqual(['foto-feld is-empty', 'text', 'titel', 'datum-chip'])
    expect(container.querySelector('.foto-feld-add').textContent).toContain('Fotos hinzufügen')
    expect(document.activeElement).toBe(field('text'))
  })

  test('Fotos hochladen, umstellen und entfernen - die Reihenfolge geht so an den Server', async () => {
    api.upload.mockResolvedValueOnce({ url: '/uploads/a.jpg' }).mockResolvedValueOnce({ url: '/uploads/b.jpg' })
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    await addPhotos('a.jpg', 'b.jpg')
    const sources = () => [...container.querySelectorAll('.foto-feld-item img')].map((img) => img.getAttribute('src'))
    expect(sources()).toEqual(['/uploads/a.jpg', '/uploads/b.jpg'])
    await act(async () => container.querySelector('[aria-label="Foto 2 nach vorne"]').click())
    expect(sources()).toEqual(['/uploads/b.jpg', '/uploads/a.jpg'])
    // Der Fokus bleibt beim verschobenen Foto (jetzt vorne, „nach vorne“ ist gesperrt)
    expect(document.activeElement.getAttribute('aria-label')).toBe('Foto 1 nach hinten')
    await act(async () => container.querySelector('[aria-label="Foto 2 entfernen"]').click())
    expect(sources()).toEqual(['/uploads/b.jpg'])
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fotoUrls: ['/uploads/b.jpg'] }))
  })

  test('scheitert ein Foto mittendrin, bleiben die schon hochgeladenen und der Fehler steht oben', async () => {
    api.upload.mockResolvedValueOnce({ url: '/uploads/a.jpg' }).mockRejectedValueOnce(new Error('Datei ist zu groß'))
    await render()
    await addPhotos('a.jpg', 'b.jpg')
    expect([...container.querySelectorAll('.foto-feld-item img')].map((img) => img.getAttribute('src'))).toEqual(['/uploads/a.jpg'])
    expect(container.querySelector('.error-banner').textContent).toBe('Datei ist zu groß')
  })

  test('während ein Foto noch hochlädt, entfernt: es bleibt entfernt', async () => {
    let finish
    api.upload.mockResolvedValueOnce({ url: '/uploads/a.jpg' }).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    await addPhotos('a.jpg')
    await addPhotos('b.jpg')
    await act(async () => container.querySelector('[aria-label="Foto 1 entfernen"]').click())
    await act(async () => finish({ url: '/uploads/b.jpg' }))
    expect([...container.querySelectorAll('.foto-feld-item img')].map((img) => img.getAttribute('src'))).toEqual(['/uploads/b.jpg'])
  })

  test('ein Nicht-Foto wird freundlich abgelehnt', async () => {
    await render()
    const input = container.querySelector('.foto-feld input[type="file"]')
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'brief.pdf', { type: 'application/pdf' })], configurable: true })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(api.upload).not.toHaveBeenCalled()
    expect(container.querySelector('.error-banner').textContent).toBe('Das ist kein Foto – bitte wähle ein Bild.')
  })

  test('Demo: keine Fotofläche zum Hochladen', async () => {
    await render({}, { isDemo: true })
    expect(container.querySelector('.foto-feld input[type="file"]')).toBeNull()
    expect(container.textContent).toContain('Demo: keine Fotos')
  })
})

describe('Erinnerung festhalten – Text, Überschrift, Datum', () => {
  test('ohne Überschrift: der erste Satz wird zur Überschrift (der Server braucht eine)', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    act(() => setValue(field('text'), 'Erster Tag am See. Nele ist sofort hinein.'))
    // Nur der Vorschlag - „sonst: …“ wurde am Handy abgeschnitten (UX-Audit, 390 px).
    expect(field('titel').placeholder).toBe('Erster Tag am See')
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Erster Tag am See', text: 'Erster Tag am See. Nele ist sofort hinein.', autorName: 'Dana', datum: todayIso() })
    )
  })

  test('nur ein Foto: „Erinnerung vom …“', async () => {
    api.upload.mockResolvedValue({ url: '/uploads/a.jpg' })
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    await addPhotos('a.jpg')
    await submit()
    expect(onSubmit.mock.calls[0][0].titel).toMatch(/^Erinnerung vom /)
  })

  test('leer: Fehler direkt am Feld, Fokus dorthin, nichts wird gesendet', async () => {
    const onSubmit = vi.fn()
    await render({ onSubmit })
    field('titel').focus()
    await submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(field('text').getAttribute('aria-invalid')).toBe('true')
    const errorId = field('text').getAttribute('aria-describedby')
    expect(container.querySelector(`[id="${errorId}"]`).textContent).toBe('Erzähl kurz, was passiert ist – oder füge ein Foto hinzu.')
    expect(document.activeElement).toBe(field('text'))
  })

  test('Datum als Chip „Heute“ - ein Tipp öffnet das Datumsfeld', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    const chip = container.querySelector('.entry-chip')
    expect(chip.textContent).toContain('Heute')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    await act(async () => chip.click())
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(field('datum'))
    act(() => setValue(field('datum'), '2026-05-01'))
    expect(chip.textContent).toContain('1. Mai 2026')
    act(() => setValue(field('text'), 'Im Mai'))
    await submit()
    expect(onSubmit.mock.calls[0][0].datum).toBe('2026-05-01')
  })

  test('ohne gemerkten Namen steht „Dein Name“ oben und ist nötig', async () => {
    window.localStorage.clear()
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    act(() => setValue(field('text'), 'Hallo'))
    await submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(field('autorName').getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain('Bitte gib deinen Namen an.')
    act(() => setValue(field('autorName'), 'Mara'))
    // Nur der eigene Fehler verschwindet
    expect(field('autorName').getAttribute('aria-invalid')).toBeNull()
    await submit()
    expect(onSubmit.mock.calls[0][0].autorName).toBe('Mara')
    expect(JSON.parse(window.localStorage.getItem('chronik.autorName'))).toBe('Mara')
  })
})

describe('Erinnerung festhalten – Sichtbarkeit und „Mehr“', () => {
  test('zwei klare Möglichkeiten; „Nur wir (privat)“ schickt privat: true', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ isHousehold: true, shareNames: ['Familie Sonnenhang'], onSubmit })
    expect(radio('Mit Familie Sonnenhang teilen').checked).toBe(true)
    expect(container.querySelector('.entry-visibility .field-hint').textContent).toBe('Sehen auch Familie Sonnenhang und eure Gäste.')
    act(() => radio('Nur wir (privat)').click())
    expect(container.querySelector('.entry-visibility .field-hint').textContent).toBe('Sehen nur die Menschen in eurem Zuhause.')
    act(() => setValue(field('text'), 'Nur für uns'))
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ privat: true }))
  })

  test('geteilt schickt privat: false; ohne Zuhause gibt es keine Wahl (privat: false)', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ isHousehold: true, onSubmit })
    expect(radio('Mit Familie & Gästen teilen').checked).toBe(true)
    act(() => setValue(field('text'), 'Für alle'))
    await submit()
    expect(onSubmit.mock.calls[0][0].privat).toBe(false)
    unmount()
    await render({ onSubmit })
    expect(container.querySelector('.entry-visibility')).toBeNull()
  })

  test('beim Bearbeiten: bisherige Werte, privat gewählt, „Speichern“', async () => {
    await render({ isHousehold: true, entry: { id: 1, titel: 'Alt', text: 'Text', autor_name: 'Dana', datum: '2024-01-01', privat: 1, foto_urls: [] } })
    expect(radio('Nur wir (privat)').checked).toBe(true)
    expect(field('titel').value).toBe('Alt')
    expect(container.querySelector('.entry-chip').textContent).toContain('1. Januar 2024')
    expect(container.querySelector('button[type="submit"]').textContent).toBe('Speichern')
  })

  test('„Mehr“ ist zu: der gemerkte Name steht nur in der Zusammenfassung', async () => {
    await render({ isHousehold: true })
    const toggle = container.querySelector('.mehr-angaben-knopf')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toContain('von Dana')
    expect(field('autorName')).toBeNull()
    act(() => toggle.click())
    expect(field('autorName').value).toBe('Dana')
  })

  test('Tierheim: Kategorie und „Im Steckbrief zeigen“ unter „Mehr“, kein „privat“', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ isShelter: true, onSubmit })
    expect(container.querySelector('.entry-visibility')).toBeNull()
    act(() => container.querySelector('.mehr-angaben-knopf').click())
    const select = field('kategorie')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'ankunft')
    act(() => select.dispatchEvent(new Event('change', { bubbles: true })))
    act(() => field('isPublic').click())
    act(() => setValue(field('text'), 'Angekommen'))
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kategorie: 'ankunft', isPublic: true, privat: false }))
  })

  test('ein Fehler beim Speichern steht oben und bekommt den Fokus', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Foto nicht gefunden'))
    await render({ onSubmit })
    act(() => setValue(field('text'), 'Hallo'))
    await submit()
    const banner = container.querySelector('.error-banner')
    expect(banner.textContent).toBe('Foto nicht gefunden')
    expect(document.activeElement).toBe(banner)
  })
})

describe('Erinnerung festhalten – Entwurf', () => {
  test('aus Versehen geschlossen: beim nächsten Öffnen ist alles wieder da; „Verwerfen“ leert', async () => {
    await render({ draftKey: 'tier-7', isHousehold: true })
    act(() => setValue(field('text'), 'Halb erzählt'))
    act(() => radio('Nur wir (privat)').click())
    unmount()

    await render({ draftKey: 'tier-7', isHousehold: true })
    expect(field('text').value).toBe('Halb erzählt')
    expect(radio('Nur wir (privat)').checked).toBe(true)
    expect(container.querySelector('.entry-draft-notice').textContent).toContain('Euer Entwurf ist noch da.')
    act(() => button('Verwerfen').click())
    expect(field('text').value).toBe('Halb erzählt')
    act(() => button('Wirklich verwerfen?').click())
    expect(field('text').value).toBe('')
    expect(container.querySelector('.entry-draft-notice')).toBeNull()
    unmount()

    await render({ draftKey: 'tier-7', isHousehold: true })
    expect(field('text').value).toBe('')
  })

  test('nach dem Festhalten ist der Entwurf weg; ein anderes Tier hat seinen eigenen', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ draftKey: 'tier-7', onSubmit })
    act(() => setValue(field('text'), 'Fertig erzählt'))
    await submit()
    unmount()
    await render({ draftKey: 'tier-7' })
    expect(field('text').value).toBe('')
    unmount()
    await render({ draftKey: 'tier-8' })
    expect(container.querySelector('.entry-draft-notice')).toBeNull()
  })

  test('endet die Sitzung, ist auch der Entwurf des offenen Formulars weg (es speichert beim Schließen noch einmal)', async () => {
    let signOut
    function Shell() {
      const [signedOut, setSignedOut] = useState(false)
      signOut = () => setSignedOut(true)
      useClearDraftsOnSignOut(signedOut)
      return signedOut ? null : <TimelineEntryForm draftKey="tier-7" onCancel={() => {}} />
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Shell />))
    act(() => setValue(field('text'), 'Persönlich'))
    await act(async () => signOut())
    expect(window.sessionStorage.length).toBe(0)
  })

  test('beim Bearbeiten gibt es keinen Entwurf', async () => {
    await render({ draftKey: 'tier-7', entry: { id: 1, titel: 'Alt', autor_name: 'Dana', datum: '2024-01-01' } })
    act(() => setValue(field('text'), 'Geändert'))
    unmount()
    expect(window.sessionStorage.length).toBe(0)
  })
})
