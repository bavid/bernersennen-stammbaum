// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, listUsers, listDogs, recentActivity, checkVoucher, redeemVoucher, myVouchers } = vi.hoisted(() => ({
  me: vi.fn(),
  myVouchers: vi.fn(),
  logout: vi.fn(),
  listUsers: vi.fn(),
  listDogs: vi.fn(),
  recentActivity: vi.fn(),
  checkVoucher: vi.fn(),
  redeemVoucher: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, listUsers, listDogs, recentActivity, checkVoucher, redeemVoucher, myVouchers },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – der Weitergabe-Dialog läuft im Modal.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

// Partner-Bereich (Phase P): Hundeschule, Hundesalon, Betreuung, … - art 'partner', me.partner gesetzt.
const partnerArea = {
  id: 30,
  name: 'Hundeschule Wiesengrund',
  theme: 'standard',
  art: 'partner',
  isDemo: false,
  home: { id: 30, name: 'Hundeschule Wiesengrund', theme: 'standard', art: 'partner' },
  memberships: [],
  auth: { kind: 'key' },
  partner: { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'entwurf', gesperrt: false }
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select, value) {
  nativeSelectValueSetter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
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
  delete document.documentElement.dataset.theme
  document.title = ''
  window.history.replaceState(null, '', '/')
  for (const mock of [me, logout, listUsers, listDogs, recentActivity, checkVoucher, redeemVoucher, myVouchers]) mock.mockReset()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function render(initialEntry, family = partnerArea) {
  if (family) me.mockResolvedValue(family)
  else me.mockRejectedValue(new Error('401'))
  listUsers.mockResolvedValue([])
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
  return container
}

function navLinks() {
  return [...container.querySelectorAll('.app-nav a')]
}

describe('Partner-Bereich (family.art === "partner") – Navigation', () => {
  test('die Hauptnavigation zeigt nur Profil und Zugang', async () => {
    await render('/profil')

    expect(navLinks().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Profil', '/profil'],
      ['Zugang', '/zugang']
    ])
  })

  test('kein Bereichswechsler ("Familie beitreten/gründen"), nur der Name', async () => {
    await render('/profil')

    expect(container.querySelector('.context-switcher')).toBeNull()
    expect(container.querySelector('.brand-sub').textContent).toBe('Hundeschule Wiesengrund')
  })

  test('das Logo führt zur Start-Route /profil', async () => {
    await render('/zugang')
    expect(container.querySelector('.brand-name').getAttribute('href')).toBe('/profil')
  })
})

describe('Partner-Bereich – Seiten', () => {
  test('/profil zeigt den Platzhalter mit Partnername, Status "Entwurf" und dem Hinweis', async () => {
    await render('/profil')

    expect(container.querySelector('h1').textContent).toBe('Hundeschule Wiesengrund')
    expect(container.querySelector('.partner-status-chip').textContent).toBe('Entwurf')
    expect(container.textContent).toContain('Hier pflegt ihr bald euer Profil.')
  })

  test('ein gesperrter Partner trägt den Status "Gesperrt"', async () => {
    await render('/profil', { ...partnerArea, partner: { ...partnerArea.partner, status: 'pausiert', gesperrt: true } })
    expect(container.querySelector('.partner-status-chip').textContent).toBe('Gesperrt')
  })

  test('/zugang zeigt die Zugangs-Einstellungen (Schlüssel erneuern, Benutzer)', async () => {
    await render('/zugang')

    expect(container.querySelector('h1').textContent).toBe('Zugang')
    expect(container.querySelector('#access-confirm')).not.toBeNull()
    expect(listUsers).toHaveBeenCalled()
    const link = navLinks().find((a) => a.textContent === 'Zugang')
    expect(link.classList.contains('active')).toBe(true)
  })

  test('das Profil verlinkt nicht doppelt auf Zugang, wenn es schon in der Leiste steht', async () => {
    await render('/profil')
    expect([...container.querySelectorAll('main a')].some((a) => a.getAttribute('href') === '/zugang')).toBe(false)
  })

  test.each(['/irgendwas', '/stammbaum', '/pinnwand', '/wegbegleiter', '/entdecken', '/wuerfe', '/collage', '/tiere', '/tier/5'])(
    '%s leitet auf /profil um (keine Chronik- oder Rudel-Funktionen)',
    async (path) => {
      await render(path)

      expect(container.querySelector('h1').textContent).toBe('Hundeschule Wiesengrund')
      expect(listDogs).not.toHaveBeenCalled()
    }
  )
})

