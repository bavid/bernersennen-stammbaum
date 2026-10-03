// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { config, hinweise } = vi.hoisted(() => ({ config: vi.fn(), hinweise: vi.fn() }))
vi.mock('../api', () => ({ api: { config, hinweise } }))

import TopStrip, { TopStripProvider, TopStripSlot } from './TopStrip.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const WARTUNG = { id: 7, titel: 'Wartung heute Abend', text: 'Ab 22 Uhr.', stufe: 'wartung' }

let container
let root
let setSession

function Session() {
  const [shown, setShown] = useState(true)
  setSession = setShown
  return shown ? (
    <TopStripSlot>
      <div className="demo-banner">Demo</div>
    </TopStripSlot>
  ) : null
}

beforeEach(() => {
  window.sessionStorage.clear()
  config.mockResolvedValue({ appEnv: 'staging' })
  hinweise.mockResolvedValue({ hinweise: [WARTUNG] })
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  config.mockReset()
  hinweise.mockReset()
})

async function render(children) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter>{children}</MemoryRouter>))
}

const strip = () => container.querySelector('.top-strip')

describe('TopStrip – Linie und eine Zeile (Calm-down-Runde)', () => {
  test('Vorschau als Linie mit kurzem Etikett, der ganze Satz für Screenreader; der Hinweis in der Zeile', async () => {
    await render(
      <TopStripProvider>
        <TopStrip />
      </TopStripProvider>
    )
    const env = container.querySelector('.env-banner')
    expect(env.getAttribute('role')).toBe('note')
    expect(env.querySelector('.env-banner-label').textContent).toBe('Vorschau')
    expect(env.querySelector('.visually-hidden').textContent).toContain('regelmäßig zurückgesetzt')
    // Die Linie steht vor der Zeile, der Hinweis in ihr.
    expect(env.nextElementSibling).toBe(strip())
    expect(strip().querySelector('.hinweis-band .hinweis-titel-text').textContent).toBe('Wartung heute Abend')
    expect(strip().classList.contains('has-session')).toBe(false)
    expect(strip().querySelector('.hinweis-band').classList.contains('is-compact')).toBe(false)
  })

  test('ein Sitzungs-Hinweis von weiter unten im Baum landet in derselben Zeile; der Hinweis rückt dann zusammen', async () => {
    await render(
      <TopStripProvider>
        <TopStrip />
        <main>
          <Session />
        </main>
      </TopStripProvider>
    )
    expect(strip().querySelector('.top-strip-session .demo-banner').textContent).toBe('Demo')
    expect(container.querySelector('main .demo-banner')).toBeNull()
    expect(strip().classList.contains('has-session')).toBe(true)
    expect(strip().querySelector('.hinweis-band').classList.contains('is-compact')).toBe(true)

    await act(async () => setSession(false))
    expect(strip().querySelector('.demo-banner')).toBeNull()
    expect(strip().classList.contains('has-session')).toBe(false)
  })

  test('ohne Leiste (einzelne Komponenten, App-Tests) steht der Sitzungs-Hinweis an Ort und Stelle', async () => {
    await render(
      <main>
        <Session />
      </main>
    )
    expect(container.querySelector('main .demo-banner').textContent).toBe('Demo')
  })

  test('Produktion ohne Hinweise: keine Linie, die Zeile bleibt leer', async () => {
    config.mockResolvedValue({ appEnv: 'production' })
    hinweise.mockResolvedValue({ hinweise: [] })
    await render(
      <TopStripProvider>
        <TopStrip />
      </TopStripProvider>
    )
    expect(container.querySelector('.env-banner')).toBeNull()
    expect(strip().textContent).toBe('')
  })
})
