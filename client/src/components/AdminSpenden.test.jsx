// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ spenden: vi.fn(), createSpende: vi.fn(), updateSpende: vi.fn(), deleteSpende: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: mocks } }))

import AdminSpenden from './AdminSpenden.jsx'

// „Spenden erfassen“ im Admin: schnelles Formular (Euro -> Cent, Fehler am Feld), Liste mit Demo-Kennzeichen, Bearbeiten.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SPENDE = { id: 7, betragCents: 2000, datum: '2026-10-09', quelle: 'paypal', anzeigename: null, nachricht: 'Für die Fellnasen!', oeffentlich: true, isDemo: false }
const DEMO = { ...SPENDE, id: 8, anzeigename: 'Wilma', isDemo: true, oeffentlich: false }

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AdminSpenden />
      </MemoryRouter>
    )
  )
}

const byId = (id) => container.querySelector(`#${id}`)

async function setValue(element, value) {
  const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  await act(async () => element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })))
}

async function submit(form) {
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

describe('AdminSpenden', () => {
  test('Liste: Betrag, Anonym, Quelle, nicht öffentlich, Demo gekennzeichnet', async () => {
    mocks.spenden.mockResolvedValue({ spenden: [SPENDE, DEMO] })
    await render()
    const rows = container.querySelectorAll('.admin-quartal-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toMatch(/20,00\s€ · Anonym/)
    expect(rows[0].textContent).toContain('09.10.2026 · PayPal')
    expect(rows[1].textContent).toContain('nicht öffentlich')
    expect(rows[1].textContent).toContain('Demo')
  })

  test('Spende erfassen: Fehler am Feld, dann Euro -> Cent an die API und neu laden', async () => {
    mocks.spenden.mockResolvedValue({ spenden: [] })
    mocks.createSpende.mockResolvedValue({ id: 9 })
    await render()
    expect(container.textContent).toContain('Noch keine Spenden erfasst.')
    await submit(container.querySelector('.admin-spende-form'))
    expect(mocks.createSpende).not.toHaveBeenCalled()
    expect(byId('admin-spende-betrag-error').textContent).toMatch(/Betrag/)
    await setValue(byId('admin-spende-betrag'), '20')
    await setValue(byId('admin-spende-datum'), '2026-10-10')
    await setValue(byId('admin-spende-quelle'), 'bar')
    await setValue(byId('admin-spende-nachricht'), 'Für die Fellnasen!')
    await submit(container.querySelector('.admin-spende-form'))
    expect(mocks.createSpende).toHaveBeenCalledWith({
      betragCents: 2000,
      datum: '2026-10-10',
      quelle: 'bar',
      anzeigename: '',
      nachricht: 'Für die Fellnasen!',
      oeffentlich: true
    })
    expect(mocks.spenden).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="status"]').textContent).toMatch(/20,00\s€ erfasst\./)
    // Formular wieder leer, Quelle und Datum bleiben.
    expect(byId('admin-spende-betrag').value).toBe('')
    expect(byId('admin-spende-quelle').value).toBe('bar')
  })

  test('Server-Fehler am Feld; Bearbeiten schickt PUT', async () => {
    mocks.spenden.mockResolvedValue({ spenden: [SPENDE] })
    const err = Object.assign(new Error('Der Name darf höchstens 40 Zeichen haben.'), { details: { feld: 'anzeigename' } })
    mocks.createSpende.mockRejectedValue(err)
    await render()
    await setValue(byId('admin-spende-betrag'), '5')
    await submit(container.querySelector('.admin-spende-form'))
    expect(byId('admin-spende-anzeigename-error').textContent).toBe('Der Name darf höchstens 40 Zeichen haben.')

    mocks.updateSpende.mockResolvedValue(SPENDE)
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent.startsWith('Bearbeiten')).click())
    expect(byId('admin-spende-betrag').value).toBe('20,00')
    await setValue(byId('admin-spende-betrag'), '25')
    await submit(container.querySelector('.admin-spende-form'))
    expect(mocks.updateSpende).toHaveBeenCalledWith(7, expect.objectContaining({ betragCents: 2500, quelle: 'paypal', nachricht: 'Für die Fellnasen!' }))
  })
})
