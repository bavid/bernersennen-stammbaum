// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { familyMembers, setMemberRole, removeMember, handOverLeitung, revokeInvite, setVoucherRole, leaveFamily, myVouchers } = vi.hoisted(() => ({
  familyMembers: vi.fn(),
  setMemberRole: vi.fn(),
  removeMember: vi.fn(),
  handOverLeitung: vi.fn(),
  revokeInvite: vi.fn(),
  setVoucherRole: vi.fn(),
  leaveFamily: vi.fn(),
  myVouchers: vi.fn()
}))
vi.mock('../api', () => ({
  api: { familyMembers, setMemberRole, removeMember, handOverLeitung, revokeInvite, setVoucherRole, leaveFamily, myVouchers }
}))

import MembersPage from './MembersPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt showModal/close am <dialog> nicht - die Modale (Einladen, Auflösen) rufen beides auf.
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

// Haushalt 1 in Familie Sonnenhang (id 3) mit der Rolle role.
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

const members = () => [
  { familyId: 1, name: 'Zuhause am Deich', rolle: 'leitung', seit: '2026-01-05 10:00:00', geteilteTiere: 2 },
  { familyId: 7, name: 'Haus Birkenweg', rolle: 'mitglied', seit: '2026-02-01 09:00:00', geteilteTiere: 1 },
  { familyId: 8, name: 'Hof Lindenblick', rolle: 'gast', seit: '2026-03-01 09:00:00', geteilteTiere: 0 }
]

const payloadAs = (role, overrides = {}) => ({
  familyId: 3,
  name: 'Familie Sonnenhang',
  ichBin: role,
  mitglieder: members().map((m) => (m.familyId === 1 ? { ...m, rolle: role } : m)),
  ...(role === 'leitung' || role === 'stellvertretung'
    ? { einladungen: [{ id: 41, hinweis: 'HJKM', rolle: 'mitglied', erstelltAm: '2026-03-02 09:00:00', ablauf: null }] }
    : {}),
  ...overrides
})

