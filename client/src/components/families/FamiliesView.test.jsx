// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import FamiliesView from './FamiliesView.jsx'
import { ThemeProvider } from '../../themes/ThemeProvider.jsx'
import { buildFamilyGroups } from '../../lib/familyGroups.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Das Raster aller Tiere mit dem Filter je Eigentümer (Familienbande 2) - auf "Tiere" (AnimalsTabs, Reiter "Alle"), in der
// Familienbande des Tierheims (OverviewPage). Hier eine Familie: eigene Tiere und Tiere aus zwei Zuhause.
let container
let root
let location
let navigate

const dog = (id, name, extra = {}) => ({ id, name, geschlecht: 'huendin', tierart: 'hund', geburtsdatum: '2019-03-10', ...extra })

const group = {
  id: 7,
  name: 'Familie Sonnenhang',
  theme: 'standard',
  art: 'rudel',
  role: 'leitung',
  home: { id: 1, name: 'Zuhause am Deich', art: 'zuhause' },
  memberships: []
}
const groupDogs = [
  dog(31, 'Bella', { family_id: 7 }),
  dog(32, 'Cora', { family_id: 7, mother_dog_id: 31, geburtsdatum: '2021-04-18' }),
  dog(34, 'Dante', { family_id: 7, geschlecht: 'ruede', mother_dog_id: 31, geburtsdatum: '2021-04-18' }),
  dog(11, 'Nele', { family_id: 1, shared_from: 'Zuhause am Deich' }),
  dog(12, 'Mira', { family_id: 1, tierart: 'katze', shared_from: 'Zuhause am Deich' }),
  dog(21, 'Wilma', { family_id: 4, shared_from: 'Zuhause Möwenweg (Demo)' })
]

function Probe() {
  location = useLocation()
  navigate = useNavigate()
  return null
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  location = null
  navigate = null
})

async function render({ family = group, dogs = groupDogs, path = '/tiere' } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId="standard">
          <Probe />
          <FamiliesView groups={buildFamilyGroups({ family, dogs })} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

const gridNames = () => [...container.querySelectorAll('.families-grid .dog-card-name')].map((n) => n.textContent)
const filter = () => container.querySelector('[role="group"][aria-label="Tiere filtern"]')
const filterButtons = () => [...(filter()?.querySelectorAll('button') || [])]
const filterButton = (text) => filterButtons().find((button) => button.textContent.startsWith(text))

async function click(element) {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })))
}

describe('FamiliesView – Raster mit Filter je Eigentümer', () => {
  test('ein Raster mit allen Tieren; Filter mit Anzahl, "Alle" gewählt; keine Zeile zu Familien und Freunden', async () => {
    await render()

    expect(gridNames()).toEqual(['Bella', 'Cora', 'Dante', 'Nele', 'Mira', 'Wilma'])
    expect(filterButtons().map((button) => button.textContent)).toEqual(['Alle 6', 'Familie 3', 'Zuhause am Deich 2', 'Möwenweg 1'])
    expect(filterButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    // Der volle Name steht im Tooltip (für Screenreader die Beschreibung); der Name des Knopfs bleibt, was man sieht
    expect(filterButton('Möwenweg').getAttribute('title')).toBe('Zuhause Möwenweg (Demo)')
    expect(filterButton('Familie').getAttribute('title')).toBe('Familie Sonnenhang')
    expect(filterButton('Alle').getAttribute('title')).toBeNull()
    expect(filterButton('Möwenweg').getAttribute('aria-controls')).toBe(container.querySelector('.families-grid').id)
    // Unter "Alle" tragen geteilte Tiere eine leise Herkunft
    const nele = [...container.querySelectorAll('.families-grid .dog-card')].find((card) => card.textContent.includes('Nele'))
    expect(nele.querySelector('.dog-card-shared').textContent).toBe('aus Zuhause am Deich')
    expect(container.querySelector('.families-links')).toBeNull()
  })

  test('nur eigene Tiere: kein Filter', async () => {
    await render({ dogs: groupDogs.slice(0, 3) })
    expect(gridNames()).toEqual(['Bella', 'Cora', 'Dante'])
    expect(filter()).toBeNull()
  })

  test('ein Filter zeigt nur die Tiere dieses Zuhauses, steht in der Adresse und lässt sich mit Zurück aufheben', async () => {
    await render()

    await click(filterButton('Zuhause am Deich'))
    expect(location.search).toBe('?gruppe=1')
    expect(gridNames()).toEqual(['Nele', 'Mira'])
    expect(filterButton('Zuhause am Deich').getAttribute('aria-pressed')).toBe('true')
    expect(filterButton('Alle').getAttribute('aria-pressed')).toBe('false')
    // Unter dem gewählten Zuhause kein doppeltes "aus Zuhause am Deich"
    expect(container.querySelector('.families-grid').textContent).not.toContain('aus Zuhause am Deich')

    await click(filterButton('Familie'))
    expect(location.search).toBe('?gruppe=eigen')
    expect(gridNames()).toEqual(['Bella', 'Cora', 'Dante'])

    await act(async () => navigate(-1))
    expect(gridNames()).toEqual(['Nele', 'Mira'])
    await act(async () => navigate(-1))
    expect(location.search).toBe('')
    expect(gridNames()).toHaveLength(6)
  })

  test('ein Klick auf den schon gewählten Filter legt keinen zweiten Eintrag in den Verlauf', async () => {
    await render()
    await click(filterButton('Möwenweg'))
    await click(filterButton('Möwenweg'))
    expect(location.search).toBe('?gruppe=4')
    await act(async () => navigate(-1))
    expect(location.search).toBe('')

    // "Alle" ohne Filter in der Adresse ändert nichts
    await click(filterButton('Alle'))
    expect(location.key).toBe('default')
  })

  test('"Alle" nimmt den Filter aus der Adresse; ein unbekannter Filter zeigt alle', async () => {
    await render({ path: '/tiere?gruppe=4' })
    expect(gridNames()).toEqual(['Wilma'])
    await click(filterButton('Alle'))
    expect(location.search).toBe('')
    expect(gridNames()).toHaveLength(6)

    act(() => root.unmount())
    container.remove()
    await render({ path: '/tiere?gruppe=99' })
    expect(gridNames()).toHaveLength(6)
    expect(filterButton('Alle').getAttribute('aria-pressed')).toBe('true')
    // "Alle" räumt auch einen veralteten Filter aus der Adresse
    await click(filterButton('Alle'))
    expect(location.search).toBe('')
  })
})
