// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api', () => ({ api: { admin: { createPartnerArea: vi.fn(), renewPartnerAreaKey: vi.fn(), updatePartner: vi.fn(), einblicke: vi.fn() } } }))

import AdminPartnerRow from './AdminPartnerRow.jsx'
import { api } from '../api'

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

async function render(row, { onChanged = noop } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ul>
        <AdminPartnerRow partner={row} onEdit={noop} onToggleStatus={noop} onDelete={noop} onKeyIssued={noop} onChanged={onChanged} />
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

describe('AdminPartnerRow – Schalter „Vertrauenswürdig“ (V-Fehler 3)', () => {
  const trustSwitch = () => container.querySelector('.admin-partner-trust input[role="switch"]')

  afterEach(() => api.admin.updatePartner.mockReset())

  test('aus: Schalter mit kurzer Erklärung; Einschalten schickt den vollen Datensatz mit vertrauenswuerdig: true', async () => {
    api.admin.updatePartner.mockResolvedValue({ ...partner, vertrauenswuerdig: 1 })
    const onChanged = vi.fn()
    await render({ ...partner, plz: '10115', vertrauenswuerdig: 0 }, { onChanged })

    const toggle = trustSwitch()
    expect(toggle.checked).toBe(false)
    expect(toggle.closest('label').textContent).toBe('Vertrauenswürdig')
    expect(container.querySelector(`#${toggle.getAttribute('aria-describedby')}`).textContent).toBe(
      'Änderungen an schon freigegebenen Beiträgen gehen ohne neue Prüfung online. Neue Beiträge prüfst du weiterhin.'
    )

    await act(async () => toggle.click())
    expect(api.admin.updatePartner).toHaveBeenCalledWith(4, expect.objectContaining({ name: 'Hundeschule Wiesengrund', plz: '10115', vertrauenswuerdig: true }))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  test('an: Ausschalten schickt false; ein Fehler steht am Schalter', async () => {
    api.admin.updatePartner.mockRejectedValue(new Error('Diesen Partner gibt es nicht'))
    const onChanged = vi.fn()
    await render({ ...partner, vertrauenswuerdig: 1 }, { onChanged })

    expect(trustSwitch().checked).toBe(true)
    await act(async () => trustSwitch().click())
    expect(api.admin.updatePartner).toHaveBeenCalledWith(4, expect.objectContaining({ vertrauenswuerdig: false }))
    expect(container.querySelector('.admin-partner-trust [role="alert"]').textContent).toBe('Diesen Partner gibt es nicht')
    expect(onChanged).not.toHaveBeenCalled()
    expect(trustSwitch().disabled).toBe(false)
  })
})
