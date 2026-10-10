// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import Lightbox from './Lightbox.jsx'
import EntryPhotos from './EntryPhotos.jsx'
import { SWIPE_THRESHOLD_PX } from '../hooks/useSwipe.js'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PHOTOS = ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg']

let container
let root
let onClose

async function render(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(element))
}

async function open(src, photos = PHOTOS) {
  onClose = vi.fn()
  await render(<Lightbox src={src} photos={photos} onClose={onClose} />)
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
})

const dialog = () => container.querySelector('.lightbox')
const shownSrc = () => container.querySelector('.lightbox img').getAttribute('src')
const prevButton = () => container.querySelector('.lightbox-prev')
const nextButton = () => container.querySelector('.lightbox-next')
const counter = () => container.querySelector('.lightbox-count')

// detail 1 = Klick per Zeiger (Finger/Maus), detail 0 = per Tastatur (Enter/Leertaste auf einem Knopf).
async function click(target, detail = 1) {
  await act(async () => target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail })))
}

async function key(name, modifiers = {}) {
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: name, ...modifiers })))
}

// jsdom kennt kein PointerEvent - React hört auf den Ereignisnamen, ein MouseEvent mit Koordinaten reicht.
// extra: Pointer-Felder, die MouseEvent nicht kennt (isPrimary, pointerId, pointerType).
async function pointer(type, x, y = 100, { buttons = 1, ...extra } = {}) {
  const target = container.querySelector('.lightbox img')
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, buttons })
  for (const [name, value] of Object.entries(extra)) Object.defineProperty(event, name, { value })
  await act(async () => target.dispatchEvent(event))
}

const image = () => container.querySelector('.lightbox img')

// Wie ein Finger: drücken, ziehen, loslassen - danach feuert der Browser noch einen Klick.
async function swipe(fromX, toX, { fromY = 100, toY = 100 } = {}) {
  await pointer('pointerdown', fromX, fromY)
  await pointer('pointermove', (fromX + toX) / 2, (fromY + toY) / 2)
  await pointer('pointerup', toX, toY)
  await click(container.querySelector('.lightbox img'))
}

describe('Lightbox mit einem Foto', () => {
  test('ohne Fotoliste: keine Blätter-Knöpfe und kein Zähler', async () => {
    onClose = vi.fn()
    await render(<Lightbox src="/uploads/x.jpg" onClose={onClose} />)
    expect(shownSrc()).toBe('/uploads/x.jpg')
    expect(prevButton()).toBeNull()
    expect(nextButton()).toBeNull()
    expect(counter()).toBeNull()
  })

  test('Liste mit nur diesem Foto: ebenfalls keine Blätter-Knöpfe', async () => {
    await open('/uploads/a.jpg', ['/uploads/a.jpg'])
    expect(nextButton()).toBeNull()
    expect(counter()).toBeNull()
  })

  test('Foto fehlt in der Liste: zeigt nur dieses Foto', async () => {
    await open('/uploads/x.jpg')
    expect(shownSrc()).toBe('/uploads/x.jpg')
    expect(counter()).toBeNull()
  })

  test('ohne src wird nichts gezeigt', async () => {
    await open(null)
    expect(dialog()).toBeNull()
  })
})

