// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { listNotes } = vi.hoisted(() => ({ listNotes: vi.fn() }))
vi.mock('../api', () => ({ api: { listNotes } }))

import PinboardPage from './PinboardPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
const familyAs = (role) => ({ id: 2, name: 'Familie Sonnenhang', theme: 'standard', art: 'rudel', isDemo: false, role, home, memberships: [] })
const ownHome = { ...home, isDemo: false, role: 'leitung', home, memberships: [] }

const notes = () => [
  {
    id: 1,
    text: 'Wer kommt zum Spaziergang?',
    autor_name: 'Benno',
    termin_datum: null,
    termin_zeit: null,
    created_at: '2026-03-01 10:00:00',
    replies: [
      { id: 10, autor_name: 'Benno', text: 'Ich!', created_at: '2026-03-01 11:00:00', vonMir: true, ehemalig: false },
      { id: 11, autor_name: 'Wilma', text: 'Ich auch', created_at: '2026-03-01 12:00:00', vonMir: false, ehemalig: false }
    ]
  }
]

async function render(family) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/pinnwand']}>
        <ThemeProvider themeId="standard">
          <PinboardPage family={family} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  delete document.documentElement.dataset.theme
  document.title = ''
  listNotes.mockReset()
})

const abnehmen = () => [...container.querySelectorAll('.note-footer button')]

describe('PinboardPage – Rechte je Rolle', () => {
  test('Gast: kein Zettel-Formular (stattdessen ein Hinweis), kein "Abnehmen", Antworten löschen nur eigene', async () => {
    listNotes.mockResolvedValue(notes())
    await render(familyAs('gast'))

    expect(container.querySelector('form.note-composer')).toBeNull()
    expect(container.textContent).toContain('Als Gast kannst du auf Zettel antworten')
    expect(abnehmen()).toHaveLength(0)
    expect(container.querySelector('.reply-open')).not.toBeNull()
    const replies = [...container.querySelectorAll('.reply')]
    expect(replies[0].querySelector('.reply-delete')).not.toBeNull()
    expect(replies[1].querySelector('.reply-delete')).toBeNull()
  })

  test('Mitglied: Zettel schreiben und abnehmen, fremde Antworten aber nicht löschen', async () => {
    listNotes.mockResolvedValue(notes())
    await render(familyAs('mitglied'))

    expect(container.querySelector('form.note-composer')).not.toBeNull()
    expect(abnehmen()).toHaveLength(1)
    expect(container.querySelectorAll('.reply-delete')).toHaveLength(1)
  })

  test('Stellvertretung: löscht auch fremde Antworten (Moderation)', async () => {
    listNotes.mockResolvedValue(notes())
    await render(familyAs('stellvertretung'))
    expect(container.querySelectorAll('.reply-delete')).toHaveLength(2)
  })

  test('im eigenen Zuhause bleibt alles wie bisher: Formular, Abnehmen, jede Antwort löschbar', async () => {
    listNotes.mockResolvedValue(notes().map((n) => ({ ...n, replies: n.replies.map(({ vonMir, ehemalig, ...r }) => r) })))
    await render(ownHome)

    expect(container.querySelector('form.note-composer')).not.toBeNull()
    expect(abnehmen()).toHaveLength(1)
    expect(container.querySelectorAll('.reply-delete')).toHaveLength(2)
  })

  test('leere Pinnwand: der Gast bekommt keinen Aufruf zum Anpinnen', async () => {
    listNotes.mockResolvedValue([])
    await render(familyAs('gast'))
    expect(container.querySelector('.empty-state').textContent).toContain('Sobald jemand etwas anpinnt')
    expect(container.textContent).not.toContain('Mach den Anfang')
  })
})
