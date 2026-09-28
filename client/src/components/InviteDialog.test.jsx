// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { myVouchers } = vi.hoisted(() => ({ myVouchers: vi.fn() }))
vi.mock('../api', () => ({ api: { myVouchers } }))

// Kein <ToastProvider> in diesem Test-Setup (siehe render() unten) – useToast() mocken, um die
// Fehlermeldung beim gescheiterten "Link kopieren" ohne echte Toast-UI zu prüfen.
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('./Toast.jsx', () => ({ useToast: () => toast }))

import InviteDialog from './InviteDialog.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rudel = { id: 3, name: 'Familie Sonnenhang', theme: 'standard', art: 'rudel', isDemo: false }
const zuhause = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false }
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
  myVouchers.mockReset()
  toast.mockReset()
  vi.restoreAllMocks()
})

async function render(family, { isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider themeId="standard">
        <DemoProvider value={isDemo}>
          <InviteDialog family={family} />
        </DemoProvider>
      </ThemeProvider>
    )
  )
  return container
}

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

  test('Erklärtext im Rudel nennt die Mitgliedschaft', async () => {
    myVouchers.mockResolvedValue([])
    await render(rudel)
    expect(container.textContent).toContain('ist gleich Mitglied in „Familie Sonnenhang“')
  })

  test('Erklärtext im Zuhause nennt nur die eigene Chronik', async () => {
    myVouchers.mockResolvedValue([])
    await render(zuhause)
    expect(container.textContent).not.toContain('Mitglied')
    expect(container.textContent).toContain('bekommt eine eigene Chronik.')
  })

  test('zeigt in der Demo einen Hinweis, dass keine echten Gutscheine vergeben werden', async () => {
    myVouchers.mockResolvedValue([openVoucher])
    await render(rudel, { isDemo: true })
    expect(container.textContent).toContain('Beispiel – in der Demo werden keine Gutscheine vergeben.')
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

describe('InviteDialog – Partner und Tierheime geben Kunden-Gutscheine weiter (Phase P)', () => {
  const PARTNER_TEXT = 'Gebt diesen Gutschein an eure Kundschaft weiter – damit legen sie ihre eigene Chronik bei Familie auf Pfoten an.'

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
