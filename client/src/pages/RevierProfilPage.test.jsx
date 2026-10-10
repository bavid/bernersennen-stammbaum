// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  revier: { profil: vi.fn(), folgen: vi.fn(), entfolgen: vi.fn(), ausblenden: vi.fn(), einblenden: vi.fn() }
}))
vi.mock('../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../components/Toast.jsx', () => ({ useToast: () => toast }))

import RevierProfilPage from './RevierProfilPage.jsx'
import { DemoProvider } from '../lib/demo.js'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const eintrag = (id, titel) => ({ id, titel, datum: '2026-10-01', text: 'Schön war es.', fotos: ['/uploads/a.jpg'], tier: { name: 'Benno', tierart: 'hund' } })
const PROFIL = {
  slug: 'spadenland',
  name: 'Benno vom Spadenland',
  text: 'Morgens um sieben unterwegs.',
  bild: null,
  ort: 'Hamburg',
  aktiv: true,
  eigenes: false,
  tiere: [{ name: 'Benno', tierart: 'hund', rasse: 'Labrador-Mix', foto: null }],
  eintraege: [eintrag(9, 'Sonnenaufgang')],
  weiter: 9,
  follower: { anzahl: 3, namen: ['Lotte & Minka'], weitere: 2 },
  folgeIch: false,
  ausgeblendet: false
}

let container
let root

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/revier/spadenland']}>
        <DemoProvider value={{ isDemo: false }}>
          <Routes>
            <Route path="/revier/:slug" element={<RevierProfilPage />} />
          </Routes>
        </DemoProvider>
      </MemoryRouter>
    )
  )
  await act(async () => {})
}

const byText = (selector, text) => [...container.querySelectorAll(selector)].find((el) => el.textContent.trim() === text)

beforeEach(() => {
  setLang('de')
  api.revier.profil.mockImplementation(async (slug, vor) => (vor ? { ...PROFIL, eintraege: [eintrag(4, 'Im Graben')], weiter: null } : PROFIL))
  api.revier.folgen.mockResolvedValue({ folgeIch: true })
  api.revier.ausblenden.mockResolvedValue({ ausgeblendet: true })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
  document.head.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove())
})

describe('/revier/:slug', () => {
  test('Profil mit Ort, Folgenden, Tieren und öffentlichen Erinnerungen – noindex', async () => {
    await render()
    expect(api.revier.profil).toHaveBeenCalledWith('spadenland')
    expect(container.querySelector('h1').textContent).toBe('Benno vom Spadenland')
    expect(container.textContent).toContain('Hamburg')
    expect(container.textContent).toContain('3 Folgende: Lotte & Minka und 2 weitere')
    expect(container.textContent).toContain('Labrador-Mix')
    expect(document.head.querySelector('meta[name="robots"]').getAttribute('content')).toBe('noindex')
    await act(async () => byText('button', 'Mehr zeigen').click())
    expect(api.revier.profil).toHaveBeenLastCalledWith('spadenland', 9)
    expect([...container.querySelectorAll('.revier-eintrag h3')].map((el) => el.textContent)).toEqual(['Sonnenaufgang', 'Im Graben'])
  })

  test('folgen und für mich ausblenden', async () => {
    await render()
    await act(async () => byText('button', 'Folgen').click())
    expect(api.revier.folgen).toHaveBeenCalledWith('spadenland')
    await act(async () => byText('button', 'Für mich ausblenden').click())
    expect(api.revier.ausblenden).toHaveBeenCalledWith('spadenland')
    expect(byText('button', 'Wieder einblenden')).toBeTruthy()
  })

  test('ausgeschaltet oder gesperrt: „gibt es nicht (mehr)“', async () => {
    api.revier.profil.mockRejectedValue(Object.assign(new Error('Profil nicht gefunden'), { status: 404 }))
    await render()
    expect(container.textContent).toContain('Dieses Profil gibt es nicht (mehr).')
  })
})
