// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  erlebtMitOffen: vi.fn(),
  visits: vi.fn(),
  createTimelineEntry: vi.fn(),
  erlebtMitTiere: vi.fn(),
  upload: vi.fn()
}))
vi.mock('../api', () => ({ api }))

import StartPage from './StartPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, role: 'leitung', memberships: [{ id: 5, name: 'Familie Sonnenhang', rolle: 'mitglied' }], besuche: [] }
const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', role: 'leitung', home: { id: 2, art: 'rudel' }, memberships: [] }

const dog = (id, name, extra = {}) => ({ id, name, name_unbekannt: 0, tierart: 'hund', foto_url: null, bei_uns_seit: null, bei_uns_bis: null, ...extra })
const entry = (id, extra = {}) => ({
  id,
  dog_id: 10,
  dog_name: 'Nele',
  titel: `Beitrag ${id}`,
  text: 'Heute am See.',
  foto_urls: [],
  autor_name: 'Mara',
  created_at: '2026-09-27 10:00:00',
  comment_count: 0,
  ...extra
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
  api.listDogs.mockResolvedValue([])
  api.recentActivity.mockResolvedValue([])
  api.listNotes.mockResolvedValue([])
  api.erlebtMitOffen.mockResolvedValue([])
  api.visits.mockResolvedValue({ besuche: [], gaeste: [] })
  api.erlebtMitTiere.mockResolvedValue([])
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  for (const mock of Object.values(api)) mock.mockReset()
  vi.useRealTimers()
})

async function render(family = atHome, themeId = 'standard') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <StartPage family={family} onFamilyChange={() => {}} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

