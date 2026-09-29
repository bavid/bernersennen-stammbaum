// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import PartnerDemoGuide, { DEMO_GUIDE_SETTING, demoGuideLinks } from './PartnerDemoGuide.jsx'

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
  vi.restoreAllMocks()
  window.localStorage.clear()
})

async function render(family = { art: 'partner' }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PartnerDemoGuide family={family} />
      </MemoryRouter>
    )
  )
  return container
}

describe('PartnerDemoGuide', () => {
  test('Wege je Bereichsart: Partner -> Beiträge, Tierheim -> Tiere', () => {
    expect(demoGuideLinks({ art: 'partner' }).map((link) => link.to)).toEqual(['/profil', '/kundensicht', '/beitraege'])
    expect(demoGuideLinks({ art: 'tierheim' }).map((link) => link.to)).toEqual(['/profil', '/kundensicht', '/tiere'])
  })

  test('schließen speichert den Merker in localStorage', async () => {
    await render()
    await act(async () => container.querySelector('button[aria-label="Hinweis schließen"]').click())

    expect(container.querySelector('.demo-guide')).toBeNull()
    expect(window.localStorage.getItem(`chronik.${DEMO_GUIDE_SETTING}`)).toBe('true')
  })

  test('mit gespeichertem Merker bleibt er zu', async () => {
    window.localStorage.setItem(`chronik.${DEMO_GUIDE_SETTING}`, 'true')
    await render()
    expect(container.querySelector('.demo-guide')).toBeNull()
  })

  test('ohne nutzbaren Speicher (privates Fenster): erscheint trotzdem und lässt sich schließen', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    await render({ art: 'tierheim' })
    expect(container.querySelector('.demo-guide h2').textContent).toBe('Das ist die Demo eines Partner-Bereichs')

    await act(async () => container.querySelector('.demo-guide-close').click())
    expect(container.querySelector('.demo-guide')).toBeNull()
  })
})