describe('Lightbox mit mehreren Fotos einer Erinnerung', () => {
  test('öffnet beim angeklickten Foto und zeigt die Stelle', async () => {
    await open('/uploads/b.jpg')
    expect(shownSrc()).toBe('/uploads/b.jpg')
    expect(counter().textContent).toContain('2 / 3')
    expect(counter().textContent).toContain('Foto 2 von 3')
  })

  test('Weiter- und Zurück-Knopf blättern, ohne zu schließen', async () => {
    await open('/uploads/b.jpg')
    await click(nextButton())
    expect(shownSrc()).toBe('/uploads/c.jpg')
    await click(prevButton())
    await click(prevButton())
    expect(shownSrc()).toBe('/uploads/a.jpg')
    expect(onClose).not.toHaveBeenCalled()
  })

  test('am Anfang kein Zurück, am Ende kein Weiter', async () => {
    await open('/uploads/a.jpg')
    expect(prevButton()).toBeNull()
    expect(nextButton()).not.toBeNull()
    await click(nextButton())
    await click(nextButton())
    expect(shownSrc()).toBe('/uploads/c.jpg')
    expect(nextButton()).toBeNull()
    expect(prevButton()).not.toBeNull()
  })

  test('Pfeiltasten blättern und bleiben an den Enden stehen, Escape schließt', async () => {
    await open('/uploads/a.jpg')
    await key('ArrowLeft')
    expect(shownSrc()).toBe('/uploads/a.jpg')
    await key('ArrowRight')
    await key('ArrowRight')
    await key('ArrowRight')
    expect(shownSrc()).toBe('/uploads/c.jpg')
    await key('ArrowLeft')
    expect(shownSrc()).toBe('/uploads/b.jpg')
    expect(onClose).not.toHaveBeenCalled()
    await key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('nach links wischen zeigt das nächste, nach rechts das vorige Foto - ohne zu schließen', async () => {
    await open('/uploads/a.jpg')
    await swipe(300, 300 - SWIPE_THRESHOLD_PX - 10)
    expect(shownSrc()).toBe('/uploads/b.jpg')
    await swipe(100, 100 + SWIPE_THRESHOLD_PX + 10)
    expect(shownSrc()).toBe('/uploads/a.jpg')
    expect(onClose).not.toHaveBeenCalled()
  })

  test('Wischen über das Ende hinaus bleibt stehen und schließt nicht', async () => {
    await open('/uploads/c.jpg')
    await swipe(300, 100)
    expect(shownSrc()).toBe('/uploads/c.jpg')
    expect(onClose).not.toHaveBeenCalled()
  })

  test('kurzes Antippen schließt weiterhin', async () => {
    await open('/uploads/a.jpg')
    await swipe(200, 200 - (SWIPE_THRESHOLD_PX - 10))
    expect(shownSrc()).toBe('/uploads/a.jpg')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('überwiegend senkrechte Bewegung blättert nicht', async () => {
    await open('/uploads/a.jpg')
    await swipe(300, 300 - SWIPE_THRESHOLD_PX - 10, { fromY: 100, toY: 300 })
    expect(shownSrc()).toBe('/uploads/a.jpg')
  })

  test('das Foto folgt beim Ziehen dem Finger und springt danach zurück', async () => {
    await open('/uploads/b.jpg')
    await pointer('pointerdown', 300)
    await pointer('pointermove', 260)
    expect(container.querySelector('.lightbox img').style.transform).toBe('translateX(-40px)')
    await pointer('pointerup', 290)
    expect(container.querySelector('.lightbox img').style.transform).toBe('')
  })

  test('neues src von außen startet bei diesem Foto', async () => {
    await open('/uploads/a.jpg')
    await click(nextButton())
    await act(async () => root.render(<Lightbox src="/uploads/c.jpg" photos={PHOTOS} onClose={onClose} />))
    expect(shownSrc()).toBe('/uploads/c.jpg')
  })

  test('Knöpfe und Zähler auf Englisch', async () => {
    setLang('en')
    try {
      await open('/uploads/b.jpg')
      expect(prevButton().getAttribute('aria-label')).toBe('Previous photo')
      expect(nextButton().getAttribute('aria-label')).toBe('Next photo')
      expect(counter().textContent).toContain('Photo 2 of 3')
    } finally {
      setLang('de')
    }
  })
})

describe('Lightbox: Randfälle beim Wischen', () => {
  test('ein zweiter Finger (Zoomen) verschiebt das Foto nicht und blättert nicht', async () => {
    await open('/uploads/b.jpg')
    await pointer('pointerdown', 300, 100, { pointerId: 1 })
    await pointer('pointermove', 100, 100, { pointerId: 2, isPrimary: false })
    expect(image().style.transform).toBe('')
    await pointer('pointerup', 100, 100, { pointerId: 2, isPrimary: false })
    expect(shownSrc()).toBe('/uploads/b.jpg')
    await pointer('pointerup', 300, 100, { pointerId: 1 })
    expect(shownSrc()).toBe('/uploads/b.jpg')
  })

  test('Maus außerhalb losgelassen: ohne gedrückte Taste endet das Ziehen', async () => {
    await open('/uploads/b.jpg')
    await pointer('pointerdown', 300, 100, { pointerType: 'mouse' })
    await pointer('pointermove', 250, 100, { pointerType: 'mouse' })
    expect(image().style.transform).toBe('translateX(-50px)')
    await pointer('pointermove', 200, 100, { pointerType: 'mouse', buttons: 0 })
    expect(image().style.transform).toBe('')
    await pointer('pointermove', 100, 100, { pointerType: 'mouse', buttons: 0 })
    expect(image().style.transform).toBe('')
  })

  test('Wischen mit Folgefoto wechselt sofort, am Ende gleitet das Foto sichtbar zurück', async () => {
    await open('/uploads/b.jpg')
    await swipe(300, 200)
    expect(shownSrc()).toBe('/uploads/c.jpg')
    expect(image().style.transition).toBe('none')
    await swipe(300, 200)
    expect(shownSrc()).toBe('/uploads/c.jpg')
    expect(image().style.transition).toBe('')
  })

  test('nach einem Wischen ohne Folgeklick reagiert ein Tastatur-Klick trotzdem', async () => {
    await open('/uploads/a.jpg')
    await pointer('pointerdown', 300)
    await pointer('pointerup', 200)
    expect(shownSrc()).toBe('/uploads/b.jpg')
    await click(nextButton(), 0)
    expect(shownSrc()).toBe('/uploads/c.jpg')
  })

  test('Pfeiltasten mit Alt, Strg oder Cmd gehören dem Browser', async () => {
    await open('/uploads/a.jpg')
    await key('ArrowRight', { altKey: true })
    await key('ArrowRight', { ctrlKey: true })
    await key('ArrowRight', { metaKey: true })
    expect(shownSrc()).toBe('/uploads/a.jpg')
  })

  test('wird die Fotoliste kürzer, bleibt ein gültiges Foto sichtbar', async () => {
    // Offen bei Foto 3 von 3, dann wird b gelöscht: Stelle 3 gibt es nicht mehr.
    await open('/uploads/c.jpg')
    await act(async () => root.render(<Lightbox src="/uploads/c.jpg" photos={['/uploads/a.jpg', '/uploads/c.jpg']} onClose={onClose} />))
    expect(shownSrc()).toBe('/uploads/c.jpg')
    expect(counter().textContent).toContain('2 / 2')
  })
})

describe('Lightbox: Fokus', () => {
  test('beim Öffnen liegt der Fokus auf Schließen, danach wieder auf dem geöffneten Foto', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    await open('/uploads/a.jpg')
    expect(document.activeElement.getAttribute('aria-label')).toBe('Schließen')
    await act(async () => root.render(<Lightbox src={null} photos={PHOTOS} onClose={onClose} />))
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  test('Tab bleibt in der Lightbox und springt am Ende wieder an den Anfang', async () => {
    await open('/uploads/b.jpg')
    const buttons = [...container.querySelectorAll('.lightbox button')]
    buttons.at(-1).focus()
    await act(async () => buttons.at(-1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(buttons[0])
    await act(async () => buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(buttons.at(-1))
  })
})

describe('EntryPhotos', () => {
  test('gibt beim Öffnen die Fotos der Erinnerung mit', async () => {
    const onOpenPhoto = vi.fn()
    await render(<EntryPhotos urls={PHOTOS} onOpenPhoto={onOpenPhoto} />)
    await click(container.querySelectorAll('.entry-photo')[1])
    expect(onOpenPhoto).toHaveBeenCalledWith('/uploads/b.jpg', PHOTOS)
  })
})