describe('Profil und Zugang gibt es nur für Partner-Bereiche', () => {
  const home = {
    id: 1,
    name: 'Zuhause am Deich',
    theme: 'standard',
    art: 'zuhause',
    isDemo: false,
    home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
    memberships: []
  }

  test('ein Zuhause lädt weiterhin mit "Jemanden einladen" ein', async () => {
    listDogs.mockResolvedValue([])
    await render('/wegbegleiter', home)

    expect(container.querySelector('.app-footer .footer-link').textContent).toBe('Jemanden einladen')
  })

  test.each(['/profil', '/zugang'])('ein Zuhause wird von %s auf seine Start-Route umgeleitet', async (path) => {
    listDogs.mockResolvedValue([])
    await render(path, home)

    expect(container.querySelector('h1').textContent).toBe('Wegbegleiter')
  })
})

describe('Partner-Zugang auf /v einlösen', () => {
  test('Formular → Schlüssel (KeyReveal) → "Weiter" landet im Partner-Profil', async () => {
    checkVoucher.mockResolvedValue({ status: 'offen', zweck: 'partnerzugang' })
    redeemVoucher.mockResolvedValue({ ...partnerArea, key: 'ABCD-1234-HJKM', fromOthers: true })
    await render('/v#abcd1234hjkm', null)

    expect(container.querySelector('.login-card-head .eyebrow').textContent).toBe('Partner-Profil einrichten')
    await act(async () => {
      setInputValue(container.querySelector('#partner-name'), 'Hundeschule Wiesengrund')
      setSelectValue(container.querySelector('#partner-typ'), 'hundeschule')
      setInputValue(container.querySelector('#partner-plz'), '10115')
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(container.querySelector('.key-reveal-value').textContent).toBe('ABCD-1234-HJKM')
    expect(container.textContent).toContain('Erneuert den Schlüssel später unter „Zugang“')
    const continueButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Weiter zum Partner-Bereich')
    await act(async () => continueButton.click())

    expect(container.querySelector('h1').textContent).toBe('Hundeschule Wiesengrund')
    expect(navLinks().map((a) => a.textContent)).toEqual(['Profil', 'Zugang'])
  })
})

describe('Partner-Bereich – Kunden-Gutscheine weitergeben', () => {
  test('der Fuß bietet "Kunden-Gutschein weitergeben" statt "Jemanden einladen"', async () => {
    await render('/profil')

    const footerButton = container.querySelector('.app-footer button.footer-link')
    expect(footerButton.textContent).toBe('Kunden-Gutschein weitergeben')
    expect(container.textContent).not.toContain('Jemanden einladen')
  })

  test('der Dialog heißt ebenso und erklärt die Weitergabe an die Kundschaft', async () => {
    myVouchers.mockResolvedValue([])
    await render('/profil')

    await act(async () => container.querySelector('.app-footer button.footer-link').click())

    const dialog = container.querySelector('dialog.modal')
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('#modal-title').textContent).toBe('Kunden-Gutschein weitergeben')
    expect(dialog.textContent).toContain('Gebt diesen Gutschein an eure Kundschaft weiter')
    expect(dialog.textContent).not.toContain('Mitglied')
  })
})

describe('Redeem-Seite – Kopfzeile', () => {
  test('ein Kunden-Gutschein behält "Neue Chronik"', async () => {
    checkVoucher.mockResolvedValue({ status: 'offen' })
    await render('/v#abcd1234hjkm', null)

    expect(container.querySelector('.login-card-head .eyebrow').textContent).toBe('Neue Chronik')
  })
})
