// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'

import CommentThread from '../CommentThread.jsx'
import { DemoProvider } from '../../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function render(element, { isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<DemoProvider value={isDemo}>{element}</DemoProvider>))
}

describe('Gast-Kommentare (security-review V2, L-4)', () => {
  test('neben dem frei eingetippten Namen steht das Zuhause des Gasts', async () => {
    const items = [
      { id: 1, autor_name: 'Familie Nissen', text: 'Von uns', created_at: '2026-09-01T10:00:00Z' },
      { id: 2, autor_name: 'Familie Nissen', text: 'Ich auch', created_at: '2026-09-01T11:00:00Z', gastZuhause: 'Zuhause Möwenweg' }
    ]
    await render(<CommentThread items={items} onAdd={() => {}} onDelete={() => {}} />)
    const metas = [...container.querySelectorAll('.reply-meta')].map((meta) => meta.textContent)
    expect(metas[0]).not.toContain('(Gast)')
    expect(metas[1]).toContain('Familie Nissen · Zuhause Möwenweg (Gast)')
  })
})
