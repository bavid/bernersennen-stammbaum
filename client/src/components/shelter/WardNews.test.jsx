// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { schuetzlinge } = vi.hoisted(() => ({ schuetzlinge: vi.fn() }))
vi.mock('../../api', () => ({ api: { schuetzlinge } }))

import WardNews from './WardNews.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
const onShowAll = vi.fn()

const item = (id, extra = {}) => ({
  id,
  dog: { id: 30 + id, name: 'Pepper', name_unbekannt: false, tierart: 'hund', foto_url: null },
  titel: `Erinnerung ${id}`,
  text: 'Ein schöner Tag am Fluss.',
  datum: '2026-09-12',
  foto_url: null,
  comment_count: 0,
  ...extra
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <WardNews onShowAll={onShowAll} />
      </MemoryRouter>
    )
  )
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  schuetzlinge.mockReset()
  onShowAll.mockReset()
})

describe('WardNews – „So geht es euren Schützlingen“', () => {
  test('Karten mit Polaroid (ohne Foto das Porträt neben dem Namen), Tiername, Tag, Titel, Anriss und Grüßen - jede führt zur Erinnerung', async () => {
    schuetzlinge.mockResolvedValue({
      items: [
        item(1, { foto_url: '/uploads/fluss.jpg', comment_count: 2 }),
        item(2, { dog: { id: 40, name: 'Nele', name_unbekannt: false, tierart: 'hund', foto_url: '/uploads/nele.jpg' }, text: null })
      ]
    })
    await render()
    const section = container.querySelector('section.ward-news')
    expect(section.querySelector('h2').textContent).toBe('So geht es euren Schützlingen')
    const cards = [...section.querySelectorAll('.ward-news-card')]
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(['/tier/31#entry-1', '/tier/40#entry-2'])
    expect(cards[0].querySelector('.polaroid img').getAttribute('src')).toBe('/uploads/fluss.jpg')
    expect(cards[0].querySelector('.ward-news-dog').textContent).toBe('Pepper')
    expect(cards[0].querySelector('.ward-news-date').textContent).toBe('12. September 2026')
    expect(cards[0].querySelector('.ward-news-title').textContent).toBe('Erinnerung 1')
    expect(cards[0].querySelector('.ward-news-text').textContent).toBe('Ein schöner Tag am Fluss.')
    expect(cards[0].querySelector('.ward-news-greetings').textContent).toBe('2 Grüße')
    expect(cards[1].querySelector('.polaroid')).toBeNull()
    expect(cards[1].querySelector('.ward-news-who .avatar img').getAttribute('src')).toBe('/uploads/nele.jpg')
    expect(cards[0].querySelector('.avatar')).toBeNull()
    expect(cards[1].querySelector('.ward-news-text')).toBeNull()
    expect(cards[1].querySelector('.ward-news-greetings')).toBeNull()
  })

  test('„Alle ansehen“ führt zu den vermittelten Tieren', async () => {
    schuetzlinge.mockResolvedValue({ items: [item(1)] })
    await render()
    const all = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Alle ansehen')
    act(() => all.click())
    expect(onShowAll).toHaveBeenCalledTimes(1)
  })

  test('ohne Neuigkeiten ein ruhiger Satz, kein „Alle ansehen“', async () => {
    schuetzlinge.mockResolvedValue({ items: [] })
    await render()
    expect(container.querySelector('.ward-news-empty').textContent).toContain('Sobald ein neues Zuhause euch mitlesen lässt')
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Alle ansehen')).toBe(false)
  })

  test('ein Fehler beim Laden steht als Hinweis da', async () => {
    schuetzlinge.mockRejectedValue(new Error('Server nicht erreichbar'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Server nicht erreichbar')
  })
})
