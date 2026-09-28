// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

const { config } = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock('../api', () => ({ api: { config } }))

import EnvBanner from './EnvBanner.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => createRoot(container).render(<EnvBanner />))
}

afterEach(() => {
  container?.remove()
  config.mockReset()
})

test('the preview shows a banner that data gets reset', async () => {
  config.mockResolvedValue({ appEnv: 'staging' })
  await render()
  expect(container.textContent).toContain('Vorschau')
})

test('the local test environment is marked, too', async () => {
  config.mockResolvedValue({ appEnv: 'dev' })
  await render()
  expect(container.textContent).toContain('Testsystem')
})

test('production shows nothing, and a failing request shows nothing either', async () => {
  config.mockResolvedValue({ appEnv: 'production' })
  await render()
  expect(container.textContent).toBe('')
  container.remove()
  config.mockRejectedValue(new Error('offline'))
  await render()
  expect(container.textContent).toBe('')
})
