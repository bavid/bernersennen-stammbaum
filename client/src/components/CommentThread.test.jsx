// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import CommentThread from './CommentThread.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
})

const reply = (id, text) => ({ id, autor_name: `Autor ${id}`, text, created_at: '2026-03-01 10:00:00' })

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<CommentThread items={[]} onAdd={vi.fn()} onDelete={vi.fn()} {...props} />))
  return container
}

const texts = () => [...container.querySelectorAll('.reply-text')].map((el) => el.textContent)
const moreButton = () => container.querySelector('.thread-more')

// Audit W (N6): lange Gespräche zeigen zuerst die letzten zwei Beiträge, der Rest hinter „Alle n Antworten“.
describe('CommentThread – eingeklappte Antworten', () => {
  test('mehr als zwei: die letzten zwei zu sehen, „Alle 4 Antworten“ klappt alle auf; „Antworten (4)“ zählt weiter alle', async () => {
    await render({ items: [reply(1, 'eins'), reply(2, 'zwei'), reply(3, 'drei'), reply(4, 'vier')] })

    expect(texts()).toEqual(['drei', 'vier'])
    expect(moreButton().textContent).toBe('Alle 4 Antworten')
    expect(container.querySelector('.thread').getAttribute('aria-label')).toBe('4 Antworten')
    expect(container.querySelector('.reply-open').textContent).toBe('Antworten (4)')

    await act(async () => moreButton().click())
    expect(texts()).toEqual(['eins', 'zwei', 'drei', 'vier'])
    expect(moreButton()).toBeNull()
  })

  test('bis zwei Beiträge: alles offen, kein Knopf', async () => {
    await render({ items: [reply(1, 'eins'), reply(2, 'zwei')] })
    expect(texts()).toEqual(['eins', 'zwei'])
    expect(moreButton()).toBeNull()
  })

  test('mit den Wörtern der Chronik: „Alle 3 Grüße“', async () => {
    await render({ items: [reply(1, 'a'), reply(2, 'b'), reply(3, 'c')], noun: 'Gruß', plural: 'Grüße', verb: 'Gruß schreiben' })
    expect(moreButton().textContent).toBe('Alle 3 Grüße')
    expect(container.querySelector('.reply-open').textContent).toBe('Gruß schreiben (3)')
  })

  test('eine neue Antwort hängt sichtbar hinten an', async () => {
    const items = [reply(1, 'eins'), reply(2, 'zwei'), reply(3, 'drei')]
    await render({ items })
    await act(async () => root.render(<CommentThread items={[...items, reply(4, 'vier')]} onAdd={vi.fn()} onDelete={vi.fn()} />))
    expect(texts()).toEqual(['drei', 'vier'])
    expect(moreButton().textContent).toBe('Alle 4 Antworten')
  })
})
