// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { profile, updateProfile, uploadLogo, publish, einblicke, posts, vouchers, config } = vi.hoisted(() => ({
  profile: vi.fn(),
  updateProfile: vi.fn(),
  uploadLogo: vi.fn(),
  publish: vi.fn(),
  einblicke: vi.fn(),
  posts: vi.fn(),
  vouchers: vi.fn(),
  config: vi.fn()
}))
vi.mock('../api', () => ({ api: { config, partnerArea: { profile, updateProfile, uploadLogo, publish, einblicke, posts, vouchers } } }))

import PartnerProfilePage from './PartnerProfilePage.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const partnerFamily = {
  id: 30,
  name: 'Hundeschule Wiesengrund',
  art: 'partner',
  partner: { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'entwurf', gesperrt: false }
}

const shelterFamily = {
  id: 5,
  name: 'Tierheim Sonnenhang',
  art: 'tierheim',
  partner: { id: 1, slug: 'tierheim-sonnenhang', name: 'Tierheim Sonnenhang', typ: 'tierheim', status: 'aktiv', gesperrt: false }
}

const baseProfile = {
  id: 4,
  slug: 'hundeschule-wiesengrund',
  name: 'Hundeschule Wiesengrund',
  typ: 'hundeschule',
  status: 'entwurf',
  gesperrt: false,
  plz: null,
  ort: null,
  portalTitel: null,
  portalText: 'Kurz.',
  farbe: null,
  logoUrl: null,
  website: null,
  spendenUrl: null,
  vermittlungUrl: null,
  kontaktEmail: null,
  kontaktTelefon: null,
  kontaktFormularUrl: null,
  kontaktformularAktiv: true,
  vollstaendig: { ok: false, fehlt: ['Postleitzahl', 'Portal-Text (mind. 40 Zeichen)'], empfohlen: ['Logo'] }
}

const completeProfile = {
  ...baseProfile,
  plz: '10115',
  ort: 'Berlin',
  portalText: 'Kleine Gruppen, viel Geduld und jede Menge Spaß auf der Wiese.',
  vollstaendig: { ok: true, fehlt: [], empfohlen: [] }
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function apiError(message, status, details = {}) {
  return Object.assign(new Error(message), { status, details: { error: message, ...details } })
}

// adminView: die Nur-Lesen-Sitzung des Admins (Phase 5 Task 5b) - derselbe Provider wie die Demo, mit me-Objekt.
async function render({ data = baseProfile, family = partnerFamily, isDemo = false, adminView = false } = {}) {
  profile.mockResolvedValue(data)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={adminView ? { isDemo, adminView } : isDemo}>
          <PartnerProfilePage family={family} />
        </DemoProvider>
      </MemoryRouter>
    )
  )
  return container
}

function button(label) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  for (const mock of [profile, updateProfile, uploadLogo, publish, einblicke, posts, vouchers, config]) mock.mockReset()
})

