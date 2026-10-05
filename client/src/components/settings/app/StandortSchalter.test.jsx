// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ plzFromLocation: vi.fn() }))
vi.mock('../../../api', () => ({ api }))

import StandortSchalter, { STANDORT_KEY } from './StandortSchalter.jsx'
import { readSetting, writeSetting } from '../../../lib/storage.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<StandortSchalter {...props} />))
}

const button = () => container.querySelector('.app-setting-row button')
const hint = () => container.querySelector('#standort-hint').textContent

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  window.localStorage.clear()
  api.plzFromLocation.mockReset()
})

describe('StandortSchalter: „Standort für ‚In der Nähe‘ merken“', () => {
  test('fragt den Standort erst auf Tippen, merkt sich nur die PLZ (auch als nearbyPlz) und zeigt sie', async () => {
    const locate = vi.fn(async () => ({ lat: 53.55, lon: 10.0 }))
    api.plzFromLocation.mockResolvedValue({ plz: '20095', ort: 'Hamburg' })
    await render({ locate })
    expect(locate).not.toHaveBeenCalled()
    expect(hint()).toBe('Noch nichts gemerkt.')
    expect(button().textContent).toBe('Standort einmal abfragen')

    await act(async () => button().click())
    expect(locate).toHaveBeenCalledTimes(1)
    expect(api.plzFromLocation).toHaveBeenCalledWith({ lat: 53.55, lon: 10.0 })
    expect(hint()).toBe('Gemerkt: 20095 Hamburg')
    expect(readSetting('nearbyPlz', '')).toBe('20095')
    expect(readSetting(STANDORT_KEY, null)).toMatchObject({ plz: '20095', ort: 'Hamburg' })
    expect(window.localStorage.getItem('chronik.standortGemerkt')).not.toMatch(/53\.55/)
  })

  test('„Vergessen“ nimmt PLZ und Merker wieder weg', async () => {
    writeSetting(STANDORT_KEY, { plz: '20095', ort: 'Hamburg', at: 1 })
    writeSetting('nearbyPlz', '20095')
    await render({ locate: vi.fn() })
    expect(button().textContent).toBe('Vergessen')
    await act(async () => button().click())
    expect(hint()).toBe('Noch nichts gemerkt.')
    expect(readSetting('nearbyPlz', null)).toBe(null)
    expect(readSetting(STANDORT_KEY, null)).toBe(null)
  })

  test('blockiert oder fehlgeschlagen: Fehlertext, nichts gemerkt', async () => {
    const locate = vi.fn(async () => {
      throw new Error('Vom Browser blockiert – in den Seiteneinstellungen des Browsers wieder erlauben.')
    })
    await render({ locate })
    await act(async () => button().click())
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/blockiert/)
    expect(readSetting(STANDORT_KEY, null)).toBe(null)
    expect(api.plzFromLocation).not.toHaveBeenCalled()
  })
})
