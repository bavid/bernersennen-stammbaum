// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import useDragReorder, { DRAG_THRESHOLD_PX } from './useDragReorder.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let onCommit

// Drei Kacheln nebeneinander, je 100 px breit - die Rechtecke kommen aus einem Ersatz für getBoundingClientRect.
function List({ keys, disabled = false }) {
  const reorder = useDragReorder({ keys, onCommit, disabled, labelFor: (key) => `Foto ${key.toUpperCase()}` })
  return (
    <>
      <p data-live>{reorder.announcement}</p>
      <ul>
        {reorder.order.map((key, index) => (
          <li key={key} ref={reorder.itemRef(key)} data-key={key} className={`tile ${reorder.itemClass(key)}`} style={reorder.itemStyle(key)}>
            <button type="button" data-handle={key} aria-label={`Foto ${key} verschieben – Stelle ${index + 1} von ${keys.length}`} {...reorder.handleProps(key)} />
          </li>
        ))}
      </ul>
    </>
  )
}

function layoutTiles() {
  container.querySelectorAll('li').forEach((li, index) => {
    li.getBoundingClientRect = () => ({ left: index * 100, right: index * 100 + 100, top: 0, bottom: 100 })
  })
}

async function render(keys = ['a', 'b', 'c'], props = {}) {
  onCommit = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<List keys={keys} {...props} />))
  layoutTiles()
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
})

const handle = (key) => container.querySelector(`[data-handle="${key}"]`)
const tile = (key) => container.querySelector(`[data-key="${key}"]`)
const order = () => [...container.querySelectorAll('li')].map((li) => li.dataset.key)
const live = () => container.querySelector('[data-live]').textContent

async function pointer(type, target, x, y) {
  await act(async () => target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })))
}

async function key(target, name) {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })))
}

describe('useDragReorder – Zeiger', () => {
  test('unter der Schwelle passiert nichts, danach zieht der Eintrag als Geist mit und das Ziel ist markiert', async () => {
    await render()
    await pointer('pointerdown', handle('a'), 50, 50)
    await pointer('pointermove', handle('a'), 50 + DRAG_THRESHOLD_PX - 1, 50)
    expect(tile('a').classList.contains('is-dragging')).toBe(false)
    await pointer('pointermove', handle('a'), 150, 50)
    expect(tile('a').classList.contains('is-dragging')).toBe(true)
    expect(tile('a').style.transform).toBe('translate(100px, 0px)')
    expect(tile('b').classList.contains('is-drop-target')).toBe(true)
    expect(order()).toEqual(['a', 'b', 'c'], 'die Liste bleibt beim Ziehen stehen')
    await pointer('pointerup', handle('a'), 150, 50)
    expect(onCommit).toHaveBeenCalledWith(['b', 'a', 'c'], { from: 0, to: 1 })
    expect(tile('a').classList.contains('is-dragging')).toBe(false)
    expect(live()).toBe('Foto A liegt jetzt an Stelle 2 von 3.')
  })

  test('ein Klick ohne Bewegung und ein Ablegen am Startplatz ändern nichts', async () => {
    await render()
    await pointer('pointerdown', handle('b'), 150, 50)
    await pointer('pointerup', handle('b'), 150, 50)
    await pointer('pointerdown', handle('b'), 150, 50)
    await pointer('pointermove', handle('b'), 180, 50)
    expect(tile('b').classList.contains('is-dragging')).toBe(true)
    expect(container.querySelector('.is-drop-target')).toBeNull()
    await pointer('pointerup', handle('b'), 180, 50)
    expect(onCommit).not.toHaveBeenCalled()
  })

  test('Escape bricht das Ziehen ab; gesperrt startet nichts', async () => {
    await render()
    await pointer('pointerdown', handle('a'), 50, 50)
    await pointer('pointermove', handle('a'), 250, 50)
    expect(tile('c').classList.contains('is-drop-target')).toBe(true)
    await key(window, 'Escape')
    expect(container.querySelector('.is-dragging')).toBeNull()
    await pointer('pointerup', handle('a'), 250, 50)
    expect(onCommit).not.toHaveBeenCalled()
    expect(live()).toBe('Verschieben abgebrochen.')

    act(() => root.unmount())
    root = null
    container.remove()
    await render(['a', 'b', 'c'], { disabled: true })
    await pointer('pointerdown', handle('a'), 50, 50)
    await pointer('pointermove', handle('a'), 250, 50)
    expect(container.querySelector('.is-dragging')).toBeNull()
  })
})

describe('useDragReorder – Tastatur', () => {
  test('Leertaste nimmt auf, Pfeile verschieben in der Vorschau, Leertaste legt ab', async () => {
    await render()
    await key(handle('a'), ' ')
    expect(handle('a').getAttribute('aria-grabbed')).toBe('true')
    expect(tile('a').classList.contains('is-grabbed')).toBe(true)
    expect(live()).toMatch(/^Foto A aufgenommen\./)
    await key(handle('a'), 'ArrowRight')
    expect(order()).toEqual(['b', 'a', 'c'])
    expect(live()).toBe('Foto A – Stelle 2 von 3')
    await key(handle('a'), 'End')
    expect(order()).toEqual(['b', 'c', 'a'])
    await key(handle('a'), 'ArrowRight')
    expect(order()).toEqual(['b', 'c', 'a'], 'am Ende bleibt es')
    expect(onCommit).not.toHaveBeenCalled()
    await key(handle('a'), ' ')
    expect(onCommit).toHaveBeenCalledWith(['b', 'c', 'a'], { from: 0, to: 2 })
    expect(handle('a').getAttribute('aria-grabbed')).toBe('false')
  })

  test('Escape stellt die alte Reihenfolge wieder her; Pfeile ohne Aufnehmen tun nichts', async () => {
    await render()
    await key(handle('c'), 'ArrowLeft')
    expect(order()).toEqual(['a', 'b', 'c'])
    await key(handle('c'), 'Enter')
    await key(handle('c'), 'Home')
    expect(order()).toEqual(['c', 'a', 'b'])
    await key(handle('c'), 'Escape')
    expect(order()).toEqual(['a', 'b', 'c'])
    expect(onCommit).not.toHaveBeenCalled()
  })
})
