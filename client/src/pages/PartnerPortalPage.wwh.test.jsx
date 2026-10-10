// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  publicPartner: vi.fn(),
  publicPartnerAnimals: vi.fn(() => Promise.resolve([])),
  publicHappyEnds: vi.fn(() => Promise.resolve([])),
  publicPartnerPosts: vi.fn(() => Promise.resolve([])),
  wwhOrt: vi.fn(),
  listDogs: vi.fn(() => Promise.resolve([])),
  wwhKontaktOffen: vi.fn(() => Promise.resolve({ an: [], von: [] }))
}))
vi.mock('../api', () => ({ api: mocks }))

import PartnerPortalPage from './PartnerPortalPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.HTMLElement.prototype.scrollIntoView = vi.fn()

const school = { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', einblicke: [], termine: [], kontakt_telefon: '040 1234567' }
const home = { id: 30, art: 'zuhause', name: 'Zuhause', home: { id: 30, art: 'zuhause' } }

let container
let root

afterEach(() => {
  if (root) act(() => root.unmount())
  container?.remove()
  root = null
  container = null
  mocks.wwhOrt.mockReset()
})

async function render({ family, inApp = Boolean(family), url = '/p/hundeschule-wiesengrund' } = {}) {
  if (root) act(() => root.unmount())
  container?.remove()
  mocks.publicPartner.mockResolvedValue(school)
  mocks.wwhOrt.mockResolvedValue({ ort: { id: 4, name: school.name, typ: 'hundeschule' }, eigene: [], andere: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <ThemeProvider>
          <PartnerPortalPage slug="hundeschule-wiesengrund" inApp={inApp} family={family} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

const tabLabels = () => [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)

describe('PartnerPortalPage – Wir waren hier', () => {
  test('ohne Sitzung kein Reiter und keine Anfrage', async () => {
    await render()
    expect(tabLabels()).not.toContain('Wir waren hier')
    expect(mocks.wwhOrt).not.toHaveBeenCalled()
  })

  test('in einer Familie (nicht im eigenen Zuhause) kein Reiter', async () => {
    await render({ family: { id: 31, art: 'rudel', name: 'Rudel', home: { id: 30, art: 'zuhause' } } })
    expect(tabLabels()).not.toContain('Wir waren hier')
  })

  test('im eigenen Zuhause: Reiter vor „Kontakt“, lädt den Ort erst beim Öffnen', async () => {
    await render({ family: home })
    expect(tabLabels().slice(-2)).toEqual(['Wir waren hier', 'Kontakt'])
    expect(mocks.wwhOrt).not.toHaveBeenCalled()

    await render({ family: home, url: '/p/hundeschule-wiesengrund?reiter=wir-waren-hier' })
    expect(mocks.wwhOrt).toHaveBeenCalledWith(4)
    expect(container.querySelector('#wwh-title').textContent).toBe('Wir waren hier')
  })
})
