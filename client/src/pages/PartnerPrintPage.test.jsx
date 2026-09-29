// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { printBatch, config } = vi.hoisted(() => ({ printBatch: vi.fn(), config: vi.fn() }))
vi.mock('../api', () => ({ api: { config, partnerArea: { printBatch } } }))

import PartnerPrintPage, { PARTNER_PRINT_HINT } from './PartnerPrintPage.jsx'
import { PRINT_BODY_CLASS } from '../components/VoucherPrintView.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PUBLIC_URL = 'https://beispiel-chronik.de'
const codes = (count) => Array.from({ length: count }, (_, i) => `P${String(i).padStart(3, '0')}-EFGH-JKLM`)
const partnerBatch = {
  id: 12,
  label: 'Weitergabe Hundeschule Wiesengrund',
  zweck: 'chronik',
  partnerTyp: null,
  partner: { name: 'Hundeschule Wiesengrund', logoUrl: '/partner-media/logo.png', farbe: '#2a6f4e' }
}

let container
let root

beforeEach(() => {
  config.mockResolvedValue({ appEnv: 'prod', publicUrl: PUBLIC_URL })
  printBatch.mockResolvedValue({ batch: partnerBatch, codes: codes(12), nichtDruckbar: 1 })
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  printBatch.mockReset()
  config.mockReset()
})

async function render(batchId = '12') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/partner-drucken/${batchId}`]}>
        <Routes>
          <Route path="/profil" element={<p data-testid="profil">Profil</p>} />
          <Route path="/partner-drucken/:id" element={<PartnerPrintPage batchId={batchId} />} />
        </Routes>
      </MemoryRouter>
    )
  )
  return container
}

function button(label) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
}

describe('PartnerPrintPage – Karten im Partner-Motiv', () => {
  test('lädt die Druckdaten des Stapels und zeigt jede Karte im Partner-Motiv mit Logo und "überreicht von"', async () => {
    await render('12')

    expect(printBatch).toHaveBeenCalledWith('12')
    expect(config).toHaveBeenCalledTimes(1)
    expect(container.querySelector('h1').textContent).toBe('Weitergabe Hundeschule Wiesengrund')
    const cards = [...container.querySelectorAll('.voucher-card:not(.voucher-card-back)')]
    expect(cards).toHaveLength(12)
    expect(cards.every((card) => card.dataset.design === 'partner')).toBe(true)
    expect(cards[0].querySelector('.voucher-card-partner-logo').getAttribute('src')).toBe('/partner-media/logo.png')
    expect(cards[0].textContent).toContain('überreicht von Hundeschule Wiesengrund')
    expect(cards[0].style.getPropertyValue('--partner-farbe')).toBe('#2a6f4e')
    expect([...container.querySelectorAll('.voucher-card-code')].map((el) => el.textContent)).toEqual(codes(12))
    expect(container.textContent).toContain('12 Karten · 2 Bögen')
    expect(container.textContent).toContain('Kunden-Karte mit eurem Auftritt')
    expect(container.textContent).toContain('1 Gutschein ohne druckbaren Code')
  })

  test('der Hinweis zur Kundschaft steht im Kopf, "Zurück zum Profil" führt zu /profil, kein CSV-Export', async () => {
    await render()

    expect(container.querySelector('.print-head').textContent).toContain(PARTNER_PRINT_HINT)
    const back = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zurück zum Profil'))
    expect(back.getAttribute('href')).toBe('/profil')
    expect(container.textContent).not.toContain('CSV herunterladen')
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
  })

  test('"Vorder- und Rückseite" hängt Rück-Bögen an, "Drucken" ruft window.print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await render()

    await act(async () => button('Vorder- und Rückseite').click())
    expect(container.querySelectorAll('.voucher-sheet-back')).toHaveLength(2)
    expect(container.querySelectorAll('.voucher-sheet-back .voucher-card-back')).toHaveLength(12)

    await act(async () => button('Drucken').click())
    expect(print).toHaveBeenCalledTimes(1)
    print.mockRestore()
  })

  test('der QR-Code zeigt auf {publicUrl}/v#CODE', async () => {
    printBatch.mockResolvedValue({ batch: partnerBatch, codes: ['ABCD-EFGH-JKLM'], nichtDruckbar: 0 })
    const { qrSvgPath } = await import('../lib/qr.js')
    await render()

    expect(container.querySelector('.voucher-qr path').getAttribute('d')).toBe(qrSvgPath(`${PUBLIC_URL}/v#ABCD-EFGH-JKLM`).path)
  })
})

describe('PartnerPrintPage – Fehler und Sicherheit', () => {
  test('ein fremder oder unbekannter Stapel (404) erscheint als Alert, ohne Karten', async () => {
    printBatch.mockRejectedValue(new Error('Diesen Stapel gibt es nicht'))
    await render('99')

    expect(container.querySelector('[role="alert"]').textContent).toBe('Diesen Stapel gibt es nicht')
    expect(container.querySelector('.voucher-card')).toBeNull()
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/profil')).toBe(true)
  })

  test('setzt die Druck-Klasse am <body>, solange die Seite offen ist; Codes landen weder im localStorage noch in der Konsole', async () => {
    const consoleSpy = { log: vi.spyOn(console, 'log'), info: vi.spyOn(console, 'info'), warn: vi.spyOn(console, 'warn') }
    window.localStorage.clear()
    await render()

    expect(document.body.classList.contains(PRINT_BODY_CLASS)).toBe(true)
    expect(JSON.stringify(window.localStorage)).not.toContain('EFGH-JKLM')
    for (const spy of Object.values(consoleSpy)) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('EFGH-JKLM')
      spy.mockRestore()
    }

    act(() => root.unmount())
    root = null
    expect(document.body.classList.contains(PRINT_BODY_CLASS)).toBe(false)
  })
})
