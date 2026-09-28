// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { config } = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock('../api', () => ({ api: { config } }))

import LegalPage from './LegalPage.jsx'

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
  config.mockReset()
})

async function render(variant) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <LegalPage variant={variant} />
      </MemoryRouter>
    )
  )
  return container
}

describe('LegalPage – /impressum', () => {
  test('ohne Betreiberangaben: ehrlicher Hinweis statt erfundener Daten', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('impressum')

    expect(container.querySelector('h1').textContent).toBe('Impressum')
    expect(container.textContent).toContain('Die Betreiberangaben werden vor dem Start ergänzt.')
  })

  test('mit Betreiberangaben: zeigt Name, Adresse (mehrzeilig), E-Mail und Telefon', async () => {
    config.mockResolvedValue({
      appEnv: 'production',
      legal: { name: 'Tierheim Sonnenhang e.V.', address: 'Musterstraße 1\n12345 Musterstadt', email: 'kontakt@example.org', phone: '+49 30 1234567' }
    })
    await render('impressum')

    expect(container.textContent).toContain('Tierheim Sonnenhang e.V.')
    expect(container.textContent).toContain('Musterstraße 1')
    expect(container.textContent).toContain('12345 Musterstadt')
    expect(container.textContent).toContain('kontakt@example.org')
    expect(container.textContent).toContain('+49 30 1234567')
    expect(container.textContent).not.toContain('Die Betreiberangaben werden vor dem Start ergänzt.')
  })
})

describe('LegalPage – /datenschutz', () => {
  test('beschreibt Cookie, Standortrundung, Umkreissuche über den eigenen Server und PLZ-Quelle', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.querySelector('h1').textContent).toBe('Datenschutz')
    expect(container.textContent).toMatch(/Cookie/)
    expect(container.textContent).toMatch(/OpenStreetMap/)
    expect(container.textContent).toMatch(/GeoNames/)
    expect(container.textContent).toMatch(/nie.*gespeichert|nicht gespeichert/)
  })

  test('Kontakt ohne Impressums-E-Mail verweist auf das Impressum statt eine E-Mail zu erfinden', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/impressum')
    expect(link).not.toBeUndefined()
  })

  test('Kontakt mit Impressums-E-Mail verlinkt sie als mailto:', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: 'X', address: '', email: 'kontakt@example.org', phone: '' } })
    await render('datenschutz')
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'mailto:kontakt@example.org')
    expect(link).not.toBeUndefined()
  })
})