describe('PartnerProfilePage – Statuskarte', () => {
  test('lädt das Profil und zeigt Status und Checkliste (fehlt / empfohlen)', async () => {
    await render()

    expect(profile).toHaveBeenCalledTimes(1)
    expect(container.querySelector('h1').textContent).toBe('Hundeschule Wiesengrund')
    expect(container.querySelector('.partner-status-badge').textContent).toBe('Entwurf')
    const missing = [...container.querySelectorAll('.partner-checklist li.is-missing')].map((li) => li.textContent)
    expect(missing).toEqual(['Postleitzahlfehlt', 'Portal-Text (mind. 40 Zeichen)fehlt'])
    const recommended = [...container.querySelectorAll('.partner-checklist li.is-recommended')].map((li) => li.textContent)
    expect(recommended).toEqual(['Logo'])
  })

  test('"Veröffentlichen" ist gesperrt, solange Pflichtangaben fehlen - mit Grund', async () => {
    await render()

    const publishButton = button('Veröffentlichen')
    expect(publishButton.disabled).toBe(true)
    const reason = document.getElementById(publishButton.getAttribute('aria-describedby'))
    expect(reason.textContent).toBe('Zum Veröffentlichen fehlt noch: Postleitzahl, Portal-Text (mind. 40 Zeichen).')
  })

  test('vollständig: "Veröffentlichen" ruft publish(true), danach "Aktiv (öffentlich)" und der Link zum Portal', async () => {
    publish.mockResolvedValue({ ...completeProfile, status: 'aktiv' })
    await render({ data: completeProfile })

    expect(container.querySelector('.partner-status-portal')).toBeNull()
    await act(async () => button('Veröffentlichen').click())

    expect(publish).toHaveBeenCalledWith(true)
    expect(container.querySelector('.partner-status-badge').textContent).toBe('Aktiv (öffentlich)')
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Euer Portal ansehen')
    expect(link.getAttribute('href')).toBe('/p/hundeschule-wiesengrund')
    expect(container.querySelector('.partner-status-portal').textContent).toContain('/p/hundeschule-wiesengrund')
    expect(button('Pausieren')).toBeDefined()
  })

  test('aktiv: "Pausieren" ruft publish(false)', async () => {
    publish.mockResolvedValue({ ...completeProfile, status: 'pausiert' })
    await render({ data: { ...completeProfile, status: 'aktiv' } })

    expect(button('Veröffentlichen')).toBeUndefined()
    await act(async () => button('Pausieren').click())

    expect(publish).toHaveBeenCalledWith(false)
    expect(container.querySelector('.partner-status-badge').textContent).toBe('Pausiert')
    expect(container.querySelector('.partner-status-portal')).toBeNull()
  })

  test('eine Ablehnung des Servers steht in der Karte', async () => {
    publish.mockRejectedValue(apiError('Bitte ergänzt noch: Postleitzahl.', 400, { fehlt: ['Postleitzahl'] }))
    await render({ data: completeProfile })

    await act(async () => button('Veröffentlichen').click())

    expect(container.querySelector('.partner-status-card [role="alert"]').textContent).toBe('Bitte ergänzt noch: Postleitzahl.')
  })

  test('gesperrt: nur der Hinweis, kein Veröffentlichen/Pausieren', async () => {
    await render({ data: { ...completeProfile, status: 'pausiert', gesperrt: true } })

    expect(container.querySelector('.partner-status-badge').textContent).toBe('Gesperrt')
    expect(container.querySelector('.partner-status-locked').textContent).toBe(
      'Euer Profil ist gesperrt – bitte meldet euch beim Betreiber.'
    )
    expect(button('Veröffentlichen')).toBeUndefined()
    expect(button('Pausieren')).toBeUndefined()
  })
})

