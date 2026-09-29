// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import EinblickeGallery from './EinblickeGallery.jsx'
import { PreviewProvider } from '../lib/preview.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) - die große Ansicht läuft im Modal.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

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

const einblicke = [
  { id: 3, fotoUrl: '/public-media/33333333-3333-3333-3333-333333333333.jpg', datum: '2026-09-12', text: 'Erster Tag im Agility-Kurs' },
  { id: 2, fotoUrl: '/public-media/22222222-2222-2222-2222-222222222222.jpg', datum: '2026-08-30', text: null },
  { id: 1, fotoUrl: '/public-media/11111111-1111-1111-1111-111111111111.png', datum: '2026-07-04', text: 'Sommerfest mit der ganzen Gruppe' }
]

async function render(items, { preview = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <PreviewProvider value={preview}>
        <EinblickeGallery einblicke={items} />
      </PreviewProvider>
    )
  )
  return container
}

function dialog() {
  return container.querySelector('dialog')
}

async function pressKey(key) {
  await act(async () => {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('EinblickeGallery – Raster', () => {
  test('zeigt die Sektion "Einblicke" mit Foto, deutschem Datum und Text, neueste zuerst', async () => {
    await render(einblicke)

    expect(container.querySelector('#portal-einblicke-title').textContent).toBe('Einblicke')
    const tiles = [...container.querySelectorAll('.einblick-tile')]
    expect(tiles).toHaveLength(3)
    expect(tiles[0].querySelector('time').textContent).toBe('12. September 2026')
    expect(tiles[0].querySelector('time').getAttribute('dateTime')).toBe('2026-09-12')
    expect(tiles[0].textContent).toContain('Erster Tag im Agility-Kurs')
  })

  test('Bilder laden lazy, mit festen Maßen und Alternativtext aus dem Text bzw. "Einblick vom <Datum>"', async () => {
    await render(einblicke)

    const images = [...container.querySelectorAll('.einblick-tile img')]
    expect(images.map((img) => img.getAttribute('alt'))).toEqual([
      'Erster Tag im Agility-Kurs',
      'Einblick vom 30. August 2026',
      'Sommerfest mit der ganzen Gruppe'
    ])
    for (const img of images) {
      expect(img.getAttribute('loading')).toBe('lazy')
      expect(img.getAttribute('width')).toBe('400')
      expect(img.getAttribute('height')).toBe('300')
    }
  })

  test('ohne (gültige) Einblicke keine Sektion; fremde Adressen und /uploads fallen öffentlich heraus', async () => {
    await render([
      { id: 5, fotoUrl: 'https://example.org/x.jpg', datum: '2026-09-01', text: 'fremd' },
      { id: 6, fotoUrl: '/uploads/66666666-6666-6666-6666-666666666666.jpg', datum: '2026-09-01', text: 'Entwurf' }
    ])
    expect(container.querySelector('.partner-portal-einblicke')).toBeNull()
  })

  test('in der Kundensicht erscheinen auch die eigenen Fotos über /uploads', async () => {
    await render([{ id: 6, fotoUrl: '/uploads/66666666-6666-6666-6666-666666666666.jpg', datum: '2026-09-01', text: 'Entwurf' }], { preview: true })
    expect(container.querySelector('.einblick-tile img').getAttribute('src')).toBe('/uploads/66666666-6666-6666-6666-666666666666.jpg')
  })
})

describe('EinblickeGallery – große Ansicht', () => {
  test('ein Klick öffnet den Dialog mit dem Foto, Text und "1 von 3"', async () => {
    await render(einblicke)

    const trigger = container.querySelectorAll('.einblick-tile-open')[0]
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    await act(async () => trigger.click())

    expect(dialog().open).toBe(true)
    expect(dialog().querySelector('#modal-title').textContent).toBe('Einblick vom 12. September 2026')
    expect(dialog().querySelector('.einblick-viewer-photo').getAttribute('src')).toBe(einblicke[0].fotoUrl)
    expect(dialog().querySelector('.einblick-viewer-text').textContent).toBe('Erster Tag im Agility-Kurs')
    expect(dialog().querySelector('.einblick-viewer-count').textContent).toBe('1 von 3')
  })

  test('Pfeiltasten blättern vor und zurück (am Ende geht es wieder von vorn los)', async () => {
    await render(einblicke)
    await act(async () => container.querySelectorAll('.einblick-tile-open')[1].click())
    expect(dialog().querySelector('.einblick-viewer-count').textContent).toBe('2 von 3')

    await pressKey('ArrowRight')
    expect(dialog().querySelector('.einblick-viewer-count').textContent).toBe('3 von 3')
    expect(dialog().querySelector('.einblick-viewer-photo').getAttribute('src')).toBe(einblicke[2].fotoUrl)

    await pressKey('ArrowRight')
    expect(dialog().querySelector('.einblick-viewer-count').textContent).toBe('1 von 3')

    await pressKey('ArrowLeft')
    expect(dialog().querySelector('.einblick-viewer-count').textContent).toBe('3 von 3')
  })

  test('"Vorheriger"/"Nächster" blättern ebenfalls', async () => {
    await render(einblicke)
    await act(async () => container.querySelectorAll('.einblick-tile-open')[0].click())

    const button = (label) => [...dialog().querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
    await act(async () => button('Nächster').click())
    expect(dialog().querySelector('#modal-title').textContent).toBe('Einblick vom 30. August 2026')
    // Ohne Text: kein leerer Absatz, der Alternativtext kommt aus dem Datum.
    expect(dialog().querySelector('.einblick-viewer-text')).toBeNull()
    expect(dialog().querySelector('.einblick-viewer-photo').getAttribute('alt')).toBe('Einblick vom 30. August 2026')

    await act(async () => button('Vorheriger').click())
    expect(dialog().querySelector('.einblick-viewer-count').textContent).toBe('1 von 3')
  })

  test('Escape schließt den Dialog, der Fokus kehrt zum angeklickten Foto zurück', async () => {
    await render(einblicke)
    const trigger = container.querySelectorAll('.einblick-tile-open')[2]
    trigger.focus()
    await act(async () => trigger.click())
    dialog().querySelector('button').focus()

    await pressKey('Escape')

    expect(dialog().open).toBe(false)
    expect(dialog().querySelector('.einblick-viewer')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  test('"Schließen" schließt ebenfalls; Pfeiltasten wirken danach nicht mehr', async () => {
    await render(einblicke)
    await act(async () => container.querySelectorAll('.einblick-tile-open')[0].click())
    await act(async () => dialog().querySelector('button[aria-label="Schließen"]').click())
    expect(dialog().open).toBe(false)

    await pressKey('ArrowRight')
    expect(dialog().open).toBe(false)
  })

  test('mit nur einem Einblick gibt es kein Blättern', async () => {
    await render([einblicke[0]])
    await act(async () => container.querySelector('.einblick-tile-open').click())
    expect(dialog().querySelector('.einblick-viewer-nav')).toBeNull()
  })
})