describe('StartPage (Phase W)', () => {
  test('Neuigkeiten: bis zu 20 Beiträge als Karten mit Anriss, Fotos und Kommentaren, je ein Link zum Beitrag', async () => {
    api.recentActivity.mockResolvedValue([
      entry(7, { foto_urls: ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg', '/uploads/d.jpg'], comment_count: 2 }),
      entry(6)
    ])
    await render()

    expect(api.recentActivity).toHaveBeenCalledWith(20)
    const cards = [...container.querySelectorAll('.feed-card')]
    expect(cards).toHaveLength(2)
    expect(cards[0].querySelector('a').getAttribute('href')).toBe('/tier/10#entry-7')
    expect(cards[0].querySelector('.feed-card-title').textContent).toBe('Beitrag 7')
    expect(cards[0].querySelectorAll('.feed-card-photos img')).toHaveLength(3)
    expect(cards[0].querySelector('.feed-card-more').textContent).toBe('+1')
    expect(cards[0].querySelector('.feed-card-comments').textContent).toBe('2 Kommentare')
    expect(cards[1].querySelector('.feed-card-comments')).toBeNull()
  })

  test('zuerst sechs Beiträge, der Rest hinter "Weitere Neuigkeiten" - danach steht der Fokus auf dem ersten neuen', async () => {
    api.recentActivity.mockResolvedValue(Array.from({ length: 9 }, (_, index) => entry(index + 1)))
    await render()
    expect(container.querySelectorAll('.feed-card')).toHaveLength(6)
    const more = container.querySelector('.start-more')
    expect(more.textContent).toBe('Weitere Neuigkeiten (3)')
    act(() => more.click())
    expect(container.querySelectorAll('.feed-card')).toHaveLength(9)
    expect(container.querySelector('.start-more')).toBeNull()
    expect(document.activeElement.getAttribute('href')).toBe('/tier/10#entry-7')
  })

  test('ohne Beiträge ein freundlicher Leerzustand', async () => {
    await render()
    expect(container.querySelector('.start-news').textContent).toContain('Noch keine Neuigkeiten.')
  })

  test('Erzählen: nur bearbeitbare, lebende Tiere zur Wahl; die Wahl öffnet den Beitrag-Dialog, der neue Beitrag steht oben', async () => {
    api.listDogs.mockResolvedValue([
      dog(10, 'Nele'),
      dog(11, 'Aiko', { bei_uns_bis: '2020-01-01' }),
      dog(12, 'Wilma', { can_edit: 0, shared_from: 'Zuhause Möwenweg' })
    ])
    api.createTimelineEntry.mockResolvedValue({ id: 99, dog_id: 10, titel: 'Erster Schnee', text: '', foto_urls: [], created_at: '2026-09-28 11:00:00' })
    await render()

    const composer = container.querySelector('.start-composer')
    expect(composer.querySelector('h2').textContent).toBe('Was erlebt euer Tier?')
    const choices = [...composer.querySelectorAll('.start-composer-animal')]
    // Der Name ohne den (für Screenreader verborgenen) Anfangsbuchstaben im Avatar
    expect(choices.map((button) => button.querySelector(':scope > span').textContent)).toEqual(['Nele'])
    act(() => choices[0].click())
    expect(choices[0].getAttribute('aria-pressed')).toBe('true')

    const setValue = (input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    act(() => {
      setValue(container.querySelector('#entry-title'), 'Erster Schnee')
      setValue(container.querySelector('#entry-author'), 'Mara')
    })
    expect(container.querySelector('.entry-form button[type="submit"]').textContent).toBe('Erzählen')
    await act(async () => container.querySelector('.entry-form').requestSubmit())

    expect(api.createTimelineEntry).toHaveBeenCalledWith(expect.objectContaining({ dogId: 10, titel: 'Erster Schnee' }))
    expect(container.querySelector('.feed-card-title').textContent).toBe('Erster Schnee')
    expect(container.querySelector('.feed-card a').getAttribute('href')).toBe('/tier/10#entry-99')
  })

  test('Berner: "Was erlebt euer Hund?"', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele')])
    await render(atHome, 'berner')
    expect(container.querySelector('.start-composer h2').textContent).toBe('Was erlebt euer Hund?')
  })

  test('Bald: Jahrestag innerhalb von 30 Tagen, Termin und der Weg zu den Notizen', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele', { bei_uns_seit: '2021-10-05' })])
    api.listNotes.mockResolvedValue([{ id: 1, text: 'Geschwistertreffen', termin_datum: '2026-10-12', termin_zeit: null, replies: [] }])
    await render()

    const soon = container.querySelector('.start-soon')
    expect(soon.textContent).toContain('In 7 Tagen: Nele ist 5 Jahre bei euch')
    expect(soon.textContent).toContain('Geschwistertreffen')
    expect(soon.querySelector('a').getAttribute('href')).toBe('/pinnwand')
    expect(soon.querySelector('a').textContent).toBe('Notizen (1) ')
  })

  test('ohne Termin, Notizen und nahen Jahrestag: kein Kasten "Bald"', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele', { bei_uns_seit: '2020-01-01' })])
    await render()
    expect(container.querySelector('.start-soon')).toBeNull()
  })

  test('Für dich: offene „Erlebt mit“-Anfragen und neue Gäste nur, wenn /me welche meldet', async () => {
    api.erlebtMitOffen.mockResolvedValue([
      { requestId: 3, dogName: 'Wilma', tier: 'Nele', zuhause: 'Zuhause am Deich', titel: 'Deichrunde', datum: '2026-08-30', foto_urls: [], autor_name: 'Nissen' }
    ])
    await render({ ...atHome, erlebtMitOffen: 1 })
    const forYou = container.querySelector('.start-foryou')
    expect(forYou.querySelector('h2').textContent).toBe('Für dich 1')
    expect(forYou.textContent).toContain('Wilma war dabei – übernehmen?')
    act(() => root.unmount())
    root = null
    container.remove()
    api.erlebtMitOffen.mockClear()

    await render({ ...atHome, erlebtMitOffen: 0, neueGaeste: 0 })
    expect(container.querySelector('.start-foryou')).toBeNull()
    expect(api.erlebtMitOffen).not.toHaveBeenCalled()
    expect(api.visits).not.toHaveBeenCalled()
  })

  test('Meine Familien am Rand mit Rolle und Link zur Gruppenseite', async () => {
    await render()
    const card = container.querySelector('.start-families')
    expect(card.querySelector('h2').textContent).toBe('Meine Familien')
    const link = card.querySelector('a')
    expect(link.getAttribute('href')).toBe('/familien/5')
    expect(link.textContent).toBe('Familie SonnenhangMitglied')
  })

  test('klassischer Login: Neuigkeiten der Familie, kein Rand mit Familien, keine Notizen-Abkürzung', async () => {
    api.listNotes.mockResolvedValue([{ id: 1, text: 'Hallo', termin_datum: null, replies: [] }])
    await render(classic)
    expect(container.querySelector('h1').textContent).toBe('Start – Rudel vom Heidekamp')
    expect(container.querySelector('.start-families')).toBeNull()
    expect(container.querySelector('.start-soon')).toBeNull()
  })
})
