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
vi.mock('../../api', () => ({ api: { myVouchers, setVoucherRole, voucherLimit, createVoucher, setVoucherLabel, deleteVoucher, visits } }))
vi.mock('../Toast.jsx', () => ({ useToast: () => vi.fn() }))

import InviteDialog from '../InviteDialog.jsx'
import KartenWahl from '../visitenkarte/KartenWahl.jsx'
import GeschenkkartePanel from './GeschenkkartePanel.jsx'
import { ThemeProvider } from '../../themes/ThemeProvider.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { KARTE, KARTEN, backHasCode } from '../../lib/kartenWahl.js'
import { GESCHENK_MUSTER_CODE, canPrintGift, geschenkCropMarks } from '../../lib/geschenkkarte.js'
import { setLang } from '../../lib/i18n/index.js'
import { VK_PRINT_BODY_CLASS } from '../visitenkarte/VisitenkartenBogen.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const zuhause = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false, home: { id: 1, name: 'Zuhause am Deich', art: 'zuhause' } }
const CODE = 'ABCD-1234-HJKM'
const openVoucher = { id: 1, code: CODE, hint: 'HJKM', status: 'offen', joins: true, eigen: true, redeemed_at: null, created_at: '2026-01-05 10:00:00' }

let container
let root

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  setLang('de')
  for (const mock of [myVouchers, voucherLimit, visits]) mock.mockReset()
})

async function mount(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ThemeProvider themeId="standard">{element}</ThemeProvider>))
}

async function openGiftTab({ isDemo = false, vouchers = [openVoucher] } = {}) {
  myVouchers.mockResolvedValue(vouchers)
  voucherLimit.mockResolvedValue({ offen: 1, max: 5, frei: 4 })
  visits.mockResolvedValue({ besuche: [], gaeste: [] })
  await mount(
    <DemoProvider value={isDemo}>
      <InviteDialog family={zuhause} />
    </DemoProvider>
  )
  const option = [...container.querySelectorAll('.invite-choice-option')].find((button) => button.textContent.includes('Zuhause verschenken'))
  await act(async () => option.click())
}

function buttonWithText(text) {
  return [...document.querySelectorAll('button')].find((button) => button.textContent.includes(text))
}

describe('Geschenkkarte – Motiv und Regeln', () => {
  test('Partner-Designer listet das Motiv „Geschenkkarte“ mit Code-Rückseite', async () => {
    expect(KARTEN.map((karte) => karte.id)).toContain(KARTE.geschenk)
    expect(backHasCode(KARTE.geschenk)).toBe(true)
    await mount(<KartenWahl karte={KARTE.geschenk} onChange={() => {}} />)
    const radio = container.querySelector('input[value="geschenk"]')
    expect(radio.checked).toBe(true)
    expect(radio.closest('label').textContent).toContain('Geschenkkarte')
  })

  test('nur offene Einladungscodes mit Code - keine Besuchs-Codes, keine eingelösten', () => {
    expect(canPrintGift(openVoucher)).toBe(true)
    expect(canPrintGift({ ...openVoucher, besuch: true })).toBe(false)
    expect(canPrintGift({ ...openVoucher, status: 'eingelöst' })).toBe(false)
    expect(canPrintGift({ ...openVoucher, code: null })).toBe(false)
  })

  test('Schnittmarken liegen außerhalb der Karte (A6 quer übereinander, mittig auf A4)', () => {
    for (const mark of geschenkCropMarks()) {
      const outsideX = Math.max(mark.x1, mark.x2) <= 29 || Math.min(mark.x1, mark.x2) >= 181
      const outsideY = Math.max(mark.y1, mark.y2) <= 41.5 || Math.min(mark.y1, mark.y2) >= 255.5
      expect(outsideX || outsideY).toBe(true)
    }
  })
})

