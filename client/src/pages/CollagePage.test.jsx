// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { listDogs } = vi.hoisted(() => ({ listDogs: vi.fn() }))
vi.mock('../api', () => ({ api: { listDogs } }))

import CollagePage from './CollagePage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { getTheme } from '../themes/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom hat keinen echten Canvas-2D-Context: fürs Titel-Layout im Bearbeiten-Modus reicht ein Fake
// mit fester, kleiner Textbreite (kein Layout-Test hier, nur der Theme-Wortschatz in der Werkzeugleiste).
const fakeContext = { measureText: () => ({ width: 10 }) }

let container
let getContextSpy

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  window.localStorage.clear()
  listDogs.mockReset()
  getContextSpy?.mockRestore()
  getContextSpy = null
})

async function render(themeId, family) {
  listDogs.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider themeId={themeId}>
        <CollagePage family={family} />
      </ThemeProvider>
    )
  )
  return container
}

describe.each(['standard'])('CollagePage im Theme %s', (themeId) => {
  const theme = getTheme(themeId)

  test('Setup-Ansicht nutzt den Theme-Wortschatz für Auswahl-Überschrift und Erstellen-Button', async () => {
    await render(themeId, { id: `setup-${themeId}`, name: 'Beispiel' })
    expect(container.querySelector('.collage-setup h2').textContent).toBe(`1. ${theme.words.animals} auswählen`)
    expect(container.querySelector('.collage-setup .btn-primary').textContent.trim()).toBe(
      `Collage erstellen (0 ${theme.words.animals})`
    )
  })

  test('Audit V7a: ohne Tiere ein Hinweis statt einer leeren Auswahl mit "Alle"/"Keine"', async () => {
    await render(themeId, { id: `leer-${themeId}`, name: 'Beispiel' })
    expect(container.querySelector('.collage-setup .muted').textContent).toContain(`Noch keine ${theme.words.animals}`)
    expect(container.querySelector('.collage-setup .segmented')).toBeNull()
    expect(container.querySelector('.collage-dogs')).toBeNull()
  })

  test('Einleitungstext nennt Tiere/Hunde aus dem Theme-Wortschatz', async () => {
    await render(themeId, { id: `lede-${themeId}`, name: 'Beispiel' })
    expect(container.querySelector('.page-lede').textContent).toContain(`Mehrere ${theme.words.animals}, mehrere Seiten`)
  })

  test('Werkzeugleiste im Bearbeiten-Modus nutzt den Theme-Wortschatz', async () => {
    const family = { id: `edit-${themeId}`, name: 'Beispiel' }
    window.localStorage.setItem(
      `chronik.collageDraft.${family.id}`,
      JSON.stringify({ pages: [{ id: 'p1', title: 'Seite 1', subtitle: '', footer: '', photos: [] }], library: [] })
    )
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext)
    await render(themeId, family)
    const backButton = container.querySelector('.collage-toolbar .btn-ghost')
    expect(backButton.textContent.trim()).toBe(`${theme.words.animals} & Aufteilung`)
  })
})

