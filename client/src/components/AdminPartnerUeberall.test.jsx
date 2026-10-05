// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { setPartnerUeberallSichtbar } = vi.hoisted(() => ({ setPartnerUeberallSichtbar: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { setPartnerUeberallSichtbar } } }))

import AdminPartnerUeberall from './AdminPartnerUeberall.jsx'

// Phase F: „Überall sichtbar“ in der Partnerliste des Admins - Chip nur, wenn an, mit „Ausschalten“.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  setPartnerUeberallSichtbar.mockReset()
})

async function render(partner, onChanged = () => {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminPartnerUeberall partner={partner} onChanged={onChanged} />))
}

describe('AdminPartnerUeberall', () => {
  test('aus: nichts', async () => {
    await render({ id: 4, name: 'Hundeschule Wiesengrund', ueberall_sichtbar: 0 })
    expect(container.innerHTML).toBe('')
  })

  test('an: Chip und „Ausschalten“ - schaltet aus und meldet die Änderung', async () => {
    const onChanged = vi.fn()
    setPartnerUeberallSichtbar.mockResolvedValue({ id: 4, ueberallSichtbar: false })
    await render({ id: 4, name: 'Hundeschule Wiesengrund', ueberall_sichtbar: 1 }, onChanged)
    expect(container.querySelector('.pill').textContent).toBe('Überall sichtbar')
    const btn = container.querySelector('button')
    expect(btn.textContent).toContain('Ausschalten')
    await act(async () => btn.click())
    expect(setPartnerUeberallSichtbar).toHaveBeenCalledWith(4, false)
    expect(onChanged).toHaveBeenCalled()
  })

  test('Fehler des Servers steht darunter', async () => {
    setPartnerUeberallSichtbar.mockRejectedValue(new Error('Diesen Partner gibt es nicht'))
    await render({ id: 4, name: 'X', ueberall_sichtbar: 1 })
    await act(async () => container.querySelector('button').click())
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/gibt es nicht/)
  })
})
