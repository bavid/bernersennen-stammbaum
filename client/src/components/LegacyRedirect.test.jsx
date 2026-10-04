// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import LegacyRedirect from './LegacyRedirect.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
const atHome = { ...home, home }
const inGroup = { id: 5, name: 'Familie Sonnenhang', art: 'rudel', home }
const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', home: { id: 2, art: 'rudel' } }

let container
let root

function Landing() {
  const { pathname, search, hash, state } = useLocation()
  return <output>{JSON.stringify({ to: `${pathname}${search}${hash}`, draft: state?.draft ?? null })}</output>
}

async function render(family, kind, entry) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/alt" element={<LegacyRedirect family={family} kind={kind} />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </MemoryRouter>
    )
  )
  return JSON.parse(container.querySelector('output').textContent)
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
})

describe('LegacyRedirect', () => {
  test('behält Query, Hash und state.draft', async () => {
    const draft = { text: 'Geschwistertreffen!', terminDatum: '2026-10-12' }
    const landed = await render(inGroup, 'pinnwand', { pathname: '/alt', search: '?x=1', hash: '#n', state: { draft } })
    expect(landed).toEqual({ to: '/familien/5?reiter=pinnwand&x=1#n', draft })
  })

  test('Stammbaum im Zuhause landet bei Tiere mit derselben Ansicht', async () => {
    expect((await render(atHome, 'tree', '/alt?ansicht=stammbaum')).to).toBe('/tiere?ansicht=stammbaum')
  })

  test('ohne Ziel im Kontext: zur Startseite', async () => {
    expect((await render(classic, 'mitglieder', '/alt')).to).toBe('/start')
  })
})
