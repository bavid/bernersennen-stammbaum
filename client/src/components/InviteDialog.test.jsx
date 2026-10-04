// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { myVouchers, setVoucherRole, voucherLimit, createVoucher, setVoucherLabel, deleteVoucher, visits } = vi.hoisted(() => ({
  myVouchers: vi.fn(),
  setVoucherRole: vi.fn(),
  voucherLimit: vi.fn(),
  createVoucher: vi.fn(),
  setVoucherLabel: vi.fn(),
  deleteVoucher: vi.fn(),
  visits: vi.fn()
}))
vi.mock('../api', () => ({ api: { myVouchers, setVoucherRole, voucherLimit, createVoucher, setVoucherLabel, deleteVoucher, visits } }))

// Kein <ToastProvider> in diesem Test-Setup (siehe render() unten) – useToast() mocken, um die
// Fehlermeldung beim gescheiterten "Link kopieren" ohne echte Toast-UI zu prüfen.
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('./Toast.jsx', () => ({ useToast: () => toast }))

import InviteDialog, { PRINTED_HINT } from './InviteDialog.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rudel = { id: 3, name: 'Familie Sonnenhang', theme: 'standard', art: 'rudel', isDemo: false }
const zuhause = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false, home: { id: 1, name: 'Zuhause am Deich', art: 'zuhause' } }
const partnerArea = { id: 30, name: 'Hundeschule Wiesengrund', theme: 'standard', art: 'partner', isDemo: false }
const shelterArea = { id: 5, name: 'Tierheim Sonnenhang', theme: 'standard', art: 'tierheim', isDemo: false }

const openVoucher = {
  id: 1,
  code: 'ABCD-1234-HJKM',
  hint: 'HJKM',
  status: 'offen',
  joins: true,
  redeemed_at: null,
  created_at: '2026-01-05 10:00:00'
}
const redeemedVoucher = {
  id: 2,
  code: null,
  hint: '000B',
  status: 'eingelöst',
  joins: true,
  redeemed_at: '2026-01-02 09:00:00',
  created_at: '2026-01-02 08:00:00'
}

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
  delete document.documentElement.dataset.theme
  document.title = ''
  for (const mock of [myVouchers, setVoucherRole, voucherLimit, createVoucher, setVoucherLabel, deleteVoucher, visits]) mock.mockReset()
  toast.mockReset()
  vi.restoreAllMocks()
})

// Phase W, Schritt 2: im eigenen Zuhause erst einen der beiden Wege wählen.
async function choose(title) {
  const option = [...container.querySelectorAll('.invite-choice-option')].find((button) => button.textContent.includes(title))
  await act(async () => option.click())
}

async function render(family, { isDemo = false, themeId = 'standard' } = {}) {
  if (!voucherLimit.getMockImplementation()) voucherLimit.mockResolvedValue({ offen: 1, max: 5, frei: 4 })
  if (!visits.getMockImplementation()) visits.mockResolvedValue({ besuche: [], gaeste: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider themeId={themeId}>
        <DemoProvider value={isDemo}>
          <InviteDialog family={family} />
        </DemoProvider>
      </ThemeProvider>
    )
  )
  return container
}

// Phase U: der Hinweis nennt den Baum mit dem Wort des Auftritts.
describe('InviteDialog – Adresse und Passwort: Name des Baums', () => {
  test.each([['standard', 'Dann sieht sie euren Stammbaum und kann mitschreiben.']])('%s', async (themeId, sentence) => {
    myVouchers.mockResolvedValue([])
    await render(rudel, { themeId })
    expect(container.querySelector('.invite-legacy').textContent.replace(/\s+/g, ' ')).toContain(sentence)
  })
})

