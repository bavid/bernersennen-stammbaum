// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { getDog, listTimeline, profile, createHandover } = vi.hoisted(() => ({
  getDog: vi.fn(),
  listTimeline: vi.fn(),
  profile: vi.fn(),
  createHandover: vi.fn()
}))
vi.mock('../api', () => ({ api: { getDog, listTimeline, createHandover, partnerArea: { profile } } }))

import StartpaketPage from './StartpaketPage.jsx'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SHELTER = { id: 3, art: 'tierheim', name: 'Tierheim Wilma', partner: { name: 'Tierheim Wilma' } }
const DOG = { id: 9, name: 'Flocke', tierart: 'katze', geburtsdatum: '2023-02-01', beschreibung: 'Ruhig.', canEdit: true }
const HANDOVER = { code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' }

let container
let root
let seen

function Spy() {
  seen = useLocation()
  return null
}

async function render({ family = SHELTER, state } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[{ pathname: '/tier/9/startpaket', state }]}>
        <StartpaketPage dogId="9" family={family} />
        <Spy />
      </MemoryRouter>
    )
  )
  return container
}

beforeEach(() => {
  getDog.mockResolvedValue(DOG)
  listTimeline.mockResolvedValue([{ id: 1, datum: '2024-03-01', titel: 'Erster Tag', text: '', foto_urls: ['/m/1.jpg'] }])
  profile.mockResolvedValue({ name: 'Tierheim Wilma', logoUrl: '/partner-media/w.png' })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
  setLang('de')
})

describe('StartpaketPage', () => {
  test('Tierheim sieht drei Seiten: Steckbrief, Erinnerungen, Übergabe', async () => {
    await render({ state: { handover: HANDOVER } })
    const sheets = container.querySelectorAll('.startpaket-sheet')
    expect(sheets).toHaveLength(3)
    expect(sheets[0].textContent).toContain('Flocke')
    expect(sheets[0].textContent).toContain('Tierheim Wilma')
    expect(sheets[1].textContent).toContain('Erster Tag')
    expect(sheets[2].textContent).toContain('So geht’s weiter')
    expect(sheets[2].textContent).toContain('Heute kostenlos. Keine fremde Werbung, kein Tracking, kein Datenhandel.')
  })

  test('Code nur im QR und in der Druckzeile – nie in der Adresse, danach aus dem Verlauf entfernt', async () => {
    await render({ state: { handover: HANDOVER } })
    expect(container.querySelector('.vk-qr')).not.toBeNull()
    expect(container.querySelector('.startpaket-code.print-only').textContent).toContain('ABCD-1234-EFGH')
    expect(seen.pathname + seen.search).toBe('/tier/9/startpaket')
    expect(seen.state).toBeNull()
  })

  test('ohne Code: Erzeugen wie im Übergabe-Dialog, dann erscheint der QR', async () => {
    createHandover.mockResolvedValue(HANDOVER)
    await render()
    expect(container.querySelector('.vk-qr')).toBeNull()
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Übergabe-Code erzeugen')
    await act(async () => button.click())
    expect(createHandover).toHaveBeenCalledWith(9)
    expect(container.querySelector('.vk-qr')).not.toBeNull()
  })

  test('fremdes Tier oder anderer Bereich: kein Zugriff', async () => {
    getDog.mockResolvedValue({ ...DOG, canEdit: false })
    await render()
    expect(container.querySelector('.startpaket-sheet')).toBeNull()
    expect(container.textContent).toContain('Kein Zugriff')
    // E2E 2026-10-10: Druckseiten ohne App-Hülle - auch Hinweis-Zustände brauchen einen Weg zurück.
    expect(container.querySelector('a[href="/tier/9"]')?.textContent).toBe('Zurück zum Tier')
  })

  test('Demo-Tierheim: Muster-QR, kein Erzeugen', async () => {
    await render({ family: { ...SHELTER, isDemo: true } })
    expect(container.querySelector('.startpaket-muster').textContent).toBe('Muster')
    expect(container.textContent).not.toContain('Übergabe-Code erzeugen')
    expect(createHandover).not.toHaveBeenCalled()
  })

  test('englische Beschriftung', async () => {
    setLang('en')
    await render({ state: { handover: HANDOVER } })
    expect(container.textContent).toContain('Starter pack – Flocke')
    expect(container.textContent).toContain('What happens next')
    expect(container.textContent).toContain('Free today. No third-party ads, no tracking, no data selling.')
  })
})
