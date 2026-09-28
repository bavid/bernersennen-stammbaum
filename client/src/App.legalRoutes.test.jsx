// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, listDogs, config } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  listDogs: vi.fn(),
  config: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, listDogs, config },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const loggedInHome = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  isDemo: false,
  home: null,
  memberships: []
}

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
  window.history.replaceState(null, '', '/')
  me.mockReset()
  logout.mockReset()
  listDogs.mockReset()
  config.mockReset()
  vi.restoreAllMocks()
})

async function render(initialEntry) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    )
  )
  return container
}

describe('Routen /impressum und /datenschutz – öffentlich, unabhängig vom Login-Status', () => {
  test('/impressum rendert ohne Sitzung', async () => {
    me.mockRejectedValue(new Error('401'))
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('/impressum')

    expect(container.querySelector('h1')?.textContent).toBe('Impressum')
  })

  test('/datenschutz rendert mit bestehender Sitzung', async () => {
    me.mockResolvedValue(loggedInHome)
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('/datenschutz')

    expect(container.querySelector('h1')?.textContent).toBe('Datenschutz')
  })

  test('der App-Fuß verlinkt Impressum und Datenschutz', async () => {
    me.mockResolvedValue(loggedInHome)
    listDogs.mockResolvedValue([])
    await render('/wegbegleiter')

    const links = [...container.querySelectorAll('.app-footer a')]
    expect(links.some((a) => a.getAttribute('href') === '/impressum')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/datenschutz')).toBe(true)
  })

  test('die Login-Seite verlinkt Impressum und Datenschutz im Fuß', async () => {
    me.mockRejectedValue(new Error('401'))
    await render('/')

    const links = [...container.querySelectorAll('a')]
    expect(links.some((a) => a.getAttribute('href') === '/impressum')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/datenschutz')).toBe(true)
  })
})
