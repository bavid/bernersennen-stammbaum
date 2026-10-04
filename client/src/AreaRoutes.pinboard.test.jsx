// @vitest-environment jsdom
import { act, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('./api', () => ({ api: { view: vi.fn() } }))
vi.mock('./pages/PinboardPage.jsx', () => ({ default: ({ family }) => <p data-testid="pinnwand">{`Pinnwand von ${family.id}`}</p> }))

import { api } from './api'
import AreaRoutes from './AreaRoutes.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, memberships: [{ id: 5, name: 'Familie Sonnenhang' }] }
const inGroup = { id: 5, name: 'Familie Sonnenhang', art: 'rudel', home, memberships: atHome.memberships }

let container
let root

function Where() {
  const { pathname, search } = useLocation()
  return <output>{`${pathname}${search}`}</output>
}

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
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
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

describe('/pinnwand (Suche: Zettel des eigenen Zuhauses)', () => {
  test('im eigenen Zuhause die Pinnwand des Zuhauses', async () => {
    await render(atHome, '/pinnwand?in=home')
    expect(container.querySelector('[data-testid="pinnwand"]').textContent).toBe('Pinnwand von 1')
    expect(api.view).not.toHaveBeenCalled()
  })

  test('in einer Familie ohne ?in=home weiter zu deren Reiter', async () => {
    await render(inGroup, '/pinnwand')
    expect(container.querySelector('output').textContent).toBe('/familien/5?reiter=pinnwand')
  })

  test('in einer Familie mit ?in=home: das Gate wechselt nach Hause', async () => {
    api.view.mockResolvedValue(atHome)
    const onFamilyChange = vi.fn()
    await render(inGroup, '/pinnwand?in=home', onFamilyChange)
    expect(api.view).toHaveBeenCalledWith(1)
    expect(onFamilyChange).toHaveBeenCalledWith(atHome)
  })
})