describe('PartnerProfilePage – Angaben', () => {
  test('der Typ ist nur zu lesen', async () => {
    await render()

    expect(container.querySelector('.partner-profile-typ').textContent).toBe('Typ: Hundeschule – ändern kann ihn nur der Betreiber')
    expect(container.querySelector('select')).toBeNull()
    expect(container.querySelector('#profile-typ')).toBeNull()
  })

  test('Fieldsets Auftritt, Links, Kontakt, Standort - Spenden/Vermittlung nur für Tierheime', async () => {
    await render()

    expect([...container.querySelectorAll('legend')].map((legend) => legend.textContent)).toEqual(['Auftritt', 'Links', 'Kontakt', 'Standort'])
    expect(container.querySelector('#profile-name').getAttribute('maxlength')).toBe('120')
    expect(container.querySelector('#profile-portalTitel').getAttribute('maxlength')).toBe('120')
    expect(container.querySelector('#profile-website')).not.toBeNull()
    expect(container.querySelector('#profile-spendenUrl')).toBeNull()
    expect(container.querySelector('#profile-vermittlungUrl')).toBeNull()
    expect(container.textContent).toContain('Link zu eurem eigenen Kontaktformular')
    expect(container.textContent).toContain('Nachrichten landen in eurem Postfach unter ‚Nachrichten‘.')
    expect(container.textContent).not.toContain('kommt bald')
    expect(container.textContent).toContain('Formular ‚Schreib uns‘ anbieten')
  })

  test('ein Tierheim bekommt Spenden- und Vermittlungs-Link und den Link zu "Zugang"', async () => {
    await render({ data: { ...completeProfile, typ: 'tierheim', slug: 'tierheim-sonnenhang' }, family: shelterFamily })

    expect(container.querySelector('#profile-spendenUrl')).not.toBeNull()
    expect(container.querySelector('#profile-vermittlungUrl')).not.toBeNull()
    const accessLink = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zugang'))
    expect(accessLink.getAttribute('href')).toBe('/zugang')
  })

  test('ein Partner mit "Zugang" in der Leiste bekommt keinen zweiten Link dorthin', async () => {
    await render()
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/zugang')).toBe(false)
  })

  test('Speichern schickt nur die geänderten Felder', async () => {
    updateProfile.mockResolvedValue({ ...baseProfile, portalTitel: 'Willkommen auf der Wiese', kontaktformularAktiv: false })
    await render()

    expect(button('Speichern').disabled).toBe(true)
    await act(async () => setInputValue(container.querySelector('#profile-portalTitel'), 'Willkommen auf der Wiese'))
    await act(async () => container.querySelector('.partner-profile-form input[type="checkbox"]').click())
    expect(button('Speichern').disabled).toBe(false)
    await act(async () => container.querySelector('.partner-profile-form').requestSubmit())

    expect(updateProfile).toHaveBeenCalledTimes(1)
    expect(updateProfile).toHaveBeenCalledWith({ portalTitel: 'Willkommen auf der Wiese', kontaktformularAktiv: false })
    expect(button('Speichern').disabled).toBe(true)
  })

  test('der Portal-Text zählt mit und nennt die 40 Zeichen fürs Veröffentlichen', async () => {
    await render()

    expect(document.getElementById('profile-portalText-hint').textContent).toBe('5 / 2000 Zeichen · mindestens 40 zum Veröffentlichen')
  })

  test('ein Feldfehler vom Server steht am Feld und bekommt den Fokus', async () => {
    updateProfile.mockRejectedValue(apiError('Die E-Mail-Adresse ist ungültig', 400))
    await render()

    const email = container.querySelector('#profile-kontaktEmail')
    await act(async () => setInputValue(email, 'kein-at-zeichen'))
    await act(async () => container.querySelector('.partner-profile-form').requestSubmit())

    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById('profile-kontaktEmail-error').textContent).toBe('Die E-Mail-Adresse ist ungültig')
    expect(document.activeElement).toBe(email)
  })

  test('400 mit fehlt (aktives Profil) steht im Banner, das den Fokus bekommt', async () => {
    const message = 'Solange euer Profil öffentlich ist, braucht es: Postleitzahl – oder pausiert es zuerst.'
    updateProfile.mockRejectedValue(apiError(message, 400, { fehlt: ['Postleitzahl'] }))
    await render({ data: { ...completeProfile, status: 'aktiv' } })

    await act(async () => setInputValue(container.querySelector('#profile-plz'), ''))
    await act(async () => container.querySelector('.partner-profile-form').requestSubmit())

    expect(updateProfile).toHaveBeenCalledWith({ plz: null })
    const banner = container.querySelector('.partner-profile-form .error-banner')
    expect(banner.textContent).toBe(message)
    expect(document.activeElement).toBe(banner)
    expect(container.querySelector('#profile-plz').hasAttribute('aria-invalid')).toBe(false)
  })

  test('die Postleitzahl nimmt nur Ziffern, höchstens fünf', async () => {
    await render()

    const plz = container.querySelector('#profile-plz')
    await act(async () => setInputValue(plz, '10a1159'))
    expect(plz.value).toBe('10115')
  })

  test('der Hinweis auf Kunden-Gutscheine steht unten', async () => {
    await render()
    expect(container.querySelector('.partner-profile-notes').textContent).toContain(
      'Privat eine eigene Chronik führen? Dafür gibt es Kunden-Gutscheine.'
    )
  })
})

