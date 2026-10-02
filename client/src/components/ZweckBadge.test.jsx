// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import ZweckBadge from './ZweckBadge.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

async function badge(batch) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ZweckBadge batch={batch} />))
  return container.textContent
}

test('Besuchs-Einladungen (Phase V2) heißen nicht „Kunden-Gutscheine“', async () => {
  expect(await badge({ zweck: 'besuch' })).toBe('Besuchs-Einladung')
})

test('Chronik-Stapel bleiben Kunden-Gutscheine', async () => {
  expect(await badge({ zweck: 'chronik' })).toBe('Kunden-Gutscheine')
})
