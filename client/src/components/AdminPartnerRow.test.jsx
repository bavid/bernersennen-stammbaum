// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api', () => ({ api: { admin: { createPartnerArea: vi.fn(), renewPartnerAreaKey: vi.fn(), updatePartner: vi.fn(), einblicke: vi.fn() } } }))

import AdminPartnerRow from './AdminPartnerRow.jsx'

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

const partner = {
  id: 4,
  slug: 'hundeschule-wiesengrund',
  name: 'Hundeschule Wiesengrund',
  typ: 'hundeschule',
  status: 'aktiv',
  gesperrt: 0,
  area_family_id: null,
  area_art: null
}

const noop = () => {}

async function render(row) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ul>
        <AdminPartnerRow partner={row} onEdit={noop} onToggleStatus={noop} onDelete={noop} onKeyIssued={noop} onChanged={noop} />
      </ul>
    )
  )
  return container
}

const viewLink = () => container.querySelector('.admin-view-link')

describe('AdminPartnerRow – „Als Admin ansehen“ (Phase 5 Task 5b)', () => {
  test('mit Bereich: Link in neuem Tab auf /admin-ansicht/<Bereichs-Id>', async () => {
    await render({ ...partner, area_family_id: 43, area_art: 'partner' })

    const link = viewLink()
    expect(link).not.toBeNull()
    expect(link.textContent).toContain('Als Admin ansehen')
    expect(link.getAttribute('href')).toBe('/admin-ansicht/43')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    // Das Portal bleibt daneben erreichbar.
    expect(container.querySelector('a[href="/p/hundeschule-wiesengrund"]')).not.toBeNull()
  })

  test('ohne Bereich gibt es nichts anzusehen - kein Link', async () => {
    await render(partner)
    expect(viewLink()).toBeNull()
  })
})
