// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ visits: vi.fn(), acknowledgeGuest: vi.fn(), removeGuest: vi.fn() }))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import NewGuestsNotice from './NewGuestsNotice.jsx'
import CommentThread from '../CommentThread.jsx'
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
})

async function render(element, { isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<DemoProvider value={isDemo}>{element}</DemoProvider>))
}

const lists = {
  besuche: [],
  gaeste: [
    { id: 9, name: 'Zuhause Möwenweg', neu: true, ueberCode: 'Tante Matilde' },
    { id: 12, name: 'Zuhause Heidekamp', neu: false, ueberCode: null }
  ]
}
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text))

describe('„Neu zu Besuch“ (security-review V2, M-3)', () => {
  test('zeigt nur neue Gäste, mit der Notiz des Codes', async () => {
    api.visits.mockResolvedValue(lists)
    await render(<NewGuestsNotice />)
    const items = [...container.querySelectorAll('.new-guest')]
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('Neu zu Besuch: Zuhause Möwenweg')
    expect(items[0].textContent).toContain('über deinen Code „Tante Matilde“')
  })

  test('„Passt“ quittiert und übernimmt das neue „me“', async () => {
    api.visits.mockResolvedValue(lists)
    const me = { id: 1, neueGaeste: 0 }
    api.acknowledgeGuest.mockResolvedValue(me)
    const onFamilyChange = vi.fn()
    await render(<NewGuestsNotice onFamilyChange={onFamilyChange} />)
    await act(async () => button('Passt').click())
    expect(api.acknowledgeGuest).toHaveBeenCalledWith(9)
    expect(onFamilyChange).toHaveBeenCalledWith(me)
    expect(container.querySelector('.new-guests')).toBeNull()
  })

  test('„Gast entfernen“ ist zweistufig und zählt den Hinweis herunter', async () => {
    api.visits.mockResolvedValue(lists)
    api.removeGuest.mockResolvedValue(null)
    const onFamilyChange = vi.fn()
    await render(<NewGuestsNotice onFamilyChange={onFamilyChange} />)
    act(() => button('Gast entfernen').click())
    await act(async () => button('Wirklich entfernen?').click())
    expect(api.removeGuest).toHaveBeenCalledWith(9)
    const update = onFamilyChange.mock.calls[0][0]
    expect(update({ id: 1, neueGaeste: 1 })).toEqual({ id: 1, neueGaeste: 0 })
  })

  test('Demo: Knöpfe gesperrt', async () => {
    api.visits.mockResolvedValue(lists)
    await render(<NewGuestsNotice />, { isDemo: true })
    expect(button('Passt').disabled).toBe(true)
    expect(button('Gast entfernen').disabled).toBe(true)
  })
})

describe('Gast-Kommentare (security-review V2, L-4)', () => {
  test('neben dem frei eingetippten Namen steht das Zuhause des Gasts', async () => {
    const items = [
      { id: 1, autor_name: 'Familie Nissen', text: 'Von uns', created_at: '2026-09-01T10:00:00Z' },
      { id: 2, autor_name: 'Familie Nissen', text: 'Ich auch', created_at: '2026-09-01T11:00:00Z', gastZuhause: 'Zuhause Möwenweg' }
    ]
    await render(<CommentThread items={items} onAdd={() => {}} onDelete={() => {}} />)
    const metas = [...container.querySelectorAll('.reply-meta')].map((meta) => meta.textContent)
    expect(metas[0]).not.toContain('(Gast)')
    expect(metas[1]).toContain('Familie Nissen · Zuhause Möwenweg (Gast)')
  })
})
