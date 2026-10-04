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

  test('"Mitglied einladen" öffnet den Einladen-Dialog der Familie (Codes mit Rolle) im Modal; Schließen lädt die Einladungen neu', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    myVouchers.mockResolvedValue([{ id: 9, code: 'ABCD-1234-HJKM', hint: 'HJKM', status: 'offen', joins: true, rolle: 'mitglied', redeemed_at: null, created_at: '2026-03-02 09:00:00' }])
    await renderPage(familyAs('leitung'))

    await act(async () => buttonWith('Mitglied einladen').click())
    const modal = [...container.querySelectorAll('.modal')].find((m) => m.open)
    expect(modal.querySelector('#modal-title').textContent).toBe('Mitglied einladen')
    expect(modal.querySelector('.voucher-code').textContent).toBe('ABCD-1234-HJKM')
    expect([...modal.querySelector('.voucher-row .role-select').options]).toHaveLength(4)

    await act(async () => modal.querySelector('.modal-header button').click())
    expect(familyMembers).toHaveBeenCalledTimes(2)
  })
})
