// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'

import AnimalAdoptionCard from './AnimalAdoptionCard.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const animal = {
  slug: 'pepper-ab12cd',
  name: 'Pepper',
  tierart: 'hund',
  geschlecht: 'huendin',
  rasse: 'Mischling',
  geburtsdatum: '2022-01-01',
  fotoUrl: '/public-media/pepper.jpg',
  vermittlung_status: 'in_vermittlung'
}

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AnimalAdoptionCard animal={{ ...animal, ...props }} />
      </MemoryRouter>
    )
  )
  return container
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
})

describe('AnimalAdoptionCard', () => {
  test('verlinkt auf den öffentlichen Steckbrief /t/:slug', async () => {
    await render()
    expect(container.querySelector('a').getAttribute('href')).toBe('/t/pepper-ab12cd')
  })

  test('zeigt Name, Art/Geschlecht, Rasse und den Status-Chip', async () => {
    await render()
    expect(container.querySelector('.shelter-card-name').textContent).toBe('Pepper')
    expect(container.querySelector('.shelter-card-species').textContent).toBe('Hund · Hündin · Mischling')
    expect(container.querySelector('.status-chip').textContent).toBe('Verfügbar')
  })

  test('zeigt das Foto über die vom Server gelieferte /public-media-URL', async () => {
    await render()
    expect(container.querySelector('img').getAttribute('src')).toBe('/public-media/pepper.jpg')
  })

  test('ohne Foto zeigt einen Buchstaben-Platzhalter statt eines <img>', async () => {
    await render({ fotoUrl: null })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.avatar-fallback').textContent).toBe('P')
  })

  test('zeigt die Entfernung mit deutschem Komma, wenn der Server sie mitliefert (Entdecken)', async () => {
    await render({ distanceKm: 12.4 })
    expect(container.querySelector('.animal-card-distance').textContent).toBe('12,4 km')
  })

  test('ohne distanceKm keine Entfernungsangabe', async () => {
    await render()
    expect(container.querySelector('.animal-card-distance')).toBeNull()
  })
})

describe('AnimalAdoptionCard – pausiert (Phase P)', () => {
  test('ein pausiertes Tier trägt den Chip "Pausiert (on hold)"', async () => {
    await render({ vermittlung_status: 'pausiert' })
    const statusChip = container.querySelector('.status-chip')
    expect(statusChip.textContent).toBe('Pausiert (on hold)')
    expect(statusChip.classList.contains('status-chip-pausiert')).toBe(true)
  })
})