describe('Geschenkkarte – Familie druckt aus „Zuhause verschenken“', () => {
  test('„Als Geschenkkarte drucken“ zeigt Karte und Druckfassung mit dem Code aus dem State - nie in der Adresse', async () => {
    const before = window.location.href
    await openGiftTab()
    await act(async () => buttonWithText('Als Geschenkkarte drucken').click())

    expect(container.textContent).toContain('Ein Geschenk für euch und euer Tier')
    const druck = document.body.querySelector(':scope > .vk-print')
    expect(document.body.classList.contains(VK_PRINT_BODY_CLASS)).toBe(true)
    expect(druck.querySelector('.gk-sheet .gk-code').textContent).toBe('ABCD1234HJKM')
    expect(druck.querySelector('.gk-back').getAttribute('aria-label')).toBe('Rückseite der Geschenkkarte')
    expect(druck.textContent).toContain('Heute kostenlos. Keine fremde Werbung, kein Tracking, kein Datenhandel.')
    expect(druck.querySelector('.vk-muster')).toBeNull()
    expect(window.location.href).toBe(before)
    expect(window.location.href).not.toContain('ABCD')

    await act(async () => buttonWithText('Zurück zu den Codes').click())
    expect(document.body.querySelector(':scope > .vk-print')).toBeNull()
    expect(document.body.classList.contains(VK_PRINT_BODY_CLASS)).toBe(false)
  })

  test('je Code höchstens zwei sichtbare Knöpfe, der Rest unter „Mehr“; mit Karte nur EIN Zurück-Link', async () => {
    await openGiftTab()
    const row = container.querySelector('.voucher-row')
    const actions = row.querySelector('.voucher-row-actions')
    const visible = [...actions.children].filter((el) => el.tagName === 'BUTTON')
    expect(visible.map((el) => el.textContent)).toEqual(['Link kopieren', 'Als Geschenkkarte drucken'])
    const more = actions.querySelector('details.voucher-row-more')
    expect(more.querySelector('summary').textContent).toBe('Mehr')
    expect(more.textContent).toContain('Code kopieren')
    expect(more.textContent).toContain('Zurückziehen')

    await act(async () => buttonWithText('Als Geschenkkarte drucken').click())
    expect(container.querySelectorAll('.invite-back')).toHaveLength(1)
    expect(buttonWithText('Andere Möglichkeit')).toBeUndefined()
    await act(async () => buttonWithText('Zurück zu den Codes').click())
    expect(container.querySelector('.voucher-row')).toBeTruthy()
    expect(buttonWithText('Andere Möglichkeit')).toBeTruthy()
  })

  test('Besuchs-Codes bekommen keinen Druck-Knopf', async () => {
    await openGiftTab({ vouchers: [{ ...openVoucher, besuch: true }] })
    expect(buttonWithText('Als Geschenkkarte drucken')).toBeUndefined()
  })

  test('Demo: Muster-Karte mit Beispiel-Code, deutlich als „Muster“ gekennzeichnet', async () => {
    await openGiftTab({ isDemo: true, vouchers: [] })
    await act(async () => buttonWithText('Geschenkkarte ansehen (Muster)').click())
    const back = container.querySelector('.gk-back')
    expect(back.dataset.muster).toBe('true')
    expect(back.querySelector('.vk-muster').textContent).toContain('Muster')
    expect(back.querySelector('.gk-code').textContent).toBe(GESCHENK_MUSTER_CODE.replace(/-/g, ''))
  })
})

describe('Geschenkkarte – Englisch', () => {
  test('Vorder- und Rückseite, Knöpfe und Hinweise auf Englisch', async () => {
    setLang('en')
    await mount(<GeschenkkartePanel code={GESCHENK_MUSTER_CODE} muster onBack={() => {}} />)
    const text = container.textContent
    expect(text).toContain('A gift for you and your pet')
    expect(text).toContain('For')
    expect(text).toContain('From')
    expect(text).toContain('How to redeem your gift')
    expect(text).toContain('Scan the QR code or open the address')
    expect(text).toContain('Free today. No third-party ads, no tracking, no data selling.')
    expect(text).toContain('Back to the codes')
    expect(buttonWithText('Print')).toBeTruthy()
    expect(container.querySelector('.gk-front').getAttribute('aria-label')).toBe('Front of the gift card')
    expect(text).not.toMatch(/Geschenk|Zurück|kostenlos/)
  })
})