describe('InviteDialog – eigene Gutscheine', () => {
  test('zeigt die Codes aus myVouchers() mit Status', async () => {
    myVouchers.mockResolvedValue([openVoucher, redeemedVoucher])
    await render(rudel)

    const rows = [...container.querySelectorAll('.voucher-row')]
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('ABCD-1234-HJKM')
    expect(rows[0].querySelector('.pill').textContent).toBe('Offen')
    expect(rows[1].textContent).toContain('Eingelöst am 02.01.2026')
  })

  test('Phase V5: gedruckte Codes tragen die Marke "gedruckt", dazu der Hinweis - ungedruckte ohne', async () => {
    const printed = { ...openVoucher, id: 7, code: 'WXYZ-5678-KLMN', hint: 'KLMN', gedruckt: true }
    myVouchers.mockResolvedValue([{ ...openVoucher, gedruckt: false }, printed])
    await render(partnerArea)

    const rows = [...container.querySelectorAll('.voucher-row')]
    expect(rows[0].querySelector('.pill-gedruckt')).toBeNull()
    expect(rows[1].querySelector('.pill-gedruckt').textContent).toBe('gedruckt')
    expect(container.textContent).toContain(PRINTED_HINT)
  })

  test('Phase V5: ohne gedruckte Codes kein Hinweis', async () => {
    myVouchers.mockResolvedValue([openVoucher, { ...redeemedVoucher, gedruckt: true }])
    await render(partnerArea)
    expect(container.querySelector('.pill-gedruckt')).toBeNull()
    expect(container.textContent).not.toContain(PRINTED_HINT)
  })

  test('kopiert den Link ohne Bindestriche ins Ziel /v#CODE (Zwischenablage gemockt)', async () => {
    myVouchers.mockResolvedValue([openVoucher])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    await render(rudel)

    const copyLinkButton = [...container.querySelectorAll('.voucher-row button')].find((btn) =>
      btn.textContent.includes('Link kopieren')
    )
    await act(async () => copyLinkButton.click())

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/v#ABCD1234HJKM`)
  })

  test('"Link kopieren": schlägt die Zwischenablage fehl, erscheint der Link als Fallback-Feld plus Fehler-Toast', async () => {
    myVouchers.mockResolvedValue([openVoucher])
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })
    await render(rudel)

    expect(container.querySelector('.voucher-link-fallback')).toBeNull()

    const copyLinkButton = [...container.querySelectorAll('.voucher-row button')].find((btn) =>
      btn.textContent.includes('Link kopieren')
    )
    await act(async () => copyLinkButton.click())

    const fallbackInput = container.querySelector('.voucher-link-fallback')
    expect(fallbackInput).not.toBeNull()
    expect(fallbackInput.value).toBe(`${window.location.origin}/v#ABCD1234HJKM`)
    expect(fallbackInput.readOnly).toBe(true)
    expect(toast).toHaveBeenCalledWith('Kopieren nicht möglich – Link bitte markieren')

    // React hängt onFocus intern an "focusin" (bubbelt) statt "focus" (bubbelt nicht) - darum focus()
    // aufrufen statt selbst ein Event zu basteln, sonst kommt der Handler nie an.
    const selectSpy = vi.spyOn(fallbackInput, 'select')
    act(() => fallbackInput.focus())
    expect(selectSpy).toHaveBeenCalled()
  })

  test('kopiert auch nur den Code', async () => {
    myVouchers.mockResolvedValue([openVoucher])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    await render(rudel)

    const copyCodeButton = [...container.querySelectorAll('.voucher-row button')].find((btn) =>
      btn.textContent.includes('Code kopieren')
    )
    await act(async () => copyCodeButton.click())

    expect(writeText).toHaveBeenCalledWith('ABCD-1234-HJKM')
  })

  test('"Teilen" erscheint nur, wenn navigator.share verfügbar ist', async () => {
    myVouchers.mockResolvedValue([openVoucher])
    await render(rudel)
    expect([...container.querySelectorAll('.voucher-row button')].some((btn) => btn.textContent.includes('Teilen'))).toBe(false)
  })

  test('Erklärtext in der Familie nennt das eigene Zuhause und die Mitgliedschaft', async () => {
    myVouchers.mockResolvedValue([])
    await render(rudel)
    expect(container.textContent).toContain('bekommt ein eigenes Zuhause und ist gleich Mitglied in „Familie Sonnenhang“')
  })

  test('im Zuhause: Zuhause verschenken nennt nur das eigene Zuhause', async () => {
    myVouchers.mockResolvedValue([])
    await render(zuhause)
    await choose('Zuhause verschenken')
    expect(container.textContent).not.toContain('Mitglied')
    expect(container.textContent).toContain('bekommt ein eigenes Zuhause für seine Tiere.')
  })

  test('zeigt in der Demo einen Hinweis, dass keine echten Gutscheine vergeben werden', async () => {
    myVouchers.mockResolvedValue([openVoucher])
    await render(rudel, { isDemo: true })
    expect(container.textContent).toContain('Beispiel – in der Demo werden keine Einladungscodes vergeben.')
  })

  test('der alte Weg (Adresse + Passwort) erscheint nur für ein Rudel, nicht für ein Zuhause', async () => {
    myVouchers.mockResolvedValue([])
    await render(rudel)
    expect(container.textContent).toContain('Adresse und Passwort weitergeben')
    await act(async () => root.unmount())
    root = null

    myVouchers.mockResolvedValue([])
    await render(zuhause)
    expect(container.textContent).not.toContain('Adresse und Passwort weitergeben')
  })

  test('ein Fehler beim Laden erscheint als Alert', async () => {
    myVouchers.mockRejectedValue(new Error('Server nicht erreichbar'))
    await render(rudel)
    expect(container.querySelector('[role="alert"]').textContent).toBe('Server nicht erreichbar')
  })
})

