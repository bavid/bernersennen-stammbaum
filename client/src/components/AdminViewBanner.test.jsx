// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import AdminViewBanner from './AdminViewBanner.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
})

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter>{ui}</MemoryRouter>))
  return container
}

describe('AdminViewBanner – Band der Admin-Ansicht', () => {
  test('nennt Ansicht, Bereich und Art, verlinkt zum Admin und beendet auf Klick', async () => {
    const onEnd = vi.fn()
    await render(<AdminViewBanner family={{ id: 5, name: 'Tierheim Sonnenhang', art: 'tierheim' }} onEnd={onEnd} />)

    const banner = container.querySelector('.admin-view-banner')
    expect(banner).not.toBeNull()
    expect(banner.classList.contains('demo-banner')).toBe(true)
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.textContent).toContain('Admin-Ansicht – nur lesen · Tierheim Sonnenhang (Tierheim-Bereich)')

    const back = container.querySelector('a')
    expect(back.textContent).toBe('Zurück zum Admin')
    expect(back.getAttribute('href')).toBe('/admin')

    const end = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Beenden')
    await act(async () => end.click())
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  test('Zuhause und Familie bekommen ihre eigene Beschriftung, Unbekanntes keine', async () => {
    await render(<AdminViewBanner family={{ id: 1, name: 'Zuhause Birkenweg', art: 'zuhause' }} onEnd={() => {}} />)
    expect(container.textContent).toContain('Zuhause Birkenweg (Zuhause)')

    await act(async () => root.render(<MemoryRouter><AdminViewBanner family={{ id: 2, name: 'Familie Talblick', art: 'rudel' }} onEnd={() => {}} /></MemoryRouter>))
    expect(container.textContent).toContain('Familie Talblick (Familie)')

    await act(async () => root.render(<MemoryRouter><AdminViewBanner family={{ id: 3, name: 'Irgendwas', art: 'neu' }} onEnd={() => {}} /></MemoryRouter>))
    expect(container.textContent).toContain('Admin-Ansicht – nur lesen · Irgendwas')
    expect(container.textContent).not.toContain('(')
  })
})
