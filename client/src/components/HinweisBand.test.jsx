// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { hinweise } = vi.hoisted(() => ({ hinweise: vi.fn() }))
vi.mock('../api', () => ({ api: { hinweise } }))

import HinweisBand from './HinweisBand.jsx'
import { DISMISSED_KEY, REFRESH_MS } from '../lib/hinweise.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const WARTUNG = { id: 7, titel: 'Wartung heute Abend', text: 'Ab 22 Uhr.', stufe: 'wartung' }
const NEU = { id: 8, titel: 'Neu: Kalender', text: null, stufe: 'info' }

let container
let root
let navigate

function Navigator() {
  navigate = useNavigate()
  return null
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  hinweise.mockReset()
  vi.restoreAllMocks()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <HinweisBand />
        <Navigator />
      </MemoryRouter>
    )
  )
}

const titel = () => container.querySelector('.hinweis-titel-text')?.textContent

test('nichts, solange nichts geladen ist - danach das Band', async () => {
  let resolve
  hinweise.mockReturnValue(new Promise((done) => (resolve = done)))
  await render()
  expect(container.innerHTML).toBe('')
  await act(async () => resolve({ hinweise: [WARTUNG] }))
  expect(titel()).toBe('Wartung heute Abend')
  expect(container.querySelector('[role="region"]').getAttribute('aria-label')).toBe('Hinweise')
})

test('keine Hinweise oder ein Fehler: kein Band, keine Fehlermeldung', async () => {
  const consoleError = vi.spyOn(console, 'error')
  hinweise.mockResolvedValue({ hinweise: [] })
  await render()
  expect(container.innerHTML).toBe('')
  act(() => root.unmount())
  root = null
  hinweise.mockRejectedValue(new Error('offline'))
  await render()
  expect(container.innerHTML).toBe('')
  expect(consoleError).not.toHaveBeenCalled()
})

test('Wegklicken merkt sich die Id in sessionStorage; ein neuer Hinweis erscheint trotzdem', async () => {
  hinweise.mockResolvedValue({ hinweise: [WARTUNG] })
  await render()
  await act(async () => container.querySelector('[aria-label="Hinweis ausblenden"]').click())
  expect(container.innerHTML).toBe('')
  expect(JSON.parse(window.sessionStorage.getItem(DISMISSED_KEY))).toEqual([7])

  // Neu geladen (gleiche Sitzung): der weggeklickte bleibt weg, der neue ist da.
  act(() => root.unmount())
  root = null
  hinweise.mockResolvedValue({ hinweise: [NEU, WARTUNG] })
  await render()
  expect(titel()).toBe('Neu: Kalender')
  expect(container.querySelector('.hinweis-count')).toBeNull()
})

test('ohne nutzbaren sessionStorage: Wegklicken wirkt trotzdem bis zum Neuladen', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError')
  })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('SecurityError')
  })
  hinweise.mockResolvedValue({ hinweise: [WARTUNG, NEU] })
  await render()
  await act(async () => container.querySelector('[aria-label="Hinweis ausblenden"]').click())
  expect(titel()).toBe('Neu: Kalender')
})

test('beim Seitenwechsel höchstens alle paar Minuten neu laden', async () => {
  let now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  hinweise.mockResolvedValue({ hinweise: [WARTUNG] })
  await render()
  expect(hinweise).toHaveBeenCalledTimes(1)

  await act(async () => navigate('/stammbaum'))
  now += REFRESH_MS - 1
  await act(async () => navigate('/tiere'))
  expect(hinweise).toHaveBeenCalledTimes(1)

  hinweise.mockResolvedValue({ hinweise: [NEU] })
  now += 2
  await act(async () => navigate('/umgebung'))
  expect(hinweise).toHaveBeenCalledTimes(2)
  expect(titel()).toBe('Neu: Kalender')
})

test('die erste Antwort kommt auch an, wenn die App gleich nach dem Laden weiterleitet', async () => {
  let resolve
  hinweise.mockReturnValue(new Promise((done) => (resolve = done)))
  await render()
  await act(async () => navigate('/stammbaum'))
  await act(async () => resolve({ hinweise: [WARTUNG] }))
  expect(titel()).toBe('Wartung heute Abend')
})