describe('InviteDialog – Einladungen mit Rolle (Phase R)', () => {
  const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
  const groupAs = (role) => ({ ...rudel, role, home, memberships: [{ id: 3, name: 'Familie Sonnenhang', rolle: role }] })
  const invite = { ...openVoucher, rolle: 'mitglied' }
  const changeSelect = (select, value) =>
    act(() => {
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

  test('die Leitung wählt je offener Einladung aus allen vier Rollen; die Auswahl schreibt sofort per api.setVoucherRole', async () => {
    myVouchers.mockResolvedValue([invite])
    setVoucherRole.mockResolvedValue({ id: 1, rolle: 'gast' })
    await render(groupAs('leitung'))

    const row = container.querySelector('.voucher-row')
    expect(row.textContent).toContain('Tritt bei als')
    const select = row.querySelector('.role-select')
    expect([...select.options].map((o) => o.value)).toEqual(['gast', 'mitglied', 'stellvertretung', 'leitung'])
    expect(select.value).toBe('mitglied')

    changeSelect(select, 'gast')
    await act(async () => {})
    expect(setVoucherRole).toHaveBeenCalledWith(1, 'gast')
    expect(row.querySelector('.role-select').value).toBe('gast')
  })

  test('die Stellvertretung darf nur Gast und Mitglied vergeben', async () => {
    myVouchers.mockResolvedValue([invite])
    await render(groupAs('stellvertretung'))
    expect([...container.querySelector('.role-select').options].map((o) => o.value)).toEqual(['gast', 'mitglied'])
  })

  test('Mitglied/Gast bekommen keine Auswahl (sie sehen den Dialog ohnehin nicht), das Zuhause auch nicht', async () => {
    myVouchers.mockResolvedValue([invite])
    await render(groupAs('mitglied'))
    expect(container.querySelector('.role-select')).toBeNull()
    act(() => root.unmount())
    root = null

    myVouchers.mockResolvedValue([{ ...openVoucher, joins: false, rolle: null }])
    await render(zuhause)
    expect(container.querySelector('.role-select')).toBeNull()
    expect(container.querySelector('.role-badge')).toBeNull()
  })

  test('eine eingelöste Einladung zeigt ihre Rolle nur noch als Chip', async () => {
    myVouchers.mockResolvedValue([{ ...redeemedVoucher, rolle: 'gast' }])
    await render(groupAs('leitung'))
    expect(container.querySelector('.role-select')).toBeNull()
    expect(container.querySelector('.voucher-row .role-badge').textContent).toBe('Gast')
  })

  test('schlägt das Schreiben fehl, springt die Auswahl zurück und ein Toast erklärt es', async () => {
    myVouchers.mockResolvedValue([invite])
    setVoucherRole.mockRejectedValue(new Error('Dafür fehlt dir die Berechtigung in dieser Familie.'))
    await render(groupAs('stellvertretung'))

    changeSelect(container.querySelector('.role-select'), 'gast')
    await act(async () => {})
    expect(container.querySelector('.role-select').value).toBe('mitglied')
    expect(toast).toHaveBeenCalledWith('Dafür fehlt dir die Berechtigung in dieser Familie.')
  })

  test('in der Demo ist die Auswahl gesperrt', async () => {
    myVouchers.mockResolvedValue([invite])
    await render(groupAs('leitung'), { isDemo: true })
    expect(container.querySelector('.role-select').disabled).toBe(true)
  })
})

describe('InviteDialog – Partner und Tierheime geben Kunden-Gutscheine weiter (Phase P)', () => {
  const PARTNER_TEXT = 'Gebt diesen Einladungscode an eure Kundschaft weiter – damit legen sie ihr eigenes Zuhause bei Familie auf Pfoten an.'

  test.each([
    ['Partner-Bereich', partnerArea],
    ['Tierheim-Bereich', shelterArea]
  ])('%s: Erklärtext für die Kundschaft, ohne Mitgliedschaft oder Rudel-Passwort', async (_label, family) => {
    myVouchers.mockResolvedValue([{ ...openVoucher, joins: false }])
    await render(family)

    expect(container.textContent).toContain(PARTNER_TEXT)
    expect(container.textContent).not.toContain('Mitglied')
    expect(container.textContent).not.toContain('beitreten')
    expect(container.textContent).not.toContain('Adresse und Passwort weitergeben')
    expect(container.querySelector('.voucher-code').textContent).toBe('ABCD-1234-HJKM')
  })
})

// Phase V2b: eigene Einladungen verwalten
describe('InviteDialog – eigene Einladungen verwalten (Phase V2b)', () => {
  const ownHome = { ...zuhause, home: { id: 1, name: 'Zuhause am Deich', art: 'zuhause' } }
  const own = { ...openVoucher, id: 11, joins: false, eigen: true, label: null }
  const foreign = { ...openVoucher, id: 12, code: 'EFGH-1234-HJKM', joins: false, eigen: false, label: null }
  const archived = [
    { ...redeemedVoucher, id: 21, eigen: true, label: 'Tante Ilse', neueChronik: true },
    { ...redeemedVoucher, id: 22, eigen: true, label: null, neueChronik: true },
    { ...redeemedVoucher, id: 23, eigen: true, label: null, besuch: true, neueChronik: false }
  ]
  const mockLists = (open, archive = []) => myVouchers.mockImplementation(({ archiv } = {}) => Promise.resolve(archiv ? archive : open))
  const buttonIn = (root_, text) => [...root_.querySelectorAll('button')].find((b) => b.textContent.includes(text))

  test('eigene Notiz inline: hinzufügen, speichern - nur am eigenen Code', async () => {
    mockLists([own, foreign])
    setVoucherLabel.mockResolvedValue({ id: 11, label: 'Tante Ilse' })
    await render(ownHome)
    await choose('Zuhause verschenken')
    const rows = [...container.querySelectorAll('.voucher-list > .voucher-row')]
    expect(rows[1].querySelector('.voucher-label-edit')).toBeNull()
    await act(async () => rows[0].querySelector('.voucher-label-edit').click())
    const input = rows[0].querySelector('.voucher-label-form input')
    expect(input.maxLength).toBe(60)
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Tante Ilse')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => buttonIn(rows[0], 'Speichern').click())
    expect(setVoucherLabel).toHaveBeenCalledWith(11, 'Tante Ilse')
    expect(rows[0].querySelector('.voucher-label-edit').textContent).toContain('Tante Ilse')
  })

  test('Zurückziehen ist zweistufig und nimmt den Code aus der Liste', async () => {
    mockLists([own])
    deleteVoucher.mockResolvedValue(null)
    await render(ownHome)
    await choose('Zuhause verschenken')
    const deleteButton = () => container.querySelector('.voucher-row-delete')
    act(() => deleteButton().click())
    expect(deleteButton().textContent).toContain('Wirklich zurückziehen und löschen?')
    await act(async () => deleteButton().click())
    expect(deleteVoucher).toHaveBeenCalledWith(11)
    expect(container.querySelectorAll('.voucher-list > .voucher-row')).toHaveLength(0)
  })

  test('„Neuen Code erstellen“ legt einen an; bei 5 offenen gesperrt mit Erklärung', async () => {
    mockLists([own])
    createVoucher.mockResolvedValue({ ...own, id: 13, code: 'JKMN-1234-HJKM' })
    await render(ownHome)
    await choose('Zuhause verschenken')
    expect(container.textContent).toContain('1 von 5 offenen Codes')
    await act(async () => buttonIn(container, 'Neuen Code erstellen').click())
    expect(createVoucher).toHaveBeenCalled()
    expect(container.querySelectorAll('.voucher-list > .voucher-row')).toHaveLength(2)
    act(() => root.unmount())
    root = null
    container.remove()

    voucherLimit.mockResolvedValue({ offen: 5, max: 5, frei: 0 })
    mockLists([own])
    await render(ownHome)
    await choose('Zuhause verschenken')
    expect(buttonIn(container, 'Neuen Code erstellen').disabled).toBe(true)
    expect(container.textContent).toContain('Ein neuer geht erst, wenn einer eingelöst, zurückgezogen oder abgelaufen ist.')
  })

  test('Archiv: „Eingelöste anzeigen“ mit der Zahl der mitgebrachten Leute', async () => {
    mockLists([own], archived)
    await render(ownHome)
    await choose('Zuhause verschenken')
    expect(container.textContent).toContain('Du hast schon 2 Leute zu Familie auf Pfoten gebracht.')
    expect(container.querySelector('.voucher-list-archive')).toBeNull()
    // Der eingelöste Besuchs-Code gehört zu "Zu Besuch einladen", nicht hierher.
    await act(async () => buttonIn(container, 'Eingelöste anzeigen (2)').click())
    expect(container.querySelectorAll('.voucher-list-archive .voucher-row')).toHaveLength(2)
    expect(container.querySelector('.voucher-list-archive').textContent).toContain('Tante Ilse')
  })

  test('in einer Familie: neue Codes ab Stellvertretung, fremde Codes zurückziehen ebenfalls', async () => {
    const groupAs = (role) => ({ ...rudel, role, home: ownHome.home, memberships: [{ id: 3, name: 'Familie Sonnenhang', rolle: role }] })
    mockLists([{ ...foreign, joins: true, rolle: 'mitglied' }])
    await render(groupAs('stellvertretung'))
    expect(buttonIn(container, 'Neuen Code erstellen')).toBeTruthy()
    expect(container.querySelector('.voucher-row-delete')).not.toBeNull()
  })

  test('Demo: Notiz nur lesbar, Knöpfe gesperrt', async () => {
    mockLists([{ ...own, label: 'Nachbarin vom Deich' }])
    await render(ownHome, { isDemo: true })
    await choose('Zuhause verschenken')
    expect(container.querySelector('.voucher-label').textContent).toBe('Nachbarin vom Deich')
    expect(buttonIn(container, 'Neuen Code erstellen').disabled).toBe(true)
    expect(container.querySelector('.voucher-row-delete').disabled).toBe(true)
  })
})

describe('InviteDialog – beschädigter Code (security-review V2)', () => {
  test('zeigt „Code nicht lesbar – bitte zurückziehen“ und bietet das Zurückziehen an', async () => {
    const ownHome = { ...zuhause, home: { id: 1, name: 'Zuhause am Deich', art: 'zuhause' } }
    myVouchers.mockImplementation(({ archiv } = {}) =>
      Promise.resolve(archiv ? [] : [{ ...openVoucher, id: 31, code: null, codeFehler: true, joins: false, eigen: true }])
    )
    await render(ownHome)
    await choose('Zuhause verschenken')
    const row = container.querySelector('.voucher-list > .voucher-row')
    expect(row.textContent).toContain('Code nicht lesbar – bitte zurückziehen.')
    expect(row.querySelector('.voucher-row-actions')).toBeNull()
    expect(row.querySelector('.voucher-row-delete')).not.toBeNull()
  })
})

// Phase W, Schritt 2: Einladen im eigenen Zuhause - zwei klare Wege statt eines langen Dialogs.
describe('InviteDialog – im eigenen Zuhause: Zu Besuch einladen oder Zuhause verschenken', () => {
  const gift = { ...openVoucher, id: 41, joins: false, eigen: true, label: null }
  const visitCode = { ...openVoucher, id: 42, code: 'JKMN-PQRS-TUVW', hint: 'TUVW', joins: false, besuch: true, eigen: true, label: null, expires_at: '2026-10-10 12:00:00' }

  test('erst die Wahl zwischen zwei Wegen - ohne Codes, ohne Einlösen, ohne Listen von Besuchen', async () => {
    myVouchers.mockResolvedValue([gift, visitCode])
    await render(zuhause)
    const options = [...container.querySelectorAll('.invite-choice-option')]
    expect(options.map((button) => button.querySelector('.invite-choice-title').textContent)).toEqual(['Zu Besuch einladen', 'Zuhause verschenken'])
    expect(container.querySelector('.voucher-row')).toBeNull()
    expect(container.querySelector('#visit-redeem-code')).toBeNull()
    expect(container.querySelector('.visit-lists')).toBeNull()
  })

  test('Zuhause verschenken: nur die Einladungscodes (ohne Besuchs-Codes); „Andere Möglichkeit“ führt zurück, der Fokus folgt', async () => {
    myVouchers.mockResolvedValue([gift, visitCode])
    await render(zuhause)
    await choose('Zuhause verschenken')
    expect(document.activeElement).toBe(container.querySelector('#invite-gift-title'))
    expect([...container.querySelectorAll('.voucher-row .voucher-code')].map((el) => el.textContent)).toEqual(['ABCD-1234-HJKM'])
    expect(container.querySelector('.voucher-create')).not.toBeNull()

    await act(async () => container.querySelector('.invite-back').click())
    expect(container.querySelectorAll('.invite-choice-option')).toHaveLength(2)
    expect(document.activeElement.textContent).toContain('Zuhause verschenken')
  })

  test('Zu Besuch einladen: Besuchs-Code erstellen (7 Tage) und die offenen Besuchs-Codes', async () => {
    myVouchers.mockResolvedValue([gift, visitCode])
    await render(zuhause)
    await choose('Zu Besuch einladen')
    expect(document.activeElement).toBe(container.querySelector('#visit-invite-title'))
    expect(container.textContent).toContain('Der Code gilt 7 Tage und nur einmal')
    expect([...container.querySelectorAll('.voucher-row .voucher-code')].map((el) => el.textContent)).toEqual(['JKMN-PQRS-TUVW'])
    expect(container.querySelector('.voucher-create')).toBeNull()
  })
})
