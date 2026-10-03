// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import TabBar from './TabBar.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const TABS = [
  { key: 'eins', label: 'Eins' },
  { key: 'zwei', label: 'Zwei' },
  { key: 'drei', label: 'Drei' }
]

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(<TabBar tabs={TABS} current="eins" label="Test" idPrefix="t" panelId="panel" countText={(n) => `${n} offen`} {...props} />)
  )
}

function tab(key) {
  return document.getElementById(`t-${key}`)
}

describe('TabBar', () => {
  test('Zähler nur, wo einer gesetzt ist - mit vorgelesenem Text', async () => {
    await render({ counts: { zwei: 4, drei: null } })

    expect(tab('eins').querySelector('.tab-bar-count')).toBeNull()
    expect(tab('zwei').textContent).toBe('Zwei4 (4 offen)')
    expect(tab('drei').querySelector('.tab-bar-count')).toBeNull()
  })

  test('panelId als Funktion: jeder Reiter steuert sein eigenes Panel', async () => {
    await render({ panelId: (key) => `panel-${key}` })
    expect(TABS.map((item) => tab(item.key).getAttribute('aria-controls'))).toEqual(['panel-eins', 'panel-zwei', 'panel-drei'])
  })

  test('rückt den gewählten Reiter nach dem Laden der Webschrift noch einmal ins Bild (Audit V7a)', async () => {
    let fontsLoaded
    const ready = new Promise((resolve) => {
      fontsLoaded = resolve
    })
    Object.defineProperty(document, 'fonts', { value: { ready }, configurable: true })
    // jsdom rechnet kein Layout: die Leiste ist 300 px breit, "drei" liegt erst nach der Schrift über den Rand hinaus.
    let dreiRight = 280
    const rect = (left, right) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40 })
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.getAttribute('role') === 'tablist') return rect(0, 300)
      if (this.id === 't-drei') return rect(dreiRight - 80, dreiRight)
      return rect(0, 0)
    })
    try {
      await render({ current: 'drei' })
      const list = container.querySelector('[role="tablist"]')
      expect(list.scrollLeft).toBe(0)

      dreiRight = 340
      await act(async () => {
        fontsLoaded()
        await ready
      })
      expect(list.scrollLeft).toBe(340 - 300 + 24)
    } finally {
      spy.mockRestore()
      delete document.fonts
    }
  })

  test('rückt nach, sobald Zähler dazukommen - auch wenn counts vorher schon ein leeres Objekt war (Audit V7a)', async () => {
    let dreiRight = 280
    const rect = (left, right) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40 })
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.getAttribute('role') === 'tablist') return rect(0, 300)
      if (this.id === 't-drei') return rect(dreiRight - 80, dreiRight)
      return rect(0, 0)
    })
    try {
      await render({ current: 'drei', counts: {} })
      const list = container.querySelector('[role="tablist"]')
      expect(list.scrollLeft).toBe(0)

      dreiRight = 330
      await act(async () =>
        root.render(<TabBar tabs={TABS} current="drei" label="Test" idPrefix="t" panelId="panel" countText={(n) => `${n} offen`} counts={{ zwei: 2 }} />)
      )
      expect(list.scrollLeft).toBe(330 - 300 + 24)
    } finally {
      spy.mockRestore()
    }
  })

  test('Pfeiltasten zählen vom fokussierten Reiter - auch wenn der gewählte noch nicht nachgezogen ist', async () => {
    const onSelect = vi.fn()
    await render({ onSelect })

    act(() => tab('eins').focus())
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    // current bleibt "eins" (die Adresse zieht erst später nach), der Fokus steht schon auf "zwei".
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))

    expect(onSelect.mock.calls.map(([key]) => key)).toEqual(['zwei', 'drei'])
    expect(document.activeElement).toBe(tab('drei'))
  })
})
