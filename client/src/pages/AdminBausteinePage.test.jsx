// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BUTTON_VARIANTS } from '../components/ui/Button.jsx'
import { CARD_VARIANTS } from '../components/ui/Card.jsx'
import { CHIP_TONES } from '../components/ui/Chip.jsx'

const { me } = vi.hoisted(() => ({ me: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { me } } }))

import AdminBausteinePage from './AdminBausteinePage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  me.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/admin/bausteine']}>
        <Routes>
          <Route path="/admin" element={<p data-testid="admin-home">Admin-Start</p>} />
          <Route path="/admin/bausteine" element={<AdminBausteinePage />} />
        </Routes>
      </MemoryRouter>
    )
  )
}

describe('AdminBausteinePage – Katalog /admin/bausteine', () => {
  test('ohne Admin-Sitzung zurück zu /admin', async () => {
    me.mockRejectedValue(new Error('401'))
    await render()
    expect(container.querySelector('[data-testid="admin-home"]')).not.toBeNull()
  })

  test('zeigt jeden Baustein in jeder Variante, Abschnitte sind benannt', async () => {
    me.mockResolvedValue({ username: 'admin' })
    await render()
    expect(container.querySelector('h1').textContent).toBe('Bausteine')
    for (const variant of CARD_VARIANTS) expect(container.querySelector(`.ui-card--${variant}`), variant).not.toBeNull()
    for (const tone of CHIP_TONES.filter((value) => value !== 'neutral')) expect(container.querySelector(`.ui-chip--${tone}`), tone).not.toBeNull()
    for (const variant of BUTTON_VARIANTS) expect(container.querySelector(`.btn-${variant}`), variant).not.toBeNull()
    expect(container.querySelectorAll('.ui-tile')).toHaveLength(3)
    expect(container.querySelector('.ui-empty')).not.toBeNull()
    for (const section of container.querySelectorAll('section[aria-labelledby]')) {
      expect(document.getElementById(section.getAttribute('aria-labelledby'))).not.toBeNull()
    }
    expect(container.querySelector('a[href="/admin"]').textContent).toContain('Zurück zum Admin')
  })
})
