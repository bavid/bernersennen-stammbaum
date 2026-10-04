// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import DogCard from './DogCard.jsx'
import { getTheme } from '../themes/index.js'

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
    expect(container.querySelector('.dog-card-tag').textContent).toBe(`3 ${getTheme('standard').words.entries}`)
  })

  test('mini-Variante zeigt statt Text ein Haus-Symbol mit visuell verstecktem Text', async () => {
    await render({ dog: dog({ shared_from: 'Zuhause am Deich' }), variant: 'mini' })
    const badge = container.querySelector('.dog-mini-badge')
    expect(badge).not.toBeNull()
    expect(badge.getAttribute('aria-label')).toBeNull()
    expect(badge.querySelector('.visually-hidden').textContent).toBe('aus Zuhause am Deich')
    expect(container.querySelector('.dog-card-shared')).toBeNull()
  })

  // Familienbande 2: das Raster zeigt Foto, Name, Rasse/Art, Geschlecht und Jahr - ohne Einträge-Zähler; die Herkunft
  // eines geteilten Tiers nur, wo nicht ohnehin nach diesem Zuhause gefiltert ist.
  test('grid-Variante: ohne Einträge-Zähler, Herkunft nur mit showOrigin', async () => {
    await render({ dog: dog({ timeline_count: 3, rasse: 'Mischling' }), variant: 'grid' })
    const card = container.querySelector('.dog-card')
    expect(card.className).toContain('is-grid')
    expect(card.querySelector('.dog-card-breed').textContent).toBe('Mischling')
    expect(card.querySelector('.dog-card-meta').textContent).toBe('Hündin2020')
    expect(card.querySelector('.dog-card-tag')).toBeNull()

    act(() => root.unmount())
    container.remove()
    await render({ dog: dog({ shared_from: 'Zuhause am Deich' }), variant: 'grid' })
    expect(container.querySelector('.dog-card-shared').textContent).toBe('aus Zuhause am Deich')
    // Im Raster einzeilig gekürzt - der volle Name steht im Tooltip
    expect(container.querySelector('.dog-card-shared').getAttribute('title')).toBe('aus Zuhause am Deich')

    act(() => root.unmount())
    container.remove()
    await render({ dog: dog({ shared_from: 'Zuhause am Deich' }), variant: 'grid', showOrigin: false })
    expect(container.querySelector('.dog-card-shared')).toBeNull()
  })
})

// Geschlecht „weiß ich nicht“: weder Punkt noch Hündin/Rüde, nur die Art.
describe('DogCard – Geschlecht', () => {
  test('bekannt: Punkt und Hündin/Rüde bzw. Katze/Kater', async () => {
    await render({ dog: dog() })
    expect(container.querySelector('.sex-dot.sex-huendin')).not.toBeNull()
    expect(container.querySelector('.sex-label').textContent).toBe('Hündin')
  })

  test.each([
    ['hund', 'Hund'],
    ['katze', 'Katze'],
    ['anderes', 'Anderes Tier']
  ])('unbekannt (%s): kein Punkt, nur die Art', async (tierart, label) => {
    await render({ dog: dog({ tierart, geschlecht: 'unbekannt' }) })
    expect(container.querySelector('.sex-dot')).toBeNull()
    expect(container.querySelector('.sex-label').textContent).toBe(label)
    expect(container.textContent).not.toMatch(/Hündin|Rüde|weiblich|männlich/)
  })
})
