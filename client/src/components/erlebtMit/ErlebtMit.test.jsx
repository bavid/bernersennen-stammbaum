// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  erlebtMitTiere: vi.fn(),
  erlebtMitOffen: vi.fn(),
  confirmErlebtMit: vi.fn(),
  rejectErlebtMit: vi.fn(),
  rejectAllErlebtMitFrom: vi.fn(),
  upload: vi.fn()
}))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import TimelineEntryForm from '../TimelineEntryForm.jsx'
import Timeline from '../Timeline.jsx'
import ErlebtMitRequests from './ErlebtMitRequests.jsx'
import { DemoProvider } from '../../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  Object.values(api).forEach((fn) => fn.mockReset())
  toast.mockReset()
  window.localStorage.clear()
})

async function render(element, { isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={isDemo}>{element}</DemoProvider>
      </MemoryRouter>
    )
  )
}

const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
function setInput(selector, value) {
  const input = container.querySelector(selector)
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const submit = () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

const animals = [
  { id: 21, name: 'Wilma', nameUnbekannt: false, tierart: 'hund', zuhauseId: 9, zuhause: 'Zuhause Möwenweg' },
  { id: 22, name: 'Pepper', nameUnbekannt: false, tierart: 'hund', zuhauseId: 12, zuhause: 'Zuhause Lindenhof' }
]

describe('„Erlebt mit“ im Eintrags-Formular (Phase V2)', () => {
  test('mit canTag: Tiere verbundener Zuhause ankreuzen, erlebtMit geht mit', async () => {
    api.erlebtMitTiere.mockResolvedValue(animals)
    const onSubmit = vi.fn().mockResolvedValue()
    await render(<TimelineEntryForm canTag isHousehold onSubmit={onSubmit} onCancel={() => {}} />)
    expect(container.querySelector('.erlebt-mit-picker').textContent).toContain('Zuhause Möwenweg')
    const wilma = [...container.querySelectorAll('.erlebt-mit-option')].find((o) => o.textContent.includes('Wilma'))
    await act(async () => wilma.querySelector('input').click())
    setInput('#entry-title', 'Deichrunde')
    setInput('#entry-author', 'Nissen')
    await act(async () => submit())
    expect(onSubmit.mock.calls[0][0].erlebtMit).toEqual([21])
  })

  test('privat: Auswahl gesperrt mit Hinweis, erlebtMit leer', async () => {
    api.erlebtMitTiere.mockResolvedValue(animals)
    const onSubmit = vi.fn().mockResolvedValue()
    await render(
      <TimelineEntryForm
        canTag
        isHousehold
        entry={{ id: 5, titel: 'Alt', autor_name: 'Nissen', datum: '2026-01-01', foto_urls: [], privat: 1, erlebt_mit: [{ id: 1, dogId: 21 }] }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    )
    expect(container.querySelector('.erlebt-mit-picker').disabled).toBe(true)
    expect(container.textContent).toContain('Private Einträge können keine anderen Tiere markieren.')
    await act(async () => submit())
    expect(onSubmit.mock.calls[0][0].erlebtMit).toEqual([])
  })

  test('ohne canTag kein Feld und kein erlebtMit im Payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render(<TimelineEntryForm isHousehold onSubmit={onSubmit} onCancel={() => {}} />)
    expect(container.querySelector('.erlebt-mit-picker')).toBeNull()
    setInput('#entry-title', 'Deichrunde')
    setInput('#entry-author', 'Nissen')
    await act(async () => submit())
    expect('erlebtMit' in onSubmit.mock.calls[0][0]).toBe(false)
    expect(api.erlebtMitTiere).not.toHaveBeenCalled()
  })
})

describe('„Erlebt mit“ in der Chronik (Phase V2)', () => {
  const ownEntry = {
    type: 'entry',
    key: 'entry-1',
    id: 1,
    datum: '2026-08-30',
    titel: 'Deichrunde',
    autor_name: 'Nissen',
    comments: [],
    erlebt_mit: [
      { id: 7, dogId: 21, name: 'Wilma', zuhause: 'Zuhause Möwenweg', status: 'bestaetigt' },
      { id: 8, dogId: 22, name: 'Pepper', zuhause: 'Zuhause Lindenhof', status: 'offen' }
    ]
  }
  const mirrored = {
    type: 'entry',
    key: 'entry-40',
    id: 40,
    datum: '2026-09-01',
    titel: 'Strandtag',
    autor_name: 'Familie Jansen',
    foto_urls: ['/uploads/x.jpg'],
    comments: [],
    gespiegelt: { requestId: 3, tierId: 50, tier: 'Wilma', tierNameUnbekannt: false, zuhauseId: 9, zuhause: 'Zuhause Möwenweg' }
  }

  test('eigener Eintrag: Chips „erlebt mit …“, offene als angefragt', async () => {
    await render(<Timeline items={[ownEntry]} canEdit onEdit={() => {}} onOpenPhoto={() => {}} onAddComment={() => {}} />)
    const chips = [...container.querySelectorAll('.erlebt-mit-chip')].map((chip) => chip.textContent)
    expect(chips).toEqual(['erlebt mit Wilma', 'erlebt mit Pepper (angefragt)'])
  })

  test('gespiegelter Eintrag: Herkunft, ohne Bearbeiten und Kommentare, mit „ansehen“ und „nicht mehr zeigen“', async () => {
    const onOpenOrigin = vi.fn()
    const onHide = vi.fn()
    await render(
      <Timeline
        items={[mirrored]}
        canEdit
        onEdit={() => {}}
        onOpenPhoto={() => {}}
        onAddComment={() => {}}
        mirror={{ canOpenOrigin: () => true, onOpenOrigin, onHide }}
      />
    )
    const card = container.querySelector('.entry-card-mirrored')
    expect(card.textContent).toContain('erlebt mit Wilma · Zuhause Möwenweg')
    expect(card.querySelector('.entry-comments')).toBeNull()
    expect(card.querySelector('[aria-label*="bearbeiten"]')).toBeNull()
    expect(card.querySelector('img').getAttribute('src')).toBe('/uploads/x.jpg')
    const buttons = [...card.querySelectorAll('button')]
    await act(async () => buttons.find((b) => b.textContent.includes('Bei Zuhause Möwenweg ansehen')).click())
    expect(onOpenOrigin).toHaveBeenCalledWith(mirrored)
    const hide = () => [...card.querySelectorAll('button')].find((b) => b.className.includes('btn-danger'))
    act(() => hide().click())
    await act(async () => hide().click())
    expect(onHide).toHaveBeenCalledWith(mirrored)
  })

  test('ohne Besuch beim Ursprung kein „ansehen“', async () => {
    await render(<Timeline items={[mirrored]} onOpenPhoto={() => {}} mirror={{ canOpenOrigin: () => false, onOpenOrigin: () => {} }} />)
    expect(container.textContent).not.toContain('ansehen')
  })
})

describe('Anfragen „Wilma war dabei – übernehmen?“ (Phase V2)', () => {
  const request = {
    requestId: 3,
    id: 40,
    dogId: 21,
    dogName: 'Wilma',
    tier: 'Nele',
    zuhause: 'Zuhause am Deich',
    titel: 'Deichrunde',
    datum: '2026-08-30',
    text: 'Zu zweit am Deich',
    foto_urls: [],
    autor_name: 'Familie Nissen'
  }

  test('zeigt die Anfrage; Übernehmen bestätigt und meldet die neue Zahl', async () => {
    api.erlebtMitOffen.mockResolvedValue([request])
    api.confirmErlebtMit.mockResolvedValue({ id: 3, status: 'bestaetigt', offen: 0 })
    const onCountChange = vi.fn()
    await render(<ErlebtMitRequests onCountChange={onCountChange} />)
    expect(container.textContent).toContain('Wilma war dabei – übernehmen?')
    expect(container.textContent).toContain('„Deichrunde“')
    const confirm = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Übernehmen')
    await act(async () => confirm.click())
    expect(api.confirmErlebtMit).toHaveBeenCalledWith(3)
    expect(onCountChange).toHaveBeenCalledWith(0)
    expect(container.querySelector('.erlebt-mit-requests')).toBeNull()
  })

  test('Ablehnen ruft api.rejectErlebtMit', async () => {
    api.erlebtMitOffen.mockResolvedValue([request])
    api.rejectErlebtMit.mockResolvedValue({ id: 3, status: 'abgelehnt', offen: 0 })
    await render(<ErlebtMitRequests />)
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ablehnen').click())
    expect(api.rejectErlebtMit).toHaveBeenCalledWith(3)
  })

  test('„Alle von … ablehnen“ erscheint bei mehreren Anfragen eines Zuhauses (security-review V2)', async () => {
    const second = { ...request, requestId: 4, titel: 'Noch eine' }
    api.erlebtMitOffen.mockResolvedValue([{ ...request, zuhauseId: 8 }, { ...second, zuhauseId: 8 }])
    api.rejectAllErlebtMitFrom.mockResolvedValue({ abgelehnt: 2, offen: 0 })
    const onCountChange = vi.fn()
    await render(<ErlebtMitRequests onCountChange={onCountChange} />)
    const all = () => [...container.querySelectorAll('.erlebt-mit-request-groups button')][0]
    expect(all().textContent).toContain('Alle 2 von „Zuhause am Deich“ ablehnen')
    act(() => all().click())
    await act(async () => all().click())
    expect(api.rejectAllErlebtMitFrom).toHaveBeenCalledWith(8)
    expect(onCountChange).toHaveBeenCalledWith(0)
    expect(container.querySelector('.erlebt-mit-requests')).toBeNull()
  })

  test('Demo: Knöpfe gesperrt; ohne Anfragen nichts', async () => {
    api.erlebtMitOffen.mockResolvedValue([request])
    await render(<ErlebtMitRequests />, { isDemo: true })
    expect([...container.querySelectorAll('.erlebt-mit-request button')].every((b) => b.disabled)).toBe(true)
    act(() => root.unmount())
    container.remove()
    api.erlebtMitOffen.mockResolvedValue([])
    await render(<ErlebtMitRequests />)
    expect(container.innerHTML).toBe('')
  })
})
