// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { viewFamily } = vi.hoisted(() => ({ viewFamily: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { viewFamily } } }))

import AdminViewStartPage from './AdminViewStartPage.jsx'

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
  viewFamily.mockReset()
})

function apiError(status, message) {
  return Object.assign(new Error(message), { status })
}

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AdminViewStartPage {...props} />
      </MemoryRouter>
    )
  )
  return container
}

const me = { id: 7, name: 'Zuhause Birkenweg', art: 'zuhause', isDemo: false, adminView: true, home: { id: 7 }, memberships: [] }

describe('AdminViewStartPage – /admin-ansicht/:id', () => {
  test('ruft POST /api/admin/view/:id und übergibt die Antwort (me mit adminView) an App', async () => {
    viewFamily.mockResolvedValue(me)
    const onEntered = vi.fn()
    await render({ familyId: '7', onEntered })

    expect(viewFamily).toHaveBeenCalledWith('7')
    expect(onEntered).toHaveBeenCalledWith(me)
    expect(container.querySelector('.error-banner')).toBeNull()
  })

  test('401: Hinweis auf den Admin-Login mit Link zu /admin, App wird nicht informiert', async () => {
    viewFamily.mockRejectedValue(apiError(401, 'Nur für Admins'))
    const onEntered = vi.fn()
    await render({ familyId: '7', onEntered })

    expect(onEntered).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.textContent).toContain('Bitte zuerst als Admin anmelden.')
    const link = container.querySelector('a')
    expect(link.getAttribute('href')).toBe('/admin')
    expect(link.textContent).toContain('Zum Admin-Login')
  })

  test('404: meldet den unbekannten Bereich', async () => {
    viewFamily.mockRejectedValue(apiError(404, 'Diesen Bereich gibt es nicht'))
    await render({ familyId: '999', onEntered: vi.fn() })

    expect(container.textContent).toContain('Diesen Bereich gibt es nicht.')
    expect(container.querySelector('a').textContent).toContain('Zurück zum Admin')
  })

  test('andere Fehler zeigen die Meldung des Servers', async () => {
    viewFamily.mockRejectedValue(apiError(500, 'Unerwarteter Serverfehler'))
    await render({ familyId: '7', onEntered: vi.fn() })

    expect(container.textContent).toContain('Unerwarteter Serverfehler')
  })

  test('solange geladen wird: Status mit Hinweis auf die Nur-Lesen-Sitzung', async () => {
    viewFamily.mockReturnValue(new Promise(() => {}))
    await render({ familyId: '7', onEntered: vi.fn() })

    const card = container.querySelector('[role="status"]')
    expect(card.getAttribute('aria-busy')).toBe('true')
    expect(container.textContent).toContain('Bereich wird geöffnet …')
    expect(container.textContent).toContain('nur lesend')
  })
})
