// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { familyMembers, setMemberRole, removeMember, handOverLeitung, revokeInvite, setVoucherRole, leaveFamily, myVouchers, dissolveFamily, renewFamilyKey, listDogs, voucherLimit } =
  vi.hoisted(() => ({
    // Phase V2b: der Einladen-Dialog fragt ab Stellvertretung die Obergrenze offener Codes ab
    voucherLimit: vi.fn(),
    familyMembers: vi.fn(),
    setMemberRole: vi.fn(),
    removeMember: vi.fn(),
    handOverLeitung: vi.fn(),
    revokeInvite: vi.fn(),
    setVoucherRole: vi.fn(),
    leaveFamily: vi.fn(),
    myVouchers: vi.fn(),
    dissolveFamily: vi.fn(),
    renewFamilyKey: vi.fn(),
    listDogs: vi.fn()
  }))
vi.mock('../api', () => ({
  api: { familyMembers, setMemberRole, removeMember, handOverLeitung, revokeInvite, setVoucherRole, leaveFamily, myVouchers, dissolveFamily, renewFamilyKey, listDogs, voucherLimit }
}))

import MembersPage from './MembersPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
const familyAs = (role) => ({
  id: 3,
  name: 'Familie Sonnenhang',
  theme: 'standard',
  art: 'rudel',
  isDemo: false,
  role,
  home,
  memberships: [{ id: 3, name: 'Familie Sonnenhang', theme: 'standard', rolle: role }],
  auth: { kind: 'key' }
})
const payloadAs = (role) => ({
  familyId: 3,
  name: 'Familie Sonnenhang',
  ichBin: role,
  mitglieder: [
    { familyId: 1, name: 'Zuhause am Deich', rolle: role, seit: '2026-01-05 10:00:00', geteilteTiere: 2 },
    { familyId: 7, name: 'Haus Birkenweg', rolle: 'mitglied', seit: '2026-02-01 09:00:00', geteilteTiere: 1 }
  ],
  einladungen: [{ id: 41, hinweis: 'HJKM', rolle: 'mitglied', erstelltAm: '2026-03-02 09:00:00', ablauf: '2026-12-31 23:59:59' }]
})

const buttons = () => [...container.querySelectorAll('button')]
const buttonWith = (text) => buttons().find((btn) => btn.textContent.includes(text))
const setInput = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const changeSelect = (select, value) =>
  act(() => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })

async function renderPage(family, { onFamilyChange = () => {} } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/mitglieder']}>
        <ThemeProvider themeId="standard">
          <DemoProvider value={false}>
            <Routes>
              <Route path="/mitglieder" element={<MembersPage family={family} onFamilyChange={onFamilyChange} />} />
              {/* Phase W: die Startseite des eigenen Zuhauses */}
              <Route path="/start" element={<h1>Start</h1>} />
              <Route path="/tier/:id" element={<h1>Tierseite</h1>} />
            </Routes>
          </DemoProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

beforeEach(() => {
  myVouchers.mockResolvedValue([])
  voucherLimit.mockResolvedValue({ offen: 1, max: 5, frei: 4 })
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  delete document.documentElement.dataset.theme
  document.title = ''
  for (const mock of [familyMembers, setMemberRole, removeMember, handOverLeitung, revokeInvite, setVoucherRole, leaveFamily, myVouchers, dissolveFamily, renewFamilyKey, listDogs, voucherLimit]) mock.mockReset()
})

describe('MembersPage – Leitung übergeben', () => {
  test('Mitglied wählen, zweistufig bestätigen → api.handOverLeitung; danach bin ich Stellvertretung (onFamilyChange)', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    const after = payloadAs('stellvertretung')
    after.mitglieder[1].rolle = 'leitung'
    handOverLeitung.mockResolvedValue(after)
    const onFamilyChange = vi.fn()
    await renderPage(familyAs('leitung'), { onFamilyChange })

    const section = container.querySelector('[aria-labelledby="handover-title"]')
    expect(section.textContent).toContain('du selbst bist dann Stellvertretung')
    const button = () => [...section.querySelectorAll('button')][0]
    expect(button().disabled).toBe(true)

    changeSelect(section.querySelector('#handover-target'), '7')
    expect(button().disabled).toBe(false)
    act(() => button().click())
    expect(button().textContent).toContain('Ja, an „Haus Birkenweg“ übergeben')
    expect(handOverLeitung).not.toHaveBeenCalled()

    await act(async () => button().click())
    expect(handOverLeitung).toHaveBeenCalledWith(7)
    expect(onFamilyChange).toHaveBeenCalledWith(expect.objectContaining({ role: 'stellvertretung' }))
    // Danach keine Leitungs-Abschnitte mehr
    expect([...container.querySelectorAll('h2')].some((h) => h.textContent === 'Leitung übergeben')).toBe(false)
  })

  test('der Hinweis "einzige Leitung" springt mit "Leitung übergeben" zur Auswahl', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    await renderPage(familyAs('leitung'))
    const select = container.querySelector('#handover-target')
    select.scrollIntoView = vi.fn()

    const ownSection = container.querySelector('[aria-labelledby="own-membership-title"]')
    act(() => [...ownSection.querySelectorAll('button')].find((b) => b.textContent === 'Leitung übergeben').click())
    expect(select.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(select)
  })
})

