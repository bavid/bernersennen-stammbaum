// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { printBatch, markPrinted, config } = vi.hoisted(() => ({ printBatch: vi.fn(), markPrinted: vi.fn(), config: vi.fn() }))
vi.mock('../api', () => ({ api: { config, partnerArea: { printBatch, markPrinted } } }))

import PartnerPrintPage, { DEMO_PRINT_HINT, PARTNER_PRINT_HINT } from './PartnerPrintPage.jsx'
import { PRINT_BODY_CLASS } from '../components/VoucherPrintView.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PUBLIC_URL = 'https://beispiel-chronik.de'
const codes = (count) => Array.from({ length: count }, (_, i) => `P${String(i).padStart(3, '0')}-EFGH-JKLM`)
const ids = (count) => Array.from({ length: count }, (_, i) => 500 + i)
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
  printBatch.mockResolvedValue({ batch: partnerBatch, codes: codes(12), ids: ids(12), nichtDruckbar: 1 })
  markPrinted.mockResolvedValue({ gedruckt: 12 })
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  printBatch.mockReset()
  markPrinted.mockReset()
  config.mockReset()
})

async function render(batchId = '12', { readOnly = false, demo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/partner-drucken/${batchId}`]}>
        <Routes>
          <Route path="/profil" element={<p data-testid="profil">Profil</p>} />
          <Route path="/partner-drucken/:id" element={<PartnerPrintPage batchId={batchId} readOnly={readOnly} demo={demo} />} />
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
  test('Phase V5: schon gedruckte Codes nennt der Kopf - so geht keiner doppelt raus', async () => {
    printBatch.mockResolvedValue({ batch: partnerBatch, codes: codes(12), schonGedruckt: 5, nichtDruckbar: 0 })
    await render('12')
    expect(container.querySelector('.print-head').textContent).toContain('5 der Codes wurden schon einmal gedruckt')
  })

  test('Phase V5: ohne schon gedruckte Codes kein Hinweis', async () => {
    await render('12')
    expect(container.querySelector('.print-head').textContent).not.toContain('schon einmal gedruckt')
  })

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
    expect(container.textContent).toContain('1 Code ohne druckbaren Code')
  })

  test('der Hinweis zur Kundschaft steht im Kopf, "Zurück zum Profil" führt zu /profil, kein CSV-Export', async () => {
    await render()

    expect(container.querySelector('.print-head').textContent).toContain(PARTNER_PRINT_HINT)
    const back = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zurück zum Profil'))
    expect(back.getAttribute('href')).toBe('/profil?reiter=teilen')
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

describe('PartnerPrintPage – Druck melden (Audit V7a)', () => {
  test('Laden meldet nichts; "Drucken" meldet die Ids der Karten genau einmal, auch mit dem Druckdialog (beforeprint)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => window.dispatchEvent(new Event('beforeprint')))
    await render()
    expect(markPrinted).not.toHaveBeenCalled()

    await act(async () => button('Drucken').click())
    expect(print).toHaveBeenCalledTimes(1)
    expect(markPrinted).toHaveBeenCalledTimes(1)
    expect(markPrinted).toHaveBeenCalledWith('12', ids(12))

    await act(async () => button('Drucken').click())
    expect(markPrinted).toHaveBeenCalledTimes(1)
    print.mockRestore()
  })

  test('Strg+P (nur beforeprint, ohne den Knopf) meldet ebenso', async () => {
    await render()
    await act(async () => window.dispatchEvent(new Event('beforeprint')))
    expect(markPrinted).toHaveBeenCalledWith('12', ids(12))
  })

  test('Demo und Admin-Ansicht (readOnly) melden nichts; ohne Codes ebenso nicht', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await render('12', { readOnly: true, demo: true })
    expect(container.querySelector('.print-head').textContent).toContain(DEMO_PRINT_HINT)
    await act(async () => button('Drucken').click())
    expect(markPrinted).not.toHaveBeenCalled()
    act(() => root.unmount())
    root = null

    printBatch.mockResolvedValue({ batch: partnerBatch, codes: [], ids: [], nichtDruckbar: 3 })
    await render()
    await act(async () => window.dispatchEvent(new Event('beforeprint')))
    expect(markPrinted).not.toHaveBeenCalled()
    print.mockRestore()
  })

  test('schlägt die Meldung fehl, sagt das ein Hinweis in der Werkzeugleiste - der nächste Druck versucht es erneut', async () => {
    markPrinted.mockRejectedValueOnce(new Error('Netzwerkfehler'))
    await render()
    await act(async () => window.dispatchEvent(new Event('beforeprint')))
    const alert = container.querySelector('.print-toolbar [role="alert"]')
    expect(alert.textContent).toContain('Der Druck ließ sich nicht vermerken (Netzwerkfehler)')

    await act(async () => window.dispatchEvent(new Event('beforeprint')))
    expect(markPrinted).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.print-toolbar [role="alert"]')).toBeNull()
  })
})

describe('PartnerPrintPage – ohne öffentliche Adresse (Feedback-Runde)', () => {
  const PENDING = 'Drucken ist bald möglich – wir richten gerade die Adresse der Plattform ein.'

  test('Produktion ohne Domain: ein freundlicher Satz ohne Adresse, Drucken gesperrt, keine Karten mit echten Codes', async () => {
    config.mockResolvedValue({ appEnv: 'production', publicUrl: 'http://10.0.0.5:3010' })
    await render()
    expect(container.textContent).toContain(PENDING)
    expect(container.textContent).not.toMatch(/10\.0\.0\.5|PUBLIC_URL|localhost|öffentliche Domain/)
    expect(container.querySelector('.warning-banner')).toBeNull()
    expect(button('Drucken').disabled).toBe(true)
    expect(container.querySelector('.voucher-card')).toBeNull()
    await act(async () => window.dispatchEvent(new Event('beforeprint')))
    expect(markPrinted).not.toHaveBeenCalled()
  })

  test('Konfiguration nicht ladbar: der Druck wartet ebenso, keine Karten', async () => {
    config.mockRejectedValue(new Error('offline'))
    await render()
    expect(container.textContent).toContain(PENDING)
    expect(button('Drucken').disabled).toBe(true)
    expect(container.querySelector('.voucher-card')).toBeNull()
  })

  test('Vorschau, Testsystem und Demo: kein Hinweis, Drucken wie gewohnt - nie die technische Warnung', async () => {
    for (const [appEnv, options] of [
      ['staging', {}],
      ['dev', {}],
      ['production', { readOnly: true, demo: true }]
    ]) {
      config.mockResolvedValue({ appEnv, publicUrl: null })
      await render('12', options)
      expect(container.textContent).not.toContain(PENDING)
      expect(container.querySelector('.warning-banner')).toBeNull()
      expect(button('Drucken').disabled).toBe(false)
      expect(container.querySelector('.voucher-card')).not.toBeNull()
      act(() => root.unmount())
      root = null
      container.remove()
    }
  })
})

describe('PartnerPrintPage – Fehler und Sicherheit', () => {
  test('ein fremder oder unbekannter Stapel (404) erscheint als Alert, ohne Karten', async () => {
    printBatch.mockRejectedValue(new Error('Diesen Stapel gibt es nicht'))
    await render('99')

    expect(container.querySelector('[role="alert"]').textContent).toBe('Diesen Stapel gibt es nicht')
    expect(container.querySelector('.voucher-card')).toBeNull()
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/profil?reiter=teilen')).toBe(true)
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
