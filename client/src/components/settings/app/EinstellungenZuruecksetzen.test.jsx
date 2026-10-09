// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ pushUnsubscribe: vi.fn() }))
vi.mock('../../../api', () => ({ api }))

import EinstellungenZuruecksetzen from './EinstellungenZuruecksetzen.jsx'
import { readSetting, writeSetting } from '../../../lib/storage.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<EinstellungenZuruecksetzen platform="android" {...props} />))
}

const resetButton = () => [...container.querySelectorAll('button')].find((b) => /zurücksetzen/i.test(b.textContent))

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  window.localStorage.clear()
  api.pushUnsubscribe.mockReset()
})

describe('EinstellungenZuruecksetzen: „Unsere Einstellungen zurücksetzen“', () => {
  test('zweistufig: kündigt das Push-Abo (Browser + Server), vergisst PLZ/Hinweise, ruft onDone, zeigt die Anleitung', async () => {
    writeSetting('nearbyPlz', '20095')
    writeSetting('standortGemerkt', { plz: '20095' })
    writeSetting('installHintDismissedAt', 123)
    writeSetting('darstellung', { palette: 'wald' })
    api.pushUnsubscribe.mockResolvedValue(null)
    const client = { unsubscribePush: vi.fn(async () => 'https://push.example/alt') }
    const onDone = vi.fn()
    await render({ client, onDone })

    expect(container.textContent).toMatch(/kann die Berechtigungen des Browsers nicht selbst zurücknehmen/)
    expect(container.querySelector('.app-reset-anleitung').textContent).toMatch(/Seiteninfo/)

    await act(async () => resetButton().click())
    expect(client.unsubscribePush).not.toHaveBeenCalled()
    expect(resetButton().textContent).toMatch(/Wirklich zurücksetzen\?/)
    await act(async () => resetButton().click())

    expect(client.unsubscribePush).toHaveBeenCalledTimes(1)
    expect(api.pushUnsubscribe).toHaveBeenCalledWith('https://push.example/alt')
    expect(readSetting('nearbyPlz', null)).toBe(null)
    expect(readSetting('standortGemerkt', null)).toBe(null)
    expect(readSetting('installHintDismissedAt', null)).toBe(null)
    expect(readSetting('darstellung', null)).toEqual({ palette: 'wald' })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="status"]').textContent).toMatch(/Zurückgesetzt/)
  })

  test('scheitert der Server (z. B. Demo 403), wird trotzdem lokal aufgeräumt', async () => {
    writeSetting('nearbyPlz', '20095')
    api.pushUnsubscribe.mockRejectedValue(new Error('Demo – nur lesen'))
    await render({ client: { unsubscribePush: vi.fn(async () => 'https://push.example/demo') }, platform: 'ios' })
    await act(async () => resetButton().click())
    await act(async () => resetButton().click())
    expect(readSetting('nearbyPlz', null)).toBe(null)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('.app-reset-anleitung').textContent).toMatch(/Safari/)
  })
})
