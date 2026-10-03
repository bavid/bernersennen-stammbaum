// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useCollageEditor } from './useCollageEditor.js'
import { MAX_STICKERS } from '../lib/collage/stickers.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let editor

function Probe({ familyId }) {
  editor = useCollageEditor(familyId)
  return null
}

let root

afterEach(() => {
  if (root) act(() => root.unmount())
  if (container) container.remove()
  root = null
  container = null
  window.localStorage.clear()
  editor = null
  vi.useRealTimers()
})

async function mount(page) {
  window.localStorage.setItem('chronik.collageDraft.f1', JSON.stringify({ pages: [page], library: [] }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<Probe familyId="f1" />))
}

const page = (stickers = []) => ({ id: 'p1', title: 'Benno', subtitle: '', footer: '', photos: [], stickers })

describe('useCollageEditor: Sticker hinzufügen', () => {
  test('schnelles Mehrfach-Klicken (gleiche Darstellung) verliert keinen Sticker', async () => {
    await mount(page())
    const { actions } = editor
    act(() => {
      actions.addSticker('stern')
      actions.addSticker('krone')
      actions.addSticker('sonne')
    })
    expect(editor.page.stickers.map((s) => s.sticker)).toEqual(['stern', 'krone', 'sonne'])
    // jeder neue Sticker liegt ein Stück versetzt, nicht genau auf dem vorigen
    expect(new Set(editor.page.stickers.map((s) => s.x)).size).toBe(3)
    expect(editor.selection).toEqual({ kind: 'sticker', id: editor.page.stickers[2].id })
  })

  test('auch bei schnellen Klicks nie mehr als 30 Sticker', async () => {
    const full = Array.from({ length: MAX_STICKERS - 1 }, (_, i) => ({ id: `s${i}`, sticker: 'stern', x: 0.5, y: 0.5, size: 0.1, rotation: 0 }))
    await mount(page(full))
    const { actions } = editor
    act(() => {
      actions.addSticker('krone')
      actions.addSticker('sonne')
    })
    expect(editor.page.stickers).toHaveLength(MAX_STICKERS)
    expect(editor.page.stickers.at(-1).sticker).toBe('krone')
  })

  test('unbekannte Sticker ändern nichts und wählen nichts aus', async () => {
    await mount(page())
    act(() => editor.actions.addSticker('gibt-es-nicht'))
    expect(editor.page.stickers).toEqual([])
    expect(editor.selection).toBeNull()
  })
})

const stored = () => JSON.parse(window.localStorage.getItem('chronik.collageDraft.f1'))

describe('useCollageEditor: Speichern und Seiten', () => {
  test('speichert gebündelt nach kurzer Pause statt bei jeder Zeigerbewegung', async () => {
    vi.useFakeTimers()
    await mount(page([{ id: 's1', sticker: 'stern', x: 0.5, y: 0.5, size: 0.1, rotation: 0 }]))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    for (let i = 1; i <= 20; i += 1) {
      act(() => editor.actions.updateSticker('s1', { ...editor.page.stickers[0], x: 0.5 + i / 100 }))
    }
    expect(setItem).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(400))
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(stored().pages[0].stickers[0].x).toBeCloseTo(0.7)
    setItem.mockRestore()
  })

  test('beim Verlassen der Seite wird sofort gespeichert', async () => {
    vi.useFakeTimers()
    await mount(page())
    act(() => editor.actions.updatePage({ title: 'Neu' }))
    act(() => root.unmount())
    root = null
    expect(stored().pages[0].title).toBe('Neu')
  })

  test('neue Seite übernimmt Vorlage und Hintergrund der aktuellen und hebt die Auswahl auf', async () => {
    await mount({ ...page(), layout: 'polaroid', background: 'nacht' })
    act(() => editor.select({ kind: 'photo', id: 'x' }))
    act(() => editor.actions.addPage())
    expect(editor.pages).toHaveLength(2)
    expect(editor.pageIndex).toBe(1)
    expect(editor.page).toMatchObject({ title: 'Neue Seite', layout: 'polaroid', background: 'nacht', stickers: [] })
    expect(editor.selection).toBeNull()
    act(() => editor.actions.deletePage())
    expect(editor.pages).toHaveLength(1)
    expect(editor.pageIndex).toBe(0)
  })

  test('volle Seite: Auswahl bleibt beim bisherigen Sticker', async () => {
    const full = Array.from({ length: MAX_STICKERS }, (_, i) => ({ id: `s${i}`, sticker: 'stern', x: 0.5, y: 0.5, size: 0.1, rotation: 0 }))
    await mount(page(full))
    act(() => editor.actions.selectSticker('s3'))
    act(() => editor.actions.addSticker('krone'))
    expect(editor.selection).toEqual({ kind: 'sticker', id: 's3' })
    expect(editor.tab).toBe('sticker')
    act(() => editor.actions.removeSticker('s3'))
    expect(editor.selection).toBeNull()
  })
})
