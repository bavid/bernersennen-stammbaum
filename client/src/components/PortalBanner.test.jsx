// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api', () => ({ api: { contactPartner: vi.fn() } }))

import PortalHero from './PortalHero.jsx'
import PortalContact from './PortalContact.jsx'
import ContactPartnerForm from './ContactPartnerForm.jsx'
import { PreviewProvider } from '../lib/preview.js'

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
})

async function render(element, { preview = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PreviewProvider value={preview}>{element}</PreviewProvider>
      </MemoryRouter>
    )
  )
  return container
}

const partner = {
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  typ: 'hundeschule',
  ort: 'Hamburg',
  logoUrl: '/partner-media/logo.png',
  kontaktformular: true,
  ansprechperson: 'Anna Berg',
  banner: []
}

describe('PortalHero mit Bannerfotos', () => {
  test('ohne Bannerfotos: der bisherige Kopf ohne Banner', async () => {
    await render(<PortalHero partner={partner} contactId={null} />)
    expect(container.querySelector('.partner-portal-hero').classList.contains('has-banner')).toBe(false)
    expect(container.querySelector('.portal-banner')).toBeNull()
  })

  test('ein Foto: breites Banner mit festen Maßen, Alternativtext, Logo darunter', async () => {
    const banner = [{ fotoUrl: '/public-media/kopf.jpg', alt: 'Welpen auf der Wiese' }]
    await render(<PortalHero partner={{ ...partner, banner }} contactId={null} />)
    const hero = container.querySelector('.partner-portal-hero')
    expect(hero.classList.contains('has-banner')).toBe(true)
    const box = hero.querySelector('.portal-banner')
    expect(box.classList.contains('portal-banner-single')).toBe(true)
    expect(box.getAttribute('role')).toBeNull()
    const img = box.querySelector('img')
    expect(img.getAttribute('src')).toBe('/public-media/kopf.jpg')
    expect(img.getAttribute('alt')).toBe('Welpen auf der Wiese')
    expect(img.getAttribute('width')).toBe('1600')
    expect(img.getAttribute('height')).toBe('900')
    expect(hero.firstElementChild).toBe(box)
    expect(box.nextElementSibling.classList.contains('partner-logo')).toBe(true)
  })

  test('zwei Fotos: nebeneinander, als benannte, per Tastatur erreichbare Gruppe; ohne Alternativtext Schmuckbild', async () => {
    const banner = [
      { fotoUrl: '/public-media/a.jpg', alt: 'Training' },
      { fotoUrl: '/public-media/b.jpg', alt: null }
    ]
    await render(<PortalHero partner={{ ...partner, banner }} contactId={null} />)
    const box = container.querySelector('.portal-banner')
    expect(box.classList.contains('portal-banner-double')).toBe(true)
    expect(box.getAttribute('role')).toBe('group')
    expect(box.getAttribute('aria-label')).toBe('Bannerfotos')
    expect(box.getAttribute('tabindex')).toBe('0')
    const imgs = [...box.querySelectorAll('img')]
    expect(imgs.map((img) => img.getAttribute('alt'))).toEqual(['Training', ''])
    expect(imgs[0].getAttribute('fetchpriority')).toBe('high')
    expect(imgs[1].getAttribute('loading')).toBeNull()
  })

  test('nur erlaubte Adressen - /uploads nur in der Kundensicht', async () => {
    const banner = [
      { fotoUrl: 'https://example.org/fremd.jpg', alt: 'fremd' },
      { fotoUrl: '/uploads/eigen.jpg', alt: 'eigen' }
    ]
    await render(<PortalHero partner={{ ...partner, banner }} contactId={null} />)
    expect(container.querySelector('.portal-banner')).toBeNull()
    expect(container.querySelector('.has-banner')).toBeNull()
    act(() => root.unmount())
    root = null
    container.remove()

    await render(<PortalHero partner={{ ...partner, banner }} contactId={null} />, { preview: true })
    expect([...container.querySelectorAll('.portal-banner img')].map((img) => img.getAttribute('src'))).toEqual(['/uploads/eigen.jpg'])
  })
})

describe('Ansprechperson', () => {
  test('im Kontakt-Abschnitt neutral als "Ansprechperson"', async () => {
    await render(<PortalContact partner={partner} />)
    const line = container.querySelector('.partner-portal-contact-person')
    expect(line.textContent).toBe('Ansprechperson: Anna Berg')
  })

  test('ohne Ansprechperson keine Zeile', async () => {
    await render(<PortalContact partner={{ ...partner, ansprechperson: null }} />)
    expect(container.querySelector('.partner-portal-contact-person')).toBeNull()
  })

  test('im Kontaktformular: an wen die Nachricht geht', async () => {
    await render(<ContactPartnerForm partner={partner} />)
    expect(container.querySelector('.contact-partner-intro').textContent).toBe('Deine Nachricht geht an Anna Berg von Hundeschule Pfotenglück.')
    act(() => root.unmount())
    root = null
    container.remove()
    await render(<ContactPartnerForm partner={{ ...partner, ansprechperson: '   ' }} />)
    expect(container.querySelector('.contact-partner-intro')).toBeNull()
  })
})
