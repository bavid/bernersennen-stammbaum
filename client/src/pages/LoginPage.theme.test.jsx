// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api', () => ({ api: {} }))

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
})

async function render(themeId) {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <LoginPage onLogin={() => {}} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

// Die Login-Seite wird von App.jsx immer im Standard-Auftritt gerendert (siehe App.jsx). Der Hero-Bereich
// bleibt trotzdem theme-fähig (liest theme.texts) – dieser Test deckt genau das ab, unabhängig davon,
// welches Theme der Aufrufer übergibt. Anmelden/Einlösen/Wiederherstellung selbst nutzen feste, nicht
// theme-abhängige Texte ("Rudel"/Familien-Wortschatz kommt hier nicht mehr vor).
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

  test('Anmelden-Modus, Feldbeschriftung und Absenden-Knopf sind fest (nicht vom Theme abhängig)', async () => {
    await render(themeId)
    expect(container.querySelector('.login-card-head h1').textContent).toBe('Anmelden')
    expect(container.querySelector('label[for="login-secret"]').textContent).toBe('Schlüssel oder Passwort')
    expect(container.querySelector('.form-stack button[type="submit"]').textContent).toBe('Chronik öffnen')
  })

  // Phase V3: der Standard-Auftritt spricht von Familien statt Generationen (die Familienbande zeigt zuerst Familien),
  // der Berner-Auftritt behält seinen Satz. Keine feste Familie im Text.
  test('Der Demo-Hinweis kommt aus den Theme-Texten und nennt keine feste Familie', async () => {
    await render(themeId)
    expect(container.querySelector('.login-demo .field-hint').textContent).toBe(theme.texts.loginDemoHint)
    expect(theme.texts.loginDemoHint).toMatch(/^Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren/)
  })
})

test('Standard-Auftritt (so startet die Anmeldung immer): Demo mit Familien und Erinnerungen statt Generationen', async () => {
  await render('standard')
  const hint = container.querySelector('.login-demo .field-hint').textContent
  expect(hint).toBe('Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren, Familien und Erinnerungen.')
  expect(hint).not.toMatch(/Generation/)
})
