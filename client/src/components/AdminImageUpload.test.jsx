// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import AdminImageUpload from './AdminImageUpload.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminImageUpload label="Bild" buttonLabel="Bild hochladen" upload={vi.fn()} onUploaded={vi.fn()} {...props} />))
  return container
}

describe('AdminImageUpload – Vorschau nur für /partner-media', () => {
  test('ein Bild unter /partner-media wird als Vorschau gezeigt', async () => {
    await render({ imageUrl: '/partner-media/abc.png' })
    expect(container.querySelector('img').getAttribute('src')).toBe('/partner-media/abc.png')
  })

  test.each([['https://example.org/bild.png'], ['javascript:alert(1)'], ['/uploads/abc.png'], [''], [null]])(
    '%s -> kein <img>',
    async (imageUrl) => {
      await render({ imageUrl })
      expect(container.querySelector('img')).toBeNull()
    }
  )

  test('das Datei-Feld bleibt per Tastatur erreichbar (nicht hidden)', async () => {
    await render({ imageUrl: null })
    const input = container.querySelector('input[type="file"]')
    expect(input.hasAttribute('hidden')).toBe(false)
    expect(input.tabIndex).not.toBe(-1)
  })
})
