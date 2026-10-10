// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api', () => ({ api: { setDarstellung: vi.fn().mockResolvedValue({}) } }))
vi.mock('./Toast.jsx', () => ({ useToast: () => ({ show: vi.fn() }) }))

import QuickSettings from './QuickSettings.jsx'
import { getLang, setLang } from '../lib/i18n/index.js'

// Schnell-Einstellungen im Kopf: Sprache sofort, Darstellung nur mit Sitzung, Escape schließt.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  setLang('de')
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <QuickSettings {...props} />
      </MemoryRouter>
    )
  )
}

const trigger = () => container.querySelector('.quick-settings-trigger')

describe('QuickSettings', () => {
  test('Knopf zeigt die Flagge der Sprache, öffnet das Feld, ein Klick auf English wechselt sofort', async () => {
    await render({})
    const flag = () => trigger().querySelector('.language-flag')
    expect(flag().dataset.lang).toBe('de')
    expect(trigger().textContent).toBe('')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    await act(async () => trigger().click())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    await act(async () => container.querySelector('button[lang="en"]').click())
    expect(getLang()).toBe('en')
    expect(flag().dataset.lang).toBe('en')
    expect(container.querySelectorAll('.quick-settings-panel .language-flag')).toHaveLength(2)
    expect(trigger().getAttribute('aria-label')).toBe('Language & view')
  })

  test('ohne Sitzung nur die Sprache; mit Sitzung auch Hintergrund und Schriftgröße', async () => {
    await render({})
    await act(async () => trigger().click())
    expect(container.querySelectorAll('.quick-settings-row')).toHaveLength(1)
    expect(container.querySelector('.quick-settings-more')).toBeNull()
    act(() => root.unmount())
    container.remove()

    const onFamilyChange = vi.fn()
    await render({ family: { id: 1, darstellung: {} }, onFamilyChange })
    await act(async () => trigger().click())
    expect(container.querySelectorAll('.quick-settings-row')).toHaveLength(3)
    expect(container.querySelector('.quick-settings-more').getAttribute('href')).toBe('/einstellungen?bereich=darstellung')
  })

  test('Escape schließt und gibt den Fokus an den Knopf zurück', async () => {
    await render({})
    await act(async () => trigger().click())
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(container.querySelector('.quick-settings-panel')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })
})
