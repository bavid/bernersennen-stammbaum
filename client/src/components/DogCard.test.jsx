// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import DogCard from './DogCard.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const dog = (overrides = {}) => ({
  id: 1,
  name: 'Nele',
  name_unbekannt: false,
  tierart: 'hund',
  geschlecht: 'huendin',
  geburtsdatum: '2020-01-01',
  ...overrides
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DogCard {...props} />
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

describe('DogCard – geteiltes Tier aus einem Zuhause', () => {
  test('volle Karte zeigt "aus {shared_from}" als Tag', async () => {
    await render({ dog: dog({ shared_from: 'Zuhause am Deich' }) })
    const tag = container.querySelector('.dog-card-shared')
    expect(tag).not.toBeNull()
    expect(tag.textContent).toBe('aus Zuhause am Deich')
  })

  test('ohne shared_from bleibt der bisherige Tag (Einträge-Zähler) erhalten', async () => {
    await render({ dog: dog({ timeline_count: 3 }) })
    expect(container.querySelector('.dog-card-shared')).toBeNull()
    expect(container.querySelector('.dog-card-tag').textContent).toBe('3 Einträge')
  })

  test('mini-Variante zeigt statt Text ein Haus-Symbol mit visuell verstecktem Text', async () => {
    await render({ dog: dog({ shared_from: 'Zuhause am Deich' }), variant: 'mini' })
    const badge = container.querySelector('.dog-mini-badge')
    expect(badge).not.toBeNull()
    expect(badge.getAttribute('aria-label')).toBeNull()
    expect(badge.querySelector('.visually-hidden').textContent).toBe('aus Zuhause am Deich')
    expect(container.querySelector('.dog-card-shared')).toBeNull()
  })
})
