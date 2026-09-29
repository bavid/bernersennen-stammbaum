// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import VoucherCard, { VoucherCardBack } from './VoucherCard.jsx'
import { qrSvgPath } from '../lib/qr.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const BASE_URL = 'https://beispiel-chronik.de'
const CODE = 'ABCD-EFGH-JKLM'
const customerBatch = { id: 1, label: 'Frühjahr', zweck: 'chronik', partnerTyp: null, partner: null }
const partnerBatch = {
  id: 2,
  label: 'Wiesengrund',
  zweck: 'chronik',
  partnerTyp: null,
  partner: { name: 'Hundeschule Wiesengrund', logoUrl: '/partner-media/wiesengrund.png', farbe: '#2a6f4e' }
}
const accessBatch = { id: 3, label: 'Zugänge Herbst', zweck: 'partnerzugang', partnerTyp: 'hundesalon', partner: null }

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
})

async function render(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(element))
  return container
}

describe('VoucherCard – Motive', () => {
  test('Kunden-Karte: Logo, Claim, QR, Code in Klarschrift und Anleitung mit dem Host', async () => {
    await render(<VoucherCard code={CODE} batch={customerBatch} baseUrl={BASE_URL} />)
    const card = container.querySelector('.voucher-card')

    expect(card.dataset.design).toBe('kunde')
    expect(card.querySelector('[data-mark="paw"]')).not.toBeNull()
    expect(card.textContent).toContain('Familie auf Pfoten')
    expect(card.textContent).toContain('Deine Chronik für deine Tiere')
    expect(card.querySelector('.voucher-card-code').textContent).toBe(CODE)
    expect(card.textContent).toContain('Scannen oder Code eingeben auf beispiel-chronik.de/v')
    expect(card.textContent).not.toContain('überreicht von')
    expect(card.querySelector('.voucher-card-partner-logo')).toBeNull()
    expect(card.querySelector('.voucher-card-stripe')).toBeNull()
  })

  test('Partner-Stapel-Karte: dazu Partner-Logo, Farbstreifen und "überreicht von"', async () => {
    await render(<VoucherCard code={CODE} batch={partnerBatch} baseUrl={BASE_URL} />)
    const card = container.querySelector('.voucher-card')

    expect(card.dataset.design).toBe('partner')
    expect(card.textContent).toContain('Deine Chronik für deine Tiere')
    expect(card.textContent).toContain('überreicht von Hundeschule Wiesengrund')
    expect(card.querySelector('.voucher-card-partner-logo').getAttribute('src')).toBe('/partner-media/wiesengrund.png')
    expect(card.querySelector('.voucher-card-stripe')).not.toBeNull()
    expect(card.style.getPropertyValue('--partner-farbe')).toBe('#2a6f4e')
  })

  test('Partner-Stapel ohne Logo und Farbe: kein <img>, Streifen mit Standardfarbe', async () => {
    const batch = { ...partnerBatch, partner: { name: 'Salon Fellglanz', logoUrl: null, farbe: null } }
    await render(<VoucherCard code={CODE} batch={batch} baseUrl={BASE_URL} />)
    const card = container.querySelector('.voucher-card')

    expect(card.querySelector('.voucher-card-partner-logo')).toBeNull()
    expect(card.querySelector('.voucher-card-stripe')).not.toBeNull()
    expect(card.style.getPropertyValue('--partner-farbe')).toBe('')
    expect(card.textContent).toContain('überreicht von Salon Fellglanz')
  })

  test('Partner-Zugangs-Karte: eigener Claim, drei Stichpunkte, QR und Code', async () => {
    await render(<VoucherCard code={CODE} batch={accessBatch} baseUrl={BASE_URL} />)
    const card = container.querySelector('.voucher-card')

    expect(card.dataset.design).toBe('zugang')
    expect(card.textContent).toContain('Euer kostenloses Partner-Profil')
    const bullets = [...card.querySelectorAll('.voucher-card-bullets li')].map((li) => li.textContent)
    expect(bullets).toEqual(['Profil & Einblicke', 'Schreib uns', 'Kundensicht'])
    expect(card.textContent).not.toContain('Deine Chronik für deine Tiere')
    expect(card.querySelector('.voucher-card-code').textContent).toBe(CODE)
    expect(card.querySelector('.voucher-qr')).not.toBeNull()
  })

  test('ein an einen Partner gebundener Zugang nennt den Partner', async () => {
    const batch = { ...accessBatch, partner: { name: 'Salon Fellglanz', logoUrl: null, farbe: null } }
    await render(<VoucherCard code={CODE} batch={batch} baseUrl={BASE_URL} />)
    expect(container.textContent).toContain('für Salon Fellglanz')
  })
})

describe('VoucherCard – QR-Code und Barrierefreiheit', () => {
  test('der QR-Code kodiert genau {baseUrl}/v#{code}', async () => {
    await render(<VoucherCard code={CODE} batch={customerBatch} baseUrl={BASE_URL} />)
    const svg = container.querySelector('.voucher-qr')
    const expected = qrSvgPath(`${BASE_URL}/v#${CODE}`)

    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${expected.size} ${expected.size}`)
    expect(svg.querySelector('path').getAttribute('d')).toBe(expected.path)
    // Gegenprobe: ein anderer Code ergibt einen anderen Pfad.
    expect(expected.path).not.toBe(qrSvgPath(`${BASE_URL}/v#WXYZ-EFGH-JKLM`).path)
  })

  test('QR-<svg> ist ein beschriftetes Bild ohne den Code im Label, der Code trägt sein eigenes Label', async () => {
    await render(<VoucherCard code={CODE} batch={customerBatch} baseUrl={BASE_URL} />)
    const svg = container.querySelector('.voucher-qr')

    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toMatch(/^QR-Code für Gutschein/)
    expect(svg.getAttribute('aria-label')).not.toContain(CODE)
    expect(container.querySelector('.voucher-card-code').getAttribute('aria-label')).toBe('Gutschein-Code')
    // Deko-Elemente bleiben für Screenreader unsichtbar.
    expect(container.querySelector('[data-mark="paw"]').getAttribute('aria-hidden')).toBe('true')
  })
})

describe('VoucherCardBack', () => {
  test('Rückseite: Anleitung mit Host, Datenschutz-Hinweis, ohne Code', async () => {
    await render(<VoucherCardBack batch={customerBatch} baseUrl={BASE_URL} />)
    const back = container.querySelector('.voucher-card-back')

    expect(back.textContent).toContain('beispiel-chronik.de/v')
    expect(back.textContent).toContain('beispiel-chronik.de/datenschutz')
    expect(back.querySelectorAll('.voucher-card-steps li')).toHaveLength(3)
    expect(back.textContent).toContain('Zuhause')
    expect(back.querySelector('.voucher-card-code')).toBeNull()
  })

  test('Rückseite eines Partner-Zugangs erklärt das Profil statt des Zuhauses', async () => {
    await render(<VoucherCardBack batch={accessBatch} baseUrl={BASE_URL} />)
    expect(container.textContent).toContain('Profil')
    expect(container.textContent).not.toContain('Zuhause')
  })
})
