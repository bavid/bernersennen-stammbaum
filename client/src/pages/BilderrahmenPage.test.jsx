// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { bilderrahmenFotos } = vi.hoisted(() => ({ bilderrahmenFotos: vi.fn() }))
vi.mock('../api', () => ({ api: { bilderrahmenFotos } }))

import BilderrahmenPage from './BilderrahmenPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let location

function Probe() {
  location = useLocation()
  return null
}

async function render(url = '/bilderrahmen', areaKey = null) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/bilderrahmen" element={<BilderrahmenPage areaKey={areaKey} />} />
          <Route path="*" element={null} />
        </Routes>
        <Probe />
      </MemoryRouter>
    )
  )
  await act(async () => {})
}

const FOTOS = {
  fotos: [{ url: '/uploads/a.jpg', tierId: 10, tierName: 'Nele', datum: '2025-03-01', eintragId: 1, inErinnerung: false }],
  tiere: [
    { id: 10, name: 'Nele', inErinnerung: false },
    { id: 11, name: 'Flocke', inErinnerung: true }
  ]
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

describe('BilderrahmenPage – Diashow im eigenen Zuhause', () => {
  test('aus dem Tierprofil (?tier=10): nur die Fotos dieses Tiers', async () => {
    bilderrahmenFotos.mockResolvedValue(FOTOS)
    await render('/bilderrahmen?tier=10')
    expect(bilderrahmenFotos).toHaveBeenCalledWith({ tiere: [10], zeitraum: 'alle', privat: false })
    expect(container.querySelector('.frame-img').getAttribute('alt')).toBe('Foto von Nele, 1. März 2025')
  })

  test('gemerkte Auswahl, Beenden führt nach Start', async () => {
    window.localStorage.setItem('chronik.bilderrahmen.auswahl', JSON.stringify({ tiere: [11], zeitraum: 'jahr' }))
    bilderrahmenFotos.mockResolvedValue(FOTOS)
    await render()
    expect(bilderrahmenFotos).toHaveBeenCalledWith({ tiere: [11], zeitraum: 'jahr', privat: false })
    await act(async () => container.querySelector('button[aria-label="Beenden"]').click())
    expect(location.pathname).toBe('/start')
  })

  test('ohne Fotos: ruhiger Hinweis statt leerer Diashow', async () => {
    bilderrahmenFotos.mockResolvedValue({ fotos: [], tiere: [] })
    await render()
    expect(container.querySelector('h1').textContent).toBe('Noch keine Fotos')
    expect(container.querySelector('a[href="/start"]')).not.toBeNull()
  })

  // B+ Familienalbum: die Diashow einer Familie (Gruppenseite „Bilderrahmen“, /bilderrahmen?in=<Id>).
  test('aus einer Familie: eigene gemerkte Auswahl je Familie, nicht die des Zuhauses', async () => {
    window.localStorage.setItem('chronik.bilderrahmen.auswahl', JSON.stringify({ tiere: [11], zeitraum: 'jahr' }))
    window.localStorage.setItem('chronik.bilderrahmen.auswahl.5', JSON.stringify({ tiere: [], zeitraum: 'monat' }))
    bilderrahmenFotos.mockResolvedValue(FOTOS)
    await render('/bilderrahmen?in=5', 5)
    expect(bilderrahmenFotos).toHaveBeenCalledWith({ tiere: [], zeitraum: 'monat', privat: false })
  })
})
