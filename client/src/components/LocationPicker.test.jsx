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
