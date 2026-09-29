// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, adminMe, viewFamily, overview, partners, profile, previewDiscover, previewPortal, listUsers } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  adminMe: vi.fn(),
  viewFamily: vi.fn(),
  overview: vi.fn(),
  partners: vi.fn(),
  profile: vi.fn(),
  previewDiscover: vi.fn(() => Promise.resolve({})),
  previewPortal: vi.fn(() => Promise.resolve({})),
  listUsers: vi.fn()
}))
vi.mock('./api', () => ({
  api: {
    me,
    logout,
    listUsers,
    admin: { me: adminMe, viewFamily, overview, partners },
    partnerArea: { profile, previewDiscover, previewPortal }
  },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// Ein Partner-Bereich, den der Admin geöffnet hat: Antwort von POST /api/admin/view/:id bzw. /api/me.
const adminViewArea = {
  id: 30,
  name: 'Hundeschule Wiesengrund',
  theme: 'standard',
  art: 'partner',
  isDemo: false,
  adminView: true,
  role: 'leitung',
  home: { id: 30, name: 'Hundeschule Wiesengrund', theme: 'standard', art: 'partner' },
  memberships: [],
  auth: { kind: 'key' },
  partner: { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'entwurf', gesperrt: false, unread: 0 }
}

const profileOf = (family) => ({
  id: family.partner.id,
  slug: family.partner.slug,
  name: family.partner.name,
  typ: family.partner.typ,
  status: family.partner.status,
  gesperrt: false,
  plz: '10115',
  ort: 'Berlin',
  portalTitel: null,
  portalText: 'Kleine Gruppen, viel Geduld und jede Menge Spaß auf der Wiese.',
  farbe: null,
  logoUrl: null,
  website: null,
  spendenUrl: null,
  vermittlungUrl: null,
  kontaktEmail: null,
  kontaktTelefon: null,
  kontaktFormularUrl: null,
  kontaktformularAktiv: true,
  vollstaendig: { ok: true, fehlt: [], empfohlen: [] }
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  window.history.replaceState(null, '', '/')
  for (const mock of [me, logout, adminMe, viewFamily, overview, partners, profile, listUsers]) mock.mockReset()
  window.localStorage.clear()
})

async function render(initialEntry) {
  profile.mockResolvedValue(profileOf(adminViewArea))
  listUsers.mockResolvedValue([])
  overview.mockReturnValue(new Promise(() => {}))
  partners.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    )
  )
  // Startseite und Profil kommen per React.lazy - auf die Chunks warten.
  await act(() => vi.dynamicImportSettled())
  await act(() => vi.dynamicImportSettled())
  return container
}

const banner = () => container.querySelector('.admin-view-banner')
const buttonNamed = (label) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)

describe('Admin-Ansicht (Phase 5 Task 5b) – Einstieg über /admin-ansicht/:id', () => {
  test('ruft api.admin.viewFamily, übernimmt die Sitzung und landet auf der Startroute des Bereichs mit Band', async () => {
    me.mockRejectedValue(new Error('Fehler 401'))
    viewFamily.mockResolvedValue(adminViewArea)
    await render('/admin-ansicht/30')

    expect(viewFamily).toHaveBeenCalledWith('30')
    // Startroute eines Partner-Bereichs ist /profil (lib/areas.js) - das Profil lädt.
    expect(profile).toHaveBeenCalled()
    expect(container.querySelector('h1').textContent).toBe('Hundeschule Wiesengrund')
    expect(banner()).not.toBeNull()
    expect(banner().textContent).toContain('Admin-Ansicht – nur lesen · Hundeschule Wiesengrund (Partner-Bereich)')
    expect(container.querySelector('.admin-view-banner a').getAttribute('href')).toBe('/admin')
  })

  test('ohne Admin-Sitzung (401) bleibt die Einstiegsseite mit Hinweis und Link zum Admin', async () => {
    me.mockRejectedValue(new Error('Fehler 401'))
    viewFamily.mockRejectedValue(Object.assign(new Error('Nur für Admins'), { status: 401 }))
    await render('/admin-ansicht/30')

    expect(container.textContent).toContain('Bitte zuerst als Admin anmelden.')
    expect(container.querySelector('a[href="/admin"]')).not.toBeNull()
    expect(banner()).toBeNull()
  })
})

describe('Admin-Ansicht – laufende Nur-Lesen-Sitzung (me.adminView)', () => {
  test('zeigt das Band statt des Demo-Bands und sperrt Schreib-Knöpfe mit dem Admin-Hinweis', async () => {
    me.mockResolvedValue(adminViewArea)
    await render('/profil')

    expect(banner()).not.toBeNull()
    expect(container.querySelector('.demo-banner:not(.admin-view-banner)')).toBeNull()
    expect(buttonNamed('Speichern').disabled).toBe(true)
    expect(buttonNamed('Veröffentlichen').disabled).toBe(true)
    expect(container.textContent).toContain('In der Admin-Ansicht nicht möglich.')
    expect(container.textContent).not.toContain('In der Demo nicht möglich.')
  })

  test('eine Demo-Familie in der Admin-Ansicht bekommt das Admin-Band, nicht das Demo-Band', async () => {
    me.mockResolvedValue({ ...adminViewArea, isDemo: true })
    await render('/profil')

    expect(banner()).not.toBeNull()
    expect(container.textContent).not.toContain('schreibgeschützte Demo')
  })

  test('"Beenden" meldet die Sitzung ab und wechselt zum Admin', async () => {
    me.mockResolvedValue(adminViewArea)
    logout.mockResolvedValue(null)
    adminMe.mockReturnValue(new Promise(() => {}))
    await render('/profil')

    await act(async () => buttonNamed('Beenden').click())
    await act(() => vi.dynamicImportSettled())

    expect(logout).toHaveBeenCalledTimes(1)
    expect(banner()).toBeNull()
    // Der Admin-Zweig von App.jsx prüft die Admin-Sitzung (api.admin.me) - wir sind auf /admin.
    expect(adminMe).toHaveBeenCalled()
  })
})
