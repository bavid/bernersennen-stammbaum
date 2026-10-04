// @vitest-environment jsdom
import { act, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('./api', () => ({ api: { view: vi.fn() } }))
vi.mock('./pages/BilderrahmenPage.jsx', () => ({
  default: ({ areaKey }) => <p data-testid="rahmen">{`Diashow ${areaKey ?? 'zuhause'}`}</p>
}))

import { api } from './api'
import AreaRoutes from './AreaRoutes.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, memberships: [{ id: 5, name: 'Familie Sonnenhang' }] }
const inGroup = { id: 5, name: 'Familie Sonnenhang', art: 'rudel', home, memberships: atHome.memberships }

let container
let root

async function render(family, entry, onFamilyChange = () => {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Suspense fallback={null}>
          <AreaRoutes family={family} onFamilyChange={onFamilyChange} />
        </Suspense>
      </MemoryRouter>
    )
  )
}

beforeEach(() => api.view.mockReset())

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
})

// Review B+: /bilderrahmen?in=<Familie> - die Diashow einer Familie; das Gate wechselt dorthin, nur in eigene Mitgliedschaften.
describe('/bilderrahmen?in=', () => {
  test('ohne Angabe die Diashow des eigenen Zuhauses', async () => {
    await render(atHome, '/bilderrahmen')
    expect(container.querySelector('[data-testid="rahmen"]').textContent).toBe('Diashow zuhause')
    expect(api.view).not.toHaveBeenCalled()
  })

  test('aus dem Zuhause mit ?in=5: das Gate wechselt in die Familie, die Diashow kennt sie', async () => {
    api.view.mockResolvedValue(inGroup)
    const onFamilyChange = vi.fn()
    await render(atHome, '/bilderrahmen?in=5', onFamilyChange)
    expect(api.view).toHaveBeenCalledWith(5)
    expect(onFamilyChange).toHaveBeenCalledWith(inGroup)
  })

  test('in der Familie: die Diashow der Familie (eigene Auswahl, ohne private Erinnerungen)', async () => {
    await render(inGroup, '/bilderrahmen?in=5')
    expect(container.querySelector('[data-testid="rahmen"]').textContent).toBe('Diashow 5')
    expect(api.view).not.toHaveBeenCalled()
  })

  test('?in=<das eigene Zuhause> ist wie ohne Angabe; Unsinn wechselt nicht', async () => {
    await render(atHome, '/bilderrahmen?in=1')
    expect(container.querySelector('[data-testid="rahmen"]').textContent).toBe('Diashow zuhause')
    act(() => root.unmount())
    container.remove()
    await render(atHome, '/bilderrahmen?in=1e3')
    expect(container.querySelector('[data-testid="rahmen"]').textContent).toBe('Diashow zuhause')
    expect(api.view).not.toHaveBeenCalled()
  })
})