describe('PartnerProfilePage – Reiter', () => {
  test('"Angaben" ist vorgewählt, "Einblicke" lädt die Einblicke erst beim Öffnen', async () => {
    einblicke.mockResolvedValue([])
    await render()

    expect(button('Angaben').getAttribute('aria-pressed')).toBe('true')
    expect(button('Einblicke').getAttribute('aria-pressed')).toBe('false')
    expect(einblicke).not.toHaveBeenCalled()

    await act(async () => button('Einblicke').click())

    expect(einblicke).toHaveBeenCalledTimes(1)
    expect(button('Einblicke').getAttribute('aria-pressed')).toBe('true')
    expect(document.getElementById('partner-profile-panel-angaben').hidden).toBe(true)
    expect(document.getElementById('partner-profile-panel-einblicke').hidden).toBe(false)
    expect(container.querySelector('#einblicke-title').textContent).toBe('Einblicke')
  })

  test('ungespeicherte Eingaben überstehen den Reiterwechsel', async () => {
    einblicke.mockResolvedValue([])
    await render()

    await act(async () => setInputValue(container.querySelector('#profile-portalTitel'), 'Noch nicht gespeichert'))
    await act(async () => button('Einblicke').click())
    await act(async () => button('Angaben').click())

    expect(container.querySelector('#profile-portalTitel').value).toBe('Noch nicht gespeichert')
  })
})

