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
