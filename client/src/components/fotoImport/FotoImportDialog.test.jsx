// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

vi.mock('../../api', () => ({ api: {} }))

import FotoImportDialog from './FotoImportDialog.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { jpegWithExifDate } from '../../lib/fotoImport/testJpeg.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function close() {
      this.open = false
    }
  }
  URL.createObjectURL = vi.fn(() => 'blob:vorschau')
  URL.revokeObjectURL = vi.fn()
  window.localStorage.setItem('chronik.autorName', JSON.stringify('Wilma'))
})

let container
let root

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  window.localStorage.clear()
  window.localStorage.setItem('chronik.autorName', JSON.stringify('Wilma'))
})

function fakeDeps() {
  return {
    prepare: vi.fn(async (item) => item.name),
    api: {
      upload: vi.fn(async (name) => ({ url: `/uploads/${name.replace(/\W/g, '')}.jpg` })),
      createTimelineEntry: vi.fn(async (payload) => ({ id: payload.datum, ...payload }))
    }
  }
}

async function render({ isDemo = false, deps = fakeDeps(), onCreated = vi.fn() } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <FotoImportDialog dogId={3} isHousehold shareNames={[]} deps={deps} onCreated={onCreated} onClose={() => {}} />
      </DemoProvider>
    )
  )
  return { deps, onCreated }
}

const photos = () => [
  new File([jpegWithExifDate('2024:04:01 10:00:00')], 'benno1.jpg', { type: 'image/jpeg' }),
  new File([jpegWithExifDate('2024:04:01 11:00:00')], 'benno2.jpg', { type: 'image/jpeg' }),
  new File([jpegWithExifDate('2024:04:03 09:00:00')], 'pepper.jpg', { type: 'image/jpeg' })
]

async function pickFiles(files) {
  const input = container.ownerDocument.querySelector('input[type=file][accept="image/*"]')
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await settle()
}

// FileReader (jsdom) und das Hochladen laufen über mehrere Makrotasks.
async function settle() {
  for (let i = 0; i < 10; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text)

describe('FotoImportDialog', () => {
  test('gruppiert je Tag und legt nach dem Start je Tag eine Erinnerung an', async () => {
    const { deps, onCreated } = await render()
    await pickFiles(photos())
    expect(document.querySelectorAll('.foto-import-day')).toHaveLength(2)
    expect(document.body.textContent).toContain('3 Fotos · 2 Erinnerungen')
    // ein Foto abwählen
    await act(async () => document.querySelectorAll('.foto-import-thumb input')[1].click())
    expect(document.body.textContent).toContain('2 Fotos · 2 Erinnerungen')
    await act(async () => button('Erinnerungen anlegen').click())
    await settle()
    expect(deps.api.upload).toHaveBeenCalledTimes(2)
    expect(deps.api.createTimelineEntry.mock.calls.map(([p]) => [p.datum, p.fotoUrls.length, p.privat, p.autorName])).toEqual([
      ['2024-04-01', 1, false, 'Wilma'],
      ['2024-04-03', 1, false, 'Wilma']
    ])
    expect(deps.api.createTimelineEntry.mock.calls[0][0].titel).toBe('Fotos vom 1. April 2024')
    expect(onCreated).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: '2024-04-01' })]))
    expect(document.body.textContent).toContain('2 Erinnerungen angelegt.')
  })

  test('Demo: Ablauf ansehen ja, hochladen nie', async () => {
    const { deps } = await render({ isDemo: true })
    await pickFiles(photos())
    expect(document.body.textContent).toContain('In der Demo könnt ihr den Ablauf ansehen')
    expect(button('Erinnerungen anlegen')).toBeUndefined()
    expect(deps.api.upload).not.toHaveBeenCalled()
    expect(deps.api.createTimelineEntry).not.toHaveBeenCalled()
  })

  test('ohne Fotos ein klarer Hinweis', async () => {
    await render()
    await pickFiles([new File(['x'], 'liste.txt', { type: 'text/plain' })])
    expect(document.body.textContent).toContain('Darin haben wir keine Fotos gefunden.')
  })
})
