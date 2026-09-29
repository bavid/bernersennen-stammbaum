// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { demo } = vi.hoisted(() => ({ demo: vi.fn() }))
vi.mock('../api', () => ({ api: { demo } }))

import DemoStartPage from './DemoStartPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  demo.mockReset()
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoStartPage {...props} />
      </MemoryRouter>
    )
  )
  return container
}

const me = { id: 90, name: 'Hundeschule Pfotenglück', art: 'partner', isDemo: true, home: { id: 90 }, memberships: [] }

describe('DemoStartPage – /demo-start', () => {
  test('as=partner&slug ruft api.demo mit beiden Werten und übergibt die Antwort ohne Ziel an App', async () => {
    demo.mockResolvedValue(me)
    const onEntered = vi.fn()
    await render({ search: '?as=partner&slug=hundeschule-pfotenglueck', onEntered })

    expect(demo).toHaveBeenCalledWith({ as: 'partner', slug: 'hundeschule-pfotenglueck' })
    expect(onEntered).toHaveBeenCalledWith(me, null)
    expect(container.querySelector('.error-banner')).toBeNull()
  })

  test('as=rudel und as=tierheim gehen als "as" an den Server, ohne as oder as=zuhause gar nichts', async () => {
    demo.mockResolvedValue(me)
    for (const [search, expected] of [
      ['?as=rudel', { as: 'rudel' }],
      ['?as=tierheim', { as: 'tierheim' }],
      ['?as=zuhause', {}],
      ['', {}]
    ]) {
      demo.mockClear()
      await render({ search, onEntered: vi.fn() })
      expect(demo, search).toHaveBeenCalledWith(expected)
      act(() => root.unmount())
      root = null
      container.remove()
    }
  })

  test('ziel=kundensicht gibt /kundensicht als Ziel mit', async () => {
    demo.mockResolvedValue(me)
    const onEntered = vi.fn()
    await render({ search: '?as=partner&slug=hundeschule-pfotenglueck&ziel=kundensicht', onEntered })
    expect(onEntered).toHaveBeenCalledWith(me, '/kundensicht')
  })

  test('ein unbekannter Wert für as ruft den Server nicht auf und meldet die Adresse als ungültig', async () => {
    const onEntered = vi.fn()
    await render({ search: '?as=admin', onEntered })

    expect(demo).not.toHaveBeenCalled()
    expect(onEntered).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.textContent).toContain('Diese Demo gibt es nicht')
    expect(container.querySelector('a').getAttribute('href')).toBe('/')
  })

  test('404 vom Server: "gerade nicht verfügbar"; andere Fehler zeigen die Meldung des Servers', async () => {
    demo.mockRejectedValue(Object.assign(new Error('Keine Demo verfügbar'), { status: 404 }))
    await render({ search: '?as=tierheim', onEntered: vi.fn() })
    expect(container.textContent).toContain('Diese Demo ist gerade nicht verfügbar.')

    act(() => root.unmount())
    root = null
    container.remove()

    demo.mockRejectedValue(Object.assign(new Error('Zu viele Anfragen'), { status: 429 }))
    await render({ search: '?as=tierheim', onEntered: vi.fn() })
    expect(container.textContent).toContain('Zu viele Anfragen')
  })

  test('solange geladen wird: Status mit Hinweis auf den Schreibschutz', async () => {
    demo.mockReturnValue(new Promise(() => {}))
    await render({ search: '?as=rudel', onEntered: vi.fn() })

    const card = container.querySelector('[role="status"]')
    expect(card.getAttribute('aria-busy')).toBe('true')
    expect(container.textContent).toContain('Demo wird geöffnet …')
    expect(container.textContent).toContain('schreibgeschützt')
  })
})
