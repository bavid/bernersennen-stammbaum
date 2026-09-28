// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { voucherBatches, createVoucherBatch, voucherBatch, revokeVoucher } = vi.hoisted(() => ({
  voucherBatches: vi.fn(),
  createVoucherBatch: vi.fn(),
  voucherBatch: vi.fn(),
  revokeVoucher: vi.fn()
}))
vi.mock('../api', () => ({ api: { admin: { voucherBatches, createVoucherBatch, voucherBatch, revokeVoucher } } }))

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
  await act(async () => root.render(<AdminVouchers joinableFamilies={families} {...props} />))
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

  test('ein Fehler beim Laden der Liste erscheint als Alert', async () => {
    voucherBatches.mockRejectedValue(new Error('Fehler 401'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Fehler 401')
  })
})