describe('MembersPage – Einladungen', () => {
  test('zeigt Hinweis, Rolle und Ablauf; die Rollenauswahl ruft api.setVoucherRole, Widerrufen api.revokeInvite (und lädt neu)', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    setVoucherRole.mockResolvedValue({ id: 41, rolle: 'gast' })
    revokeInvite.mockResolvedValue(null)
    await renderPage(familyAs('leitung'))

    const row = container.querySelector('.invite-list .member-row')
    expect(row.textContent).toContain('…HJKM')
    expect(row.querySelector('.role-badge').textContent).toBe('Mitglied')
    expect(row.textContent).toContain('gültig bis 31.12.2026')

    changeSelect(row.querySelector('.role-select'), 'gast')
    await act(async () => {})
    expect(setVoucherRole).toHaveBeenCalledWith(41, 'gast')
    expect(familyMembers).toHaveBeenCalledTimes(2)

    const revoke = () => [...container.querySelectorAll('.invite-list button')].find((b) => b.textContent.includes('iderrufen'))
    act(() => revoke().click())
    expect(revoke().textContent).toContain('Wirklich widerrufen?')
    await act(async () => revoke().click())
    expect(revokeInvite).toHaveBeenCalledWith(41)
    expect(familyMembers).toHaveBeenCalledTimes(3)
  })

  test('"Einladen" öffnet den Einladen-Dialog (Gutscheine mit Rolle) im Modal; Schließen lädt die Einladungen neu', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    myVouchers.mockResolvedValue([{ id: 9, code: 'ABCD-1234-HJKM', hint: 'HJKM', status: 'offen', joins: true, rolle: 'mitglied', redeemed_at: null, created_at: '2026-03-02 09:00:00' }])
    await renderPage(familyAs('leitung'))

    await act(async () => buttonWith('Einladen').click())
    const modal = [...container.querySelectorAll('.modal')].find((m) => m.open)
    expect(modal.querySelector('.voucher-code').textContent).toBe('ABCD-1234-HJKM')
    expect([...modal.querySelector('.voucher-row .role-select').options]).toHaveLength(4)

    await act(async () => modal.querySelector('.modal-header button').click())
    expect(familyMembers).toHaveBeenCalledTimes(2)
  })
})

describe('MembersPage – Familie auflösen', () => {
  test('der Dialog erklärt, verlangt den genauen Namen und ruft api.dissolveFamily; danach landet man im Zuhause', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    const me = { ...home, isDemo: false, role: 'leitung', home, memberships: [] }
    dissolveFamily.mockResolvedValue(me)
    const onFamilyChange = vi.fn()
    await renderPage(familyAs('leitung'), { onFamilyChange })

    await act(async () => buttonWith('Familie auflösen …').click())
    const form = container.querySelector('.dissolve-dialog')
    expect(form.textContent).toContain('Das lässt sich nicht rückgängig machen.')
    expect(form.textContent).toContain('Die Tiere der Mitglieder bleiben in ihren eigenen Chroniken')
    const submit = () => form.querySelector('button[type="submit"]')
    expect(submit().disabled).toBe(true)

    setInput(form.querySelector('#dissolve-name'), 'Familie Sonnenhan')
    expect(submit().disabled).toBe(true)
    setInput(form.querySelector('#dissolve-name'), 'Familie Sonnenhang')
    expect(submit().disabled).toBe(false)

    await act(async () => form.requestSubmit())
    expect(dissolveFamily).toHaveBeenCalledWith('Familie Sonnenhang')
    expect(onFamilyChange).toHaveBeenCalledWith(me)
    expect(container.querySelector('h1').textContent).toBe('Start')
  })

  test('409 "eigene Tiere": zeigt den Hinweis und die Tiere der Familie als Links „In meine Chronik übernehmen“', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    dissolveFamily.mockRejectedValue(Object.assign(new Error('Die Familie hat eigene Tiere – bitte vorher in eine Chronik übernehmen.'), { status: 409 }))
    listDogs.mockResolvedValue([
      { id: 21, name: 'Wilma', can_edit: 1 },
      { id: 22, name: 'Flocke', can_edit: 0 }
    ])
    await renderPage(familyAs('leitung'))

    await act(async () => buttonWith('Familie auflösen …').click())
    const form = container.querySelector('.dissolve-dialog')
    setInput(form.querySelector('#dissolve-name'), 'Familie Sonnenhang')
    await act(async () => form.requestSubmit())
    await act(async () => {})

    expect(form.querySelector('[role="alert"]').textContent).toBe('Die Familie hat eigene Tiere – bitte vorher in eine Chronik übernehmen.')
    const links = [...form.querySelectorAll('.dissolve-animals a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/tier/21'])
    expect(links[0].textContent).toContain('Wilma')
    expect(links[0].textContent).toContain('In meine Chronik übernehmen')
    expect(form.textContent).not.toContain('Flocke')
  })

  test('mit dem gemeinsamen Schlüssel (Antwort 204) endet die Sitzung - zurück zur Startseite', async () => {
    const sharedKey = { ...familyAs('leitung'), home: { id: 3, name: 'Familie Sonnenhang', theme: 'standard', art: 'rudel' }, memberships: [] }
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    dissolveFamily.mockResolvedValue(null)
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, assign }, writable: true, configurable: true })
    try {
      await renderPage(sharedKey)
      await act(async () => buttonWith('Familie auflösen …').click())
      const form = container.querySelector('.dissolve-dialog')
      setInput(form.querySelector('#dissolve-name'), 'Familie Sonnenhang')
      await act(async () => form.requestSubmit())
      expect(assign).toHaveBeenCalledWith('/')
    } finally {
      Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
    }
  })
})

