// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  visits: vi.fn(),
  createVisitInvite: vi.fn(),
  redeemVisit: vi.fn(),
  endVisit: vi.fn(),
  removeGuest: vi.fn()
}))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import VisitSection from './VisitSection.jsx'
import VisitInviteCreator from './VisitInviteCreator.jsx'
import VisitRedeemForm from './VisitRedeemForm.jsx'
import { DemoProvider } from '../../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const lists = {
  besuche: [{ id: 9, name: 'Zuhause Möwenweg', seit: '2026-09-01 10:00:00' }],
  gaeste: [{ id: 12, name: 'Zuhause Heidekamp', seit: '2026-09-20 10:00:00' }]
}

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  Object.values(api).forEach((fn) => fn.mockReset())
  toast.mockReset()
})

async function render({ isDemo = false, ...props } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <VisitSection {...props} />
      </DemoProvider>
    )
  )
}

async function renderComponent(element, { isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<DemoProvider value={isDemo}>{element}</DemoProvider>))
}

function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const buttonByText = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text))

describe('VisitSection (Phase V2, seit Phase W Schritt 2 nur die Listen)', () => {
  test('zeigt Besuche und Gäste mit „Beenden“ - kein Einladen, kein Einlösen', async () => {
    api.visits.mockResolvedValue(lists)
    await render()
    expect(container.querySelector('#visit-invite-title')).toBeNull()
    expect(container.querySelector('#visit-redeem-code')).toBeNull()
    expect(container.querySelector('#visit-list-besuche').parentElement.textContent).toContain('Zuhause Möwenweg')
    expect(container.querySelector('#visit-list-gaeste').parentElement.textContent).toContain('Zuhause Heidekamp')
  })

  test('Besuch beenden (zweistufig) ruft api.endVisit und übernimmt „me“; Gast entfernen ruft api.removeGuest', async () => {
    api.visits.mockResolvedValue(lists)
    const me = { id: 1, besuche: [] }
    api.endVisit.mockResolvedValue(me)
    api.removeGuest.mockResolvedValue(null)
    const onFamilyChange = vi.fn()
    await render({ onFamilyChange })
    const endButton = () => container.querySelector('#visit-list-besuche').parentElement.querySelector('button')
    act(() => endButton().click())
    await act(async () => endButton().click())
    expect(api.endVisit).toHaveBeenCalledWith(9)
    expect(onFamilyChange).toHaveBeenCalledWith(me)
    const guestButton = () => container.querySelector('#visit-list-gaeste').parentElement.querySelector('button')
    act(() => guestButton().click())
    await act(async () => guestButton().click())
    expect(api.removeGuest).toHaveBeenCalledWith(12)
  })

  test('Demo: Beenden gesperrt', async () => {
    api.visits.mockResolvedValue(lists)
    await render({ isDemo: true })
    expect(container.querySelector('#visit-list-besuche').parentElement.querySelector('button').disabled).toBe(true)
  })
})

describe('VisitInviteCreator (Zu Besuch einladen)', () => {
  test('Einladung erstellen zeigt Code, Link und den 7-Tage-Hinweis', async () => {
    api.createVisitInvite.mockResolvedValue({ id: 4, code: 'ABCD-EFGH-JKMN', expires_at: '2026-10-10 12:00:00', gueltigTage: 7 })
    const onCreated = vi.fn()
    await renderComponent(<VisitInviteCreator onCreated={onCreated} />)
    expect(container.textContent).toContain('Der Code gilt 7 Tage und nur einmal')
    await act(async () => buttonByText('Besuchs-Einladung erstellen').click())
    expect(container.querySelector('#visit-invite-code').value).toBe('ABCD-EFGH-JKMN')
    expect(container.querySelector('#visit-invite-link').value).toBe(`${window.location.origin}/v#ABCDEFGHJKMN`)
    expect(container.textContent).toContain('Gültig bis 10.10.2026')
    expect(onCreated).toHaveBeenCalled()
  })

  test('Demo: gesperrt mit Hinweis', async () => {
    await renderComponent(<VisitInviteCreator />, { isDemo: true })
    expect(buttonByText('Besuchs-Einladung erstellen').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo werden keine Einladungen vergeben.')
  })
})

describe('VisitRedeemForm (Code von Freunden eingeben, Seite „Familien“)', () => {
  test('Code einlösen meldet { gastgeber, me }', async () => {
    const me = { id: 1, besuche: [{ id: 9, name: 'Zuhause Möwenweg' }] }
    api.redeemVisit.mockResolvedValue({ gastgeber: { id: 9, name: 'Zuhause Möwenweg' }, me })
    const onRedeemed = vi.fn()
    await renderComponent(<VisitRedeemForm onRedeemed={onRedeemed} />)
    const input = container.querySelector('#visit-redeem-code')
    await act(async () => setInput(input, 'abcdefghjkmn'))
    expect(input.value).toBe('ABCD-EFGH-JKMN')
    await act(async () => container.querySelector('.visit-redeem-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(api.redeemVisit).toHaveBeenCalledWith('ABCD-EFGH-JKMN')
    expect(onRedeemed).toHaveBeenCalledWith({ gastgeber: { id: 9, name: 'Zuhause Möwenweg' }, me })
  })

  test('Fehler beim Einlösen erscheint am Formular; in der Demo gesperrt', async () => {
    api.redeemVisit.mockRejectedValue(new Error('Dieser Gutschein ist abgelaufen'))
    await renderComponent(<VisitRedeemForm onRedeemed={() => {}} />)
    await act(async () => setInput(container.querySelector('#visit-redeem-code'), 'ABCDEFGHJKMN'))
    await act(async () => container.querySelector('.visit-redeem-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.querySelector('.visit-redeem-form [role="alert"]').textContent).toContain('abgelaufen')
    act(() => root.unmount())
    container.remove()

    await renderComponent(<VisitRedeemForm onRedeemed={() => {}} />, { isDemo: true })
    expect(buttonByText('Besuchen').disabled).toBe(true)
  })
})
