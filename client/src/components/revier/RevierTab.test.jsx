// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  revier: {
    radar: vi.fn(),
    feed: vi.fn(),
    folge: vi.fn(),
    ausgeblendet: vi.fn(),
    folgen: vi.fn(),
    entfolgen: vi.fn(),
    einblenden: vi.fn()
  }
}))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import RevierTab from './RevierTab.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const profil = (slug, extra = {}) => ({
  slug,
  name: `Profil ${slug}`,
  text: null,
  bild: null,
  band: 'unter5',
  tiere: [{ name: 'Benno', tierart: 'hund', rasse: null, foto: null }],
  neueste: { id: 1, titel: 'Am Deich', datum: '2026-10-01', fotos: [], tier: { name: 'Benno' } },
  folgeIch: false,
  ...extra
})

let container
let root

async function render({ plz = '21037', me = { isDemo: false } } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={me}>
          <RevierTab plz={plz} onPlzChange={vi.fn()} />
        </DemoProvider>
      </MemoryRouter>
    )
  )
  await act(async () => {})
}

const byText = (selector, text) => [...container.querySelectorAll(selector)].find((el) => el.textContent.trim() === text)

beforeEach(() => {
  setLang('de')
  localStorage.clear()
  api.revier.radar.mockResolvedValue({ umkreis: 25, ort: 'Hamburg Spadenland', profile: [profil('aa'), profil('bb', { band: '10-25', ort: 'Hamburg' })] })
  api.revier.feed.mockResolvedValue({ eintraege: [{ id: 7, titel: 'Sonnenaufgang', datum: '2026-10-02', fotos: [], tier: { name: 'Benno' }, profil: { slug: 'aa', name: 'Profil aa', bild: null } }], weiter: null })
  api.revier.folge.mockResolvedValue({ profile: [profil('aa')] })
  api.revier.ausgeblendet.mockResolvedValue({ profile: [{ slug: 'cc', name: 'Profil cc' }] })
  api.revier.folgen.mockResolvedValue({ folgeIch: true })
  api.revier.entfolgen.mockResolvedValue(null)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
  setLang('de')
})

describe('Entdecken › Mein Revier', () => {
  test('Radar: Stufen statt Kilometer, PLZ nur im Body, Umkreis wechselbar', async () => {
    await render()
    expect(api.revier.radar).toHaveBeenCalledWith({ plz: '21037', umkreis: 25, tierart: '' })
    const karten = [...container.querySelectorAll('.revier-karte')]
    expect(karten.map((el) => el.querySelector('h3').textContent)).toEqual(['Profil aa', 'Profil bb'])
    expect(karten[0].textContent).toContain('unter 5 km')
    expect(karten[1].textContent).toContain('10–25 km · Hamburg')
    expect(container.textContent).not.toMatch(/\b\d{5}\b/)
    await act(async () => byText('button', 'bis 5 km').click())
    expect(api.revier.radar).toHaveBeenLastCalledWith({ plz: '21037', umkreis: 5, tierart: '' })
  })

  test('Folgen und Entfolgen', async () => {
    await render()
    const knopf = () => container.querySelector('.revier-karte .revier-karte-fuss button')
    await act(async () => knopf().click())
    expect(api.revier.folgen).toHaveBeenCalledWith('aa')
    expect(knopf().textContent).toBe('Ich folge')
    await act(async () => knopf().click())
    expect(api.revier.entfolgen).toHaveBeenCalledWith('aa')
  })

  test('in der Demo nur ansehen', async () => {
    await render({ me: { isDemo: true } })
    expect(container.querySelector('.revier-karte-fuss button').disabled).toBe(true)
  })

  test('Aus deinem Revier und Ich folge', async () => {
    await render()
    await act(async () => byText('button', 'Aus deinem Revier').click())
    expect(container.querySelector('.revier-eintrag h3').textContent).toBe('Sonnenaufgang')
    await act(async () => byText('button', 'Ich folge').click())
    expect(container.querySelector('.revier-folge-name').textContent).toBe('Profil aa')
    expect(container.textContent).toContain('Ausgeblendete Profile (1)')
  })

  test('ohne PLZ fragt das Radar danach', async () => {
    const err = Object.assign(new Error('Bitte eine Postleitzahl angeben.'), { status: 400, details: { code: 'PLZ' } })
    api.revier.radar.mockRejectedValue(err)
    await render({ plz: '' })
    expect(api.revier.radar).toHaveBeenCalledWith({ plz: null, umkreis: 25, tierart: '' })
    expect(container.querySelector('.revier-plz input')).not.toBeNull()
  })

  test('auf Englisch', async () => {
    setLang('en')
    await render()
    expect(container.textContent).toContain('under 5 km')
    expect(byText('button', 'From your neighbourhood')).toBeTruthy()
    expect(container.textContent).toContain('Set up your own public profile')
  })
})
