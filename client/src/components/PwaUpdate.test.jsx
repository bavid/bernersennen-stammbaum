// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import PwaUpdate from './PwaUpdate.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<PwaUpdate {...props} />))
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('PwaUpdate: „Neue Version verfügbar · Neu laden“', () => {
  test('ohne wartende Version steht nichts da - der Service Worker wird aber angemeldet', () => {
    const register = vi.fn()
    render({ register, apply: vi.fn() })
    expect(register).toHaveBeenCalledTimes(1)
    expect(container.textContent).toBe('')
  })

  test('meldet der Worker eine neue Version, erscheint der Hinweis; „Neu laden“ lässt genau diese Version übernehmen', () => {
    const worker = { id: 'neu' }
    let onWaiting
    const register = vi.fn(({ onWaiting: fn }) => {
      onWaiting = fn
    })
    const apply = vi.fn()
    render({ register, apply })
    act(() => onWaiting(worker))

    const status = container.querySelector('[role="status"]')
    expect(status.textContent).toContain('Neue Version verfügbar')
    const button = container.querySelector('button')
    expect(button.textContent).toBe('Neu laden')
    act(() => button.click())
    expect(apply).toHaveBeenCalledWith(worker)
  })
})
