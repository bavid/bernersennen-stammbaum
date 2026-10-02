// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import LocationPicker from './LocationPicker.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let originalIsSecureContext
let originalGeolocation

function setSecureContext(value) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true })
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  if (originalIsSecureContext !== undefined) Object.defineProperty(window, 'isSecureContext', originalIsSecureContext)
  if (originalGeolocation !== undefined) Object.defineProperty(navigator, 'geolocation', originalGeolocation)
  else delete navigator.geolocation
})

async function render(props) {
  originalIsSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
  originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <LocationPicker plz="" radius={25} onPlzChange={() => {}} onRadiusChange={() => {}} onSubmit={(e) => e.preventDefault()} {...props} />
    )
  )
  return container
}

function locateButton() {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Standort verwenden'))
}

describe('LocationPicker – PLZ und Umkreis', () => {
  test('zeigt ein PLZ-Feld und die Umkreis-Auswahl mit 5/10/25/50/100 km', async () => {
    await render()
    expect(container.querySelector('#location-plz')).not.toBeNull()
    const options = [...container.querySelectorAll('#location-radius option')].map((o) => o.value)
    expect(options).toEqual(['5', '10', '25', '50', '100'])
  })

  test('lässt beim Tippen nur Ziffern zu, höchstens 5', async () => {
    const onPlzChange = vi.fn()
    await render({ onPlzChange })
    const input = container.querySelector('#location-plz')
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      nativeSetter.call(input, '10a11599')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onPlzChange).toHaveBeenCalledWith('10115')
  })

  test('das Absenden des Formulars ruft onSubmit auf', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault())
    await render({ onSubmit })
    await act(async () => container.querySelector('.location-picker').requestSubmit())
    expect(onSubmit).toHaveBeenCalled()
  })
})

// Phase V1: collapsible - eine Zeile statt des Formulars, aufklappbar.
describe('LocationPicker – zugeklappt (collapsible)', () => {
  test('ohne Ort und ohne "überall" bleibt das Formular offen, ohne Zeile', async () => {
    await render({ collapsible: true })
    expect(container.querySelector('.location-summary')).toBeNull()
    expect(container.querySelector('#location-plz')).not.toBeNull()
  })

  test('mit Standort: "In der Nähe eures Standorts", der Knopf nennt für Screenreader Ort und Umkreis', async () => {
    await render({ collapsible: true, applied: { standort: true, radius: 10 } })
    expect(container.querySelector('.location-summary').textContent).toContain('In der Nähe eures Standorts')
    expect(container.querySelector('.location-summary-radius').textContent).toBe('10 km')
    expect(container.querySelector('.location-summary-toggle').textContent).toBe('ändern: Ort und Umkreis')
    expect(container.querySelector('#location-plz')).toBeNull()
  })

  test('"Überall" ohne Umkreis-Angabe, der Knopf heißt "Ort wählen"', async () => {
    await render({ collapsible: true, allowEverywhere: true, applied: { plz: null, radius: 25 } })
    expect(container.querySelector('.location-summary-text').textContent).toBe('Überall')
    expect(container.querySelector('.location-summary-radius')).toBeNull()
    expect(container.querySelector('.location-summary-toggle').textContent).toBe('Ort wählen')
  })

  test('sucht die Seite nicht (onSubmit gibt false zurück), klappt ein später neuer Ort die Eingabe nicht zu', async () => {
    const props = { collapsible: true, allowEverywhere: true, applied: { plz: null, radius: 25 }, onSubmit: (e) => (e.preventDefault(), false) }
    await render(props)
    await act(async () => container.querySelector('.location-summary-toggle').click())
    await act(async () => container.querySelector('.location-picker').requestSubmit())
    await act(async () =>
      root.render(<LocationPicker plz="" radius={25} onPlzChange={() => {}} onRadiusChange={() => {}} {...props} applied={{ plz: '10115', radius: 25 }} />)
    )
    expect(container.querySelector('#location-plz')).not.toBeNull()
  })

  test('ohne collapsible bleibt alles wie bisher (nur das Formular)', async () => {
    await render({ applied: { plz: '10115' } })
    expect(container.querySelector('.location-summary')).toBeNull()
    expect(container.querySelector('form.location-picker')).not.toBeNull()
  })
})

describe('LocationPicker – Standort-Knopf (Task 6 schaltet ihn für die App frei)', () => {
  test('fehlt ohne allowGeolocation, selbst in einem sicheren Kontext mit Geolocation-API', async () => {
    setSecureContext(true)
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: vi.fn() }, configurable: true })
    await render()
    expect(locateButton()).toBeUndefined()
  })

  test('fehlt in einem unsicheren Kontext, selbst mit allowGeolocation', async () => {
    setSecureContext(false)
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: vi.fn() }, configurable: true })
    await render({ allowGeolocation: true })
    expect(locateButton()).toBeUndefined()
  })

  test('fehlt ohne Geolocation-API im Browser, selbst mit allowGeolocation im sicheren Kontext', async () => {
    setSecureContext(true)
    delete navigator.geolocation
    await render({ allowGeolocation: true })
    expect(locateButton()).toBeUndefined()
  })

  test('erscheint mit allowGeolocation in einem sicheren Kontext mit Geolocation-API und rundet auf 0,01', async () => {
    setSecureContext(true)
    const getCurrentPosition = vi.fn((success) => success({ coords: { latitude: 52.523406, longitude: 13.411899 } }))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    const onLocate = vi.fn()
    await render({ allowGeolocation: true, onLocate })

    const button = locateButton()
    expect(button).not.toBeUndefined()
    await act(async () => button.click())

    expect(getCurrentPosition).toHaveBeenCalled()
    expect(onLocate).toHaveBeenCalledWith({ lat: 52.52, lon: 13.41 })
  })
})

// Phase U: kompakt - PLZ, Umkreis und "Suchen" in EINER Zeile, der Standort als kleiner Text-Link darunter.
describe('LocationPicker – kompakt', () => {
  test('PLZ-Feld, Umkreis und "Suchen" stehen gemeinsam in einer Zeile, das PLZ-Feld ist schmal ausgezeichnet', async () => {
    await render()
    const row = container.querySelector('.location-picker-fields')
    expect(row.querySelector('.location-picker-plz #location-plz')).not.toBeNull()
    expect(row.querySelector('.location-picker-radius #location-radius')).not.toBeNull()
    expect(row.querySelector('button[type="submit"]').textContent).toBe('Suchen')
    expect(container.querySelector('#location-plz').getAttribute('maxlength')).toBe('5')
    // Kein eigener Kasten mehr (früher eine Karte mit Schatten).
    expect(container.querySelector('form.location-picker').classList.contains('card')).toBe(false)
  })

  test('"Standort verwenden" ist ein kleiner Text-Link unter der Zeile, kein großer Knopf', async () => {
    setSecureContext(true)
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: vi.fn() }, configurable: true })
    await render({ allowGeolocation: true, onLocate: () => {} })
    const locate = locateButton()
    expect(locate.classList.contains('location-picker-locate')).toBe(true)
    expect(locate.classList.contains('btn')).toBe(false)
    expect(locate.closest('.location-picker-fields')).toBeNull()
  })
})
