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