async function renderPage(family, { isDemo = false, onFamilyChange = () => {}, themeId = 'standard' } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/mitglieder']}>
        <ThemeProvider themeId={themeId}>
          <DemoProvider value={isDemo}>
            <MembersPage family={family} onFamilyChange={onFamilyChange} />
          </DemoProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

const buttons = () => [...container.querySelectorAll('button')]
const buttonWith = (text) => buttons().find((btn) => btn.textContent.includes(text))
const heading = (text) => [...container.querySelectorAll('h2')].find((h) => h.textContent === text)
const memberRows = () => [...container.querySelectorAll('.member-list:not(.invite-list) .member-row')]

function changeSelect(select, value) {
  act(() => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  myVouchers.mockResolvedValue([])
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
  for (const mock of [familyMembers, setMemberRole, removeMember, handOverLeitung, revokeInvite, setVoucherRole, leaveFamily, myVouchers]) mock.mockReset()
})

describe('MembersPage – „Wer sieht was?“ und Liste (für alle Rollen)', () => {
  test('zeigt die drei Kreise Privat / Familie / Öffentlich und dass eine Familie nie öffentlich ist', async () => {
    familyMembers.mockResolvedValue(payloadAs('gast'))
    await renderPage(familyAs('gast'))

    const rows = [...container.querySelectorAll('.visibility-row')].map((row) => row.querySelector('strong').textContent)
    expect(rows[0]).toContain('Privat')
    expect(rows[0]).toContain('nur euer Zuhause')
    expect(rows[1]).toContain('Familie')
    expect(rows[1]).toContain('Mitglieder, je nach Rolle')
    expect(rows[2]).toContain('Öffentlich')
    expect(rows[2]).toContain('Partner-Portale, Steckbriefe und Happy Ends mit Einwilligung')
    expect(container.textContent).toContain('Eine Familie ist nie öffentlich.')
    // Audit V7a: nur einmal - in "Wer sieht was?", nicht noch einmal in der Einleitung
    expect(container.textContent.split('nie öffentlich').length - 1).toBe(1)
    expect(container.querySelector('.page-lede').textContent).not.toContain('nie öffentlich')
    expect(container.querySelectorAll('.visibility-icon svg')).toHaveLength(3)
  })

  test('listet Mitglieder mit Rolle, "seit" und geteilten Tieren, markiert sich selbst mit "(ich)"', async () => {
    familyMembers.mockResolvedValue(payloadAs('mitglied'))
    await renderPage(familyAs('mitglied'))

    const rows = memberRows()
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Zuhause am Deich')
    expect(rows[0].textContent).toContain('(ich)')
    expect(rows[0].querySelector('.role-badge').textContent).toBe('Mitglied')
    expect(rows[0].textContent).toContain('seit 05.01.2026')
    expect(rows[0].textContent).toContain('2 geteilte Tiere')
    expect(rows[1].textContent).toContain('1 geteiltes Tier')
    expect(rows[1].textContent).not.toContain('(ich)')
    expect(rows[2].querySelector('.role-badge').textContent).toBe('Gast')
    expect(container.querySelector('.stats').textContent).toContain('3')
  })

  test('ein Fehler beim Laden erscheint als Alert', async () => {
    familyMembers.mockRejectedValue(new Error('Nur in einer Familie möglich'))
    await renderPage(familyAs('mitglied'))
    expect(container.querySelector('[role="alert"]').textContent).toBe('Nur in einer Familie möglich')
  })
})

// Phase W, Schritt 2: Leitung übergeben, Schlüssel, Verlassen und Auflösen stehen in Einstellungen › Familien › [Familie]
// (components/settings/FamilyManage.test.jsx) - der Reiter "Mitglieder" zeigt nur noch, wer dazugehört, und die Einladungen.
const LEITUNG_TOOLS = ['Leitung übergeben', 'Familie auflösen', 'Schlüssel der Familie erneuern', 'Deine Mitgliedschaft']

describe('MembersPage – was welche Rolle sieht', () => {
  test('Gast und Mitglied: keine Rollenauswahl, kein Entfernen, keine Einladungen - und keine Verwaltung', async () => {
    for (const role of ['gast', 'mitglied']) {
      familyMembers.mockResolvedValue(payloadAs(role))
      await renderPage(familyAs(role))

      expect(container.querySelector('.role-select')).toBeNull()
      expect(buttonWith('Entfernen')).toBeUndefined()
      expect(heading('Offene Einladungen')).toBeUndefined()
      expect(buttonWith('Mitglied einladen')).toBeUndefined()
      for (const title of LEITUNG_TOOLS) expect(heading(title), title).toBeUndefined()
      expect(buttonWith('Familie verlassen')).toBeUndefined()

      act(() => root.unmount())
      root = null
      container.remove()
    }
  })

  test('Stellvertretung: Einladungen mit eingeschränkter Rollenauswahl (Gast/Mitglied) und "Mitglied einladen"', async () => {
    familyMembers.mockResolvedValue(payloadAs('stellvertretung'))
    await renderPage(familyAs('stellvertretung'))

    expect(heading('Offene Einladungen')).not.toBeUndefined()
    expect(buttonWith('Mitglied einladen')).not.toBeUndefined()
    const inviteSelect = container.querySelector('.invite-list .role-select')
    expect([...inviteSelect.options].map((o) => o.value)).toEqual(['gast', 'mitglied'])
    expect(buttonWith('Widerrufen')).not.toBeUndefined()
    expect(memberRows()[0].querySelector('.role-select')).toBeNull()
    expect(buttonWith('Entfernen')).toBeUndefined()
  })

  test('Leitung: Rollenauswahl je Mitglied (alle vier Rollen), Entfernen für andere, nicht für sich; Einladungen - die Werkzeuge der Leitung stehen in den Einstellungen', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    await renderPage(familyAs('leitung'))

    const rows = memberRows()
    // Ich bin die einzige Leitung: statt der Auswahl der Hinweis
    expect(rows[0].querySelector('.role-select')).toBeNull()
    expect(rows[0].textContent).toContain('Es muss immer eine Leitung geben.')
    expect(rows[0].querySelector('.btn-danger')).toBeNull()
    expect([...rows[1].querySelector('.role-select').options].map((o) => o.value)).toEqual(['gast', 'mitglied', 'stellvertretung', 'leitung'])
    expect(rows[1].textContent).toContain('Entfernen')
    expect(heading('Offene Einladungen')).not.toBeUndefined()
    expect([...container.querySelector('.invite-list .role-select').options]).toHaveLength(4)
    for (const title of LEITUNG_TOOLS) expect(heading(title), title).toBeUndefined()
  })

  test('Reihenfolge: Mitglieder dieser Familie, Offene Einladungen, „Wer sieht was?“ zum Aufklappen', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    await renderPage(familyAs('leitung'))

    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Mitglieder dieser Familie', 'Offene Einladungen', 'Wer sieht was?'])
    expect(container.querySelector('details.visibility-card').open).toBe(false)
  })

  test('gibt es eine zweite Leitung, bekommt auch die eigene Zeile die Rollenauswahl', async () => {
    const payload = payloadAs('leitung')
    payload.mitglieder[1].rolle = 'leitung'
    familyMembers.mockResolvedValue(payload)
    await renderPage(familyAs('leitung'))

    expect(memberRows()[0].querySelector('.role-select')).not.toBeNull()
    expect(container.textContent).not.toContain('Es muss immer eine Leitung geben.')
  })

  test('mit dem gemeinsamen Schlüssel angemeldet (Identität = Familie): ohne "(ich)", Rollen verwalten - und der Weg zu „Familie verwalten“', async () => {
    const sharedKey = { ...familyAs('leitung'), home: { id: 3, name: 'Familie Sonnenhang', theme: 'standard', art: 'rudel' }, memberships: [] }
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    await renderPage(sharedKey)

    expect(container.textContent).not.toContain('(ich)')
    expect(memberRows()[1].querySelector('.role-select')).not.toBeNull()
    const manage = [...container.querySelectorAll('.members-hero-links a')].find((a) => a.textContent === 'Familie verwalten')
    expect(manage.getAttribute('href')).toBe('/einstellungen?bereich=familien')
  })
})

