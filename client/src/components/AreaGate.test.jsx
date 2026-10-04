// @vitest-environment jsdom
import { StrictMode, act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { view, toast } = vi.hoisted(() => ({ view: vi.fn(), toast: vi.fn() }))
vi.mock('../api', () => ({ api: { view } }))
vi.mock('./Toast.jsx', () => ({ useToast: () => toast }))

import AreaGate, { targetAreaId } from './AreaGate.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
const atHome = { ...home, home, memberships: [{ id: 5, name: 'Familie Sonnenhang' }] }
const inGroup = { ...atHome, id: 5, name: 'Familie Sonnenhang', art: 'rudel' }

let container
let root

function Where() {
  const { pathname } = useLocation()
  return <output data-testid="where">{pathname}</output>
}

// Hält "me" wie App.jsx und mountet den Inhalt je Bereich neu (key) - so wie <main key={family.id}>.
function Shell({ initial, need }) {
  const [family, setFamily] = useState(initial)
  return (
    <div key={family.id}>
      <Routes>
        <Route
          path="/familien"
          element={<p className="families">Familien</p>}
        />
        <Route
          path="*"
          element={
            <AreaGate family={family} need={need} onFamilyChange={setFamily}>
              <p className="content">Inhalt von {family.name}</p>
            </AreaGate>
          }
        />
      </Routes>
      <Where />
    </div>
  )
}

async function render(initial, need, path = '/x') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <Shell initial={initial} need={need} />
        </MemoryRouter>
      </StrictMode>
    )
  )
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  view.mockReset()
  toast.mockReset()
})

const content = () => container.querySelector('.content')?.textContent
const where = () => container.querySelector('[data-testid="where"]').textContent

describe('targetAreaId', () => {
  test('"home" ist das eigene Zuhause (klassischer Login: der Bereich selbst), sonst die Id aus der Adresse', () => {
    expect(targetAreaId(inGroup, 'home')).toBe(1)
    expect(targetAreaId({ id: 9, art: 'rudel', home: { id: 9 } }, 'home')).toBe(9)
    expect(targetAreaId(atHome, '5')).toBe(5)
    expect(targetAreaId(atHome, 5)).toBe(5)
    for (const bad of ['abc', '0', '-1', '5x', '', null, undefined]) expect(targetAreaId(atHome, bad)).toBeNull()
  })
})

describe('AreaGate', () => {
  test('im richtigen Bereich: Inhalt sofort, kein Wechsel', async () => {
    await render(atHome, 'home')
    expect(content()).toBe('Inhalt von Zuhause am Deich')
    expect(view).not.toHaveBeenCalled()
  })

  test('anderer Bereich: genau ein api.view (auch unter StrictMode), dann der Inhalt im neuen Bereich', async () => {
    view.mockResolvedValue(inGroup)
    await render(atHome, '5')
    expect(view).toHaveBeenCalledTimes(1)
    expect(view).toHaveBeenCalledWith(5)
    expect(content()).toBe('Inhalt von Familie Sonnenhang')
    expect(where()).toBe('/x')
  })

  test('zurück nach Hause aus einer Familie', async () => {
    view.mockResolvedValue(atHome)
    await render(inGroup, 'home')
    expect(view).toHaveBeenCalledWith(1)
    expect(content()).toBe('Inhalt von Zuhause am Deich')
  })

  test('während des Wechsels steht nur der Platzhalter', async () => {
    view.mockReturnValue(new Promise(() => {}))
    await render(atHome, '5')
    expect(content()).toBeUndefined()
    expect(container.querySelector('[role="status"]').textContent).toBe('Lädt …')
  })

  test('scheitert der Wechsel: Hinweis, weiter zu /familien, kein zweiter Versuch', async () => {
    view.mockRejectedValue(new Error('Diesen Bereich gibt es nicht'))
    await render(atHome, '77')
    expect(toast).toHaveBeenCalledWith('Diesen Bereich gibt es nicht')
    expect(where()).toBe('/familien')
    expect(view).toHaveBeenCalledTimes(1)
  })

  test('antwortet der Server mit einem anderen Bereich, gilt das als Fehlschlag (keine Schleife)', async () => {
    view.mockResolvedValue(atHome)
    await render(atHome, '5')
    expect(view).toHaveBeenCalledTimes(1)
    expect(where()).toBe('/familien')
    expect(toast).toHaveBeenCalledTimes(1)
  })

  test('eine ungültige Id führt ohne Anfrage zu /familien', async () => {
    await render(atHome, 'abc')
    expect(view).not.toHaveBeenCalled()
    expect(where()).toBe('/familien')
  })
})
