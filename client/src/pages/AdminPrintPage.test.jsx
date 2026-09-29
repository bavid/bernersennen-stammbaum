// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, printBatch, config } = vi.hoisted(() => ({ me: vi.fn(), printBatch: vi.fn(), config: vi.fn() }))
vi.mock('../api', () => ({
  api: {
    config,
    admin: { me, printBatch, voucherCsvUrl: (id) => `/api/admin/voucher-batches/${id}/export.csv` }
  }
}))

import AdminPrintPage, { PRINT_BODY_CLASS } from './AdminPrintPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PUBLIC_URL = 'https://beispiel-chronik.de'
const codes = (count) => Array.from({ length: count }, (_, i) => `C${String(i).padStart(3, '0')}-EFGH-JKLM`)
const customerBatch = { id: 7, label: 'Frühjahrsaktion', zweck: 'chronik', partnerTyp: null, partner: null }

let container
let root

beforeEach(() => {
  me.mockResolvedValue({ username: 'admin' })
  config.mockResolvedValue({ appEnv: 'prod', publicUrl: PUBLIC_URL })
  printBatch.mockResolvedValue({ batch: customerBatch, codes: codes(23), nichtDruckbar: 0 })
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  me.mockReset()
  printBatch.mockReset()
  config.mockReset()
})

async function render(batchId = '7') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/admin/gutscheine/${batchId}/druck`]}>
        <Routes>
          <Route path="/admin" element={<p data-testid="admin-home">Admin-Start</p>} />
          <Route path="/admin/gutscheine/:id/druck" element={<AdminPrintPage batchId={batchId} />} />
        </Routes>
      </MemoryRouter>
    )
  )
  return container
}

function button(label) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
}

describe('AdminPrintPage – Zugang', () => {
  test('ohne Admin-Sitzung geht es zurück zu /admin, Druckdaten werden nicht geladen', async () => {
    me.mockRejectedValue(new Error('Fehler 401'))
    await render()

    expect(container.querySelector('[data-testid="admin-home"]')).not.toBeNull()
    expect(printBatch).not.toHaveBeenCalled()
    expect(container.querySelector('.voucher-card')).toBeNull()
  })

  test('mit Sitzung lädt sie Druckdaten und Konfiguration des Stapels', async () => {
    await render('7')

    expect(printBatch).toHaveBeenCalledWith('7')
    expect(config).toHaveBeenCalledTimes(1)
    expect(container.querySelector('h1').textContent).toBe('Frühjahrsaktion')
  })

  test('ein Fehler beim Laden erscheint als Alert, ohne Karten', async () => {
    printBatch.mockRejectedValue(new Error('Diesen Stapel gibt es nicht'))
    await render('99')

    expect(container.querySelector('[role="alert"]').textContent).toBe('Diesen Stapel gibt es nicht')
    expect(container.querySelector('.voucher-card')).toBeNull()
  })
})

describe('AdminPrintPage – Bögen', () => {
  test('23 Codes ergeben 3 Bögen: 10, 10 und 3 Karten, jede mit ihrem Code', async () => {
    await render()

    const sheets = [...container.querySelectorAll('.voucher-sheet')]
    expect(sheets).toHaveLength(3)
    expect(sheets.map((sheet) => sheet.querySelectorAll('.voucher-card').length)).toEqual([10, 10, 3])
    expect(sheets.every((sheet) => sheet.classList.contains('voucher-sheet-front'))).toBe(true)
    const printed = [...container.querySelectorAll('.voucher-card-code')].map((el) => el.textContent)
    expect(printed).toEqual(codes(23))
    expect(container.textContent).toContain('23 Karten · 3 Bögen')
  })

  test('"Vorder- und Rückseite" fügt hinter jedem Bogen einen Rück-Bogen mit ebenso vielen Karten ein', async () => {
    await render()

    expect(button('Nur Vorderseite').getAttribute('aria-pressed')).toBe('true')
    await act(async () => button('Vorder- und Rückseite').click())

    expect(button('Vorder- und Rückseite').getAttribute('aria-pressed')).toBe('true')
    const sheets = [...container.querySelectorAll('.voucher-sheet')]
    expect(sheets.map((sheet) => sheet.className)).toEqual([
      'voucher-sheet voucher-sheet-front',
      'voucher-sheet voucher-sheet-back',
      'voucher-sheet voucher-sheet-front',
      'voucher-sheet voucher-sheet-back',
      'voucher-sheet voucher-sheet-front',
      'voucher-sheet voucher-sheet-back'
    ])
    expect(sheets[5].querySelectorAll('.voucher-card-back')).toHaveLength(3)
    // Rückseiten tragen keinen Code.
    expect(sheets[1].querySelector('.voucher-card-code')).toBeNull()

    await act(async () => button('Nur Vorderseite').click())
    expect(container.querySelectorAll('.voucher-sheet-back')).toHaveLength(0)
  })

  test('der QR-Code jeder Karte zeigt auf {publicUrl}/v#CODE', async () => {
    printBatch.mockResolvedValue({ batch: customerBatch, codes: ['ABCD-EFGH-JKLM'], nichtDruckbar: 0 })
    const { qrSvgPath } = await import('../lib/qr.js')
    await render()

    const path = container.querySelector('.voucher-qr path').getAttribute('d')
    expect(path).toBe(qrSvgPath(`${PUBLIC_URL}/v#ABCD-EFGH-JKLM`).path)
    expect(container.textContent).toContain('Scannen oder Code eingeben auf beispiel-chronik.de/v')
  })

  test('wählt das Motiv nach Stapel: Partner-Stapel und Partner-Zugang', async () => {
    printBatch.mockResolvedValue({
      batch: { id: 8, label: 'Wiesengrund', zweck: 'chronik', partnerTyp: null, partner: { name: 'Hundeschule Wiesengrund', logoUrl: null, farbe: '#2a6f4e' } },
      codes: codes(2),
      nichtDruckbar: 0
    })
    await render('8')
    expect(container.textContent).toContain('Partner-Stapel-Karte')
    expect([...container.querySelectorAll('.voucher-card')].every((card) => card.dataset.design === 'partner')).toBe(true)

    act(() => root.unmount())
    root = null
    container.remove()

    printBatch.mockResolvedValue({
      batch: { id: 9, label: 'Zugänge', zweck: 'partnerzugang', partnerTyp: 'hundesalon', partner: null },
      codes: codes(1),
      nichtDruckbar: 0
    })
    await render('9')
    expect(container.textContent).toContain('Partner-Zugangs-Karte')
    expect(container.querySelector('.voucher-card').dataset.design).toBe('zugang')
  })

  test('meldet Gutscheine ohne druckbaren Code und einen leeren Stapel', async () => {
    printBatch.mockResolvedValue({ batch: customerBatch, codes: codes(2), nichtDruckbar: 3 })
    await render()
    expect(container.textContent).toContain('3 Gutscheine ohne druckbaren Code (eingelöst, widerrufen oder ohne Klartext)')

    act(() => root.unmount())
    root = null
    container.remove()

    printBatch.mockResolvedValue({ batch: customerBatch, codes: [], nichtDruckbar: 1 })
    await render()
    expect(container.textContent).toContain('1 Gutschein ohne druckbaren Code')
    expect(container.textContent).toContain('Keine offenen Gutscheine in diesem Stapel')
    expect(container.querySelectorAll('.voucher-sheet')).toHaveLength(0)
  })
})

