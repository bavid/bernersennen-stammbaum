// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { voucherBatches, createVoucherBatch, voucherBatch, revokeVoucher } = vi.hoisted(() => ({
  voucherBatches: vi.fn(),
  createVoucherBatch: vi.fn(),
  voucherBatch: vi.fn(),
  revokeVoucher: vi.fn()
}))
vi.mock('../api', () => ({
  api: {
    admin: {
      voucherBatches,
      createVoucherBatch,
      voucherBatch,
      revokeVoucher,
      voucherCsvUrl: (id) => `/api/admin/voucher-batches/${id}/export.csv`
    }
  }
}))

import AdminVouchers from './AdminVouchers.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const families = [
  { id: 3, name: 'Familie Sonnenhang' },
  { id: 4, name: 'Zuhause am Deich' }
]

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
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
  voucherBatches.mockReset()
  createVoucherBatch.mockReset()
  voucherBatch.mockReset()
  revokeVoucher.mockReset()
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // MemoryRouter: "Karten drucken" ist ein Router-Link zur Druckseite.
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AdminVouchers joinableFamilies={families} {...props} />
      </MemoryRouter>
    )
  )
  return container
}

describe('AdminVouchers – Stapel anlegen', () => {
  test('legt einen Stapel an und zeigt die neuen Codes mit "Alle kopieren"', async () => {
    voucherBatches.mockResolvedValue([])
    createVoucherBatch.mockResolvedValue({
      batch: { id: 1, label: 'Testkarten', size: 2, created_at: '2026-01-05 10:00:00' },
      codes: ['ABCD-1234-HJKM', 'EFGH-5678-NPQR']
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    await render()

    await act(async () => {
      setInputValue(container.querySelector('#admin-voucher-label'), 'Testkarten')
      setInputValue(container.querySelector('#admin-voucher-size'), '2')
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(createVoucherBatch).toHaveBeenCalledWith({ label: 'Testkarten', size: 2 })
    expect(container.querySelectorAll('.admin-voucher-codes li')).toHaveLength(2)
    expect(container.textContent).toContain('ABCD-1234-HJKM')

    const copyAllButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Alle kopieren'))
    await act(async () => copyAllButton.click())
    expect(writeText).toHaveBeenCalledWith('ABCD-1234-HJKM\nEFGH-5678-NPQR')
  })

  test('sendet joinFamilyId nur, wenn eine Familie ausgewählt ist', async () => {
    voucherBatches.mockResolvedValue([])
    createVoucherBatch.mockResolvedValue({ batch: { id: 1, label: 'Einladung', size: 1, created_at: '2026-01-05 10:00:00' }, codes: ['A'] })
    await render()

    await act(async () => {
      setInputValue(container.querySelector('#admin-voucher-label'), 'Einladung')
      setInputValue(container.querySelector('#admin-voucher-size'), '1')
      const select = container.querySelector('#admin-voucher-join')
      const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      nativeSelectSetter.call(select, '3')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(createVoucherBatch).toHaveBeenCalledWith({ label: 'Einladung', size: 1, joinFamilyId: 3 })
  })

  test('die Auswahl "tritt Familie bei" listet die übergebenen Familien', async () => {
    voucherBatches.mockResolvedValue([])
    await render()
    const options = [...container.querySelectorAll('#admin-voucher-join option')].map((o) => o.textContent)
    expect(options).toEqual(['Keine – eigenständiges Zuhause', 'Familie Sonnenhang', 'Zuhause am Deich'])
  })

  test('die Auswahl "für Partner" listet die übergebenen Partner und sendet partnerId nur bei Auswahl', async () => {
    voucherBatches.mockResolvedValue([])
    createVoucherBatch.mockResolvedValue({ batch: { id: 1, label: 'Partnerkarten', size: 3, created_at: '2026-01-05 10:00:00' }, codes: ['A', 'B', 'C'] })
    const partners = [
      { id: 5, name: 'Tierheim Sonnenhang' },
      { id: 6, name: 'Hundeschule Pfotenglück' }
    ]
    await render({ partners })

    const options = [...container.querySelectorAll('#admin-voucher-partner option')].map((o) => o.textContent)
    expect(options).toEqual(['Kein Partner', 'Tierheim Sonnenhang', 'Hundeschule Pfotenglück'])

    await act(async () => {
      setInputValue(container.querySelector('#admin-voucher-label'), 'Partnerkarten')
      setInputValue(container.querySelector('#admin-voucher-size'), '3')
    })
    await act(async () => container.querySelector('form').requestSubmit())
    expect(createVoucherBatch).toHaveBeenCalledWith({ label: 'Partnerkarten', size: 3 })

    createVoucherBatch.mockClear()
    await act(async () => {
      setInputValue(container.querySelector('#admin-voucher-label'), 'Partnerkarten 2')
      setInputValue(container.querySelector('#admin-voucher-size'), '3')
      const select = container.querySelector('#admin-voucher-partner')
      const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      nativeSelectSetter.call(select, '6')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(createVoucherBatch).toHaveBeenCalledWith({ label: 'Partnerkarten 2', size: 3, partnerId: 6 })
  })
})

describe('AdminVouchers – Liste und Details', () => {
  test('zeigt die Stapel-Liste mit Zählern', async () => {
    voucherBatches.mockResolvedValue([{ id: 1, label: 'Testkarten', kind: 'admin', size: 5, open: 3, redeemed: 2, revoked: 0, created_at: '2026-01-05 10:00:00' }])
    await render()

    const head = container.querySelector('.admin-voucher-batch-head')
    expect(head.textContent).toContain('Testkarten')
    expect(head.textContent).toContain('3 offen')
    expect(head.textContent).toContain('2 eingelöst')
  })

  test('zeigt bei einem Partner-Stapel die Pill "für {partner_name}"', async () => {
    voucherBatches.mockResolvedValue([
      {
        id: 1,
        label: 'Partnerkarten',
        kind: 'partner',
        partner_name: 'Tierheim Sonnenhang',
        size: 3,
        open: 3,
        redeemed: 0,
        revoked: 0,
        created_at: '2026-01-05 10:00:00'
      },
      { id: 2, label: 'Testkarten', kind: 'admin', partner_name: null, size: 5, open: 3, redeemed: 2, revoked: 0, created_at: '2026-01-05 10:00:00' }
    ])
    await render()

    const heads = [...container.querySelectorAll('.admin-voucher-batch-head')]
    expect(heads[0].textContent).toContain('für Tierheim Sonnenhang')
    expect(heads[1].textContent).not.toContain('für ')
  })

  test('ein Klick zeigt die Codes mit Status; "Zurückziehen" zieht einen offenen Gutschein zurück', async () => {
    voucherBatches.mockResolvedValue([{ id: 1, label: 'Testkarten', kind: 'admin', size: 2, open: 2, redeemed: 0, revoked: 0, created_at: '2026-01-05 10:00:00' }])
    voucherBatch.mockResolvedValue({
      batch: { id: 1, label: 'Testkarten', kind: 'admin', size: 2, created_at: '2026-01-05 10:00:00' },
      vouchers: [
        { id: 10, code: 'ABCD-1234-HJKM', hint: 'HJKM', status: 'offen', redeemed_at: null, redeemed_by_name: null },
        { id: 11, code: 'EFGH-5678-NPQR', hint: 'NPQR', status: 'offen', redeemed_at: null, redeemed_by_name: null }
      ]
    })
    revokeVoucher.mockResolvedValue({ status: 'widerrufen' })
    await render()

    await act(async () => container.querySelector('.admin-voucher-batch-head').click())
    expect(voucherBatch).toHaveBeenCalledWith(1)
    expect(container.querySelectorAll('.admin-voucher-detail li')).toHaveLength(2)

    voucherBatch.mockResolvedValue({
      batch: { id: 1, label: 'Testkarten', kind: 'admin', size: 2, created_at: '2026-01-05 10:00:00' },
      vouchers: [
        { id: 10, code: null, hint: 'HJKM', status: 'widerrufen', redeemed_at: null, redeemed_by_name: null },
        { id: 11, code: 'EFGH-5678-NPQR', hint: 'NPQR', status: 'offen', redeemed_at: null, redeemed_by_name: null }
      ]
    })
    const revokeButton = [...container.querySelectorAll('.admin-voucher-detail button')].find((btn) => btn.textContent === 'Zurückziehen')
    await act(async () => revokeButton.click())

    expect(revokeVoucher).toHaveBeenCalledWith(10)
    expect(container.querySelectorAll('.admin-voucher-detail button')).toHaveLength(1)
  })

  test('eingelöste Gutscheine bleiben in der Liste – mit Einlösedatum und dem entstandenen Bereich', async () => {
    voucherBatches.mockResolvedValue([{ id: 1, label: 'Testkarten', kind: 'admin', size: 2, open: 1, redeemed: 1, revoked: 0, created_at: '2026-01-05 10:00:00' }])
    voucherBatch.mockResolvedValue({
      batch: { id: 1, label: 'Testkarten', kind: 'admin', size: 2, created_at: '2026-01-05 10:00:00' },
      vouchers: [
        { id: 10, code: null, hint: 'HJKM', status: 'eingeloest', redeemed_at: '2026-03-14 09:30:00', redeemed_by_name: 'Zuhause Möwenweg' },
        { id: 11, code: 'EFGH-5678-NPQR', hint: 'NPQR', status: 'offen', redeemed_at: null, redeemed_by_name: null }
      ]
    })
    await render()

    await act(async () => container.querySelector('.admin-voucher-batch-head').click())
    const rows = [...container.querySelectorAll('.admin-voucher-detail li')]
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('eingelöst am 14.03.2026')
    expect(rows[0].textContent).toContain('Zuhause Möwenweg')
    expect(rows[0].querySelector('button')).toBeNull()
    expect(rows[1].textContent).not.toContain('eingelöst am')
  })

  test('zeigt sprechende Status-Labels statt des rohen Server-Werts (z. B. "Zurückgezogen" statt "widerrufen")', async () => {
    voucherBatches.mockResolvedValue([{ id: 1, label: 'Testkarten', kind: 'admin', size: 2, open: 1, redeemed: 0, revoked: 1, created_at: '2026-01-05 10:00:00' }])
    voucherBatch.mockResolvedValue({
      batch: { id: 1, label: 'Testkarten', kind: 'admin', size: 2, created_at: '2026-01-05 10:00:00' },
      vouchers: [
        { id: 10, code: null, hint: 'HJKM', status: 'widerrufen', redeemed_at: null, redeemed_by_name: null },
        { id: 11, code: 'EFGH-5678-NPQR', hint: 'NPQR', status: 'offen', redeemed_at: null, redeemed_by_name: null }
      ]
    })
    await render()

    await act(async () => container.querySelector('.admin-voucher-batch-head').click())
    const items = [...container.querySelectorAll('.admin-voucher-detail li')]

    expect(items[0].textContent).toContain('Zurückgezogen')
    expect(items[0].textContent).not.toContain('widerrufen')
    expect(items[1].textContent).toContain('Offen')
  })

  // Phase 5 Task 2: Druck- und CSV-Links je Stapel, nur bei offenen Gutscheinen.
  test('"Karten drucken" und "CSV" gibt es nur für Stapel mit offenen Gutscheinen', async () => {
    voucherBatches.mockResolvedValue([
      { id: 1, label: 'Frühjahr', kind: 'admin', size: 5, open: 3, redeemed: 2, revoked: 0, created_at: '2026-01-05 10:00:00' },
      { id: 2, label: 'Aufgebraucht', kind: 'admin', size: 2, open: 0, redeemed: 2, revoked: 0, created_at: '2026-01-05 10:00:00' }
    ])
    await render()

    const items = [...container.querySelectorAll('.admin-voucher-batch')]
    const links = [...items[0].querySelectorAll('.admin-voucher-batch-actions a')]
    expect(links.map((a) => a.textContent.trim())).toEqual(['Karten drucken', 'CSV'])
    expect(links[0].getAttribute('href')).toBe('/admin/gutscheine/1/druck')
    expect(links[1].getAttribute('href')).toBe('/api/admin/voucher-batches/1/export.csv')
    expect(links[1].hasAttribute('download')).toBe(true)
    // Kein Link im Kopf-Knopf, keine Klartext-Codes in der Liste.
    expect(items[0].querySelector('.admin-voucher-batch-head a')).toBeNull()
    expect(items[1].querySelector('.admin-voucher-batch-actions')).toBeNull()
  })

  test('ein Fehler beim Laden der Liste erscheint als Alert', async () => {
    voucherBatches.mockRejectedValue(new Error('Fehler 401'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Fehler 401')
  })
})

// Phase P: Zweck "Kunden-Gutscheine | Partner-Zugang" - ein Partner-Zugang schickt zweck/partnerTyp bzw.
// partnerId (gebunden, dann fest Anzahl 1), Kunden-Gutscheine bleiben ohne zweck (Server-Standard).
describe('AdminVouchers – Zweck', () => {
  const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  const accessPartners = [
    { id: 11, name: 'Hundeschule Wiesengrund', typ: 'hundeschule' },
    { id: 12, name: 'Salon Fellglanz', typ: 'hundesalon' }
  ]

  function setSelect(id, value) {
    const select = container.querySelector(id)
    nativeSelectSetter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function zweckButton(label) {
    return [...container.querySelectorAll('.admin-voucher-zweck button')].find((btn) => btn.textContent === label)
  }

  beforeEach(() => {
    voucherBatches.mockResolvedValue([])
    createVoucherBatch.mockResolvedValue({ batch: { id: 1, label: 'Zugang', size: 1, created_at: '2026-01-05 10:00:00' }, codes: ['A'] })
  })

  test('Kunden-Gutscheine sind vorausgewählt; Partner-Zugang tauscht Rudel/Partner gegen Typ und Bindung', async () => {
    await render({ accessPartners })

    expect(zweckButton('Kunden-Gutscheine').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('#admin-voucher-join')).not.toBeNull()
    expect(container.querySelector('#admin-voucher-typ')).toBeNull()

    await act(async () => zweckButton('Partner-Zugang').click())

    expect(zweckButton('Partner-Zugang').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('#admin-voucher-join')).toBeNull()
    expect(container.querySelector('#admin-voucher-partner')).toBeNull()
    const typOptions = [...container.querySelectorAll('#admin-voucher-typ option')].map((o) => o.textContent)
    expect(typOptions).toHaveLength(8)
    expect(typOptions[0]).toBe('Keine Vorgabe')
    const bindOptions = [...container.querySelectorAll('#admin-voucher-bind option')].map((o) => o.textContent)
    expect(bindOptions).toEqual(['Neuer Partner', 'Hundeschule Wiesengrund (Hundeschule)', 'Salon Fellglanz (Hundesalon)'])
  })

  test('Partner-Zugang mit Typ-Vorgabe sendet zweck und partnerTyp', async () => {
    await render({ accessPartners })
    await act(async () => zweckButton('Partner-Zugang').click())

    await act(async () => {
      setInputValue(container.querySelector('#admin-voucher-label'), 'Hundeschulen Herbst')
      setInputValue(container.querySelector('#admin-voucher-size'), '5')
      setSelect('#admin-voucher-typ', 'hundeschule')
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(createVoucherBatch).toHaveBeenCalledWith({ label: 'Hundeschulen Herbst', size: 5, zweck: 'partnerzugang', partnerTyp: 'hundeschule' })
  })

  test('Partner-Zugang ohne Vorgabe sendet nur zweck', async () => {
    await render({ accessPartners })
    await act(async () => zweckButton('Partner-Zugang').click())
    await act(async () => {
      setInputValue(container.querySelector('#admin-voucher-label'), 'Offene Zugänge')
      setInputValue(container.querySelector('#admin-voucher-size'), '3')
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(createVoucherBatch).toHaveBeenCalledWith({ label: 'Offene Zugänge', size: 3, zweck: 'partnerzugang' })
  })

  test('an einen Partner gebunden: Anzahl fest 1, Typ gesperrt, sendet partnerId statt partnerTyp', async () => {
    await render({ accessPartners })
    await act(async () => zweckButton('Partner-Zugang').click())
    await act(async () => {
      setInputValue(container.querySelector('#admin-voucher-label'), 'Zugang Fellglanz')
      setInputValue(container.querySelector('#admin-voucher-size'), '10')
      setSelect('#admin-voucher-typ', 'hundeschule')
      setSelect('#admin-voucher-bind', '12')
    })

    const sizeInput = container.querySelector('#admin-voucher-size')
    expect(sizeInput.value).toBe('1')
    expect(sizeInput.disabled).toBe(true)
    expect(container.querySelector('#admin-voucher-typ').disabled).toBe(true)
    expect(container.textContent).toContain('die Anzahl ist fest 1')

    await act(async () => container.querySelector('form').requestSubmit())
    expect(createVoucherBatch).toHaveBeenCalledWith({ label: 'Zugang Fellglanz', size: 1, zweck: 'partnerzugang', partnerId: 12 })
  })

  test('die Liste zeigt den Zweck als Badge (Partner-Zugang mit Typ)', async () => {
    voucherBatches.mockResolvedValue([
      { id: 1, label: 'Zugänge', kind: 'admin', zweck: 'partnerzugang', partnerTyp: 'hundesalon', size: 2, open: 2, redeemed: 0, revoked: 0, created_at: '2026-01-05 10:00:00' },
      { id: 2, label: 'Karten', kind: 'admin', zweck: 'chronik', partnerTyp: null, size: 5, open: 5, redeemed: 0, revoked: 0, created_at: '2026-01-05 10:00:00' }
    ])
    await render()

    const badges = [...container.querySelectorAll('.admin-voucher-zweck-badge')].map((badge) => badge.textContent)
    expect(badges).toEqual(['Partner-Zugang · Hundesalon', 'Kunden-Gutscheine'])
  })
})
