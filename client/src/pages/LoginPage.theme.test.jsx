// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { config } = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock('../api', () => ({ api: { config } }))

import LoginPage from './LoginPage.jsx'
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
  config.mockReset()
})

async function render(themeId) {
  config.mockResolvedValue({ inviteRequired: false })
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider themeId={themeId}>
        <LoginPage onLogin={() => {}} />
      </ThemeProvider>
    )
  )
  return container
}

describe.each(['standard', 'berner'])('Login-Hero im Theme %s', (themeId) => {
  const theme = getTheme(themeId)

  test('Kicker und zweizeilige Headline kommen aus den Theme-Texten', async () => {
    await render(themeId)
    expect(container.querySelector('.login-kicker').textContent).toBe(theme.texts.loginKicker)
    const headline = container.querySelector('.login-headline')
    expect(headline.textContent).toBe(theme.texts.loginHeadline.join(''))
    expect(headline.querySelector('em').textContent).toBe(theme.texts.loginHeadline[1])
  })

  test('Lauftext und Facts kommen aus den Theme-Texten', async () => {
    await render(themeId)
    expect(container.querySelector('.login-lede').textContent).toBe(theme.texts.loginLede)
    const facts = [...container.querySelectorAll('.login-facts li')].map((li) => [
      li.querySelector('strong').textContent,
      li.querySelector('span').textContent
    ])
    expect(facts).toEqual(theme.texts.loginFacts)
  })

  test('Der senkrechte Dreifarb-Streifen erscheint nur, wenn das Theme einen hat', async () => {
    await render(themeId)
    const stripe = container.querySelector('.login-hero .tricolor-vertical')
    expect(stripe === null).toBe(!theme.tricolor)
  })
})
