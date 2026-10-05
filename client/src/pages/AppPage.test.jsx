// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api', () => ({ api: {} }))

import AppPage from './AppPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { captureInstallPrompt, resetInstallPromptForTests } from '../lib/install.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/app']}>
        <ThemeProvider>
          <AppPage standalone={false} platform="desktop" {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  resetInstallPromptForTests()
})

const selectedTab = () => container.querySelector('[role="tab"][aria-selected="true"]')?.textContent
const panelTitle = () => container.querySelector('#app-guide-panel h3')?.textContent

describe('AppPage: /app „Als App aufs Handy“', () => {
  test('das erkannte Gerät steht zuerst - iPhone zeigt Teilen → Zum Home-Bildschirm samt den Hinweisen', () => {
    render({ platform: 'ios' })
    expect(container.querySelector('h1').textContent).toBe('Als App aufs Handy')
    expect(selectedTab()).toBe('iPhone & iPad')
    expect(panelTitle()).toBe('iPhone & iPad (Safari)')
    const steps = [...container.querySelectorAll('.app-guide-steps li')].map((li) => li.textContent)
    expect(steps).toHaveLength(3)
    expect(steps[0]).toContain('Teilen-Symbol')
    expect(steps[2]).toContain('Zum Home-Bildschirm')
    expect(container.textContent).toContain('in Safari öffnen')
    expect(container.textContent).toContain('Später auch in den App Stores')
    expect(container.textContent).not.toMatch(/bald/)
  })

  test('Android zuerst; die Reiter wechseln das Gerät', () => {
    render({ platform: 'android' })
    expect(selectedTab()).toBe('Android')
    act(() => container.querySelector('#app-guide-desktop').click())
    expect(selectedTab()).toBe('PC & Laptop')
    expect(panelTitle()).toContain('PC & Laptop')
  })

  test('schon installiert (standalone): Status statt Knopf', () => {
    render({ platform: 'android', standalone: true })
    expect(container.querySelector('[role="status"]').textContent).toContain('Schon installiert')
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'App installieren')).toBe(false)
  })

  test('bietet der Browser den Dialog an, gibt es den Knopf „App installieren“', async () => {
    const listeners = {}
    captureInstallPrompt({ addEventListener: (type, fn) => (listeners[type] = fn) })
    render({ platform: 'android' })
    const event = { preventDefault() {}, prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) }
    act(() => listeners.beforeinstallprompt(event))
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'App installieren')
    expect(button).toBeTruthy()
    await act(async () => {
      button.click()
      await Promise.resolve()
    })
    expect(event.prompt).toHaveBeenCalled()
    expect(container.querySelector('[role="status"]').textContent).toContain('Schon installiert')
  })

  test('angemeldet als Zuhause: Link zu Einstellungen › App; ohne Sitzung nicht', () => {
    render({ family: { id: 1, art: 'zuhause', home: { id: 1, art: 'zuhause' } } })
    expect(container.querySelector('a[href="/einstellungen?bereich=app"]')).not.toBeNull()
    act(() => root.unmount())
    container.remove()
    render({ family: null })
    expect(container.querySelector('a[href="/einstellungen?bereich=app"]')).toBeNull()
  })
})
