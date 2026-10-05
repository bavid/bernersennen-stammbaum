// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { setUeberallSichtbar } = vi.hoisted(() => ({ setUeberallSichtbar: vi.fn() }))
vi.mock('../api', () => ({ api: { partnerArea: { setUeberallSichtbar } } }))

import PartnerUeberallSwitch, { UEBERALL_LABEL } from './PartnerUeberallSwitch.jsx'
import { DemoProvider } from '../lib/demo.js'

// Phase F: Schalter „Überall sichtbar (vorerst kostenlos)“ im Reiter „Teilen“.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const profile = { id: 3, slug: 'hundeschule-kiesel', name: 'Hundeschule Kieselweg', typ: 'hundeschule', status: 'aktiv', gesperrt: false, ueberallSichtbar: false }

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  setUeberallSichtbar.mockReset()
})

async function render(props = {}, { isDemo = false, onSaved = () => {} } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <PartnerUeberallSwitch profile={{ ...profile, ...props }} onSaved={onSaved} />
      </DemoProvider>
    )
  )
}

const toggle = () => container.querySelector('input[role="switch"]')

describe('PartnerUeberallSwitch', () => {
  test('Beschriftung, ein Satz dazu, aus - ein Klick schaltet ein und gibt das neue Profil weiter', async () => {
    const onSaved = vi.fn()
    setUeberallSichtbar.mockResolvedValue({ ...profile, ueberallSichtbar: true })
    await render({}, { onSaved })

    expect(container.querySelector('label').textContent).toBe(UEBERALL_LABEL)
    expect(toggle().checked).toBe(false)
    expect(toggle().disabled).toBe(false)
    const hint = document.getElementById(toggle().getAttribute('aria-describedby'))
    expect(hint.textContent).toMatch(/nicht nur in der Nähe/)

    await act(async () => toggle().click())
    expect(setUeberallSichtbar).toHaveBeenCalledWith(true)
    expect(onSaved).toHaveBeenCalledWith({ ...profile, ueberallSichtbar: true })
  })

  test('an - ein Klick schaltet aus; Fehler des Servers steht darunter', async () => {
    setUeberallSichtbar.mockRejectedValue(new Error('Gesperrt – bitte meldet euch beim Betreiber.'))
    await render({ ueberallSichtbar: true })
    expect(toggle().checked).toBe(true)
    await act(async () => toggle().click())
    expect(setUeberallSichtbar).toHaveBeenCalledWith(false)
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/Gesperrt/)
  })

  test('Demo: gesperrt mit Hinweis; noch nicht veröffentlicht: Hinweis „gilt, sobald …“', async () => {
    await render({ status: 'entwurf' }, { isDemo: true })
    expect(toggle().disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
    expect(container.textContent).toContain('Gilt, sobald euer Profil veröffentlicht ist.')
  })

  test('gesperrter Partner: Schalter aus, Hinweis zum Betreiber', async () => {
    await render({ gesperrt: true })
    expect(toggle().disabled).toBe(true)
    expect(container.textContent).toMatch(/Gesperrt – bitte meldet euch beim Betreiber/)
  })
})
