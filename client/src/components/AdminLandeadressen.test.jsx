// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { landeadressen, createLandeadresse, updateLandeadresse } = vi.hoisted(() => ({
  landeadressen: vi.fn(),
  createLandeadresse: vi.fn(),
  updateLandeadresse: vi.fn()
}))
vi.mock('../api', () => ({ api: { admin: { landeadressen, createLandeadresse, updateLandeadresse } } }))

import AdminLandeadressen from './AdminLandeadressen.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// Antwort von GET /api/admin/landeadressen (server/lib/landeadressen.js).
const FB = { id: 1, slug: 'fb', ziel: '/', serie: 'FB', aktiv: true, besuche30: 12, besucheGesamt: 40, einloesungen: { tage30: 3, gesamt: 9 } }
const HERBST = { id: 2, slug: 'anzeige-herbst', ziel: '/partner-werden', serie: null, aktiv: false, besuche30: 0, besucheGesamt: 5, einloesungen: null }

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  vi.clearAllMocks()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminLandeadressen />))
}

function setInput(id, value) {
  const input = container.querySelector(`#${id}`)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const rowTexts = () => [...container.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))

describe('AdminLandeadressen – Landeadressen je Kanal', () => {
  test('zeigt Adressen mit Besuchen und eingelösten Codes der Serie', async () => {
    landeadressen.mockResolvedValue({ landeadressen: [FB, HERBST] })
    await render()
    const rows = rowTexts()
    expect(rows[0].slice(0, 5)).toEqual(['/fb', '/', '12', '40', 'FB: 3 in 30 Tagen, 9 gesamt'])
    expect(rows[0][5]).toContain('aktiv')
    expect(rows[1].slice(0, 5)).toEqual(['/anzeige-herbst', '/partner-werden', '0', '5', '–'])
    expect(rows[1][5]).toContain('Einschalten')
  })

  test('legt eine Adresse an und lädt neu', async () => {
    landeadressen.mockResolvedValueOnce({ landeadressen: [] }).mockResolvedValue({ landeadressen: [FB] })
    createLandeadresse.mockResolvedValue(FB)
    await render()
    expect(container.textContent).toContain('Noch keine Landeadressen')
    await act(async () => {
      setInput('landeadresse-slug', ' fb ')
      setInput('landeadresse-serie', 'FB')
    })
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(createLandeadresse).toHaveBeenCalledWith({ slug: 'fb', ziel: '/', serie: 'FB' })
    expect(landeadressen).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="status"]').textContent).toBe('/fb angelegt')
    expect(container.querySelector('#landeadresse-slug').value).toBe('')
  })

  test('zeigt den Fehler des Servers am Feld', async () => {
    landeadressen.mockResolvedValue({ landeadressen: [] })
    createLandeadresse.mockRejectedValue(Object.assign(new Error('Diesen Kurznamen nutzt die App schon selbst.'), { details: { feld: 'slug' } }))
    await render()
    await act(async () => setInput('landeadresse-slug', 'admin'))
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.querySelector('#landeadresse-slug-error').textContent).toBe('Diesen Kurznamen nutzt die App schon selbst.')
    expect(container.querySelector('#landeadresse-slug').getAttribute('aria-invalid')).toBe('true')
  })

  test('schaltet eine Adresse aus', async () => {
    landeadressen.mockResolvedValue({ landeadressen: [FB] })
    updateLandeadresse.mockResolvedValue({ ...FB, aktiv: false })
    await render()
    const button = [...container.querySelectorAll('tbody button')].find((b) => b.textContent === 'Ausschalten')
    await act(async () => button.click())
    expect(updateLandeadresse).toHaveBeenCalledWith(1, { aktiv: false })
    expect(container.querySelector('[role="status"]').textContent).toBe('/fb ausgeschaltet')
  })
})
