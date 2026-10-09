// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'

import LanguageSwitch from './LanguageSwitch.jsx'
import LoginForm from './LoginForm.jsx'
import { getLang, setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  act(() => setLang('de'))
  window.localStorage.clear()
})

const button = (name) => [...container.querySelectorAll('button')].find((el) => el.textContent === name)

describe('LanguageSwitch', () => {
  test('schaltet die Texte der Seite sofort auf Englisch und zurück', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <MemoryRouter>
          <LanguageSwitch />
          <LoginForm onLogin={() => {}} onRedeemRequired={() => {}} onForgot={() => {}} />
        </MemoryRouter>
      )
    )
    expect(button('Chronik öffnen')).toBeTruthy()
    expect(button('Deutsch').getAttribute('aria-pressed')).toBe('true')

    await act(async () => button('English').click())
    expect(button('Open chronicle')).toBeTruthy()
    expect(button('English').getAttribute('aria-pressed')).toBe('true')
    expect(getLang()).toBe('en')
    expect(document.documentElement.lang).toBe('en')

    await act(async () => button('Deutsch').click())
    expect(button('Chronik öffnen')).toBeTruthy()
    expect(document.documentElement.lang).toBe('de')
  })
})
