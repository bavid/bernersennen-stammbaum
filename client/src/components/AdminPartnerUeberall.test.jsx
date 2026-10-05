// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { setPartnerUeberallErlaubt } = vi.hoisted(() => ({ setPartnerUeberallErlaubt: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { setPartnerUeberallErlaubt } } }))

import AdminPartnerUeberall from './AdminPartnerUeberall.jsx'

// Phase F: „Überall sichtbar“ in der Partnerliste des Admins - Chip nur, wenn an oder vom Team ausgeschaltet.
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
  setPartnerUeberallErlaubt.mockReset()
})

async function render(partner, onChanged = () => {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminPartnerUeberall partner={partner} onChanged={onChanged} />))
}

const partner = { id: 4, name: 'Hundeschule Wiesengrund', ueberall_sichtbar: 0, ueberall_gesperrt: 0 }

describe('AdminPartnerUeberall', () => {
  test('aus und nicht gesperrt: nichts', async () => {
    await render(partner)
    expect(container.innerHTML).toBe('')
  })

  test('an: Chip und „Ausschalten“ - schaltet aus und sperrt (erlaubt: false), meldet die Änderung', async () => {
    const onChanged = vi.fn()
    setPartnerUeberallErlaubt.mockResolvedValue({ id: 4, ueberallSichtbar: false, ueberallGesperrt: true })
    await render({ ...partner, ueberall_sichtbar: 1 }, onChanged)
    expect(container.querySelector('.pill').textContent).toBe('Überall sichtbar')
    const btn = container.querySelector('button')
    expect(btn.textContent).toContain('Ausschalten')
    await act(async () => btn.click())
    expect(setPartnerUeberallErlaubt).toHaveBeenCalledWith(4, false)
    expect(onChanged).toHaveBeenCalled()
  })

  test('vom Team ausgeschaltet: Chip „vom Team ausgeschaltet“ und „Wieder erlauben“ (erlaubt: true)', async () => {
    setPartnerUeberallErlaubt.mockResolvedValue({ id: 4, ueberallSichtbar: false, ueberallGesperrt: false })
    await render({ ...partner, ueberall_gesperrt: 1 })
    expect(container.querySelector('.pill').textContent).toBe('Überall sichtbar: vom Team ausgeschaltet')
    const btn = container.querySelector('button')
    expect(btn.textContent).toContain('Wieder erlauben')
    await act(async () => btn.click())
    expect(setPartnerUeberallErlaubt).toHaveBeenCalledWith(4, true)
  })

  test('Fehler des Servers steht darunter', async () => {
    setPartnerUeberallErlaubt.mockRejectedValue(new Error('Diesen Partner gibt es nicht'))
    await render({ ...partner, ueberall_sichtbar: 1 })
    await act(async () => container.querySelector('button').click())
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/gibt es nicht/)
  })
})