describe('MembersPage – Rollen ändern und Mitglieder entfernen (Leitung)', () => {
  test('Rollenauswahl ruft api.setMemberRole und übernimmt die Antwort; ändert sich die eigene Rolle, zieht onFamilyChange mit', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    const after = payloadAs('leitung')
    after.mitglieder[1].rolle = 'stellvertretung'
    setMemberRole.mockResolvedValue(after)
    const onFamilyChange = vi.fn()
    await renderPage(familyAs('leitung'), { onFamilyChange })

    changeSelect(memberRows()[1].querySelector('.role-select'), 'stellvertretung')
    await act(async () => {})

    expect(setMemberRole).toHaveBeenCalledWith(7, 'stellvertretung')
    expect(memberRows()[1].querySelector('.role-badge').textContent).toBe('Stellvertretung')
    expect(onFamilyChange).not.toHaveBeenCalled()

    // Selbst herabstufen (jetzt gibt es eine zweite Leitung ... simuliert über die Antwort ichBin)
    setMemberRole.mockResolvedValue({ ...after, ichBin: 'mitglied', mitglieder: after.mitglieder.map((m) => (m.familyId === 1 ? { ...m, rolle: 'mitglied' } : m)) })
    familyMembers.mockResolvedValue(after)
    changeSelect(memberRows()[1].querySelector('.role-select'), 'leitung')
    await act(async () => {})
    expect(onFamilyChange).toHaveBeenCalledWith(expect.objectContaining({ role: 'mitglied' }))
  })

  test('"Entfernen" blendet die Erklärung ein (Tiere verschwinden aus der Familie, bleiben in der Chronik); "Ja, entfernen" ruft api.removeMember und lädt neu', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    removeMember.mockResolvedValue(null)
    await renderPage(familyAs('leitung'))

    expect(removeMember).not.toHaveBeenCalled()
    act(() => memberRows()[1].querySelector('.btn-danger').click())
    const confirm = container.querySelector('.member-remove-confirm')
    expect(confirm.textContent).toContain('„Haus Birkenweg“ aus eurer Familie entfernen?')
    expect(confirm.textContent).toContain('Die geteilten Tiere verschwinden aus eurer Familie, bleiben aber in der Chronik dieses Haushalts.')

    // Abbrechen schließt ohne Aufruf
    act(() => [...confirm.querySelectorAll('button')].find((b) => b.textContent === 'Abbrechen').click())
    expect(container.querySelector('.member-remove-confirm')).toBeNull()
    expect(removeMember).not.toHaveBeenCalled()

    act(() => memberRows()[1].querySelector('.btn-danger').click())
    await act(async () => buttonWith('Ja, entfernen').click())
    expect(removeMember).toHaveBeenCalledWith(7)
    expect(familyMembers).toHaveBeenCalledTimes(2)
  })

  test('ein Fehler des Servers (z. B. 409 letzte Leitung) erscheint als Alert', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    setMemberRole.mockRejectedValue(new Error('Es muss immer eine Leitung geben.'))
    await renderPage(familyAs('leitung'))

    changeSelect(memberRows()[1].querySelector('.role-select'), 'gast')
    await act(async () => {})
    expect(container.querySelector('[role="alert"]').textContent).toBe('Es muss immer eine Leitung geben.')
  })
})

describe('MembersPage – Demo', () => {
  test('alles sichtbar, Schreiben gesperrt mit "In der Demo nicht möglich."', async () => {
    familyMembers.mockResolvedValue(payloadAs('leitung'))
    await renderPage(familyAs('leitung'), { isDemo: true })

    expect(container.textContent).toContain('In der Demo nicht möglich.')
    expect(memberRows()[1].querySelector('.role-select').disabled).toBe(true)
    expect(memberRows()[1].querySelector('.btn-danger').disabled).toBe(true)
    expect(buttonWith('Widerrufen').disabled).toBe(true)
    expect(container.querySelector('.invite-list .role-select').disabled).toBe(true)
  })
})
