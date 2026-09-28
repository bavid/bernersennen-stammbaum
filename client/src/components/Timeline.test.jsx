// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import Timeline from './Timeline.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const entry = (overrides = {}) => ({
  type: 'entry',
  key: 'entry-1',
  datum: '2024-05-01',
  titel: 'Erster Tag am See',
  autor_name: 'Dana',
  comments: [],
  ...overrides
})

async function render(items) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Timeline items={items} canEdit={false} onEdit={() => {}} onOpenPhoto={() => {}} onDeleteComment={() => {}} />
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

describe('Timeline – private Einträge', () => {
  test('ein privater Eintrag zeigt ein Schloss-Symbol mit "privat"-Badge', async () => {
    await render([entry({ privat: 1 })])
    const badge = container.querySelector('.privat-badge')
    expect(badge).not.toBeNull()
    expect(badge.getAttribute('aria-label')).toBe('Privater Eintrag')
    expect(badge.querySelector('svg')).not.toBeNull()
    expect(badge.textContent).toContain('privat')
  })

  test('ein normaler Eintrag zeigt kein Badge', async () => {
    await render([entry({ privat: 0 })])
    expect(container.querySelector('.privat-badge')).toBeNull()
  })
})

describe('Timeline – Tierheim (Kategorie, öffentlich, Herkunft)', () => {
  test('ein Eintrag mit Kategorie zeigt einen Kategorie-Chip mit deutschem Label', async () => {
    await render([entry({ kategorie: 'tierarzt' })])
    const badge = container.querySelector('.kategorie-badge')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toBe('Tierarzt')
  })

  test('ohne Kategorie erscheint kein Kategorie-Chip', async () => {
    await render([entry({ kategorie: null })])
    expect(container.querySelector('.kategorie-badge')).toBeNull()
  })

  test('is_public zeigt ein "öffentlich"-Kennzeichen', async () => {
    await render([entry({ is_public: 1 })])
    const badge = container.querySelector('.public-badge')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toContain('öffentlich')
  })

  test('ohne is_public bleibt das Kennzeichen weg', async () => {
    await render([entry({ is_public: 0 })])
    expect(container.querySelector('.public-badge')).toBeNull()
  })

  test('herkunft_name zeigt "aus {herkunft_name}" (umgezogener Eintrag)', async () => {
    await render([entry({ herkunft_name: 'Tierheim Sonnenhang' })])
    expect(container.querySelector('.entry-herkunft').textContent).toBe('aus Tierheim Sonnenhang')
  })

  test('ohne herkunft_name bleibt die Zeile weg', async () => {
    await render([entry()])
    expect(container.querySelector('.entry-herkunft')).toBeNull()
  })
})