// Phase V6: Vorlagen, Hintergründe und Sticker im Editor (Entwurf bleibt nur im Browser)
describe('CollagePage: Gestaltung im Editor', () => {
  const photo = (id) => ({ id, url: `/uploads/${id}.jpg`, caption: '', focusX: 0.5, focusY: 0.5, zoom: 1 })
  const family = { id: 'design', name: 'Familie Sonnenhang' }
  // Der Entwurf wird gebündelt gespeichert (kurz nach der letzten Änderung) - Zeit vorspulen, dann lesen
  const storedDraft = () => {
    act(() => vi.advanceTimersByTime(400))
    return JSON.parse(window.localStorage.getItem(`chronik.collageDraft.${family.id}`))
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function renderEditor(page) {
    window.localStorage.setItem(`chronik.collageDraft.${family.id}`, JSON.stringify({ pages: [page], library: [] }))
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext)
    await render('standard', family)
  }

  const stage = () => container.querySelector('.collage-stage .cpage')
  const click = (el) => act(() => el.click())

  test('Vorlage wechseln verteilt dieselben Fotos neu und speichert den Entwurf', async () => {
    await renderEditor({ id: 'p1', title: 'Benno', subtitle: '', footer: '', photos: [photo('a'), photo('b'), photo('c')] })
    expect(stage().querySelectorAll('.cframe')).toHaveLength(3)

    await click(container.querySelector('input[name="collage-layout"][value="polaroid"]'))
    expect(stage().querySelectorAll('.cpolaroid')).toHaveLength(3)
    expect(storedDraft().pages[0].layout).toBe('polaroid')
    expect(storedDraft().pages[0].photos.map((p) => p.id)).toEqual(['a', 'b', 'c'])

    await click(container.querySelector('input[name="collage-background"][value="herzen"]'))
    expect(storedDraft().pages[0].background).toBe('herzen')
    expect(stage().style.backgroundImage).toContain('data:image/svg+xml')
  })

  test('Sticker hinzufügen: liegt auf der Seite, ist ausgewählt und gespeichert', async () => {
    await renderEditor({ id: 'p1', title: 'Benno', subtitle: '', footer: '', photos: [photo('a')] })
    await click([...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Sticker'))
    await click(container.querySelector('[aria-label="Krone hinzufügen"]'))

    const placed = stage().querySelector('[aria-label="Sticker: Krone"]')
    expect(placed.classList.contains('is-selected')).toBe(true)
    expect(container.querySelector('.sticker-selected').textContent).toBe('Krone')
    expect(storedDraft().pages[0].stickers).toHaveLength(1)
    expect(storedDraft().pages[0].stickers[0].sticker).toBe('krone')

    await click([...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sticker entfernen'))
    expect(stage().querySelector('.csticker')).toBeNull()
    expect(storedDraft().pages[0].stickers).toHaveLength(0)
    // der Knopf ist weg - der Fokus landet auf der Seite (mit Namen), nicht im Nichts
    expect(document.activeElement).toBe(stage())
    expect(stage().getAttribute('aria-label')).toBe('Seite 1 von 1: Benno')
  })

  test('Foto in der Vorschau anklicken öffnet den Reiter Fotos', async () => {
    await renderEditor({ id: 'p1', title: 'Benno', subtitle: '', footer: '', photos: [photo('a')] })
    const frame = stage().querySelector('.cframe')
    // jsdom kennt kein PointerEvent - React hört trotzdem auf den Ereignisnamen
    await act(() => frame.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(container.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('Fotos')
    expect(container.textContent).toContain('Ausgewähltes Foto')
  })

  test('ein manipulierter Entwurf lädt mit sicheren Standardwerten', async () => {
    await renderEditor({
      id: 'p1',
      title: 'Benno',
      subtitle: '',
      footer: '',
      layout: 'herz',
      background: 'url(https://evil.test/x.png)',
      photos: [photo('a'), { ...photo('x'), url: 'https://evil.test/x.jpg' }],
      stickers: [{ id: 's1', sticker: '../../evil', x: 0.5, y: 0.5, size: 0.1, rotation: 0 }]
    })
    expect(stage().querySelectorAll('.cframe')).toHaveLength(1)
    expect(stage().querySelector('.csticker')).toBeNull()
    expect(stage().style.backgroundImage).toBe('')
  })
})

test('Entwurf mit inzwischen gelöschtem Tier: Erstellen bleibt gesperrt statt leer zu öffnen', async () => {
  const family = { id: 'stale', name: 'Beispiel' }
  window.localStorage.setItem(`chronik.collageDraft.${family.id}`, JSON.stringify({ selectedIds: [99], pages: [], library: [] }))
  await render('standard', family)
  const button = container.querySelector('.collage-setup .btn-primary')
  expect(button.disabled).toBe(true)
  expect(button.textContent).toContain('(0 ')
})