describe('PartnerProfilePage – Demo', () => {
  test('alles sichtbar, Schreib-Knöpfe gesperrt mit "In der Demo nicht möglich."', async () => {
    await render({ data: completeProfile, isDemo: true })

    expect(container.querySelector('#profile-name').value).toBe('Hundeschule Wiesengrund')
    expect(button('Veröffentlichen').disabled).toBe(true)
    expect(button('Speichern').disabled).toBe(true)
    expect(container.querySelector('.partner-logo-field input[type="file"]').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')

    await act(async () => setInputValue(container.querySelector('#profile-portalTitel'), 'Demo-Titel'))
    expect(button('Speichern').disabled).toBe(true)
    await act(async () => container.querySelector('.partner-profile-form').requestSubmit())
    expect(updateProfile).not.toHaveBeenCalled()
  })

  test('auch "Pausieren" ist in der Demo gesperrt', async () => {
    await render({ data: { ...completeProfile, status: 'aktiv' }, isDemo: true })
    expect(button('Pausieren').disabled).toBe(true)
  })
})

describe('PartnerProfilePage – Admin-Ansicht (Phase 5 Task 5b)', () => {
  test('dieselben Sperren wie in der Demo, aber mit "In der Admin-Ansicht nicht möglich."', async () => {
    await render({ data: completeProfile, adminView: true })

    expect(container.querySelector('#profile-name').value).toBe('Hundeschule Wiesengrund')
    expect(button('Veröffentlichen').disabled).toBe(true)
    expect(button('Speichern').disabled).toBe(true)
    expect(container.querySelector('.partner-logo-field input[type="file"]').disabled).toBe(true)
    expect(container.textContent).toContain('In der Admin-Ansicht nicht möglich.')
    expect(container.textContent).not.toContain('In der Demo nicht möglich.')

    await act(async () => setInputValue(container.querySelector('#profile-portalTitel'), 'Neuer Titel'))
    expect(button('Speichern').disabled).toBe(true)
    await act(async () => container.querySelector('.partner-profile-form').requestSubmit())
    expect(updateProfile).not.toHaveBeenCalled()
  })
})

// Phase P2: Tierheime haben "Beiträge" nicht in der Navigation (dort stünden sonst sechs Einträge), sondern
// als dritten Reiter im Profil.
describe('PartnerProfilePage – Reiter "Beiträge" (Tierheim)', () => {
  test('ein Tierheim bekommt den Reiter; die Beiträge laden erst beim Öffnen, mit den Bereichen des Typs', async () => {
    posts.mockResolvedValue([])
    await render({ data: { ...completeProfile, typ: 'tierheim', slug: 'tierheim-sonnenhang' }, family: shelterFamily })

    const tabs = [...container.querySelectorAll('.partner-profile-tabs button')].map((btn) => btn.textContent)
    expect(tabs).toEqual(['Angaben', 'Einblicke', 'Beiträge', 'Teilen'])
    expect(posts).not.toHaveBeenCalled()

    await act(async () => button('Beiträge').click())
    expect(posts).toHaveBeenCalledTimes(1)
    expect(document.getElementById('partner-profile-panel-beitraege').hidden).toBe(false)
    expect(container.querySelector('#partner-posts-title').textContent).toBe('Eure Beiträge')

    await act(async () => button('Beitrag anlegen').click())
    expect([...container.querySelector('#post-bereich').options].map((option) => option.value)).toEqual(['', 'begleiter', 'unterstuetzen'])
  })

  test('ein Partner-Bereich hat "Beiträge" in der Navigation - im Profil Angaben, Einblicke und Teilen', async () => {
    await render()
    const tabs = [...container.querySelectorAll('.partner-profile-tabs button')].map((btn) => btn.textContent)
    expect(tabs).toEqual(['Angaben', 'Einblicke', 'Teilen'])
    expect(document.getElementById('partner-profile-panel-beitraege')).toBeNull()
  })
})

// Phase 5 Task 4: die Kunden-Gutschein-Stapel des Partners, mit Weg zur Druckseite - seit Phase U im Reiter
// "Teilen" unter dem Portal-Link (höchstens vier Reiter).
describe('PartnerProfilePage – Kunden-Gutscheine im Reiter "Teilen"', () => {
  test('lädt die Stapel erst beim Öffnen und verlinkt "Karten drucken" auf /partner-drucken/:id', async () => {
    config.mockResolvedValue({ publicUrl: null })
    vouchers.mockResolvedValue({
      stapel: [{ id: 12, label: 'Weitergabe Hundeschule Wiesengrund', quelle: 'weitergabe', size: 5, offen: 4, eingeloest: 1, widerrufen: 0, erstelltAm: '2026-09-20 10:00:00' }]
    })
    await render()
    expect(vouchers).not.toHaveBeenCalled()

    await act(async () => button('Teilen').click())

    expect(vouchers).toHaveBeenCalledTimes(1)
    expect(button('Teilen').getAttribute('aria-pressed')).toBe('true')
    expect(document.getElementById('partner-profile-panel-teilen').hidden).toBe(false)
    expect(container.querySelector('#partner-vouchers-title').textContent).toBe('Kunden-Gutscheine')
    expect(container.textContent).toContain('Jede Karte legt für eure Kundschaft eine eigene Chronik an')
    const print = container.querySelector('a.partner-stack-print')
    expect(print.getAttribute('href')).toBe('/partner-drucken/12')
    expect(container.querySelector('.partner-stack-quelle').textContent).toBe('weitergegeben')
  })

  test('auch ein Tierheim und die Demo sehen den Reiter', async () => {
    config.mockResolvedValue({ publicUrl: null })
    vouchers.mockResolvedValue({ stapel: [] })
    await render({ data: { ...completeProfile, typ: 'tierheim', slug: 'tierheim-sonnenhang' }, family: shelterFamily, isDemo: true })

    await act(async () => button('Teilen').click())
    expect(vouchers).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.empty-state').textContent).toContain('Noch keine Kunden-Gutscheine')
  })
})
