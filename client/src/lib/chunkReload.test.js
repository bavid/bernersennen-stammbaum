import { describe, expect, test, vi } from 'vitest'
import { installChunkReload, reloadAfterChunkError } from './chunkReload.js'

function fakeWindow() {
  const store = new Map()
  const win = new EventTarget()
  win.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value))
  }
  win.location = { reload: vi.fn() }
  return win
}

describe('reloadAfterChunkError', () => {
  test('lädt beim ersten Chunk-Fehler neu', () => {
    const win = fakeWindow()

    expect(reloadAfterChunkError(win, 50_000)).toBe(true)
    expect(win.location.reload).toHaveBeenCalledTimes(1)
  })

  test('lädt innerhalb von 10 s nicht noch einmal neu (keine Schleife), danach wieder', () => {
    const win = fakeWindow()
    reloadAfterChunkError(win, 50_000)

    expect(reloadAfterChunkError(win, 55_000)).toBe(false)
    expect(win.location.reload).toHaveBeenCalledTimes(1)

    expect(reloadAfterChunkError(win, 61_000)).toBe(true)
    expect(win.location.reload).toHaveBeenCalledTimes(2)
  })

  test('ohne nutzbaren sessionStorage wird nicht neu geladen', () => {
    const win = fakeWindow()
    win.sessionStorage.setItem = () => {
      throw new Error('blockiert')
    }

    expect(reloadAfterChunkError(win, 50_000)).toBe(false)
    expect(win.location.reload).not.toHaveBeenCalled()
  })
})

test('installChunkReload lädt bei "vite:preloadError" neu', () => {
  const win = fakeWindow()
  installChunkReload(win)

  win.dispatchEvent(new Event('vite:preloadError'))

  expect(win.location.reload).toHaveBeenCalledTimes(1)
})
