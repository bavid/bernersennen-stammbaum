// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ communityBanner: vi.fn(), saveCommunityBanner: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: mocks, community: vi.fn() } }))

import AdminCommunityBanner from './AdminCommunityBanner.jsx'
import { bannerPayload, bannerPreviewData, bannerForm } from '../lib/communityBannerAdmin.js'

// Admin-Karte „Band ‚Mit dabei‘“: Partner des Monats wählen, Zahlen schalten, eigener Eintrag mit internem Link, Vorschau.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const INFO = {
  banner: { partnerId: null, bis: null, chips: ['familien', 'zuhause', 'erinnerungen', 'fotos', 'spenden', 'partner'], text: null, link: null },
  partners: [
    { id: 4, slug: 'hundeschule-benno', name: 'Hundeschule Benno', typ: 'hundeschule', isDemo: false, fotos: ['/public-media/b1.jpg', '/public-media/b2.jpg'] },
    { id: 7, slug: 'salon-wilma', name: 'Salon Wilma', typ: 'hundesalon', isDemo: false, fotos: [] }
  ],
  vorschau: { zahlen: { familien: 12, zuhause: 3, erinnerungen: 40, fotos: 9, partner: 2, spendenCents: 0 }, vorgestellt: [] },
  chipKeys: ['familien', 'zuhause', 'erinnerungen', 'fotos', 'spenden', 'partner'],
  maxText: 80,
  demoPartnerErlaubt: false
}

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of Object.values(mocks)) mock.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AdminCommunityBanner />
      </MemoryRouter>
    )
  )
}

const $ = (selector) => container.querySelector(selector)

function setValue(element, value) {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

describe('AdminCommunityBanner', () => {
  test('Partner wählen, Zahl abschalten, eigener Eintrag: Vorschau folgt dem Formular, Speichern schickt den Stand', async () => {
    mocks.communityBanner.mockResolvedValue(INFO)
    mocks.saveCommunityBanner.mockImplementation(async (banner) => ({ banner }))
    await render()
    expect($('h2').textContent).toBe('Band „Mit dabei“')
    expect($('.admin-band-preview .community-hero')).toBeNull()

    await act(async () => setValue($('#admin-band-partner'), '4'))
    const hero = $('.admin-band-preview .community-hero')
    expect(hero.textContent).toContain('Partner des Monats')
    expect(hero.textContent).toContain('Hundeschule Benno')
    expect($('.admin-band-preview .community-hero-photo img').getAttribute('src')).toBe('/public-media/b1.jpg')

    const familien = [...container.querySelectorAll('.admin-band-chips input')][0]
    await act(async () => familien.click())
    await act(async () => setValue($('#admin-band-text'), 'Neu: Wir waren hier'))
    await act(async () => setValue($('#admin-band-link'), '/partner-werden'))
    expect($('.admin-band-preview').textContent).toContain('Neu: Wir waren hier')
    expect($('.admin-band-preview').textContent).not.toContain('Familien')

    await act(async () => $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mocks.saveCommunityBanner).toHaveBeenCalledWith({
      partnerId: 4,
      bis: null,
      chips: ['zuhause', 'erinnerungen', 'fotos', 'spenden', 'partner'],
      text: 'Neu: Wir waren hier',
      link: '/partner-werden'
    })
    expect($('[role="status"]').textContent).toBe('Gespeichert.')
  })

  test('fremder Link: Feldfehler, nichts gespeichert; Fehler des Servers als Banner', async () => {
    mocks.communityBanner.mockResolvedValue(INFO)
    mocks.saveCommunityBanner.mockRejectedValue(new Error('Der Link muss ein Pfad in der App sein'))
    await render()
    await act(async () => setValue($('#admin-band-text'), 'Hallo'))
    await act(async () => setValue($('#admin-band-link'), 'https://evil'))
    await act(async () => $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mocks.saveCommunityBanner).not.toHaveBeenCalled()
    expect($('#admin-band-link-error').textContent).toMatch(/Pfad/)

    await act(async () => setValue($('#admin-band-link'), '/finanzierung'))
    await act(async () => $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect($('.error-banner').textContent).toMatch(/Pfad/)
  })

  test('Laden scheitert: Fehlerbanner', async () => {
    mocks.communityBanner.mockRejectedValue(new Error('Nicht angemeldet'))
    await render()
    expect($('.error-banner').textContent).toBe('Nicht angemeldet')
  })
})

describe('lib/communityBannerAdmin', () => {
  test('Payload: Links nur intern, Text höchstens 80, Link braucht Text; „bis“ nur mit Partner', () => {
    const form = { ...bannerForm(INFO.banner), text: 'T' }
    for (const link of ['//x', 'https://evil', 'x', '/\\a']) expect(bannerPayload({ ...form, link }).errors.link).toBeTruthy()
    expect(bannerPayload({ ...form, text: 'x'.repeat(81) }).errors.text).toBeTruthy()
    expect(bannerPayload({ ...form, text: '', link: '/a' }).errors.text).toBeTruthy()
    expect(bannerPayload({ ...form, bis: '2026-12-31' }).payload.bis).toBeNull()
    expect(bannerPayload({ ...form, partnerId: '7', bis: '2026-12-31' }).payload).toMatchObject({ partnerId: 7, bis: '2026-12-31' })
  })

  test('Vorschau: abgelaufen oder Demo ohne Freigabe -> die vorgestellten Partner', () => {
    const vorgestellt = [{ slug: 'salon-lotte', name: 'Salon Lotte', fotos: [] }]
    const info = { ...INFO, vorschau: { ...INFO.vorschau, vorgestellt }, partners: [...INFO.partners, { id: 9, slug: 'demo-flocke', name: 'Flocke', isDemo: true, fotos: [] }] }
    const now = new Date(2026, 9, 10)
    const form = bannerForm(INFO.banner)
    expect(bannerPreviewData({ ...form, partnerId: '4', bis: '2026-10-09' }, info, now).partnerVorgestellt).toEqual(vorgestellt)
    expect(bannerPreviewData({ ...form, partnerId: '9' }, info, now).banner.partnerDesMonats).toBe(false)
    const data = bannerPreviewData({ ...form, partnerId: '4', bis: '2026-10-10' }, info, now)
    expect(data.partnerVorgestellt.map((p) => p.slug)).toEqual(['hundeschule-benno', 'salon-lotte'])
    expect(data.banner.partnerDesMonats).toBe(true)
  })
})
