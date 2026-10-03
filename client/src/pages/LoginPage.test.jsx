// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { login, loginUser, checkVoucher, redeemVoucher, recover, demo, sendAnfrage } = vi.hoisted(() => ({
  login: vi.fn(),
  loginUser: vi.fn(),
  checkVoucher: vi.fn(),
  redeemVoucher: vi.fn(),
  recover: vi.fn(),
  demo: vi.fn(),
  sendAnfrage: vi.fn()
}))
vi.mock('../api', () => ({ api: { login, loginUser, checkVoucher, redeemVoucher, recover, demo, sendAnfrage } }))

import LoginPage from './LoginPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

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
  delete document.documentElement.dataset.theme
  document.title = ''
  login.mockReset()
  loginUser.mockReset()
  checkVoucher.mockReset()
  redeemVoucher.mockReset()
  recover.mockReset()
  demo.mockReset()
  sendAnfrage.mockReset()
})

async function render(props, initialEntries = ['/']) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={initialEntries}>
        <ThemeProvider themeId="standard">
          <LoginPage onLogin={() => {}} {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

// React verfolgt den zuletzt gerenderten Input-Wert intern; ein simples input.value = x lässt das
// anschließende "input"-Event wirkungslos wirken. Der native Setter am Prototyp umgeht das.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function segmentButton(label) {
  return [...container.querySelectorAll('.login-switch button')].find((btn) => btn.textContent === label)
}

function linkButton(text) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

describe('LoginPage – Anmelden mit Schlüssel oder Passwort', () => {
  test('zeigt ein Feld "Schlüssel oder Passwort" mit autocomplete current-password und dem Knopf "Chronik öffnen"', async () => {
    await render()
    const input = container.querySelector('#login-secret')
    expect(container.querySelector('label[for="login-secret"]').textContent).toBe('Schlüssel oder Passwort')
    expect(input.autocomplete).toBe('current-password')
    expect(container.querySelector('.form-stack button[type="submit"]').textContent).toBe('Chronik öffnen')
  })

  test('das Feld hat beim Laden den Fokus - gesetzt ohne Scrollen (Audit V7a: am Handy bleibt der Kopf sichtbar)', async () => {
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    await render()
    expect(document.activeElement).toBe(container.querySelector('#login-secret'))
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    focus.mockRestore()
  })

  test('sendet den eingegebenen Wert als "secret" und ruft onLogin mit der Antwort auf', async () => {
    const onLogin = vi.fn()
    const me = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
    login.mockResolvedValue(me)
    await render({ onLogin })

    await act(async () => setInputValue(container.querySelector('#login-secret'), 'ABCD-1234-HJKM'))
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(login).toHaveBeenCalledWith('ABCD-1234-HJKM')
    expect(onLogin).toHaveBeenCalledWith(me)
  })

  test('ein Fehler vom Server erscheint als Alert', async () => {
    login.mockRejectedValue(Object.assign(new Error('Schlüssel oder Passwort falsch'), { status: 401, details: {} }))
    await render()

    await act(async () => setInputValue(container.querySelector('#login-secret'), 'falsch'))
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Schlüssel oder Passwort falsch')
  })
})

