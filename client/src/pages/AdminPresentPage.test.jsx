// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, partners } = vi.hoisted(() => ({ me: vi.fn(), partners: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { me, partners } } }))

import AdminPresentPage from './AdminPresentPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const partnerRows = [
  { id: 1, slug: 'tierheim-sonnenhang', name: 'Tierheim Sonnenhang', typ: 'tierheim', status: 'aktiv', gesperrt: 0, is_demo: 1 },
  { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'entwurf', gesperrt: 0, is_demo: 0 },
  { id: 5, slug: 'salon-fellfein', name: 'Hundesalon Fellfein', typ: 'hundesalon', status: 'pausiert', gesperrt: 1, is_demo: 0 }
]

beforeEach(() => {
  me.mockResolvedValue({ username: 'admin' })
  partners.mockResolvedValue(partnerRows)
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  me.mockReset()
  partners.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/admin/praesentation']}>
        <Routes>
          <Route path="/admin" element={<p data-testid="admin-home">Admin-Start</p>} />
          <Route path="/admin/praesentation" element={<AdminPresentPage />} />
        </Routes>
      </MemoryRouter>
    )
  )
  return container
}

const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function selectValue(select, value) {
  nativeSelectValueSetter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('AdminPresentPage – Zugang', () => {
  test('ohne Admin-Sitzung geht es zurück zu /admin, die Partnerliste wird nicht geladen', async () => {
    me.mockRejectedValue(new Error('Fehler 401'))
    await render()

    expect(container.querySelector('[data-testid="admin-home"]')).not.toBeNull()
    expect(partners).not.toHaveBeenCalled()
    expect(container.querySelector('.present-page')).toBeNull()
  })

  test('mit Sitzung: großer Kopf, "Zurück zum Admin", keine Admin-Karten', async () => {
    await render()

    expect(container.querySelector('.present-page h1').textContent).toBe('Familie auf Pfoten zeigen')
    const back = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zurück zum Admin'))
    expect(back.getAttribute('href')).toBe('/admin')
    expect(container.querySelector('.admin-header')).toBeNull()
    expect(container.querySelector('.admin-main')).toBeNull()
  })

  test('verlinkt die Präsentation zum Durchklicken (/vorstellung)', async () => {
    await render()

    const link = container.querySelector('a[href="/vorstellung"]')
    expect(link).not.toBeNull()
    expect(link.textContent).toContain('Präsentation zum Durchklicken')
  })
})

describe('AdminPresentPage – Kacheln', () => {
  test('sechs Kacheln als echte Links auf /demo-start mit passendem as/slug/ziel, jede in neuem Tab', async () => {
    await render()

    const tiles = [...container.querySelectorAll('[aria-labelledby="present-tiles-title"] a.present-tile')]
    expect(tiles.map((tile) => [tile.querySelector('.present-tile-title').textContent, tile.getAttribute('href')])).toEqual([
      ['Als Familie ansehen', '/demo-start?as=zuhause'],
      ['Als Rudel ansehen', '/demo-start?as=rudel'],
      ['Als Tierheim ansehen', '/demo-start?as=tierheim'],
      ['Als Hundeschule ansehen', '/demo-start?as=partner&slug=hundeschule-pfotenglueck'],
      ['Als Hundesalon ansehen', '/demo-start?as=partner&slug=hundesalon-wuschelglueck'],
      ['Kundensicht eines Partners', '/demo-start?as=partner&slug=hundeschule-pfotenglueck&ziel=kundensicht']
    ])
    for (const tile of tiles) {
      expect(tile.getAttribute('target')).toBe('_blank')
      expect(tile.getAttribute('rel')).toBe('noopener noreferrer')
      expect(tile.querySelector('.present-tile-sub').textContent.length).toBeGreaterThan(20)
    }
  })

  test('Öffentliche Portale: drei Kacheln direkt auf /p/<slug>?demo=1 (ohne /demo-start), jede in neuem Tab', async () => {
    await render()

    const section = container.querySelector('[aria-labelledby="present-portals-title"]')
    expect(section.querySelector('h2').textContent).toBe('Öffentliche Portale')
    const tiles = [...section.querySelectorAll('a.present-tile')]
    expect(tiles.map((tile) => [tile.querySelector('.present-tile-title').textContent, tile.getAttribute('href')])).toEqual([
      ['Portal Tierheim', '/p/tierheim-sonnenhang?demo=1&reiter=tiere'],
      ['Portal Hundeschule', '/p/hundeschule-pfotenglueck?demo=1&reiter=termine'],
      ['Portal Hundesalon', '/p/hundesalon-wuschelglueck?demo=1']
    ])
    for (const tile of tiles) {
      expect(tile.getAttribute('target')).toBe('_blank')
      expect(tile.getAttribute('rel')).toBe('noopener noreferrer')
      expect(tile.querySelector('.present-tile-sub').textContent.length).toBeGreaterThan(20)
      expect(tile.textContent).toContain('Öffnet in neuem Tab')
    }
  })

  test('Reihenfolge: Demo ansehen, Öffentliche Portale, Portal-Vorschau', async () => {
    await render()

    expect([...container.querySelectorAll('.present-page h2')].map((h2) => h2.textContent)).toEqual([
      'Demo ansehen',
      'Öffentliche Portale',
      'Portal-Vorschau'
    ])
  })

  test('keine Codes, Tokens oder Sitzungsdaten in den Adressen - nur die bekannten Parameter', async () => {
    await render()

    const allowed = ['as', 'slug', 'ziel', 'demo', 'reiter']
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
    expect(hrefs.length).toBeGreaterThan(9)
    for (const href of hrefs) {
      const url = new URL(href, 'https://example.org')
      expect([...url.searchParams.keys()].filter((key) => !allowed.includes(key)), href).toEqual([])
      expect(url.hash, href).toBe('')
    }
  })
})

describe('AdminPresentPage – Portal-Vorschau', () => {
  test('listet alle Partner mit Status (auch Entwurf, gesperrt, Demo) und öffnet den gewählten in neuem Tab', async () => {
    await render()

    expect(partners).toHaveBeenCalledTimes(1)
    const select = container.querySelector('#present-partner')
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Tierheim Sonnenhang · Aktiv · Demo',
      'Hundeschule Wiesengrund · Entwurf',
      'Hundesalon Fellfein · Gesperrt'
    ])
    const open = container.querySelector('a.present-portal-open')
    // Vorgabe: der erste Partner - ein Demo-Partner braucht ?demo=1.
    expect(open.getAttribute('href')).toBe('/p/tierheim-sonnenhang?demo=1')
    expect(open.getAttribute('target')).toBe('_blank')

    await act(async () => selectValue(select, 'hundeschule-wiesengrund'))
    expect(container.querySelector('a.present-portal-open').getAttribute('href')).toBe('/p/hundeschule-wiesengrund')

    await act(async () => selectValue(select, 'salon-fellfein'))
    expect(container.querySelector('a.present-portal-open').getAttribute('href')).toBe('/p/salon-fellfein')
  })

  test('ohne Partner ein Hinweis, bei einem Fehler ein Alert', async () => {
    partners.mockResolvedValue([])
    await render()
    expect(container.textContent).toContain('Noch keine Partner angelegt.')
    expect(container.querySelector('#present-partner')).toBeNull()

    act(() => root.unmount())
    root = null
    container.remove()

    partners.mockRejectedValue(new Error('Fehler 500'))
    await render()
    expect(container.querySelector('.present-portal [role="alert"]').textContent).toBe('Fehler 500')
  })
})
