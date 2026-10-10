// Gemeinsame Test-Hilfen für „Wir waren hier“ (nur von *.test.jsx importiert): rendern, klicken, Dialog-Ersatz.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DemoProvider } from '../../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt showModal/close am <dialog> nicht.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
}

let mounted = null

export async function renderUi(element, { isDemo = false } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={isDemo}>{element}</DemoProvider>
      </MemoryRouter>
    )
  )
  return container
}

export function cleanupUi() {
  if (!mounted) return
  act(() => mounted.root.unmount())
  mounted.container.remove()
  mounted = null
}

export async function click(element) {
  await act(async () => element.click())
}

export function button(container, text) {
  return [...container.querySelectorAll('button')].find((el) => el.textContent.trim() === text || el.getAttribute('aria-label') === text)
}

export async function choose(select, value) {
  await act(async () => {
    select.value = String(value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