describe('LoginPage – Anmelden mit Benutzername', () => {
  test('"Mit Benutzername anmelden" zeigt Benutzername- und Passwort-Feld mit passendem autocomplete', async () => {
    await render()
    act(() => linkButton('Mit Benutzername anmelden').click())

    const username = container.querySelector('#login-username')
    const password = container.querySelector('#login-user-password')
    expect(username.autocomplete).toBe('username')
    expect(password.autocomplete).toBe('current-password')
    expect(container.querySelector('#login-secret')).toBeNull()
  })

  test('sendet Benutzername und Passwort per api.loginUser', async () => {
    const onLogin = vi.fn()
    const me = { id: 2, name: 'Zuhause am Deich' }
    loginUser.mockResolvedValue(me)
    await render({ onLogin })
    act(() => linkButton('Mit Benutzername anmelden').click())

    await act(async () => {
      setInputValue(container.querySelector('#login-username'), 'nele')
      setInputValue(container.querySelector('#login-user-password'), 'geheim1234')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(loginUser).toHaveBeenCalledWith('nele', 'geheim1234')
    expect(onLogin).toHaveBeenCalledWith(me)
  })
})

describe('LoginPage – 409 (offener Gutschein) beim Anmelden', () => {
  test('wechselt in den Einlöse-Modus, füllt den Code vor und zeigt den Erklärtext', async () => {
    login.mockRejectedValue(Object.assign(new Error('Fehler 409'), { status: 409, details: { redeem: true } }))
    await render()

    await act(async () => setInputValue(container.querySelector('#login-secret'), 'abcd1234hjkm'))
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(segmentButton('Gutschein einlösen').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('#redeem-code').value).toBe('ABCD-1234-HJKM')
    expect(container.textContent).toContain('Das ist ein Gutschein – löst ihn ein, um eure Chronik anzulegen.')
  })
})

describe('LoginPage – initialMode/initialCode (für die Route /v)', () => {
  test('startet direkt im Einlöse-Modus mit vorausgefülltem, formatiertem Code', async () => {
    await render({ initialMode: 'redeem', initialCode: 'abcd1234hjkm' })

    expect(segmentButton('Gutschein einlösen').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('#redeem-code').value).toBe('ABCD-1234-HJKM')
  })
})

describe('LoginPage – Gutschein einlösen', () => {
  async function goToRedeem() {
    act(() => segmentButton('Gutschein einlösen').click())
  }

  test('sendet die Felder inkl. Honeypot "website" an api.redeemVoucher', async () => {
    redeemVoucher.mockResolvedValue({
      id: 5,
      name: 'Zuhause am Deich',
      art: 'zuhause',
      theme: 'standard',
      isDemo: false,
      home: null,
      memberships: [],
      key: 'ABCD-1234-HJKM',
      fromOthers: true
    })
    await render()
    await goToRedeem()

    await act(async () => {
      setInputValue(container.querySelector('#redeem-code'), 'abcd1234hjkm')
      setInputValue(container.querySelector('#redeem-name'), 'Zuhause am Deich')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(redeemVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABCD-1234-HJKM', name: 'Zuhause am Deich', website: '' })
    )
  })

  test('zeigt nach dem Einlösen KeyReveal; onLogin wird erst nach "Weiter zu Meiner Chronik" aufgerufen', async () => {
    const onLogin = vi.fn()
    const response = {
      id: 5,
      name: 'Zuhause am Deich',
      art: 'zuhause',
      theme: 'standard',
      isDemo: false,
      home: null,
      memberships: [],
      key: 'ABCD-1234-HJKM',
      fromOthers: true
    }
    redeemVoucher.mockResolvedValue(response)
    await render({ onLogin })
    await goToRedeem()

    await act(async () => {
      setInputValue(container.querySelector('#redeem-code'), 'abcd1234hjkm')
      setInputValue(container.querySelector('#redeem-name'), 'Zuhause am Deich')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(container.querySelector('.key-reveal-value').textContent).toBe('ABCD-1234-HJKM')
    expect(onLogin).not.toHaveBeenCalled()

    const continueButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Weiter zu Meiner Chronik')
    act(() => continueButton.click())

    const { key, fromOthers, ...me } = response
    expect(onLogin).toHaveBeenCalledWith(me)
  })
})

describe('LoginPage – Hinweis unter dem Schlüssel (Audit V7a)', () => {
  async function redeemWith(fromOthers) {
    redeemVoucher.mockResolvedValue({
      id: 5,
      name: 'Zuhause am Deich',
      art: 'zuhause',
      theme: 'standard',
      isDemo: false,
      home: null,
      memberships: [],
      key: 'ABCD-1234-HJKM',
      fromOthers
    })
    await render()
    act(() => segmentButton('Gutschein einlösen').click())
    await act(async () => {
      setInputValue(container.querySelector('#redeem-code'), 'abcd1234hjkm')
      setInputValue(container.querySelector('#redeem-name'), 'Zuhause am Deich')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())
  }

  test('Karte = Schlüssel (fromOthers): "Wer euch die Karte gegeben hat, kennt diesen Code"', async () => {
    await redeemWith(true)
    expect(container.textContent).toContain('Wer euch die Karte gegeben hat, kennt diesen Code.')
  })

  test('persönlicher Code mit frischem Schlüssel: kein Kartenhinweis, sondern "nur ihr kennt ihn"', async () => {
    await redeemWith(false)
    expect(container.textContent).not.toContain('Wer euch die Karte gegeben hat')
    expect(container.textContent).toContain('nur ihr kennt ihn')
  })
})

describe('LoginPage – Wiederherstellung', () => {
  test('"Passwort vergessen?" wechselt in die Wiederherstellung, der Modus-Umschalter verschwindet', async () => {
    await render()
    act(() => linkButton('Passwort vergessen?').click())

    expect(container.querySelector('.login-switch')).toBeNull()
    expect(container.querySelector('#recover-code')).not.toBeNull()
    expect(container.textContent).toContain('Kein Benutzer? Dann meldet euch einfach mit dem Schlüssel an.')
  })

  test('erfolgreiche Wiederherstellung sendet code/username/newPassword; "Zum Anmelden" führt zurück', async () => {
    recover.mockResolvedValue(null)
    await render()
    act(() => linkButton('Passwort vergessen?').click())

    await act(async () => {
      setInputValue(container.querySelector('#recover-code'), 'abcd1234hjkm')
      setInputValue(container.querySelector('#recover-username'), 'nele')
      setInputValue(container.querySelector('#recover-password'), 'neuesPasswort1')
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(recover).toHaveBeenCalledWith({ code: 'ABCD-1234-HJKM', username: 'nele', newPassword: 'neuesPasswort1' })
    expect(container.textContent).toContain('Passwort geändert – jetzt anmelden.')

    act(() => container.querySelector('button').click())
    expect(container.querySelector('#login-secret')).not.toBeNull()
  })
})

describe('LoginPage – Demo bleibt erreichbar', () => {
  test('der Demo-Knopf ruft api.demo auf und liefert die Antwort an onLogin', async () => {
    const onLogin = vi.fn()
    const me = { id: 99, name: 'Demo', isDemo: true }
    demo.mockResolvedValue(me)
    await render({ onLogin })

    const demoButton = [...container.querySelectorAll('.login-demo button')].find((btn) => btn.textContent.includes('Demo ansehen'))
    await act(async () => demoButton.click())

    expect(demo).toHaveBeenCalled()
    expect(onLogin).toHaveBeenCalledWith(me)
  })
})

// Phase 5 Task 4: Weg zur Infoseite für Hundeschulen, Tierheime, Hundesalons und Betreuung.
describe('LoginPage – Fuß', () => {
  test('verlinkt "Für Partner" (/partner-werden) neben Impressum und Datenschutz', async () => {
    await render()
    const links = [...container.querySelectorAll('.login-footer a')].map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Für Partner', '/partner-werden'],
      ['Impressum', '/impressum'],
      ['Datenschutz', '/datenschutz']
    ])
  })
})

// Phase U: zwei klare Einstiege - Tierhalter und Partner (Hundeschulen, Tierheime & Co.).
describe('LoginPage – zwei Einstiege', () => {
  const labels = () => [...container.querySelectorAll('.login-entry-label')].map((el) => el.textContent.trim())

  test('zeigt "Für Tierhalter" (Anmelden, Gutschein, Demo) und daneben "Für Hundeschulen, Tierheime & Co."', async () => {
    await render()

    expect(labels()).toEqual(['Für Tierhalter', 'Für Hundeschulen, Tierheime & Co.'])
    const [owners, partners] = container.querySelectorAll('.login-entries > .login-entry')
    expect(owners.querySelector('#login-secret')).not.toBeNull()
    expect(owners.querySelector('.login-demo button').textContent).toContain('Demo ansehen')
    expect(partners.querySelector('h2').textContent).toBe('Euer Partner-Bereich')
    expect(partners.querySelector('a[href="/partner-werden"]').textContent).toContain('Mehr erfahren')
  })

  test('"Demo: Hundeschule" meldet in der Demo-Hundeschule an und liefert die Sitzung an onLogin', async () => {
    const onLogin = vi.fn()
    const me = { id: 90, art: 'partner', isDemo: true }
    demo.mockResolvedValue(me)
    await render({ onLogin })

    await act(async () => linkButton('Demo: Hundeschule').click())

    expect(demo).toHaveBeenCalledWith({ as: 'partner', slug: 'hundeschule-pfotenglueck' })
    expect(onLogin).toHaveBeenCalledWith(me)
  })

  test('"Demo: Tierheim" meldet im Demo-Tierheim an', async () => {
    const onLogin = vi.fn()
    const me = { id: 91, art: 'tierheim', isDemo: true }
    demo.mockResolvedValue(me)
    await render({ onLogin })

    await act(async () => linkButton('Demo: Tierheim').click())

    expect(demo).toHaveBeenCalledWith({ as: 'tierheim' })
    expect(onLogin).toHaveBeenCalledWith(me)
  })

  test('ein Fehler der Partner-Demo erscheint im Partner-Einstieg, der Knopf ist wieder frei', async () => {
    demo.mockRejectedValue(new Error('Keine Demo verfügbar'))
    await render()

    await act(async () => linkButton('Demo: Hundeschule').click())

    expect(container.querySelector('.login-partner [role="alert"]').textContent).toBe('Keine Demo verfügbar')
    expect(linkButton('Demo: Hundeschule').disabled).toBe(false)
  })

  test('auf /v (initialMode redeem) geht es nur ums Einlösen - ohne Partner-Einstieg', async () => {
    await render({ initialMode: 'redeem' })
    expect(container.querySelector('.login-partner')).toBeNull()
    expect(labels()).toEqual(['Für Tierhalter'])
  })

  test('ein erkannter Partner-Zugang bleibt erkannt, wenn "Gutschein einlösen" noch einmal gedrückt wird', async () => {
    checkVoucher.mockResolvedValue({ status: 'offen', zweck: 'partnerzugang', partnerTyp: 'hundeschule', partnerName: 'Hundeschule Wiesengrund' })
    await render({ initialMode: 'redeem', initialCode: 'abcd1234hjkm' })
    expect(container.querySelector('.login-card-head .muted').textContent).toBe('Löst euren Partner-Zugang ein und richtet euer Partner-Profil ein.')
    expect(labels()).toEqual(['Partner-Zugang'])

    await act(async () => segmentButton('Gutschein einlösen').click())

    expect(container.querySelector('.login-card-head .muted').textContent).toBe('Löst euren Partner-Zugang ein und richtet euer Partner-Profil ein.')
    expect(labels()).toEqual(['Partner-Zugang'])
  })

  test('ist "Gutschein einlösen" schon offen, holt der Hinweis im Partner-Einstieg nur den Fokus ins Code-Feld', async () => {
    await render()
    await act(async () => segmentButton('Gutschein einlösen').click())
    document.activeElement.blur()
    expect(document.activeElement.id).not.toBe('redeem-code')

    await act(async () => container.querySelector('.login-partner .login-link-btn').click())

    expect(document.activeElement.id).toBe('redeem-code')
    expect(container.querySelector('.login-card-head h1').textContent).toBe('Gutschein einlösen')
  })

  test('beide Einstiege sind benannte Abschnitte', async () => {
    await render()
    const [owners, partners] = container.querySelectorAll('.login-entries > section')
    expect(document.getElementById(owners.getAttribute('aria-labelledby')).textContent.trim()).toBe('Für Tierhalter')
    expect(document.getElementById(partners.getAttribute('aria-labelledby')).textContent).toBe('Euer Partner-Bereich')
  })

  test('der Hinweis zum Partner-Zugang schaltet die Anmelde-Karte auf "Gutschein einlösen"', async () => {
    await render()
    expect(container.querySelector('.login-card-head h1').textContent).toBe('Anmelden')

    const redeemLink = container.querySelector('.login-partner .login-link-btn')
    expect(redeemLink.closest('p').textContent).toContain('Partner-Zugang')
    await act(async () => redeemLink.click())

    expect(container.querySelector('.login-card-head h1').textContent).toBe('Gutschein einlösen')
    expect(segmentButton('Gutschein einlösen').getAttribute('aria-pressed')).toBe('true')
  })
})

// Phase N: "Noch keinen Gutschein?" im Einstieg für Tierhalter und "Partner-Zugang anfragen" im Partner-Einstieg.
describe('LoginPage – Gutschein und Partner-Zugang anfragen', () => {
  const requestCard = () => container.querySelector('.login-entries > .login-entry .login-request')

  test('über /#gutschein-anfragen (Fuß der Partner-Portale) ist das Anfrage-Formular gleich offen', async () => {
    await render(undefined, ['/#gutschein-anfragen'])

    const card = container.querySelector('#gutschein-anfragen')
    expect(card).not.toBeNull()
    expect(card.querySelector('form input[type="email"]')).not.toBeNull()
    expect(card.querySelector('button.btn-ghost')).toBeNull()
  })

  test('"Noch keinen Gutschein?" steht zugeklappt im Einstieg für Tierhalter - ein Klick öffnet das Formular', async () => {
    await render()

    const card = requestCard()
    expect(card.querySelector('h2').textContent).toBe('Noch keinen Gutschein?')
    expect(card.textContent).toContain('Schreib uns – wir schicken dir einen Gutschein per E-Mail.')
    expect(card.querySelector('form')).toBeNull()

    await act(async () => linkButton('Gutschein anfragen').click())

    expect(card.querySelector('form')).not.toBeNull()
    expect(card.querySelector('.request-why h3').textContent).toBe('Warum per Gutschein?')
    expect(document.activeElement).toBe(container.querySelector('#login-request-name'))
  })

  test('Anfrage abschicken: Dank statt Formular, die Anmeldung bleibt unberührt', async () => {
    sendAnfrage.mockResolvedValue({ ok: true })
    await render()
    await act(async () => linkButton('Gutschein anfragen').click())

    setInputValue(container.querySelector('#login-request-email'), 'wilma@example.org')
    await act(async () => requestCard().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(sendAnfrage).toHaveBeenCalledWith(expect.objectContaining({ typ: 'gutschein', email: 'wilma@example.org' }))
    expect(requestCard().querySelector('form')).toBeNull()
    expect(requestCard().querySelector('[role="status"]').textContent).toBe('Danke! Wir melden uns per E-Mail, sobald wieder Platz ist.')
    expect(login).not.toHaveBeenCalled()
  })

  test('auch beim Einlösen (z. B. /v aus der Demo) - aber nicht beim Passwort-Wiederherstellen', async () => {
    await render({ initialMode: 'redeem' })
    expect(requestCard()).not.toBeNull()

    act(() => root.unmount())
    container.remove()
    await render()
    await act(async () => linkButton('Passwort vergessen?').click())
    expect(requestCard()).toBeNull()
  })

  test('im Partner-Einstieg: "Partner-Zugang anfragen" führt zum Formular auf /partner-werden#anfragen', async () => {
    await render()
    const link = [...container.querySelectorAll('.login-partner a')].find((a) => a.textContent === 'Partner-Zugang anfragen')
    expect(link.getAttribute('href')).toBe('/partner-werden#anfragen')
  })
})
