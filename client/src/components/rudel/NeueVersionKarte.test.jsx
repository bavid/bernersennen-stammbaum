// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { config, sendMessage } = vi.hoisted(() => ({ config: vi.fn(), sendMessage: vi.fn() }))
vi.mock('../../api', () => ({ api: { config, sendMessage } }))

import NeueVersionKarte, { EINLADUNG_PFAD } from './NeueVersionKarte.jsx'
import ContactAdminPage from '../../pages/ContactAdminPage.jsx'
import { ToastProvider } from '../Toast.jsx'
import { resetInstanzModus } from '../../lib/instanzModus.js'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const URL_NEU = 'https://neu.example/'
let container
let root

afterEach(async () => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  config.mockReset()
  resetInstanzModus()
  await act(async () => setLang('de'))
})

async function render(element, path = '/') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>))
  await act(async () => {})
}

describe('NeueVersionKarte (Rudel-Instanz)', () => {
  test('ohne Link vom Server: nichts', async () => {
    config.mockResolvedValue({ instanzModus: '' })
    await render(<NeueVersionKarte angemeldet />)
    expect(container.querySelector('.neue-version')).toBeNull()
  })

  test('angemeldet: deutliche Überschrift, Link zur neuen Version, Einladung über Feedback', async () => {
    config.mockResolvedValue({ instanzModus: 'rudel', neueVersionUrl: URL_NEU })
    await render(<NeueVersionKarte angemeldet />)
    expect(container.querySelector('h2').textContent).toBe('Es gibt eine neue Version')
    const neu = container.querySelector(`a[href="${URL_NEU}"]`)
    expect(neu.getAttribute('target')).toBe('_blank')
    expect(neu.getAttribute('rel')).toMatch(/noopener/)
    expect(container.querySelector(`a[href="${EINLADUNG_PFAD}"]`).textContent).toMatch(/Einladung anfragen/)
  })

  test('auf der Anmeldung: kein Einladungs-Knopf, Hinweis auf Feedback; auf Englisch', async () => {
    config.mockResolvedValue({ instanzModus: 'rudel', neueVersionUrl: URL_NEU })
    await act(async () => setLang('en'))
    await render(<NeueVersionKarte />)
    expect(container.querySelector(`a[href="${EINLADUNG_PFAD}"]`)).toBeNull()
    expect(container.textContent).toMatch(/There's a new version/)
    expect(container.textContent).toMatch(/Feedback/)
  })

  test('kein https-Link: nichts (kein javascript:)', async () => {
    config.mockResolvedValue({ instanzModus: 'rudel', neueVersionUrl: 'javascript:alert(1)' })
    await render(<NeueVersionKarte angemeldet />)
    expect(container.querySelector('.neue-version')).toBeNull()
  })

  test('Feedback mit ?thema=einladung: Text ist vorausgefüllt', async () => {
    await render(
      <ToastProvider>
        <Routes>
          <Route path="/admin-schreiben" element={<ContactAdminPage />} />
        </Routes>
      </ToastProvider>,
      EINLADUNG_PFAD
    )
    expect(container.querySelector('#contact-text').value).toMatch(/Einladungscode/)
  })
})
