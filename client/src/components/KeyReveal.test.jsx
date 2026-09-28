// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

import KeyReveal from './KeyReveal.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  vi.restoreAllMocks()
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider themeId="standard">
        <KeyReveal value="ABCD-1234-HJKM" onContinue={() => {}} {...props} />
      </ThemeProvider>
    )
  )
  return container
}

describe('KeyReveal', () => {
  test('zeigt den Schlüssel groß in Monospace und die Erklärtexte', () => {
    return render().then(() => {
      expect(container.querySelector('.key-reveal-value').textContent).toBe('ABCD-1234-HJKM')
      expect(container.textContent).toContain(
        'Mit diesem Schlüssel meldet ihr euch an – auf jedem Gerät. Hebt ihn gut auf, er ist auch eure Wiederherstellung.'
      )
      expect(container.textContent).toContain('Wer euch die Karte gegeben hat, kennt diesen Code.')
      expect(container.textContent).toContain('Familie einstellen')
    })
  })

  test('"Kopieren" schreibt den Schlüssel in die Zwischenablage und zeigt kurz "Kopiert"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    await render()

    const copyButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Kopieren'))
    await act(async () => copyButton.click())

    expect(writeText).toHaveBeenCalledWith('ABCD-1234-HJKM')
    expect(container.querySelector('button').textContent).toContain('Kopiert')
  })

  test('"Weiter zu Meiner Chronik" ruft onContinue auf', async () => {
    const onContinue = vi.fn()
    await render({ onContinue })

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Weiter zu Meiner Chronik')
    act(() => button.click())

    expect(onContinue).toHaveBeenCalled()
  })

  test('verbirgt den Kartenhinweis, wenn showCardHint=false gesetzt ist (z. B. nach dem Schlüssel-Erneuern)', async () => {
    await render({ showCardHint: false })
    expect(container.textContent).not.toContain('Wer euch die Karte gegeben hat, kennt diesen Code.')
  })

  test('zeigt den Kartenhinweis standardmäßig (showCardHint=true)', async () => {
    await render()
    expect(container.textContent).toContain('Wer euch die Karte gegeben hat, kennt diesen Code.')
  })

  test('setzt beim Erscheinen den Fokus auf die Überschrift "Euer Schlüssel", die in einer role="status"-Region steckt', async () => {
    await render()
    const heading = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Euer Schlüssel')
    expect(heading.getAttribute('tabindex')).toBe('-1')
    expect(heading.closest('[role="status"]')).not.toBeNull()
    expect(document.activeElement).toBe(heading)
  })
})
