// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ view: vi.fn(), redeemVisit: vi.fn() }))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import VisitChip from './VisitChip.jsx'
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

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

describe('VisitChip und VisitClaimCard (Phase V2, Phase W)', () => {
  // Phase W, Schritt 2: statt des Bands oben ein Chip im Kopf der Besuchsseite; er navigiert nur nach /start - den Wechsel
  // macht dort das AreaGate (kein eigener api.view).
  test('der Chip sagt "Zu Besuch · Zurück zu Mein Zuhause" und führt nach Hause (/start)', async () => {
    await render(
      <>
        <VisitChip name="Zuhause Möwenweg" />
        <Where />
      </>
    )
    const chip = container.querySelector('a.visit-chip')
    expect(chip.textContent).toBe('Zu Besuch · Zurück zu Mein Zuhause')
    expect(chip.getAttribute('aria-label')).toBe('Zu Besuch bei Zuhause Möwenweg – zurück zu Mein Zuhause')
    await act(async () => chip.click())
    expect(container.querySelector('[data-testid="where"]').textContent).toBe('/start')
    expect(api.view).not.toHaveBeenCalled()
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