describe('MembersPage – Schlüssel der Familie erneuern', () => {
  test('eigener Nachweis (Schlüssel), zweistufig → api.renewFamilyKey({ currentKey }); der neue Schlüssel erscheint einmal', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    renewFamilyKey.mockResolvedValue({ key: 'NEUE-RKEY-1234' })
    await renderPage(familyAs('leitung'))

    const section = container.querySelector('[aria-labelledby="family-key-title"]')
    const button = () => [...section.querySelectorAll('button')].find((b) => b.textContent.includes('Schlüssel erneuern'))
    expect(section.querySelector('label').textContent).toBe('Zur Bestätigung: euer aktueller Schlüssel')
    expect(button().disabled).toBe(true)

    setInput(section.querySelector('#family-key-confirm'), 'abcd1234hjkm')
    expect(button().disabled).toBe(false)
    act(() => button().click())
    expect(button().textContent).toContain('Ja, Schlüssel erneuern')
    expect(renewFamilyKey).not.toHaveBeenCalled()

    await act(async () => button().click())
    expect(renewFamilyKey).toHaveBeenCalledWith({ currentKey: 'ABCD-1234-HJKM' })
    expect(section.querySelector('.key-reveal-value').textContent).toBe('NEUE-RKEY-1234')
    expect(section.textContent).toContain('Deine eigene Anmeldung bleibt')
  })

  test('mit Benutzer-Sitzung fragt es nach dem Passwort (currentPassword); der 400/403 des Servers erscheint als Alert', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    renewFamilyKey.mockRejectedValue(new Error('Den Schlüssel des eigenen Bereichs erneuerst du in dessen Einstellungen.'))
    await renderPage({ ...familyAs('leitung'), auth: { kind: 'user', username: 'benno' } })

    const section = container.querySelector('[aria-labelledby="family-key-title"]')
    expect(section.querySelector('label').textContent).toBe('Zur Bestätigung: dein Passwort')
    const input = section.querySelector('#family-key-confirm')
    expect(input.type).toBe('password')
    setInput(input, 'geheim123')
    const button = () => [...section.querySelectorAll('button')].find((b) => b.textContent.includes('Schlüssel erneuern'))
    act(() => button().click())
    await act(async () => button().click())

    expect(renewFamilyKey).toHaveBeenCalledWith({ currentPassword: 'geheim123' })
    expect(section.querySelector('[role="alert"]').textContent).toBe('Den Schlüssel des eigenen Bereichs erneuerst du in dessen Einstellungen.')
  })
})

describe('MembersPage – Familie verlassen (kein letzter Leiter)', () => {
  test('ruft den bestehenden Verlassen-Weg (api.leaveFamily) und wechselt ins Zuhause', async () => {
    familyMembers.mockResolvedValue(payloadAs('mitglied'))
    const me = { ...home, isDemo: false, role: 'leitung', home, memberships: [] }
    leaveFamily.mockResolvedValue(me)
    const onFamilyChange = vi.fn()
    await renderPage(familyAs('mitglied'), { onFamilyChange })

    const button = () => buttonWith('verlassen')
    act(() => button().click())
    await act(async () => button().click())
    expect(leaveFamily).toHaveBeenCalledWith(3)
    expect(onFamilyChange).toHaveBeenCalledWith(me)
    expect(container.querySelector('h1').textContent).toBe('Start')
  })
})
