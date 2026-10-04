// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ view: vi.fn(), redeemVisit: vi.fn() }))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import VisitBanner from './VisitBanner.jsx'
import VisitClaimCard from './VisitClaimCard.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  api.view.mockReset()
  api.redeemVisit.mockReset()
})

async function render(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter>{element}</MemoryRouter>))
}

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }

describe('VisitBanner und VisitClaimCard (Phase V2)', () => {
  test('das Band nennt den Gastgeber und wechselt zurück in die eigene Chronik', async () => {
    const me = { ...home, home, besuche: [] }
    api.view.mockResolvedValue(me)
    const onFamilyChange = vi.fn()
    await render(<VisitBanner family={{ id: 9, name: 'Zuhause Möwenweg', art: 'zuhause', zuBesuch: true, home }} onFamilyChange={onFamilyChange} />)
    expect(container.textContent).toContain('Zu Besuch bei Zuhause Möwenweg')
    expect(container.textContent).toContain('ansehen und kommentieren')
    expect(container.querySelector('button').textContent).toBe('Zurück zu Mein Zuhause')
    await act(async () => container.querySelector('button').click())
    expect(api.view).toHaveBeenCalledWith(1)
    expect(onFamilyChange).toHaveBeenCalledWith(me)
  })

  test('die Karte auf /v verbindet mit dem einladenden Zuhause', async () => {
    const me = { ...home, home, besuche: [{ id: 9, name: 'Zuhause Möwenweg' }] }
    api.redeemVisit.mockResolvedValue({ gastgeber: { id: 9, name: 'Zuhause Möwenweg' }, me })
    const onConnected = vi.fn()
    await render(<VisitClaimCard code="ABCD-EFGH-JKMN" visit={{ name: 'Zuhause Möwenweg' }} onConnected={onConnected} />)
    expect(container.textContent).toContain('„Zuhause Möwenweg“ lädt euch zu Besuch ein')
    await act(async () => container.querySelector('button').click())
    expect(api.redeemVisit).toHaveBeenCalledWith('ABCD-EFGH-JKMN')
    expect(onConnected).toHaveBeenCalledWith(me)
  })

  test('ein Fehler beim Verbinden bleibt auf der Karte stehen', async () => {
    api.redeemVisit.mockRejectedValue(new Error('Dieser Gutschein ist abgelaufen'))
    await render(<VisitClaimCard code="ABCD-EFGH-JKMN" visit={{ name: 'Zuhause Möwenweg' }} onConnected={() => {}} />)
    await act(async () => container.querySelector('button').click())
    expect(container.querySelector('[role="alert"]').textContent).toContain('abgelaufen')
    expect(container.querySelector('button').disabled).toBe(false)
  })
})