describe('AdminPrintPage – Werkzeugleiste und Warnung', () => {
  test('"Drucken" ruft window.print, "CSV herunterladen" zeigt auf den Export, "Zurück zum Admin" auf /admin', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await render()

    await act(async () => button('Drucken').click())
    expect(print).toHaveBeenCalledTimes(1)
    print.mockRestore()

    const csv = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('CSV herunterladen'))
    expect(csv.getAttribute('href')).toBe('/api/admin/voucher-batches/7/export.csv')
    expect(csv.hasAttribute('download')).toBe(true)
    const back = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zurück zum Admin'))
    expect(back.getAttribute('href')).toBe('/admin')
    expect(container.querySelector('[role="toolbar"]').getAttribute('aria-label')).toBe('Druckoptionen')
  })

  test('ohne publicUrl: Warnbanner mit dem Ursprung der Seite, die QR-Codes nutzen ihn trotzdem', async () => {
    config.mockResolvedValue({ appEnv: 'dev', publicUrl: null })
    printBatch.mockResolvedValue({ batch: customerBatch, codes: ['ABCD-EFGH-JKLM'], nichtDruckbar: 0 })
    const { qrSvgPath } = await import('../lib/qr.js')
    await render()

    const banner = container.querySelector('.warning-banner')
    expect(banner.textContent).toContain('Vor dem Druck die öffentliche Domain setzen (PUBLIC_URL)')
    expect(banner.textContent).toContain(`Sonst zeigen die QR-Codes auf diese Adresse: ${window.location.origin}`)
    const path = container.querySelector('.voucher-qr path').getAttribute('d')
    expect(path).toBe(qrSvgPath(`${window.location.origin}/v#ABCD-EFGH-JKLM`).path)
  })

  test('eine IP-Adresse oder localhost als publicUrl warnt ebenfalls, eine Domain nicht', async () => {
    config.mockResolvedValue({ appEnv: 'staging', publicUrl: 'http://192.168.2.10:4000' })
    await render()
    expect(container.querySelector('.warning-banner').textContent).toContain('http://192.168.2.10:4000')

    act(() => root.unmount())
    root = null
    container.remove()

    config.mockResolvedValue({ appEnv: 'prod', publicUrl: PUBLIC_URL })
    await render()
    expect(container.querySelector('.warning-banner')).toBeNull()
  })

  test('schlägt die Konfiguration fehl, gilt der Ursprung mit Warnung', async () => {
    config.mockRejectedValue(new Error('Fehler 500'))
    await render()
    expect(container.querySelector('.warning-banner')).not.toBeNull()
    expect(container.querySelectorAll('.voucher-card')).toHaveLength(23)
  })
})

describe('AdminPrintPage – Druck-Klasse am <body>', () => {
  test('setzt has-voucher-print, solange die Seite offen ist (print.css zeigt #root damit wieder)', async () => {
    await render()
    expect(document.body.classList.contains(PRINT_BODY_CLASS)).toBe(true)

    act(() => root.unmount())
    root = null
    expect(document.body.classList.contains(PRINT_BODY_CLASS)).toBe(false)
  })
})

describe('AdminPrintPage – Sicherheit', () => {
  test('Codes landen weder im localStorage noch in der Konsole', async () => {
    const consoleSpy = { log: vi.spyOn(console, 'log'), info: vi.spyOn(console, 'info'), warn: vi.spyOn(console, 'warn') }
    window.localStorage.clear()
    await render()

    expect(JSON.stringify(window.localStorage)).not.toContain('EFGH-JKLM')
    for (const spy of Object.values(consoleSpy)) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('EFGH-JKLM')
      spy.mockRestore()
    }
  })
})
