// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  sichtbarkeitUebersicht: vi.fn(),
  listTimeline: vi.fn(),
  visits: vi.fn(),
  rahmenGeraete: vi.fn(),
  revier: { einstellungen: vi.fn(), eintraege: vi.fn(), setEintrag: vi.fn() }
}))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import SichtbarkeitSection from './SichtbarkeitSection.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { ThemeProvider } from '../../themes/ThemeProvider.jsx'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Phase M: „Wer sieht was“ zeigt die dritte Sichtbarkeit „öffentlich“ (Mein Revier) - bei Tieren und Erinnerungen.
const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
const family = { ...home, isDemo: false, home, memberships: [] }
const dogs = [
  { id: 11, name: 'Benno', family_id: 1, can_edit: 1, shares: [] },
  { id: 12, name: 'Wilma', family_id: 1, can_edit: 1, shares: [] }
]
const entries = [
  { id: 101, dog_id: 11, family_id: 1, autor_name: 'P', datum: '2026-09-01', titel: 'Am See', text: '', foto_urls: [], privat: 0 },
  { id: 102, dog_id: 11, family_id: 1, autor_name: 'P', datum: '2026-08-01', titel: 'Impfung', text: '', foto_urls: [], privat: 0, gesundheit: { art: 'impfung' } },
  { id: 103, dog_id: 12, family_id: 1, autor_name: 'P', datum: '2026-07-01', titel: 'Nur wir', text: '', foto_urls: [], privat: 1 }
]

let container
let root

async function render(path) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId="standard">
          <DemoProvider value={family}>
            <SichtbarkeitSection family={family} onFamilyChange={vi.fn()} />
          </DemoProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  await act(async () => {})
}

const row = (titel) => [...container.querySelectorAll('.sicht-erinnerung')].find((el) => el.querySelector('strong').textContent === titel)
const buttonIn = (el, text) => [...el.querySelectorAll('button')].find((button) => button.textContent.trim() === text)

beforeEach(() => {
  setLang('de')
  api.listDogs.mockResolvedValue(dogs)
  api.sichtbarkeitUebersicht.mockResolvedValue({ tiere: [{ id: 11, privat: 0, geteilt: 2, tierheim: null }, { id: 12, privat: 1, geteilt: 0, tierheim: null }] })
  api.listTimeline.mockResolvedValue(entries)
  api.visits.mockResolvedValue({ besuche: [], gaeste: [] })
  api.rahmenGeraete.mockResolvedValue({ geraete: [] })
  api.revier.einstellungen.mockResolvedValue({ aktiv: true, gesperrt: false, tiere: [{ id: 11, name: 'Benno', sichtbar: true }, { id: 12, name: 'Wilma', sichtbar: false }] })
  api.revier.eintraege.mockResolvedValue({ ids: [] })
  api.revier.setEintrag.mockResolvedValue({ id: 101, oeffentlich: true, tierImProfil: true })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe('Wer sieht was – öffentlich (Mein Revier)', () => {
  test('Tiere: im öffentlichen Profil oder nicht', async () => {
    await render('/einstellungen?bereich=sichtbarkeit')
    const cards = [...container.querySelectorAll('.sicht-tier')]
    expect(cards[0].textContent).toContain('Im öffentlichen Profil (Mein Revier)')
    expect(cards[1].textContent).toContain('Kein öffentlicher Steckbrief')
  })

  test('Erinnerungen: öffentlich zeigen – nie privat, nie Gesundheit', async () => {
    await render('/einstellungen?bereich=sichtbarkeit&ansicht=erinnerungen')
    expect(buttonIn(row('Impfung'), 'Öffentlich zeigen')).toBeUndefined()
    expect(buttonIn(row('Nur wir'), 'Öffentlich zeigen')).toBeUndefined()
    await act(async () => buttonIn(row('Am See'), 'Öffentlich zeigen').click())
    expect(api.revier.setEintrag).toHaveBeenCalledWith(101, true)
    expect(row('Am See').textContent).toContain('Öffentlich – Mein Revier')
    expect(buttonIn(row('Am See'), 'Nicht mehr öffentlich')).toBeTruthy()
  })
})
