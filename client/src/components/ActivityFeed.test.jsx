// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import ActivityFeed from './ActivityFeed.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { getTheme } from '../themes/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
})

async function render(themeId, props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <ActivityFeed {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

describe.each(['standard', 'berner'])('ActivityFeed im Theme %s', (themeId) => {
  const theme = getTheme(themeId)

  test('leerer Zustand nutzt die Theme-Überschrift und den Theme-Text', async () => {
    await render(themeId, { entries: [], termin: null })
    const section = container.querySelector('.feed-empty')
    expect(section.getAttribute('aria-label')).toBe(theme.words.newsTitle)
    expect(section.querySelector('strong').textContent).toBe('Noch keine Neuigkeiten.')
    expect(section.querySelector('p').textContent).toBe(
      `Noch keine Neuigkeiten. ${theme.texts.feedEmpty} – die anderen sehen es dann hier.`
    )
  })

  test('Überschrift mit Einträgen kommt aus dem Theme-Wortschatz', async () => {
    await render(themeId, {
      entries: [
        {
          id: 1,
          dog_id: 5,
          dog_name: 'Tilda',
          titel: 'Am See',
          autor_name: 'Mo',
          created_at: new Date().toISOString(),
          comment_count: 0
        }
      ],
      termin: null
    })
    expect(container.querySelector('#feed-title').textContent).toBe(theme.words.newsTitle)
  })
})
