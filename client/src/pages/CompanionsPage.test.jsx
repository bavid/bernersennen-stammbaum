// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { listDogs, erlebtMitOffen } = vi.hoisted(() => ({ listDogs: vi.fn(), erlebtMitOffen: vi.fn() }))
vi.mock('../api', () => ({ api: { listDogs, erlebtMitOffen } }))

import CompanionsPage from './CompanionsPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
})

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  listDogs.mockReset()
  erlebtMitOffen.mockReset()
  vi.useRealTimers()
})

const dog = (id, name, extra = {}) => ({
  id,
  name,
  name_unbekannt: 0,
  tierart: 'hund',
  geschlecht: 'ruede',
  foto_url: null,
  bei_uns_seit: null,
  bei_uns_bis: null,
  abschied_grund: null,
  herkunft_art: null,
  herkunft_text: null,
  geburtsdatum: null,
  ...extra
})

async function render(dogs, themeId = 'standard', family = { id: 1, name: 'Zuhause am See' }) {
  listDogs.mockResolvedValue(dogs)
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <CompanionsPage family={family} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  // eine weitere Runde für das async listDogs()
  await act(async () => {})
  return container
}

// Phase U: der Weg zum Baum heißt wie im Auftritt - Berner wortgleich wie bisher.
test.each([
  ['standard', 'Die Familie pflegst du in der Familienbande.', 'Familienbande'],
  ['berner', 'Das Rudel pflegst du im Stammbaum.', 'Stammbaum']
])('Hinweis zum Baum im Auftritt %s', async (themeId, sentence, linkText) => {
  await render([], themeId)
  const hint = [...container.querySelectorAll('.hero-hint')].find((p) => p.querySelector('a[href="/stammbaum"]'))
  expect(hint.textContent).toBe(sentence)
  expect(hint.querySelector('a').textContent).toBe(linkText)
})

test('zeigt Kennzahlen für Tiere gesamt, aktuell lebende Tiere und Jahre gemeinsam', async () => {
  await render([
    dog(1, 'Nele', { bei_uns_seit: '2016-09-20' }),
    dog(2, 'Aiko', { bei_uns_seit: '2010-01-01', bei_uns_bis: '2018-01-01', abschied_grund: 'verstorben' })
  ])
  const stats = [...container.querySelectorAll('.stats dd')].map((el) => el.textContent)
  expect(stats).toEqual(['2', '1', '18'])
})

test('Audit V7a: beim Laden stehen die Kennzahlen schon mit Platzhaltern da (kein Nachrutschen), ohne Tiere danach nicht', async () => {
  let resolve
  listDogs.mockReturnValue(new Promise((done) => (resolve = done)))
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <ThemeProvider themeId="standard">
          <CompanionsPage family={{ id: 1, name: 'Zuhause am See' }} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  expect([...container.querySelectorAll('.stats dd')].map((el) => el.textContent)).toEqual(['–', '–', '–'])
  expect(container.querySelector('.stats').getAttribute('aria-busy')).toBe('true')
  await act(async () => resolve([]))
  expect(container.querySelector('.stats')).toBeNull()
})

test('zeigt den Jahrestag-Hinweis, wenn er innerhalb von 30 Tagen liegt', async () => {
  await render([dog(1, 'Nele', { bei_uns_seit: '2021-10-05' })])
  const hint = container.querySelector('.companions-anniversary')
  expect(hint.textContent).toBe('In 7 Tagen: Nele ist 5 Jahre bei euch')
})

test('zeigt keinen Jahrestag-Hinweis, wenn er weiter als 30 Tage entfernt ist', async () => {
  await render([dog(1, 'Nele', { bei_uns_seit: '2020-01-01' })])
  expect(container.querySelector('.companions-anniversary')).toBeNull()
})

test('Leerzustand ohne Tiere mit Einzugs- oder Geburtsdatum', async () => {
  await render([dog(1, 'Ohne Datum')])
  const empty = container.querySelector('.empty-state')
  expect(empty).toBeTruthy()
  expect(empty.querySelector('h3').textContent).toBe('Noch keine Wegbegleiter')
  // Audit V7a: der Text wiederholt die Überschrift nicht
  expect(empty.querySelector('p').textContent).toBe(
    'Hier erscheinen eure Tiere, sobald ein Einzugs- oder Geburtsdatum eingetragen ist – tragt bei ihnen ein, seit wann sie bei euch sind.'
  )
  expect(container.querySelector('.companion-timeline')).toBeNull()
})

test('ganz ohne Tiere: der erste Schritt statt des Hinweises aufs Datum', async () => {
  await render([])
  expect(container.querySelector('.empty-state p').textContent).toBe(
    'Legt euer erstes Tier an – mit Einzugs- oder Geburtsdatum erscheint es hier auf der Zeitleiste.'
  )
})

test('zeigt die Zeitleiste, sobald Tiere mit Datum vorhanden sind', async () => {
  await render([dog(1, 'Nele', { bei_uns_seit: '2016-09-20' })])
  expect(container.querySelector('.companion-timeline')).toBeTruthy()
  expect(container.querySelector('.empty-state')).toBeNull()
})

// Phase V2: Besuch und "Erlebt mit"
const home = { id: 1, name: 'Zuhause am See', art: 'zuhause' }

test('zu Besuch: Eyebrow „Zu Besuch bei …“, kein „Tier hinzufügen“', async () => {
  await render([], 'standard', { id: 9, name: 'Zuhause Möwenweg', art: 'zuhause', zuBesuch: true, home })
  expect(container.textContent).toContain('Zu Besuch bei Zuhause Möwenweg')
  expect(container.textContent).not.toContain('Tier hinzufügen')
})

test('offene „Erlebt mit“-Anfragen erscheinen im eigenen Zuhause, nur wenn /me welche meldet', async () => {
  erlebtMitOffen.mockResolvedValue([
    { requestId: 3, dogName: 'Wilma', tier: 'Nele', zuhause: 'Zuhause am Deich', titel: 'Deichrunde', datum: '2026-08-30', foto_urls: [], autor_name: 'Nissen' }
  ])
  await render([], 'standard', { ...home, home, erlebtMitOffen: 1 })
  expect(container.textContent).toContain('Wilma war dabei – übernehmen?')
  act(() => container.remove())
  erlebtMitOffen.mockClear()
  await render([], 'standard', { ...home, home, erlebtMitOffen: 0 })
  expect(erlebtMitOffen).not.toHaveBeenCalled()
})
