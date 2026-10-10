// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ getDog: vi.fn(), listTimeline: vi.fn(), updateDog: vi.fn(), createTimelineEntry: vi.fn() }))
vi.mock('../api', () => ({ api }))

import VermisstPage from './VermisstPage.jsx'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const HOME = { id: 1, art: 'zuhause', name: 'Zuhause Lindenweg' }
const WILMA = { id: 9, name: 'Wilma', tierart: 'katze', geschlecht: 'huendin', geburtsdatum: '2022-04-01', farbe_markings: 'getigert', foto_url: '/p/wilma.jpg', canEdit: true }
const ENTRIES = [{ id: 1, datum: '2024-05-01', foto_urls: ['/m/1.jpg', '/m/2.jpg'] }]

let container
let root

async function render(family = HOME) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/tier/9/vermisst']}>
        <VermisstPage dogId="9" family={family} />
      </MemoryRouter>
    )
  )
  return container
}

function type(id, value) {
  const input = container.querySelector(`#${id}`)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  api.getDog.mockResolvedValue(WILMA)
  api.listTimeline.mockResolvedValue(ENTRIES)
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('kein Netz im Test')))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.restoreAllMocks()
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  setLang('de')
})

describe('VermisstPage', () => {
  test('Plakat zeigt VERMISST, Profil-Angaben und TASSO/FINDEFIX', async () => {
    await render()
    const sheet = container.querySelector('.vermisst-sheet')
    expect(sheet.querySelector('.vermisst-headline').textContent).toBe('VERMISST')
    expect(sheet.querySelector('.vermisst-name').textContent).toBe('Wilma')
    expect(sheet.textContent).toContain('Katze')
    expect(sheet.textContent).toContain('getigert')
    expect(sheet.querySelector('.vermisst-photo img').getAttribute('src')).toBe('/p/wilma.jpg')
    expect(sheet.textContent).toContain('tasso.net')
    expect(sheet.textContent).toContain('findefix.com')
    expect(sheet.textContent).toContain('Bitte meldet euch auch bei TASSO (tasso.net) und FINDEFIX (findefix.com).')
  })

  test('Foto-Wahl unter bis zu sechs Fotos wechselt das Plakatbild', async () => {
    await render()
    const options = container.querySelectorAll('.vermisst-photo-option')
    expect(options).toHaveLength(3)
    await act(async () => options[2].click())
    expect(container.querySelector('.vermisst-photo img').getAttribute('src')).toBe('/m/2.jpg')
    expect(options[2].getAttribute('aria-pressed')).toBe('true')
  })

  test('Eingaben erscheinen auf dem Plakat, gehen aber nirgends hin', async () => {
    await render()
    type('vermisst-seenDate', '9. Oktober, abends')
    type('vermisst-seenPlace', 'Stadtpark')
    type('vermisst-contact', '0170 000000')
    type('vermisst-chip', '276000000000001')
    const sheet = container.querySelector('.vermisst-sheet')
    expect(sheet.textContent).toContain('Stadtpark')
    expect(sheet.textContent).toContain('0170 000000')
    expect(sheet.textContent).toContain('276000000000001')
    expect(api.getDog).toHaveBeenCalledTimes(1)
    expect(api.listTimeline).toHaveBeenCalledTimes(1)
    expect(api.updateDog).not.toHaveBeenCalled()
    expect(api.createTimelineEntry).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('0170')
    expect(container.textContent).toContain('Diese Nummer wird mit aufs Plakat gedruckt.')
  })

  test('kein Plakat für fremde Tiere oder zu Besuch', async () => {
    api.getDog.mockResolvedValue({ ...WILMA, canEdit: false })
    await render()
    expect(container.querySelector('.vermisst-sheet')).toBeNull()
    expect(container.textContent).toContain('Ein Suchplakat gibt es nur für eigene Tiere, die bei euch leben.')
    act(() => root.unmount())
    container.remove()
    api.getDog.mockResolvedValue(WILMA)
    await render({ ...HOME, zuBesuch: true })
    expect(container.querySelector('.vermisst-sheet')).toBeNull()
  })

  test('englische Beschriftungen', async () => {
    setLang('en')
    await render()
    expect(container.querySelector('.vermisst-headline').textContent).toBe('MISSING')
    expect(container.textContent).toContain('Last seen on')
    expect(container.textContent).toContain('Please also report to TASSO (tasso.net) and FINDEFIX (findefix.com).')
    expect(container.textContent).toContain('Share as image')
    expect(container.querySelector('label[for="vermisst-chip"]').textContent).toBe('Microchip number (optional)')
  })
})
