// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  rahmenGeraete: vi.fn(),
  createRahmenGeraet: vi.fn(),
  updateRahmenGeraet: vi.fn(),
  revokeRahmenGeraet: vi.fn(),
  listDogs: vi.fn()
}))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import RahmenGeraete from './RahmenGeraete.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { DEFAULT_OPTIONEN } from '../../lib/bilderrahmen.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = 'Ab3_dEf-ghIjkLmNoPqRsTuVwXyZ0123456789abcde'
const AUSWAHL = { ...DEFAULT_OPTIONEN, tiere: [], zeitraum: 'alle', privat: false }
const OMA = { id: 1, name: 'Wohnzimmer Oma', auswahl: AUSWAHL, erstellt: '2026-10-01 10:00:00', zuletztAktiv: null }

let container
let root

async function render({ demo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={demo}>
        <RahmenGeraete />
      </DemoProvider>
    )
  )
}

const buttonByText = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  api.rahmenGeraete.mockResolvedValue({ geraete: [OMA], max: 5 })
  api.listDogs.mockResolvedValue([
    { id: 4, name: 'Nele', can_edit: 1, abschied_grund: null },
    { id: 5, name: 'Flocke', can_edit: 1, abschied_grund: 'verstorben' },
    { id: 9, name: 'Benno', can_edit: 0 }
  ])
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

describe('Einstellungen › Bilderrahmen auf einem anderen Gerät', () => {
  test('Liste mit „zuletzt aktiv“ und Auswahl', async () => {
    api.rahmenGeraete.mockResolvedValue({
      geraete: [OMA, { ...OMA, id: 2, name: 'Küche', zuletztAktiv: '2026-10-04 06:00:00', auswahl: { ...AUSWAHL, privat: true } }],
      max: 5
    })
    await render()
    const rows = [...container.querySelectorAll('.rahmen-row')]
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('noch nicht verbunden')
    expect(rows[0].textContent).toContain('Alle Tiere · alle 10 s')
    expect(rows[1].textContent).toMatch(/zuletzt aktiv /)
    expect(rows[1].textContent).toContain('auch private Erinnerungen')
  })

  test('einrichten: nur eigene Tiere, private Erinnerungen aus – der Link erscheint einmal mit QR-Code', async () => {
    api.createRahmenGeraet.mockResolvedValue({ geraet: { ...OMA, id: 3, name: 'Flur' }, token: TOKEN })
    await render()
    await act(async () => buttonByText('Bilderrahmen einrichten').click())
    const chips = [...container.querySelectorAll('.frame-chip')].map((chip) => chip.textContent)
    expect(chips).toEqual(['Alle', 'Nele', 'Flocke · in Erinnerung'])
    const privat = [...container.querySelectorAll('label.check')].find((label) => label.textContent.includes('Auch private'))
    expect(privat.querySelector('input').checked).toBe(false)

    type(container.querySelector('.rahmen-form input:not([type])'), 'Flur')
    act(() => [...container.querySelectorAll('.frame-chip')].find((chip) => chip.textContent === 'Nele').click())
    await act(async () => container.querySelector('.rahmen-form').requestSubmit())

    expect(api.createRahmenGeraet).toHaveBeenCalledWith({ name: 'Flur', auswahl: { ...AUSWAHL, tiere: [4] } })
    const field = container.querySelector('#rahmen-link-3')
    expect(field.value).toBe(`${window.location.origin}/rahmen#${TOKEN}`)
    expect(container.querySelector('.rahmen-reveal-qr').getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(container.textContent).toContain('Diesen Link seht ihr nur jetzt.')
    expect(container.querySelectorAll('.rahmen-row')).toHaveLength(2)

    act(() => buttonByText('Fertig').click())
    expect(container.querySelector('.rahmen-reveal')).toBeNull()
    expect(container.textContent.includes(TOKEN)).toBe(false)
  })

  test('mit Haken auch private Erinnerungen', async () => {
    api.createRahmenGeraet.mockResolvedValue({ geraet: { ...OMA, id: 3 }, token: TOKEN })
    await render()
    await act(async () => buttonByText('Bilderrahmen einrichten').click())
    type(container.querySelector('.rahmen-form input:not([type])'), 'Oma')
    const privat = [...container.querySelectorAll('label.check')].find((label) => label.textContent.includes('Auch private'))
    act(() => privat.querySelector('input').click())
    await act(async () => container.querySelector('.rahmen-form').requestSubmit())
    expect(api.createRahmenGeraet.mock.calls[0][0].auswahl.privat).toBe(true)
  })

  test('beenden (zweistufig) und ändern - Name und Auswahl, vorbelegt mit den Werten des Rahmens', async () => {
    api.revokeRahmenGeraet.mockResolvedValue(null)
    api.updateRahmenGeraet.mockImplementation(async (id, payload) => ({ geraet: { ...OMA, ...payload } }))
    await render()
    act(() => buttonByText('Ändern').click())
    const form = container.querySelector('.rahmen-row .rahmen-form')
    expect(form.querySelector('h3').textContent).toBe(`„${OMA.name}“ ändern`)
    const nameInput = form.querySelector('input:not([type])')
    expect(nameInput.value).toBe(OMA.name)
    type(nameInput, 'Oma Wohnzimmer')
    await act(async () => form.requestSubmit())
    expect(api.updateRahmenGeraet).toHaveBeenCalledWith(1, {
      name: 'Oma Wohnzimmer',
      auswahl: expect.objectContaining({ tiere: OMA.auswahl.tiere, zeitraum: OMA.auswahl.zeitraum, privat: Boolean(OMA.auswahl.privat) })
    })
    expect(container.querySelector('.rahmen-row .rahmen-form')).toBeNull()
    expect(container.querySelector('.rahmen-row strong').textContent).toBe('Oma Wohnzimmer')

    const end = container.querySelector('button[aria-label="Bilderrahmen „Oma Wohnzimmer“ beenden"]')
    act(() => end.click())
    expect(api.revokeRahmenGeraet).not.toHaveBeenCalled()
    await act(async () => container.querySelector('.rahmen-row .btn-danger').click())
    expect(api.revokeRahmenGeraet).toHaveBeenCalledWith(1)
    expect(container.querySelectorAll('.rahmen-row')).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('„Oma Wohnzimmer“ ist beendet – das Gerät zeigt in wenigen Minuten keine Fotos mehr.')
  })

  test('Demo/Admin-Ansicht: nur ansehen; bei fünf Rahmen ist Schluss', async () => {
    await render({ demo: true })
    expect(buttonByText('Bilderrahmen einrichten').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
    expect(buttonByText('Ändern')).toBeUndefined()
    act(() => root.unmount())
    container.remove()

    api.rahmenGeraete.mockResolvedValue({ geraete: [1, 2, 3, 4, 5].map((id) => ({ ...OMA, id })), max: 5 })
    await render()
    expect(buttonByText('Bilderrahmen einrichten').disabled).toBe(true)
    expect(container.textContent).toContain('Höchstens 5 Bilderrahmen')
  })
})
