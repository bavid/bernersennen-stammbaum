// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { checkVoucher, redeemVoucher } = vi.hoisted(() => ({ checkVoucher: vi.fn(), redeemVoucher: vi.fn() }))
vi.mock('../api', () => ({ api: { checkVoucher, redeemVoucher } }))

import RedeemForm from './RedeemForm.jsx'

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
  checkVoucher.mockReset()
  redeemVoucher.mockReset()
})

const UNBOUND = { status: 'offen', zweck: 'partnerzugang' }
const PRESET = { status: 'offen', zweck: 'partnerzugang', partnerTyp: 'hundesalon' }
const BOUND = { status: 'offen', zweck: 'partnerzugang', partnerTyp: 'hundeschule', partnerName: 'Hundeschule Wiesengrund' }

const partnerMe = {
  id: 30,
  name: 'Hundeschule Wiesengrund',
  art: 'partner',
  key: 'ABCD-1234-HJKM',
  fromOthers: true,
  partner: { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'entwurf', gesperrt: false }
}

// Wie auf /v#CODE: der Code kommt vorausgefüllt, die Prüfung läuft gleich beim Öffnen.
async function render(checkResult, props = {}) {
  checkVoucher.mockResolvedValue(checkResult)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<RedeemForm initialCode="abcd1234hjkm" onRedeemed={() => {}} {...props} />))
  return container
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select, value) {
  nativeSelectValueSetter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const $ = (selector) => container.querySelector(selector)

async function fillUnbound({ name = 'Hundeschule Wiesengrund', typ = 'hundeschule', plz = '10115' } = {}) {
  await act(async () => {
    setInputValue($('#partner-name'), name)
    if ($('#partner-typ')) setSelectValue($('#partner-typ'), typ)
    setInputValue($('#partner-plz'), plz)
  })
}

async function submit() {
  await act(async () => $('form').requestSubmit())
}

function submitButton() {
  return $('button[type="submit"]')
}

describe('RedeemForm – Partner-Zugang erkennen', () => {
  test('ein vorausgefüllter Code wird gleich beim Öffnen geprüft', async () => {
    await render(UNBOUND)
    expect(checkVoucher).toHaveBeenCalledWith('ABCD-1234-HJKM')
  })

  test('zeigt "Partner-Profil einrichten" mit Einleitung statt des Kunden-Formulars', async () => {
    await render(UNBOUND)

    expect($('h2').textContent).toBe('Partner-Profil einrichten')
    expect(container.textContent).toContain(
      'Willkommen! Mit diesem Zugang richtet ihr euer kostenloses Partner-Profil ein – euer öffentlicher Auftritt bei Familie auf Pfoten.'
    )
    expect($('#redeem-name')).toBeNull()
    expect(submitButton().textContent).toBe('Partner-Profil einrichten')
    expect(container.textContent).not.toContain('Meine Chronik anlegen')
  })

  test('verweist Privatleute auf Kunden-Gutscheine', async () => {
    await render(UNBOUND)
    expect(container.textContent).toContain('Privat eine eigene Chronik führen? Dafür gibt es Einladungscodes.')
  })

  test('ungebunden: Name, Typ-Auswahl mit allen Partner-Typen und PLZ', async () => {
    await render(UNBOUND)

    expect($('label[for="partner-name"]').textContent).toContain('Name eurer Hundeschule, eures Tierheims …')
    const options = [...$('#partner-typ').querySelectorAll('option')].filter((o) => o.value).map((o) => o.textContent)
    expect(options).toEqual([
      'Tierheim',
      'Vermittlungsstelle',
      'Hundeschule',
      'Hundesalon',
      'Betreuung (Hundesitter, Tagesstätte, Pension)',
      'Futter & Zubehör',
      'Sonstiges'
    ])
    expect($('#partner-plz')).not.toBeNull()
  })

  test('das PLZ-Feld nimmt nur Ziffern an, höchstens fünf', async () => {
    await render(UNBOUND)
    await act(async () => setInputValue($('#partner-plz'), '1a0115 9'))
    expect($('#partner-plz').value).toBe('10115')
  })

  test('ein anderer Code führt zurück zum Kunden-Formular', async () => {
    await render(UNBOUND)
    await act(async () => setInputValue($('#redeem-code'), 'wxyz9876mnpq'))

    expect($('#partner-name')).toBeNull()
    expect($('#redeem-name')).not.toBeNull()
  })

  test('ein Hinweistext für Kunden-Gutscheine (nach 409 beim Anmelden) entfällt beim Partner-Zugang', async () => {
    await render(UNBOUND, { hint: 'Das ist ein Einladungscode – löst ihn ein, um eure Chronik anzulegen.' })
    expect(container.textContent).not.toContain('um eure Chronik anzulegen')
  })
})

describe('RedeemForm – Partner-Zugang absenden', () => {
  test('ungebunden: sendet Code, Name, Typ, PLZ und das leere Honeypot-Feld', async () => {
    redeemVoucher.mockResolvedValue(partnerMe)
    await render(UNBOUND)
    await fillUnbound()
    await submit()

    expect(redeemVoucher).toHaveBeenCalledTimes(1)
    const body = redeemVoucher.mock.calls[0][0]
    expect(body).toEqual({ code: 'ABCD-1234-HJKM', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', plz: '10115', website: '' })
    expect(Object.hasOwn(body, 'shelterMayRead')).toBe(false)
  })

  test('ruft onRedeemed mit der vollen Server-Antwort auf (für KeyReveal)', async () => {
    const onRedeemed = vi.fn()
    redeemVoucher.mockResolvedValue(partnerMe)
    await render(UNBOUND, { onRedeemed })
    await fillUnbound()
    await submit()

    expect(onRedeemed).toHaveBeenCalledWith(partnerMe)
  })

  test('sendet optional Benutzername, Passwort und E-Mail wie beim Kunden-Formular', async () => {
    redeemVoucher.mockResolvedValue(partnerMe)
    await render(UNBOUND)
    await fillUnbound()
    act(() => $('.expand-toggle').click())
    await act(async () => {
      setInputValue($('#redeem-username'), 'wiesengrund')
      setInputValue($('#redeem-password'), 'geheim1234')
      setInputValue($('#redeem-email'), 'kontakt@wiesengrund.example.org')
    })
    await submit()

    expect(redeemVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'wiesengrund', password: 'geheim1234', email: 'kontakt@wiesengrund.example.org' })
    )
  })

  test('mit Typ-Vorgabe: Typ steht fest (keine Auswahl) und wird nicht mitgeschickt', async () => {
    redeemVoucher.mockResolvedValue(partnerMe)
    await render(PRESET)

    expect($('#partner-typ')).toBeNull()
    expect($('.partner-setup-typ-fixed').textContent).toContain('Hundesalon')

    await fillUnbound({ name: 'Salon Wuschelpfote' })
    await submit()

    const body = redeemVoucher.mock.calls[0][0]
    expect(body).toEqual({ code: 'ABCD-1234-HJKM', name: 'Salon Wuschelpfote', plz: '10115', website: '' })
    expect(Object.hasOwn(body, 'typ')).toBe(false)
  })

  test('gebunden: begrüßt den Partner mit Namen, ohne Name/Typ/PLZ, und sendet nur den Code', async () => {
    redeemVoucher.mockResolvedValue(partnerMe)
    await render(BOUND)

    expect(container.textContent).toContain('Willkommen, Hundeschule Wiesengrund!')
    expect($('#partner-name')).toBeNull()
    expect($('#partner-typ')).toBeNull()
    expect($('#partner-plz')).toBeNull()

    await submit()
    expect(redeemVoucher.mock.calls[0][0]).toEqual({ code: 'ABCD-1234-HJKM', website: '' })
  })

  test('eine Fehlermeldung des Servers erscheint als Alert', async () => {
    redeemVoucher.mockRejectedValue(new Error('Diese Postleitzahl kennen wir nicht'))
    await render(UNBOUND)
    await fillUnbound()
    await submit()

    expect($('.error-banner').textContent).toBe('Diese Postleitzahl kennen wir nicht')
    expect(submitButton().disabled).toBe(false)
  })
})

describe('RedeemForm – Partner-Zugang: Prüfung im Browser', () => {
  test('eine unvollständige PLZ wird abgelehnt, ohne den Server zu fragen', async () => {
    await render(UNBOUND)
    await fillUnbound({ plz: '101' })
    await submit()

    expect(redeemVoucher).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Bitte gebt eine fünfstellige Postleitzahl an.')
    expect($('#partner-plz').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe($('#partner-plz'))
  })

  test('Name und Typ sind Pflicht - der Fokus springt aufs erste fehlerhafte Feld', async () => {
    await render(UNBOUND)
    await act(async () => setInputValue($('#partner-plz'), '10115'))
    await submit()

    expect(redeemVoucher).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Bitte gebt euren Namen an.')
    expect(container.textContent).toContain('Bitte wählt aus, was ihr anbietet.')
    expect(document.activeElement).toBe($('#partner-name'))
  })

  test('die Feldmeldung verschwindet, sobald das Feld geändert wird', async () => {
    await render(UNBOUND)
    await fillUnbound({ plz: '101' })
    await submit()
    await act(async () => setInputValue($('#partner-plz'), '10115'))

    expect(container.textContent).not.toContain('fünfstellige Postleitzahl')
    expect($('#partner-plz').getAttribute('aria-invalid')).toBeNull()
  })
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Ohne vorgegebene Antwort: die Tests steuern checkVoucher selbst (verzögerte Antworten).
async function mountPending(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<RedeemForm initialCode="abcd1234hjkm" onRedeemed={() => {}} {...props} />))
}

function blurCode() {
  $('#redeem-code').dispatchEvent(new Event('focusout', { bubbles: true }))
}

describe('RedeemForm – Prüfung: Reihenfolge, doppelte Anfragen, Abbau', () => {
  test('eine verspätete Antwort für einen alten Code wird verworfen (Antworten in falscher Reihenfolge)', async () => {
    const oldCheck = deferred()
    const newCheck = deferred()
    checkVoucher.mockReturnValueOnce(oldCheck.promise).mockReturnValueOnce(newCheck.promise)
    await mountPending()
    expect(checkVoucher).toHaveBeenNthCalledWith(1, 'ABCD-1234-HJKM')

    await act(async () => setInputValue($('#redeem-code'), 'wxyz9876mnpq'))
    await act(async () => blurCode())
    expect(checkVoucher).toHaveBeenNthCalledWith(2, 'WXYZ-9876-MNPQ')

    await act(async () => newCheck.resolve(UNBOUND))
    expect($('#partner-name')).not.toBeNull()
    expect(container.textContent).not.toContain('Prüfe …')

    await act(async () => oldCheck.resolve({ status: 'eingelöst' }))
    expect(container.textContent).not.toContain('schon eingelöst')
    expect($('#partner-name')).not.toBeNull()
    expect(submitButton().disabled).toBe(false)
  })

  test('ein verspäteter Fehler für einen alten Code löscht das neue Ergebnis nicht', async () => {
    const oldCheck = deferred()
    checkVoucher.mockReturnValueOnce(oldCheck.promise).mockResolvedValueOnce(UNBOUND)
    await mountPending()

    await act(async () => setInputValue($('#redeem-code'), 'wxyz9876mnpq'))
    await act(async () => blurCode())
    await act(async () => oldCheck.reject(new Error('Netzwerkfehler')))

    expect($('#partner-name')).not.toBeNull()
  })

  test('Verlassen des Code-Felds während der laufenden Prüfung fragt nicht doppelt', async () => {
    const pending = deferred()
    checkVoucher.mockReturnValue(pending.promise)
    await mountPending()

    await act(async () => blurCode())
    expect(checkVoucher).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Prüfe …')

    await act(async () => pending.resolve(UNBOUND))
    await act(async () => blurCode())
    expect(checkVoucher).toHaveBeenCalledTimes(1)
  })

  test('eine Antwort nach dem Schließen des Formulars läuft ins Leere, ohne Fehler', async () => {
    const pending = deferred()
    checkVoucher.mockReturnValue(pending.promise)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountPending()

    act(() => root.unmount())
    root = null
    await act(async () => pending.resolve(UNBOUND))

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

