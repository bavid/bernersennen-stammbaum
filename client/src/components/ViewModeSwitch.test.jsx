// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import ViewModeSwitch from './ViewModeSwitch.jsx'

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
})

// Derselbe MemoryRouter bleibt beim erneuten Rendern erhalten (initialEntries zählt nur beim ersten Mal) -
// so ändert sich zwischen zwei Aufrufen nur areaId, wie in App.jsx beim Bereichswechsel.
function renderSwitch(areaId, initialEntry = '/profil') {
  const element = (
    <MemoryRouter initialEntries={[initialEntry]}>
      <ViewModeSwitch areaId={areaId} />
    </MemoryRouter>
  )
  if (root) {
    act(() => root.render(element))
    return
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(element))
}

function link(label) {
  return [...container.querySelectorAll('.view-mode-switch a')].find((a) => a.textContent === label)
}

describe('ViewModeSwitch', () => {
  test('merkt sich die zuletzt besuchte Seite für "Bearbeiten"', () => {
    renderSwitch(30, '/zugang')

    expect(link('Bearbeiten').getAttribute('href')).toBe('/zugang')
    act(() => link('Kundensicht').click())

    expect(link('Kundensicht').getAttribute('aria-current')).toBe('page')
    expect(link('Bearbeiten').getAttribute('href')).toBe('/zugang')
  })

  // Audit V7a: samt Suche - so kommt man aus der Kundensicht in denselben Profil-Reiter zurück.
  test('merkt sich auch den Profil-Reiter (?reiter=…)', () => {
    renderSwitch(30, '/profil?reiter=einblicke')
    act(() => link('Kundensicht').click())
    expect(link('Bearbeiten').getAttribute('href')).toBe('/profil?reiter=einblicke')
  })

  test('nach einem Bereichswechsel gilt wieder die Vorgabe /profil', () => {
    renderSwitch(30, '/zugang')
    act(() => link('Kundensicht').click())
    expect(link('Bearbeiten').getAttribute('href')).toBe('/zugang')

    renderSwitch(31)

    expect(link('Kundensicht').getAttribute('aria-current')).toBe('page')
    expect(link('Bearbeiten').getAttribute('href')).toBe('/profil')
  })

  test('im neuen Bereich merkt er sich wieder dessen Seiten', () => {
    renderSwitch(30, '/zugang')
    renderSwitch(31)
    act(() => link('Kundensicht').click())

    expect(link('Bearbeiten').getAttribute('href')).toBe('/zugang')
  })
})
