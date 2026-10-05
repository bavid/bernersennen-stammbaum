// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import InstallHint, { INSTALL_TITLE } from './InstallHint.jsx'
import { captureInstallPrompt, resetInstallPromptForTests } from '../lib/install.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function render(props) {
  if (!container) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  act(() => root.render(<InstallHint standalone={false} platform="desktop" {...props} />))
}

function unmount() {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
}

afterEach(() => {
  unmount()
  window.localStorage.clear()
  resetInstallPromptForTests()
})

function fakeWindow() {
  const listeners = {}
  return {
    addEventListener: (type, fn) => {
      listeners[type] = fn
    },
    emit: (type, event) => listeners[type]?.(event)
  }
}

describe('InstallHint: „Als App aufs Handy – ohne App Store“', () => {
  test('Android/Chrome mit Installations-Dialog: der Knopf „App installieren“ öffnet ihn; angenommen -> Karte weg', async () => {
    const win = fakeWindow()
    captureInstallPrompt(win)
    const event = { preventDefault() {}, prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) }
    render({ platform: 'android' })
    act(() => win.emit('beforeinstallprompt', event))

    expect(container.querySelector('h2').textContent).toBe(INSTALL_TITLE)
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'App installieren')
    expect(button).toBeTruthy()
    await act(async () => {
      button.click()
      await Promise.resolve()
    })
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(container.textContent).toBe('')
  })

  test('iPhone ohne Dialog: zwei Schritte „Teilen → Zum Home-Bildschirm“ mit dem Teilen-Symbol', () => {
    render({ platform: 'ios' })
    const steps = container.querySelectorAll('.install-hint-steps li')
    expect(steps).toHaveLength(2)
    expect(steps[0].textContent).toContain('Teilen')
    expect(steps[0].querySelector('svg')).toBeTruthy()
    expect(steps[1].textContent).toContain('Zum Home-Bildschirm')
    expect(container.textContent).toContain('Später auch in den App Stores')
    expect(container.textContent).not.toContain('bald')
  })

  test('schon installiert: die Karte bleibt weg, in den Einstellungen steht „Schon als App installiert“', () => {
    render({ platform: 'ios', standalone: true })
    expect(container.textContent).toBe('')
    unmount()
    render({ variant: 'settings', platform: 'ios', standalone: true })
    expect(container.querySelector('h2').textContent).toBe('Schon als App installiert')
    expect(container.querySelector('.install-hint-later')).toBeNull()
  })

  test('„Später“ blendet die Karte aus und merkt sich das - auch beim nächsten Rendern', () => {
    render({ platform: 'android' })
    const later = container.querySelector('.install-hint-later')
    expect(later.textContent).toBe('Später')
    act(() => later.click())
    expect(container.textContent).toBe('')
    unmount()
    render({ platform: 'android' })
    expect(container.textContent).toBe('')
    // die Einstellungen zeigen den Hinweis trotzdem
    unmount()
    render({ variant: 'settings', platform: 'android' })
    expect(container.querySelector('h2').textContent).toBe(INSTALL_TITLE)
  })

  test('Desktop: Hinweis aufs Handy bzw. das Symbol in der Adressleiste, Überschrift wählbar', () => {
    render({ platform: 'desktop', headingLevel: 'h3' })
    expect(container.querySelector('h3').textContent).toBe(INSTALL_TITLE)
    expect(container.textContent).toContain('Adressleiste')
  })
})
