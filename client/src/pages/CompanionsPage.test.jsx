// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { listDogs } = vi.hoisted(() => ({ listDogs: vi.fn() }))
vi.mock('../api', () => ({ api: { listDogs } }))

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

async function render(dogs) {
  listDogs.mockResolvedValue(dogs)
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
  // eine weitere Runde für das async listDogs()
  await act(async () => {})
  return container
}

test('zeigt Kennzahlen für Tiere gesamt, aktuell lebende Tiere und Jahre gemeinsam', async () => {
  await render([
    dog(1, 'Nele', { bei_uns_seit: '2016-09-20' }),
    dog(2, 'Aiko', { bei_uns_seit: '2010-01-01', bei_uns_bis: '2018-01-01', abschied_grund: 'verstorben' })
  ])
  const stats = [...container.querySelectorAll('.stats dd')].map((el) => el.textContent)
  expect(stats).toEqual(['2', '1', '18'])
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
  expect(empty.textContent).toContain('Noch keine Wegbegleiter mit Einzugs- oder Geburtsdatum')
  expect(container.querySelector('.companion-timeline')).toBeNull()
})

test('zeigt die Zeitleiste, sobald Tiere mit Datum vorhanden sind', async () => {
  await render([dog(1, 'Nele', { bei_uns_seit: '2016-09-20' })])
  expect(container.querySelector('.companion-timeline')).toBeTruthy()
  expect(container.querySelector('.empty-state')).toBeNull()
})
